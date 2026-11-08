// Ties the chips together: power, reset, timing, keyboard, SYS/machine code, IRQs, peripherals.
import { Machine } from './machine.js';
import { Kernal } from './kernal.js';
import { Basic, crunch, BasicError, TOKENS } from './basic.js';
import { CPU } from './cpu6502.js';
import { SID, Foley } from './sid.js';
import { DiskStore, Drive1541, asciiToPet } from './disk.js';
import { MATRIX } from './keyboard.js';
import { DEMO_PROGRAMS } from './demos.js';
import { GAME_PROGRAMS, UTILITY_PROGRAMS, LIB_VERSION } from './games.js';

const SENTINEL = 0xff3a;   // return address used to detect the end of a SYS call
const IRQ_DONE = 0xff3b;

class Printer {
  constructor() { this.lines = ['']; this.onChange = null; this.mode = 0; }
  open(sa) { this.mode = sa; }
  write(c) {
    if (c === 13 || c === 10) { if (c === 13) this.lines.push(''); }
    else if (c >= 32 && c < 128) this.lines[this.lines.length - 1] += String.fromCharCode(c);
    else if (c >= 0xc1 && c <= 0xda) this.lines[this.lines.length - 1] += String.fromCharCode(c - 0x80);
    else if (c >= 160) this.lines[this.lines.length - 1] += '#';
    if (this.lines.length > 500) this.lines.shift();
    this.onChange && this.onChange(this.lines);
  }
  flush() { this.onChange && this.onChange(this.lines); }
  clear() { this.lines = ['']; this.flush(); }
}

