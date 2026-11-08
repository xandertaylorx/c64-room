// Memory map, VIC-II video chip, CIA chips. Everything the CPU/BASIC sees goes through read()/write().
import { buildCharRom } from './font.js';

// PAL colour palette (measured values commonly used by emulators)
export const PALETTE = [
  0x000000, 0xffffff, 0x813338, 0x75cec8, 0x8e3c97, 0x56ac4d, 0x2e2c9b, 0xedf171,
  0x8e5029, 0x553800, 0xc46c71, 0x4a4a4a, 0x7b7b7b, 0xa9ff9f, 0x706deb, 0xb2b2b2,
];

export const W = 384, H = 272;           // full frame incl. border
export const DX = 32, DY = 36;           // top-left of the 320x200 display window

export class Machine {
  constructor() {
    this.ram = new Uint8Array(65536);
    this.color = new Uint8Array(1024);
    this.vic = new Uint8Array(64);
    this.sid = new Uint8Array(32);
    this.cia1 = new Uint8Array(16);
    this.cia2 = new Uint8Array(16);
    this.charRom = buildCharRom();
    this.keysDown = new Set();      // matrix codes held (0-63)
    this.joy1 = 0; this.joy2 = 0;   // bit0 up,1 down,2 left,3 right,4 fire
    this.onSidWrite = null;
    this.collSS = 0; this.collSB = 0;
    this.frameBuf = new Uint32Array(W * H);
    this.fgMask = new Uint8Array(320 * 200);
    this.sprMask = new Uint8Array(W * H);
    this.pal32 = PALETTE.map(c => 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff));
    this.t0 = performance.now();
    this.reset();
  }

  reset() {
    this.ram.fill(0);
    // power-on RAM pattern is irrelevant; set the important system bytes
    this.ram[0] = 0x2f; this.ram[1] = 0x37;
    this.vic.fill(0); this.sid.fill(0);
    this.vic[0x11] = 0x1b; this.vic[0x16] = 0xc8; this.vic[0x18] = 0x14;
    this.vic[0x20] = 14; this.vic[0x21] = 6; this.vic[0x19] = 0x71;
    this.cia1.fill(0); this.cia1[0] = 0x7f; this.cia1[1] = 0xff; this.cia1[2] = 0xff;
    this.cia2.fill(0); this.cia2[0] = 0x97; this.cia2[2] = 0x3f;
    this.color.fill(14);
    this.collSS = this.collSB = 0;
    for (let i = 0; i < 32; i++) this.onSidWrite && this.onSidWrite(i, 0);
  }

  get rasterLine() {
    const t = (performance.now() - this.t0) * 1000; // microseconds
    return Math.floor((t % 19656) / 63) % 312;
  }

  ioVisible() { const p = this.ram[1] & 7; return (p & 3) !== 0 && (p & 4) !== 0; }
  charVisible() { const p = this.ram[1] & 7; return (p & 3) !== 0 && (p & 4) === 0; }

  read(a) {
    a &= 0xffff;
    if (a >= 0xd000 && a < 0xe000) {
      if (this.ioVisible()) return this.readIO(a);
      if (this.charVisible()) return this.charRom[a - 0xd000];
    }
    return this.ram[a];
  }

  readIO(a) {
    if (a < 0xd400) {
      const r = a & 0x3f;
      if (r === 0x11) return (this.vic[0x11] & 0x7f) | ((this.rasterLine & 0x100) >> 1);
      if (r === 0x12) return this.rasterLine & 0xff;
      if (r === 0x1e) { const v = this.collSS; this.collSS = 0; return v; }
      if (r === 0x1f) { const v = this.collSB; this.collSB = 0; return v; }
      if (r === 0x16) return this.vic[r] | 0xc0;
      if (r === 0x18) return this.vic[r] | 0x01;
      if (r === 0x19) return this.vic[r] | 0x70;
      if (r >= 0x20 && r <= 0x2e) return this.vic[r] | 0xf0;
      if (r > 0x2e) return 0xff;
      return this.vic[r];
    }
    if (a < 0xd800) {
      const r = a & 0x1f;
      if (r === 0x1b) { // oscillator 3 output
        const ctl = this.sid[0x12];
        if (ctl & 0x80) return (Math.random() * 256) | 0;
        const f = this.sid[0x0e] | (this.sid[0x0f] << 8);
        const ph = ((performance.now() / 1000) * f * 0.0587) % 1;
        if (ctl & 0x20) return (ph * 256) | 0;
        if (ctl & 0x10) return ((ph < 0.5 ? ph * 2 : 2 - ph * 2) * 255) | 0;
        if (ctl & 0x40) return ph * 4096 > ((this.sid[0x10] | (this.sid[0x11] & 15) << 8)) ? 255 : 0;
        return 0;
      }
      if (r === 0x1c) return (this.sid[0x12] & 1) ? 200 : 0;
      if (r === 0x19 || r === 0x1a) return 0xff; // paddles
      return 0; // SID write-only registers read as 0
    }
    if (a < 0xdc00) return this.color[a & 0x3ff] | 0xf0;
    if (a < 0xdd00) {
      const r = a & 0x0f;
      if (r === 0) { // port A: keyboard column select out / joystick 2 in
        return ((this.cia1[0] | ~this.cia1[2]) & 0xff) & (~this.joy2 & 0xff) & this.kbReadCols();
      }
      if (r === 1) return this.kbReadRows() & (~this.joy1 & 0xff);
      if (r === 4) return (Math.random() * 256) | 0;
      if (r === 5) return (Math.random() * 256) | 0;
      if (r === 8) return Math.floor((performance.now() / 100) % 10);
      if (r === 9) return toBCD(Math.floor(performance.now() / 1000) % 60);
      if (r === 0x0d) return 0;
      return this.cia1[r];
    }
    if (a < 0xde00) {
      const r = a & 0x0f;
      if (r === 0) return (this.cia2[0] & 0x3f) | 0xc0;
      if (r === 4 || r === 5) return (Math.random() * 256) | 0;
      return this.cia2[r];
    }
    return 0xff; // expansion I/O: nothing connected
  }

  kbReadRows() {
    const sel = (~this.cia1[0]) & 0xff; // columns pulled low
    let rows = 0;
    for (const k of this.keysDown) if (sel & (1 << (k >> 3))) rows |= 1 << (k & 7);
    // joystick 2 pulls the same lines as some keys on real hardware; ignored here
    return (~rows) & 0xff;
  }
  kbReadCols() {
    const sel = (~this.cia1[1]) & 0xff;
    if (sel === 0) return 0xff;
    let cols = 0;
    for (const k of this.keysDown) if (sel & (1 << (k & 7))) cols |= 1 << (k >> 3);
    return (~cols) & 0xff;
  }

  write(a, v) {
    a &= 0xffff; v &= 0xff;
    if (a >= 0xd000 && a < 0xe000 && this.ioVisible()) { this.writeIO(a, v); return; }
    this.ram[a] = v;
  }

  writeIO(a, v) {
    if (a < 0xd400) {
      const r = a & 0x3f;
      if (r === 0x19) { this.vic[r] &= ~v; return; } // ack interrupts
      if (r < 0x2f) this.vic[r] = v;
      return;
    }
    if (a < 0xd800) { const r = a & 0x1f; this.sid[r] = v; this.onSidWrite && this.onSidWrite(r, v); return; }
    if (a < 0xdc00) { this.color[a & 0x3ff] = v & 15; return; }
    if (a < 0xdd00) { this.cia1[a & 15] = v; return; }
    if (a < 0xde00) { this.cia2[a & 15] = v; return; }
  }

  // --- VIC-II renderer --------------------------------------------------
  vicFetch(addr) {
    // VIC sees char ROM at $1000-$1FFF in banks 0 and 2
    const bank = addr & 0xc000, off = addr & 0x3fff;
    if ((bank === 0 || bank === 0x8000) && off >= 0x1000 && off < 0x2000) return this.charRom[off - 0x1000];
    return this.ram[addr];
  }

  render() {
    const fb = this.frameBuf, P = this.pal32, v = this.vic;
    const border = P[v[0x20] & 15];
    fb.fill(border);
    const fg = this.fgMask; fg.fill(0);
    const d011 = v[0x11], d016 = v[0x16], d018 = v[0x18];
    const den = d011 & 0x10;
    if (den) {
      const ecm = d011 & 0x40, bmm = d011 & 0x20, mcm = d016 & 0x10;
      const bank = (3 - (this.cia2[0] & 3)) * 0x4000;
      const scr = bank + ((d018 >> 4) & 15) * 1024;
      const chr = bank + ((d018 >> 1) & 7) * 2048;
      const bmp = bank + ((d018 >> 3) & 1) * 8192;
      const xs = d016 & 7, ys = (d011 & 7) - 3;
      const b0 = P[v[0x21] & 15], b1 = P[v[0x22] & 15], b2 = P[v[0x23] & 15], b3 = P[v[0x24] & 15];
      const ram = this.ram, col = this.color;
      for (let y = 0; y < 200; y++) {
        const sy = y - ys;
        const rowBase = (DY + y) * W + DX;
        if (sy < 0 || sy >= 200) { for (let x = 0; x < 320; x++) fb[rowBase + x] = b0; continue; }
        const cy = sy >> 3, line = sy & 7;
        for (let x = 0; x < 320; x++) {
          const sx = x - xs;
          if (sx < 0) { fb[rowBase + x] = b0; continue; }
          const cx = sx >> 3, px = sx & 7, cell = cy * 40 + cx;
          let c, f = 0;
          if (bmm) {
            const byte = this.vicFetch(bmp + cell * 8 + line), sc = this.vicFetch(scr + cell);
            if (mcm) {
              const bits = (byte >> (6 - (px & 6))) & 3;
              c = bits === 0 ? b0 : bits === 1 ? P[sc >> 4] : bits === 2 ? P[sc & 15] : P[col[cell] & 15];
              f = bits & 2;
            } else {
              const bit = (byte >> (7 - px)) & 1;
              c = bit ? P[sc >> 4] : P[sc & 15]; f = bit;
            }
          } else {
            let code = this.vicFetch(scr + cell); const cc = col[cell] & 15;
            let bg = b0;
            if (ecm) { const sel = code >> 6; bg = sel === 0 ? b0 : sel === 1 ? b1 : sel === 2 ? b2 : b3; code &= 63; }
            const byte = this.vicFetch(chr + code * 8 + line);
            if (mcm && (cc & 8) && !ecm) {
              const bits = (byte >> (6 - (px & 6))) & 3;
              c = bits === 0 ? b0 : bits === 1 ? b1 : bits === 2 ? b2 : P[cc & 7];
              f = bits & 2;
            } else {
              const bit = (byte >> (7 - px)) & 1;
              c = bit ? P[cc] : bg; f = bit;
            }
          }
          fb[rowBase + x] = c;
          if (f) fg[y * 320 + x] = 1;
        }
      }
      this.renderSprites(bank, scr);
      // 38 column / 24 row modes cover the edges with border
      if (!(d016 & 8)) for (let y = 0; y < 200; y++) { const r = (DY + y) * W + DX; for (let x = 0; x < 8; x++) fb[r + x] = border; for (let x = 311; x < 320; x++) fb[r + x] = border; }
      if (!(d011 & 8)) { for (let y = 0; y < 4; y++) fb.fill(border, (DY + y) * W + DX, (DY + y) * W + DX + 320); for (let y = 196; y < 200; y++) fb.fill(border, (DY + y) * W + DX, (DY + y) * W + DX + 320); }
    }
  }

  renderSprites(bank, scr) {
    const v = this.vic, en = v[0x15];
    if (!en) return;
    const fb = this.frameBuf, P = this.pal32, fg = this.fgMask, sm = this.sprMask;
    sm.fill(0);
    let ss = 0, sb = 0;
    for (let n = 7; n >= 0; n--) {
      if (!(en & (1 << n))) continue;
      const ptr = this.ram[scr + 0x3f8 + n];
      const data = bank + ptr * 64;
      const sx = v[n * 2] | ((v[0x10] >> n) & 1) << 8, sy = v[n * 2 + 1];
      const xe = (v[0x1d] >> n) & 1, ye = (v[0x17] >> n) & 1, mc = (v[0x1c] >> n) & 1, behind = (v[0x1b] >> n) & 1;
      const colr = P[v[0x27 + n] & 15], mc0 = P[v[0x25] & 15], mc1 = P[v[0x26] & 15];
      const ox = sx - 24 + DX, oy = sy - 50 + DY;
      for (let row = 0; row < 21; row++) {
        for (let rep = 0; rep <= ye; rep++) {
          const y = oy + row * (ye + 1) + rep;
          if (y < DY || y >= DY + 200) continue;
          for (let px = 0; px < 24; px++) {
            const byte = this.ram[(data + row * 3 + (px >> 3)) & 0xffff];
            let c = -1;
            if (mc) { const bits = (byte >> (6 - ((px & 7) & 6))) & 3; if (bits) c = bits === 1 ? mc0 : bits === 2 ? colr : mc1; }
            else if ((byte >> (7 - (px & 7))) & 1) c = colr;
            if (c === -1) continue;
            for (let xr = 0; xr <= xe; xr++) {
              const x = ox + px * (xe + 1) + xr;
              if (x < DX || x >= DX + 320) continue;
              const i = y * W + x, fi = (y - DY) * 320 + (x - DX);
              if (sm[i]) { ss |= sm[i] | (1 << n); }
              sm[i] |= 1 << n;
              if (fg[fi]) sb |= 1 << n;
              if (behind && fg[fi]) continue;
              fb[i] = c;
            }
          }
        }
      }
    }
    // lower numbered sprites have priority: they were drawn last, so they're on top already
    this.collSS |= ss; this.collSB |= sb;
  }
}

function toBCD(n) { return ((n / 10) | 0) << 4 | (n % 10); }