export class C64 {
  constructor() {
    this.m = new Machine();
    this.sid = new SID();
    this.foley = new Foley(this.sid);
    this.m.onSidWrite = (r, v) => this.sid.write(r, v);
    this.k = new Kernal(this.m);
    this.cpu = new CPU(this.m);
    this.cpu.onTrap = (pc) => this.trap(pc);
    this.store = new DiskStore();
    this.drive = new Drive1541(this.store);
    this.tape = new Drive1541(this.store);
    this.printer = new Printer();
    this.basic = new Basic(this);
    this.powered = false;
    this.speed = 1; this.turbo = false;
    this.jiffyBase = 0; this.time = 0; this.jiffyAcc = 0;
    this.heldKeys = new Map(); // keyName -> count
    this.shift = false; this.cbm = false; this.ctrl = false;
    this.listeners = {};
    this.irqAcc = 0;
    this.keyQueue = [];
    this.setupDisks();
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)); }

  setupDisks() {
    const ids = this.store.listDisks();
    // library disks are refreshed from the built-in programs; anything the user saved on them is kept
    const lib = [
      { id: 'games', name: 'GAMES', diskId: 'G1', progs: GAME_PROGRAMS },
      { id: 'utils', name: 'UTILITIES', diskId: 'U1', progs: UTILITY_PROGRAMS },
      { id: 'demos', name: 'DEMO DISK', diskId: '64', progs: DEMO_PROGRAMS, drop: ['SNAKE', 'GUESS'] },
    ];
    for (const L of lib) {
      let disk = ids.includes(L.id) ? this.store.load(L.id) : { id: L.id, name: L.name, diskId: L.diskId, files: [] };
      const mine = L.progs.map(d => ({ name: asciiToPet(d.name), type: 'PRG', data: this.tokenizeSource(d.src) }));
      const libNames = new Set(mine.map(f => f.name));
      const drop = new Set((L.drop || []).map(asciiToPet));
      disk.files = [...mine, ...disk.files.filter(f => !libNames.has(f.name) && !drop.has(f.name))];
      disk.name = L.name;
      this.store.save(disk);
    }
    if (!ids.includes('blank')) this.store.save({ id: 'blank', name: 'MY DISK', diskId: '01', files: [] });
    if (!ids.includes('~tape')) this.store.save({ id: '~tape', name: 'TAPE', diskId: 'TP', files: [] });
    const cur = this.store.current;
    const libVer = this.store.get('c64.libVersion');
    const pick = (cur && this.store.listDisks().includes(cur) && libVer === LIB_VERSION) ? cur : 'games';
    this.store.set('c64.libVersion', LIB_VERSION);
    this.drive.insert(this.store.load(pick));
    this.tape.insert(this.store.load('~tape'));
    this.store.current = this.drive.disk.id;
    this.drive.onActivity = (s) => this.emit('drive', s);
  }

  // ---- program text <-> memory ---------------------------------------------
  // parse a listing (ASCII, {n} = CHR$(n)) into tokenised lines
  parseListing(src) {
    const lines = []; let skipped = 0;
    for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
      if (!raw.trim()) continue;
      const m = /^\s*(\d{1,5})\s?(.*)$/.exec(raw);
      if (!m || +m[1] > 63999) { skipped++; continue; }
      let t = m[2].replace(/\{(\d+)\}/g, (_, n) => String.fromCharCode(Math.min(255, +n)));
      t = asciiToPet(t);
      lines.push([+m[1], crunch([...t].map(c => c.charCodeAt(0)))]);
    }
    return { lines, skipped };
  }
  tokenizeSource(src) {
    const { lines } = this.parseListing(src);
    lines.sort((a, b) => a[0] - b[0]);
    let addr = 0x0801; const out = [0x01, 0x08];
    for (const [n, b] of lines) {
      const next = addr + 4 + b.length + 1;
      out.push(next & 0xff, next >> 8, n & 0xff, n >> 8, ...b, 0);
      addr = next;
    }
    out.push(0, 0);
    return new Uint8Array(out);
  }
  // the program currently in memory as text
  listing() {
    const r = this.m.ram, out = [];
    for (const l of this.basic.lines()) {
      let s = l.num + ' ', a = l.addr + 4, q = false;
      while (r[a]) {
        const c = r[a++];
        if (c === 34) { q = !q; s += '"'; }
        else if (!q && c >= 0x80 && c <= 0xcb && c !== 0xff) s += TOKENS[c - 0x80];
        else if (c >= 32 && c <= 90 && c !== 92) s += String.fromCharCode(c);
        else if (c === 91 || c === 93 || c === 94 || c === 95) s += String.fromCharCode(c);
        else s += '{' + c + '}';
      }
      out.push(s);
    }
    return out.join('\n');
  }
  // replace the program in memory with a listing; returns {count, skipped}
  loadListing(src) {
    const { lines, skipped } = this.parseListing(src);
    this.basic.newProgram();
    for (const [n, b] of lines) this.basic.storeLine(n, b);
    return { count: lines.length, skipped };
  }
  // current program as a PRG image (what SAVE writes)
  programPrg() {
    const start = this.basic.txtTab, end = this.basic.varTab;
    const data = new Uint8Array(end - start + 2);
    data[0] = start & 0xff; data[1] = start >> 8;
    data.set(this.m.ram.subarray(start, end), 2);
    return data;
  }

  // ---- power ---------------------------------------------------------------
  powerOn() {
    this.powered = true; this.keyQueue = [];
    this.m.reset(); this.cpuRunning = false;
    this.k = new Kernal(this.m);
    this.basic = new Basic(this);
    this.k.coldStart();
    this.m.ram[808] = 0xed; this.m.ram[809] = 0xf6;
    this.jiffyBase = 0; this.time = 0;
    this.basic.newProgram();
    this.k.print('\r    **** COMMODORE 64 BASIC V2 ****\r\r 64K RAM SYSTEM  38911 BASIC BYTES FREE\r');
    this.basic.ready();
    this.emit('power', true);
  }
  powerOff() {
    this.powered = false;
    for (let i = 0; i < 25; i++) this.sid.write(i, 0);
    this.sid.flush();
    this.emit('power', false);
  }
  togglePower() { if (this.powered) this.powerOff(); else this.powerOn(); }
  // RUN/STOP + RESTORE: warm start, program kept
  warmReset() {
    if (!this.powered) return;
    this.cpuRunning = false;
    const r = this.m.ram;
    for (let i = 0; i < 25; i++) this.m.write(0xd400 + i, 0);
    const v = this.m.vic; v[0x11] = 0x1b; v[0x16] = 0xc8; v[0x18] = 0x14; v[0x15] = 0; v[0x20] = 14; v[0x21] = 6; v[0x1a] = 0;
    this.m.cia2[0] = 0x97; r[1] = 0x37; r[646] = 14; r[648] = 4; r[0x314] = 0x31; r[0x315] = 0xea; r[808] = 0xed;
    this.basic.closeAll(); this.basic.state = 'direct'; this.basic.breakReq = false;
    this.k.inputActive = false; this.k.quote = false; this.k.insert = 0; this.k.rvs = false;
    this.k.clear();
    this.k.print('READY.\r'); this.basic.toDirect();
  }

  jiffies() { return Math.floor(this.jiffyBase + this.time * 60) % 5184000; }
  tiString() {
    const j = this.jiffies(); const s = Math.floor(j / 60);
    const p = (n) => String(n).padStart(2, '0');
    return p(Math.floor(s / 3600) % 24) + p(Math.floor(s / 60) % 60) + p(s % 60);
  }
  setTi(v) {
    if (typeof v !== 'string' || v.length !== 6 || !/^\d{6}$/.test(v)) throw new BasicError('QTY');
    const h = +v.slice(0, 2), mi = +v.slice(2, 4), s = +v.slice(4, 6);
    this.jiffyBase = ((h * 3600 + mi * 60 + s) * 60) - this.time * 60;
  }

  peek(a) {
    if (a === 197 || a === 203) {
      let best = 64;
      for (const name of this.heldKeys.keys()) { const c = MATRIX[name]; if (c !== undefined && c >= 0 && ![15, 52, 58, 61].includes(c) && c < best) best = c; }
      return best;
    }
    if (a === 653) return (this.shift ? 1 : 0) | (this.cbm ? 2 : 0) | (this.ctrl ? 4 : 0);
    if (a === 160 || a === 161 || a === 162) { const j = this.jiffies(); return a === 162 ? j & 0xff : a === 161 ? (j >> 8) & 0xff : (j >> 16) & 0xff; }
    return this.m.read(a);
  }

  // ---- keyboard --------------------------------------------------------------
  keyDown(name) {
    this.heldKeys.set(name, (this.heldKeys.get(name) || 0) + 1);
    const c = MATRIX[name]; if (c !== undefined && c >= 0) this.m.keysDown.add(c);
  }
  keyUp(name) {
    const n = (this.heldKeys.get(name) || 1) - 1;
    if (n <= 0) { this.heldKeys.delete(name); const c = MATRIX[name]; if (c !== undefined && c >= 0) this.m.keysDown.delete(c); }
    else this.heldKeys.set(name, n);
  }
  typePetscii(p) {
    if (!this.powered) return;
    const b = this.basic;
    if (p === 3) { // RUN/STOP
      if (this.m.ram[808] !== 0xed) { this.k.pushKey(3); return; }
      if (b.state === 'input') { this.k.inputActive = false; b.state = 'run'; b.line >= 0 && (b.cont = { p: b.p, line: b.line, lineAddr: b.lineAddr }); b.error(new BasicError('BREAK')); return; }
      if (b.state === 'run' || b.state === 'wait' || b.state === 'list' || b.state === 'device') { b.breakReq = true; if (b.state === 'device') { b.pending = null; b.state = 'run'; } return; }
      this.k.pushKey(3); return;
    }
    if (p === 'COMMODORE-SHIFT') return;
    // the real buffer holds 10 keys; extra fast keystrokes wait in a queue instead of being lost
    if (this.keyQueue.length || !this.k.pushKey(p)) { if (this.keyQueue.length < 4000) this.keyQueue.push(p); }
  }
  toggleCase() { if (!(this.m.ram[657] & 0x80)) this.m.vic[0x18] ^= 2; }
  restoreKey(withStop) { if (withStop || this.heldKeys.has('STOP')) this.warmReset(); }

  // ---- SYS / machine code ----------------------------------------------------
  doSys(addr) {
    const r = this.m.ram;
    switch (addr) {
      case 64738: this.powerOn(); this.basic.state = 'direct'; return;           // cold reset
      case 58732: case 58640: this.k.readPos(); return;                            // set cursor from 211/214
      case 58692: case 65409: this.k.clear(); return;                              // clear screen / CINT
      case 65490: this.k.out(r[780]); return;
      case 65508: r[780] = this.k.getKey(); return;
      case 65520: if (r[783] & 1) { r[781] = this.k.row; r[782] = this.k.col; } else this.k.setCursor(r[781], r[782]); return;
      case 42115: case 41986: this.basic.ready(); return;
      case 65511: case 65484: return;
    }
    const c = this.cpu;
    c.a = r[780]; c.x = r[781]; c.y = r[782]; c.p = (r[783] | 0x20) & ~0x10; c.sp = 0xfa;
    c.push((SENTINEL - 1) >> 8); c.push((SENTINEL - 1) & 0xff);
    c.pc = addr; c.halted = false;
    this.cpuRunning = true; this.basic.state = 'sys';
  }
  runCpu(cycles) {
    const c = this.cpu; const target = c.cycles + cycles;
    while (c.cycles < target) {
      if (c.pc === SENTINEL) { this.endSys(); return; }
      if (!c.step()) { // JAM
        this.cpuRunning = false; this.basic.state = 'run'; this.basic.error(new BasicError('BREAK')); return;
      }
      if (c.brk) { c.brk = false; this.cpuRunning = false; this.k.print('\r'); this.basic.ready(); return; }
    }
  }
  endSys() {
    const c = this.cpu, r = this.m.ram;
    r[780] = c.a; r[781] = c.x; r[782] = c.y; r[783] = c.p;
    this.cpuRunning = false; this.basic.state = 'run';
  }
  // KERNAL / BASIC ROM entry points emulated in JS
  trap(pc) {
    if (pc < 0xa000) return false;
    const c = this.cpu, r = this.m.ram;
    const rts = () => { c.rts(); return true; };
    switch (pc) {
      case 0xffd2: case 0xe716: this.k.out(c.a); c.p &= ~1; return rts();
      case 0xffe4: case 0xffcf: { const k = this.k.getKey(); c.a = k; c.nz(k); c.p &= ~1; return rts(); }
      case 0xffe1: { const stop = this.heldKeys.has('STOP'); c.p = stop ? (c.p | 2) : (c.p & ~2); return rts(); }
      case 0xfff0: if (c.p & 1) { c.x = this.k.row; c.y = this.k.col; } else this.k.setCursor(c.x, c.y); return rts();
      case 0xe544: case 0xff81: this.k.clear(); return rts();
      case 0xe566: this.k.setCursor(0, 0); return rts();
      case 0xab1e: { let a = c.a | (c.y << 8), g = 0; while (r[a] && g++ < 1000) { this.k.out(r[a]); a = (a + 1) & 0xffff; } return rts(); }
      case 0xbdcd: { this.k.print(String((c.a << 8) | c.x)); return rts(); }
      case 0xff9f: case 0xffe7: case 0xffcc: case 0xffba: case 0xffbd: case 0xff90: case 0xffc3: case 0xffc6: case 0xffc9: return rts();
      case 0xffc0: c.p &= ~1; return rts();
      case 0xffde: { const j = this.jiffies(); c.a = j & 0xff; c.x = (j >> 8) & 0xff; c.y = (j >> 16) & 0xff; return rts(); }
      case 0xea31: case 0xea81: case 0xea7e: case 0xfebc: { // end of IRQ handler: restore registers, RTI
        c.y = c.pop(); c.x = c.pop(); c.a = c.pop();
        c.p = (c.pop() & ~0x10) | 0x20; const lo = c.pop(), hi = c.pop(); c.pc = hi << 8 | lo; return true;
      }
      case IRQ_DONE: return false;
      case 0xfce2: this.powerOn(); this.basic.state = 'direct'; this.cpuRunning = false; c.pc = SENTINEL; return true;
      case 0xa474: case 0xe37b: this.cpuRunning = false; c.pc = SENTINEL; this.basic.ready(); return true;
    }
    return false;
  }
  // run the user's IRQ handler (vector at $0314) once per jiffy, as the C64's timer IRQ would
  serviceIrq() {
    const r = this.m.ram, vec = r[0x314] | (r[0x315] << 8);
    const rasterIrq = this.m.vic[0x1a] & 1;
    if (vec === 0xea31 && !rasterIrq) return;
    if (vec === 0xea31) return;
    if (this.cpuRunning && (this.cpu.p & 4)) return;
    const c = this.cpu;
    const saved = { a: c.a, x: c.x, y: c.y, p: c.p, sp: c.sp, pc: c.pc };
    if (!this.cpuRunning) c.sp = 0xf0;
    if (rasterIrq) this.m.vic[0x19] |= 0x81;
    // emulate the KERNAL IRQ entry: push PC, P, then A X Y
    c.push(IRQ_DONE >> 8); c.push(IRQ_DONE & 0xff); c.push(c.p & ~0x10);
    c.push(c.a); c.push(c.x); c.push(c.y);
    c.p |= 4; c.pc = vec;
    let n = 0;
    while (c.pc !== IRQ_DONE && n++ < 30000) { if (!c.step()) break; }
    Object.assign(c, saved);
  }

  // ---- main tick ------------------------------------------------------------------
  frame(dt) {
    if (!this.powered) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const b = this.basic;
    // statements per frame: ~1200/s at 1x
    const budget = this.speed >= 100 ? 1e9 : Math.max(1, Math.round(2500 * this.speed * dt));
    const t0 = performance.now();
    this.irqAcc += dt;
    if (this.irqAcc >= 1 / 60) { this.irqAcc %= 1 / 60; try { this.serviceIrq(); } catch (e) { console.warn(e); } }
    if (b.state === 'sys' && this.cpuRunning) this.runCpu(Math.round(985248 * dt * Math.min(this.speed, 20)));
    else if (b.state === 'run') {
      if (this.speed >= 100) { while (b.state === 'run' && performance.now() - t0 < 12) b.run(2000); }
      else b.run(budget);
    }
    else if (b.state === 'list') b.serviceList(this.speed >= 100 ? 1000 : Math.max(1, Math.round(60 * this.speed * dt)));
    else if (b.state === 'wait') b.serviceWait();
    else if (b.state === 'device') b.serviceDevice(dt);
    while (this.keyQueue.length && this.m.ram[198] < (this.m.ram[649] || 10)) this.k.pushKey(this.keyQueue.shift());
    this.k.serviceInput();
    this.k.tickCursor(dt, this.k.inputActive);
    this.sid.flush();
    this.drive.activity = Math.max(0, this.drive.activity - dt);
  }
}
