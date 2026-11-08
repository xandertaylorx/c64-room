// DESK64: an original GEOS-style graphical desktop for the emulated C64.
// It runs in the VIC-II hi-res bitmap mode (320x200, black on white), draws into real bitmap RAM at
// $2000 and uses hardware sprites for the mouse pointer. Documents and pictures are saved to the 1541.
import { asciiToPet, petToAscii } from './disk.js';

const W = 320, H = 200, MBAR = 12;
const BITMAP = 0x2000, SCREEN = 0x0400;

// ---------------------------------------------------------------- graphics helpers
function scode(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 97 && c <= 122) return c - 96;
  if (c >= 65 && c <= 90) return c;
  if (c === 64) return 0;
  if (c === 94) return 30;
  if (c >= 32 && c < 64) return c;
  return 63;
}

class Gfx {
  constructor(rom) { this.b = new Uint8Array(W * H); this.rom = rom; this.unclip(); }
  clip(x, y, w, h) { this.x0 = Math.max(0, x); this.y0 = Math.max(0, y); this.x1 = Math.min(W, x + w); this.y1 = Math.min(H, y + h); }
  unclip() { this.x0 = 0; this.y0 = 0; this.x1 = W; this.y1 = H; }
  px(x, y, c = 1) { if (x >= this.x0 && x < this.x1 && y >= this.y0 && y < this.y1) this.b[y * W + x] = c; }
  get(x, y) { return (x >= 0 && x < W && y >= 0 && y < H) ? this.b[y * W + x] : 0; }
  rect(x, y, w, h, c = 1) { for (let j = Math.max(y, this.y0); j < Math.min(y + h, this.y1); j++) for (let i = Math.max(x, this.x0); i < Math.min(x + w, this.x1); i++) this.b[j * W + i] = c; }
  box(x, y, w, h, c = 1) { this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c); this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c); }
  line(x0, y0, x1, y1, c = 1) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (; ;) { this.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  gray(x, y, w, h, phase = 0) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, ((i + j + phase) & 1) ? 1 : 0); }
  text(x, y, s, inv = false) {
    if (inv) this.rect(x, y, s.length * 8, 8, 1);
    for (let n = 0; n < s.length; n++) {
      const base = 2048 + scode(s[n]) * 8;
      for (let r = 0; r < 8; r++) {
        const row = this.rom[base + r];
        for (let bit = 0; bit < 8; bit++) if (row & (0x80 >> bit)) this.px(x + n * 8 + bit, y + r, inv ? 0 : 1);
      }
    }
  }
  dump(x0 = 0, y0 = 0, w = 160, h = 100) { let o = ''; for (let y = y0; y < y0 + h; y += 2) { let l = ''; for (let x = x0; x < x0 + w; x++) l += this.b[y * W + x] ? '#' : ' '; o += l.replace(/\s+$/, '') + '\n'; } return o; }
}

// pointer arrow (12 wide) drawn as sprite 0 (black) over sprite 1 (white outline)
const ARROW = [
  'X...........', 'XX..........', 'XXX.........', 'XXXX........', 'XXXXX.......', 'XXXXXX......', 'XXXXXXX.....',
  'XXXXXXXX....', 'XXXXXXXXX...', 'XXXXXXXXXX..', 'XXXXXX......', 'XX.XXX......', 'X..XXX......', '....XXX.....', '....XXX.....', '.....XXX....',
];

const ICONS = {
  disk(g, x, y) { g.box(x + 2, y + 1, 20, 20); g.rect(x + 6, y + 1, 12, 8, 1); g.rect(x + 14, y + 2, 3, 6, 0); g.rect(x + 6, y + 13, 12, 8, 0); g.box(x + 6, y + 13, 12, 8); g.line(x + 8, y + 16, x + 15, y + 16); },
  notes(g, x, y) { g.box(x + 4, y, 16, 22); for (let i = 0; i < 5; i++) g.line(x + 7, y + 5 + i * 3, x + 16, y + 5 + i * 3); g.rect(x + 14, y, 6, 1, 0); g.line(x + 14, y, x + 19, y + 5); },
  paint(g, x, y) { g.box(x + 2, y + 2, 20, 17); g.rect(x + 4, y + 4, 16, 13, 0); g.line(x + 5, y + 15, x + 11, y + 8); g.line(x + 11, y + 8, x + 14, y + 12); g.line(x + 14, y + 12, x + 19, y + 6); g.rect(x + 16, y + 5, 3, 3, 1); },
  calc(g, x, y) { g.box(x + 4, y, 16, 22); g.box(x + 6, y + 2, 12, 5); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.rect(x + 7 + c * 4, y + 10 + r * 4, 2, 2, 1); },
  clock(g, x, y) { for (let a = 0; a < 64; a++) { const t = a / 64 * Math.PI * 2; g.px(Math.round(x + 12 + Math.cos(t) * 10), Math.round(y + 11 + Math.sin(t) * 10)); g.px(Math.round(x + 12 + Math.cos(t) * 9.4), Math.round(y + 11 + Math.sin(t) * 9.4)); } g.line(x + 12, y + 11, x + 12, y + 4); g.line(x + 12, y + 11, x + 17, y + 13); },
  basic(g, x, y) { g.box(x + 2, y + 2, 20, 17); g.rect(x + 4, y + 4, 16, 11, 1); g.text(x + 5, y + 5, '>_', true); g.rect(x + 8, y + 19, 8, 2, 1); g.rect(x + 5, y + 21, 14, 1, 1); },
};

// ---------------------------------------------------------------- the desktop
export class Desktop {
  constructor(sys) {
    this.sys = sys; this.m = sys.m;
    this.g = new Gfx(this.m.charRom);
    this.win = [];               // back to front
    this.icons = [
      { label: 'Disk', icon: 'disk', x: 12, y: 24, app: 'files' },
      { label: 'Notepad', icon: 'notes', x: 12, y: 58, app: 'notes' },
      { label: 'Paint', icon: 'paint', x: 12, y: 92, app: 'paint' },
      { label: 'Calc', icon: 'calc', x: 12, y: 126, app: 'calc' },
      { label: 'Clock', icon: 'clock', x: 268, y: 24, app: 'clock' },
      { label: 'BASIC', icon: 'basic', x: 268, y: 160, app: 'quit' },
    ];
    this.mx = 160; this.my = 100; this.down = false; this.drag = null;
    this.menu = null; this.menuDefs = null; this.dialog = null; this.sel = null; this.lastClick = { t: 0, what: null };
    this.dirty = true; this.clockT = 0; this.nextId = 1; this.done = false;
    this.menus = [
      { name: 'Desk64', items: [['About Desk64', () => this.about()], ['Quit to BASIC', () => this.quit()]] },
      { name: 'Apps', items: [['Disk', () => this.open('files')], ['Notepad', () => this.open('notes')], ['Paint', () => this.open('paint')], ['Calculator', () => this.open('calc')], ['Clock', () => this.open('clock')]] },
      { name: 'Window', items: [['Close window', () => this.closeTop()], ['Close all', () => { this.win = []; this.dirty = true; }]] },
    ];
  }

  // ---- lifecycle -------------------------------------------------
  start() {
    const m = this.m, v = m.vic, r = m.ram;
    for (let i = 0; i < 1000; i++) r[SCREEN + i] = 0x01;            // black on white everywhere
    this.saved = { d011: v[0x11], d016: v[0x16], d018: v[0x18], border: v[0x20], en: v[0x15] };
    v[0x11] = 0x3b; v[0x16] = 0xc8; v[0x18] = 0x18; v[0x20] = 12; v[0x15] = 3;
    // pointer sprites at blocks 13 (black arrow) and 14 (white outline)
    r[SCREEN + 0x3f8] = 13; r[SCREEN + 0x3f9] = 14;
    const fill = (mask, base) => { for (let i = 0; i < 63; i++) r[base + i] = 0; mask.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') r[base + y * 3 + (x >> 3)] |= 0x80 >> (x & 7); })); };
    const fillMask = [], outMask = [];
    for (let y = 0; y < 21; y++) { fillMask.push(new Array(24).fill(0)); outMask.push(new Array(24).fill(0)); }
    ARROW.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') fillMask[y + 1][x + 1] = 1; }));
    for (let y = 0; y < 21; y++) for (let x = 0; x < 24; x++) if (fillMask[y][x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < 21 && xx >= 0 && xx < 24) outMask[yy][xx] = 1; }
    const toRows = (mk) => mk.map(rw => rw.map(c => c ? 'X' : '.').join(''));
    fill(toRows(fillMask), 13 * 64); fill(toRows(outMask), 14 * 64);
    v[0x27] = 0; v[0x28] = 1; v[0x1b] = 0; v[0x1c] = 0; v[0x17] = 0; v[0x1d] = 0;
    this.placeCursor();
    this.sys.k.hideCursor && this.sys.k.hideCursor();
    this.open('files'); this.win[0].x = 60; this.win[0].y = 30;
    this.dirty = true;
  }
  stop() {
    const v = this.m.vic, s = this.saved;
    v[0x11] = s.d011; v[0x16] = s.d016; v[0x18] = s.d018; v[0x20] = s.border; v[0x15] = s.en;
    this.sys.k.clear();
  }
  quit() { this.done = true; }

  // ---- input -----------------------------------------------------
  mouse(type, x, y) {
    x = Math.max(0, Math.min(W - 1, Math.round(x))); y = Math.max(0, Math.min(H - 1, Math.round(y)));
    this.mx = x; this.my = y; this.placeCursor();
    if (type === 'down') { this.down = true; this.press(x, y); }
    else if (type === 'move') { if (this.down) this.dragTo(x, y); else this.hover(x, y); }
    else if (type === 'up') { if (this.down) this.release(x, y); this.down = false; }
  }
  placeCursor() {
    const v = this.m.vic, px = 24 + this.mx - 1, py = 50 + this.my - 1;
    v[0] = px & 255; v[1] = py & 255; v[2] = px & 255; v[3] = py & 255;
    v[0x10] = px > 255 ? 3 : 0;
  }
  hover() { /* highlight handled while drawing */ }
  key(p) {
    if (this.dialog) { this.dialogKey(p); return; }
    const w = this.win[this.win.length - 1];
    if (w && w.app.key) { w.app.key(p, this); this.dirty = true; }
  }

  // ---- windows ---------------------------------------------------
  open(kind, arg) {
    const existing = this.win.find(w => w.kind === kind && kind !== 'notes' && kind !== 'paint');
    if (existing) { this.front(existing); return existing.app; }
    const defs = { files: [Files, 232, 150, 'Disk'], notes: [Notepad, 232, 150, 'Notepad'], paint: [Paint, 254, 152, 'Paint'], calc: [Calc, 116, 124, 'Calculator'], clock: [Clock, 128, 116, 'Clock'] };
    const [Cls, w, h, title] = defs[kind];
    const n = this.win.length;
    const win = { id: this.nextId++, kind, x: 30 + n * 14 + (kind === 'calc' ? 120 : 0), y: 18 + n * 12, w, h, title, app: null };
    win.x = Math.min(win.x, W - w - 2); win.y = Math.min(win.y, H - h - 2);
    win.app = new Cls(this, win, arg);
    this.win.push(win); this.dirty = true;
    return win.app;
  }
  front(w) { const i = this.win.indexOf(w); if (i >= 0 && i !== this.win.length - 1) { this.win.splice(i, 1); this.win.push(w); } this.dirty = true; }
  close(w) { const i = this.win.indexOf(w); if (i >= 0) this.win.splice(i, 1); this.dirty = true; }
  closeTop() { if (this.win.length) this.win.pop(); this.dirty = true; }
  hitWin(x, y) { for (let i = this.win.length - 1; i >= 0; i--) { const w = this.win[i]; if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return w; } return null; }

  // ---- dialogs ---------------------------------------------------
  alert(msg, cb) { this.dialog = { type: 'alert', msg, cb }; this.dirty = true; }
  confirm(msg, cb) { this.dialog = { type: 'confirm', msg, cb }; this.dirty = true; }
  prompt(msg, text, cb) { this.dialog = { type: 'prompt', msg, text: text || '', cb }; this.dirty = true; }
  choose(title, items, cb) { this.dialog = { type: 'choose', title, items, cb, top: 0, sel: 0 }; this.dirty = true; }
  about() { this.alert('Desk64 v1.0|An original desktop for the|Commodore 64 emulator.|Not GEOS, but in its spirit.'); }
  endDialog(result) { const d = this.dialog; this.dialog = null; this.dirty = true; if (d.cb) d.cb(result); }
  dialogRect() { const d = this.dialog; const lines = d.msg ? d.msg.split('|') : []; const w = d.type === 'choose' ? 200 : Math.max(180, Math.max(0, ...lines.map(l => l.length)) * 8 + 24); const h = d.type === 'choose' ? 132 : 40 + lines.length * 10 + (d.type === 'prompt' ? 18 : 0); return { x: (W - w) >> 1, y: (H - h) >> 1, w, h, lines }; }
  dialogKey(p) {
    const d = this.dialog;
    if (p === 3) { this.endDialog(d.type === 'alert' ? undefined : null); return; }
    if (d.type === 'alert') { if (p === 13 || p === 32) this.endDialog(); return; }
    if (d.type === 'confirm') { if (p === 13 || p === 89 || p === 121) this.endDialog(true); else if (p === 78 || p === 110) this.endDialog(false); return; }
    if (d.type === 'prompt') {
      if (p === 13) { this.endDialog(d.text); return; }
      if (p === 20) d.text = d.text.slice(0, -1);
      else { const ch = keyChar(p); if (ch && d.text.length < 16) d.text += ch; }
      this.dirty = true; return;
    }
    if (d.type === 'choose') {
      if (p === 17 && d.sel < d.items.length - 1) d.sel++;
      if (p === 145 && d.sel > 0) d.sel--;
      if (p === 13) { this.endDialog(d.items.length ? d.sel : null); return; }
      if (d.sel < d.top) d.top = d.sel; if (d.sel >= d.top + 8) d.top = d.sel - 7;
      this.dirty = true;
    }
  }

  // ---- mouse handling ---------------------------------------------
  press(x, y) {
    const now = performance.now();
    if (this.dialog) {
      const r = this.dialogRect(), d = this.dialog;
      const btn = (i, n, label) => ({ x: r.x + r.w - (n - i) * 56 - 8 + 8, y: r.y + r.h - 20, w: 48, h: 14, label });
      const buttons = d.type === 'alert' ? ['OK'] : d.type === 'choose' ? ['Open', 'Cancel'] : ['OK', 'Cancel'];
      buttons.forEach((lab, i) => {
        const b = btn(i, buttons.length, lab);
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
          if (d.type === 'alert') this.endDialog();
          else if (d.type === 'confirm') this.endDialog(i === 0);
          else if (d.type === 'prompt') this.endDialog(i === 0 ? d.text : null);
          else this.endDialog(i === 0 && d.items.length ? d.sel : null);
        }
      });
      if (this.dialog && d.type === 'choose') {
        const ly = r.y + 16; if (x >= r.x + 8 && x < r.x + r.w - 8 && y >= ly && y < ly + 8 * 10) { const i = d.top + Math.floor((y - ly) / 10); if (i < d.items.length) { if (d.sel === i && now - this.lastClick.t < 450) { this.endDialog(i); return; } d.sel = i; this.lastClick = { t: now, what: 'c' }; this.dirty = true; } }
      }
      return;
    }
    // menu bar
    if (y < MBAR) {
      let mx = 4;
      for (let i = 0; i < this.menus.length; i++) {
        const w = this.menus[i].name.length * 8 + 12;
        if (x >= mx && x < mx + w) { this.menu = this.menu === i ? null : i; this.dirty = true; return; }
        mx += w;
      }
      this.menu = null; this.dirty = true; return;
    }
    if (this.menu !== null) {
      const it = this.menuItemAt(x, y);
      const mi = this.menu; this.menu = null; this.dirty = true;
      if (it >= 0) this.menus[mi].items[it][1]();
      return;
    }
    const w = this.hitWin(x, y);
    if (w) {
      this.front(w);
      const lx = x - w.x, ly = y - w.y;
      if (ly < 12) {
        if (lx >= 3 && lx < 12) { if (w.app.canClose && !w.app.canClose()) return; this.close(w); return; }
        this.drag = { w, ox: lx, oy: ly }; return;
      }
      this.pressW = w; w.app.mouse && w.app.mouse('down', lx, ly - 12, this); this.dirty = true; return;
    }
    // desktop icons
    for (const ic of this.icons) {
      if (x >= ic.x - 6 && x < ic.x + 30 && y >= ic.y && y < ic.y + 32) {
        if (this.sel === ic && now - this.lastClick.t < 450) { this.sel = null; ic.app === 'quit' ? this.quit() : this.open(ic.app); }
        else { this.sel = ic; this.lastClick = { t: now, what: ic }; }
        this.dirty = true; return;
      }
    }
    this.sel = null; this.dirty = true;
  }
  dragTo(x, y) {
    if (this.drag) { const d = this.drag; d.w.x = Math.max(-d.w.w + 24, Math.min(W - 24, x - d.ox)); d.w.y = Math.max(MBAR, Math.min(H - 12, y - d.oy)); this.dirty = true; return; }
    const w = this.pressW;
    if (w && this.win.includes(w)) { w.app.mouse && w.app.mouse('move', x - w.x, y - w.y - 12, this); this.dirty = true; }
  }
  release(x, y) {
    if (this.drag) { this.drag = null; return; }
    const w = this.pressW; this.pressW = null;
    if (w && this.win.includes(w) && w.app.mouse) { w.app.mouse('up', x - w.x, y - w.y - 12, this); this.dirty = true; }
  }
  menuItemAt(x, y) {
    let mx = 4;
    for (let i = 0; i < this.menus.length; i++) {
      const w = this.menus[i].name.length * 8 + 12;
      if (i === this.menu) {
        const items = this.menus[i].items, iw = Math.max(...items.map(t => t[0].length)) * 8 + 16;
        if (x >= mx && x < mx + iw && y >= MBAR && y < MBAR + items.length * 11 + 2) return Math.floor((y - MBAR - 1) / 11);
        return -1;
      }
      mx += w;
    }
    return -1;
  }

  // ---- drawing -----------------------------------------------------
  frame(dt) {
    if (this.done) return false;
    this.clockT += dt; if (this.clockT >= 1) { this.clockT = 0; this.dirty = true; }
    // keyboard: everything typed goes to the focused window or dialog
    let k; while ((k = this.sys.k.getKey())) this.key(k);
    for (const w of this.win) if (w.app.tick) w.app.tick(dt, this);
    this.activeApp = this.win[this.win.length - 1] || null;
    if (this.dirty) { this.render(); this.dirty = false; }
    return true;
  }
  render() {
    const g = this.g; g.unclip();
    g.rect(0, 0, W, H, 0); g.gray(0, MBAR, W, H - MBAR, 0);
    for (const ic of this.icons) {
      const on = this.sel === ic;
      g.rect(ic.x - 4, ic.y - 2, 32, 34, 0); ICONS[ic.icon](g, ic.x, ic.y);
      const lx = Math.max(2, Math.min(W - 2 - ic.label.length * 8, ic.x + 12 - ic.label.length * 4));
      g.rect(lx - 1, ic.y + 24, ic.label.length * 8 + 2, 9, on ? 1 : 0); g.text(lx, ic.y + 24, ic.label, on);
    }
    for (const w of this.win) this.drawWin(w, w === this.win[this.win.length - 1]);
    this.drawMenuBar();
    if (this.dialog) this.drawDialog();
    this.pack();
  }
  drawWin(w, active) {
    const g = this.g; g.unclip();
    g.rect(w.x + 2, w.y + 2, w.w, w.h, 1);               // shadow
    g.rect(w.x, w.y, w.w, w.h, 0); g.box(w.x, w.y, w.w, w.h);
    for (let y = w.y + 2; y < w.y + 10; y += 2) g.rect(w.x + 1, y, w.w - 2, 1, active ? 1 : 0);
    if (!active) g.gray(w.x + 1, w.y + 1, w.w - 2, 10, 0);
    g.rect(w.x + 3, w.y + 2, 9, 8, 0); g.box(w.x + 3, w.y + 2, 9, 8);
    const tx = w.x + ((w.w - w.title.length * 8) >> 1); g.rect(tx - 3, w.y + 2, w.title.length * 8 + 6, 8, 0); g.text(tx, w.y + 2, w.title);
    g.line(w.x, w.y + 11, w.x + w.w - 1, w.y + 11);
    g.clip(w.x + 1, w.y + 12, w.w - 2, w.h - 13);
    w.app.draw(g, w.x + 1, w.y + 12, w.w - 2, w.h - 13, this);
    g.unclip();
  }
  drawMenuBar() {
    const g = this.g; g.unclip(); g.rect(0, 0, W, MBAR, 0); g.line(0, MBAR - 1, W, MBAR - 1);
    let x = 4;
    this.menus.forEach((mn, i) => { const w = mn.name.length * 8 + 12; if (this.menu === i) g.rect(x, 0, w, MBAR - 1, 1); g.text(x + 6, 2, mn.name, this.menu === i); x += w; });
    const d = new Date(), t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    g.text(W - 46, 2, t);
    if (this.menu !== null) {
      let mx = 4; for (let i = 0; i < this.menu; i++) mx += this.menus[i].name.length * 8 + 12;
      const items = this.menus[this.menu].items, iw = Math.max(...items.map(t => t[0].length)) * 8 + 16, ih = items.length * 11 + 2;
      g.rect(mx + 2, MBAR + 2, iw, ih, 1); g.rect(mx, MBAR, iw, ih, 0); g.box(mx, MBAR, iw, ih);
      const hi = this.menuItemAt(this.mx, this.my);
      items.forEach((it, i) => { const y = MBAR + 1 + i * 11; if (i === hi) g.rect(mx + 1, y, iw - 2, 11, 1); g.text(mx + 8, y + 2, it[0], i === hi); });
    }
  }
  drawDialog() {
    const g = this.g, d = this.dialog, r = this.dialogRect(); g.unclip();
    g.rect(0, MBAR, W, H - MBAR, 0); g.gray(0, MBAR, W, H - MBAR, 1);
    g.rect(r.x + 3, r.y + 3, r.w, r.h, 1); g.rect(r.x, r.y, r.w, r.h, 0); g.box(r.x, r.y, r.w, r.h); g.box(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    if (d.type === 'choose') {
      g.text(r.x + 8, r.y + 6, d.title);
      const ly = r.y + 16; g.box(r.x + 8, ly - 1, r.w - 16, 82);
      for (let i = 0; i < 8; i++) { const idx = d.top + i; if (idx >= d.items.length) break; const on = idx === d.sel; g.rect(r.x + 9, ly + i * 10, r.w - 18, 10, on ? 1 : 0); g.text(r.x + 12, ly + i * 10 + 1, d.items[idx].slice(0, 22), on); }
      if (!d.items.length) g.text(r.x + 12, ly + 4, '(nothing here)');
    } else {
      r.lines.forEach((ln, i) => g.text(r.x + 12, r.y + 8 + i * 10, ln));
      if (d.type === 'prompt') { const iy = r.y + 8 + r.lines.length * 10 + 2; g.box(r.x + 12, iy, r.w - 24, 12); g.text(r.x + 15, iy + 2, d.text + ((performance.now() / 400 | 0) % 2 ? '_' : ' ')); }
    }
    const buttons = d.type === 'alert' ? ['OK'] : d.type === 'choose' ? ['Open', 'Cancel'] : d.type === 'confirm' ? ['Yes', 'No'] : ['OK', 'Cancel'];
    buttons.forEach((lab, i) => { const bx = r.x + r.w - (buttons.length - i) * 56 - 8 + 8, by = r.y + r.h - 20; g.rect(bx, by, 48, 14, 0); g.box(bx, by, 48, 14); if (i === 0) g.box(bx - 1, by - 1, 50, 16); g.text(bx + ((48 - lab.length * 8) >> 1), by + 3, lab); });
    if (d.type === 'prompt') this.dirty = true; // keep the caret blinking
  }
  pack() {
    const r = this.m.ram, b = this.g.b;
    for (let cy = 0; cy < 25; cy++) for (let cx = 0; cx < 40; cx++) {
      const a = BITMAP + (cy * 40 + cx) * 8;
      for (let row = 0; row < 8; row++) {
        let v = 0; const o = (cy * 8 + row) * W + cx * 8;
        for (let bit = 0; bit < 8; bit++) v = (v << 1) | b[o + bit];
        r[a + row] = v;
      }
    }
  }
}

// map a PETSCII code from the keyboard buffer to a typed character (lowercase unless shifted)
export function keyChar(p) {
  if (p >= 65 && p <= 90) return String.fromCharCode(p + 32);
  if (p >= 193 && p <= 218) return String.fromCharCode(p - 128);
  if (p >= 32 && p <= 63) return String.fromCharCode(p);
  if (p === 64) return '@';
  if (p === 92) return '\\';
  if (p === 91 || p === 93) return String.fromCharCode(p);
  return '';
}

// ---------------------------------------------------------------- shared widgets
function button(g, x, y, w, label, on = false) { g.rect(x, y, w, 12, on ? 1 : 0); g.box(x, y, w, 12); g.text(x + ((w - label.length * 8) >> 1), y + 2, label, on); }
const inside = (x, y, bx, by, bw, bh) => x >= bx && x < bx + bw && y >= by && y < by + bh;
function fileName(n) { return petToAscii(n).toUpperCase(); }

// ---------------------------------------------------------------- Notepad
class Notepad {
  constructor(d, win, arg) {
    this.d = d; this.win = win; this.lines = ['']; this.cx = 0; this.cy = 0; this.top = 0; this.lx = 0; this.name = null; this.modified = false;
    this.cols = 27; this.rows = 12;
    if (arg) this.loadFile(arg);
  }
  loadFile(name) {
    const f = this.d.sys.drive.disk && this.d.sys.drive.disk.files.find(x => x.name === name);
    if (!f) return;
    this.lines = String.fromCharCode(...f.data).split('\r'); if (!this.lines.length) this.lines = [''];
    this.name = name; this.cx = this.cy = this.top = this.lx = 0; this.modified = false; this.win.title = fileName(name).slice(0, 14);
  }
  canClose() { if (!this.modified) return true; this.d.confirm('Close without saving?', (ok) => { if (ok) this.d.close(this.win); }); return false; }
  text() { return this.lines.join('\r'); }
  save(name) {
    const dr = this.d.sys.drive; if (!dr.disk) { this.d.alert('No disk in the drive.'); return; }
    let n = name.trim().toUpperCase(); if (!n) return; if (!n.includes('.')) n += '.DOC';
    const pet = asciiToPet(n);
    const data = Uint8Array.from([...this.text()].map(c => c.charCodeAt(0) & 255));
    const ex = dr.disk.files.find(f => f.name === pet);
    const go = () => { const f = { name: pet.slice(0, 16), type: 'SEQ', data }; const i = dr.disk.files.findIndex(x => x.name === pet); if (i >= 0) dr.disk.files[i] = f; else dr.disk.files.push(f); dr.persist(); dr.touch(1); this.name = pet; this.modified = false; this.win.title = n.slice(0, 14); this.d.dirty = true; };
    if (ex) this.d.confirm('Replace ' + n + '?', (ok) => ok && go()); else go();
  }
  key(p) {
    const L = this.lines;
    if (p === 13) { const rest = L[this.cy].slice(this.cx); L[this.cy] = L[this.cy].slice(0, this.cx); L.splice(this.cy + 1, 0, rest); this.cy++; this.cx = 0; this.modified = true; }
    else if (p === 20) { if (this.cx > 0) { L[this.cy] = L[this.cy].slice(0, this.cx - 1) + L[this.cy].slice(this.cx); this.cx--; } else if (this.cy > 0) { this.cx = L[this.cy - 1].length; L[this.cy - 1] += L[this.cy]; L.splice(this.cy, 1); this.cy--; } this.modified = true; }
    else if (p === 29) { if (this.cx < L[this.cy].length) this.cx++; else if (this.cy < L.length - 1) { this.cy++; this.cx = 0; } }
    else if (p === 157) { if (this.cx > 0) this.cx--; else if (this.cy > 0) { this.cy--; this.cx = L[this.cy].length; } }
    else if (p === 17) { if (this.cy < L.length - 1) { this.cy++; this.cx = Math.min(this.cx, L[this.cy].length); } }
    else if (p === 145) { if (this.cy > 0) { this.cy--; this.cx = Math.min(this.cx, L[this.cy].length); } }
    else if (p === 19) { this.cx = 0; }
    else { const ch = keyChar(p); if (ch && L[this.cy].length < 200) { L[this.cy] = L[this.cy].slice(0, this.cx) + ch + L[this.cy].slice(this.cx); this.cx++; this.modified = true; } }
    if (this.cy < this.top) this.top = this.cy; if (this.cy >= this.top + this.rows) this.top = this.cy - this.rows + 1;
    if (this.cx < this.lx) this.lx = this.cx; if (this.cx >= this.lx + this.cols) this.lx = this.cx - this.cols + 1;
  }
  mouse(type, x, y) {
    if (type !== 'down') return;
    const d = this.d;
    if (y < 14) {
      const bs = [['New', 3], ['Open', 37], ['Save', 79], ['Save as', 121]];
      for (const [lab, bx] of bs) if (inside(x, y, bx, 1, lab.length * 8 + 8, 12)) {
        if (lab === 'New') { const go = () => { this.lines = ['']; this.cx = this.cy = this.top = this.lx = 0; this.name = null; this.modified = false; this.win.title = 'Notepad'; }; this.modified ? d.confirm('Discard changes?', ok => ok && go()) : go(); }
        if (lab === 'Open') { const fs = (d.sys.drive.disk ? d.sys.drive.disk.files : []).filter(f => f.type === 'SEQ'); d.choose('Open a document', fs.map(f => fileName(f.name)), (i) => { if (i !== null && i !== undefined && fs[i]) this.loadFile(fs[i].name); }); }
        if (lab === 'Save') { if (this.name) this.save(fileName(this.name)); else d.prompt('Save as:', '', (t) => t && this.save(t)); }
        if (lab === 'Save as') d.prompt('Save as:', this.name ? fileName(this.name) : '', (t) => t && this.save(t));
      }
      return;
    }
    const col = Math.floor(x / 8) + this.lx, row = Math.floor((y - 15) / 9) + this.top;
    if (row >= 0 && row < this.lines.length) { this.cy = row; this.cx = Math.min(col, this.lines[row].length); }
  }
  draw(g, x, y, w, h) {
    [['New', 3], ['Open', 37], ['Save', 79], ['Save as', 121]].forEach(([lab, bx]) => button(g, x + bx, y + 1, lab.length * 8 + 8, lab));
    g.line(x, y + 14, x + w, y + 14);
    for (let r = 0; r < this.rows; r++) {
      const li = this.top + r; if (li >= this.lines.length) break;
      g.text(x + 2, y + 16 + r * 9 + (r ? 0 : 0), this.lines[li].slice(this.lx, this.lx + this.cols));
    }
    if (this.d.win[this.d.win.length - 1] === this.win && ((performance.now() / 500) | 0) % 2 === 0) { const cxp = x + 2 + (this.cx - this.lx) * 8, cyp = y + 16 + (this.cy - this.top) * 9; g.rect(cxp, cyp, 2, 8, 1); }
  }
  tick() { if (this.d.win[this.d.win.length - 1] === this.win) { const b = ((performance.now() / 500) | 0) % 2; if (b !== this._b) { this._b = b; this.d.dirty = true; } } }
}

// ---------------------------------------------------------------- Paint
const PW = 192, PH = 112;
class Paint {
  constructor(d, win, arg) {
    this.d = d; this.win = win; this.c = new Uint8Array(PW * PH); this.tool = 0; this.pat = 0; this.name = null; this.start = null; this.tmp = null; this.modified = false;
    this.tools = ['Pencil', 'Brush', 'Eraser', 'Line', 'Box', 'Fill'];
    if (arg) this.loadFile(arg);
  }
  canClose() { if (!this.modified) return true; this.d.confirm('Close without saving?', (ok) => { if (ok) this.d.close(this.win); }); return false; }
  val(x, y) { return this.pat === 0 ? 1 : this.pat === 1 ? 0 : ((x + y) & 1); }
  put(x, y, v) { if (x >= 0 && x < PW && y >= 0 && y < PH) this.c[y * PW + x] = v; }
  dab(x, y) {
    const t = this.tool;
    if (t === 0) this.put(x, y, this.val(x, y));
    else if (t === 1) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.put(x + i, y + j, this.val(x + i, y + j));
    else if (t === 2) for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) this.put(x + i, y + j, 0);
  }
  stroke(x0, y0, x1, y1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) this.dab(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n)); }
  shape(x0, y0, x1, y1) {
    this.c.set(this.tmp);
    if (this.tool === 3) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); this.put(x, y, this.val(x, y)); } }
    else { const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1); for (let x = ax; x <= bx; x++) { this.put(x, ay, this.val(x, ay)); this.put(x, by, this.val(x, by)); } for (let y = ay; y <= by; y++) { this.put(ax, y, this.val(ax, y)); this.put(bx, y, this.val(bx, y)); } }
  }
  fill(x, y) {
    if (x < 0 || y < 0 || x >= PW || y >= PH) return;
    const target = this.c[y * PW + x], seen = new Uint8Array(PW * PH), st = [[x, y]];
    while (st.length) {
      const [cx, cy] = st.pop(); if (cx < 0 || cy < 0 || cx >= PW || cy >= PH) continue;
      const i = cy * PW + cx; if (seen[i] || this.c[i] !== target) continue;
      seen[i] = 1; st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    for (let i = 0; i < seen.length; i++) if (seen[i]) this.c[i] = this.val(i % PW, (i / PW) | 0);
  }
  mouse(type, x, y) {
    const cx = x - 56, cy = y - 2;
    if (type === 'down') {
      for (let i = 0; i < 6; i++) if (inside(x, y, 2, 2 + i * 13, 50, 12)) { this.tool = i; return; }
      for (let i = 0; i < 3; i++) if (inside(x, y, 2 + i * 16, 82, 14, 11)) { this.pat = i; return; }
      if (inside(x, y, 2, 96, 50, 12)) { this.d.confirm('Clear the picture?', ok => { if (ok) { this.c.fill(0); this.modified = true; } }); return; }
      if (inside(x, y, 56, 116, 40, 12)) { this.d.prompt('Save picture as:', this.name ? fileName(this.name) : '', t => t && this.save(t)); return; }
      if (inside(x, y, 98, 116, 40, 12)) { const fs = (this.d.sys.drive.disk ? this.d.sys.drive.disk.files : []).filter(f => f.name.endsWith(asciiToPet('.PIC'))); this.d.choose('Open a picture', fs.map(f => fileName(f.name)), i => { if (i !== null && i !== undefined) this.loadFile(fs[i].name); }); return; }
      if (cx >= 0 && cx < PW && cy >= 0 && cy < PH) {
        this.modified = true; this.start = [cx, cy]; this.last = [cx, cy];
        if (this.tool === 5) { this.fill(cx, cy); this.start = null; }
        else if (this.tool >= 3) this.tmp = this.c.slice(); else this.dab(cx, cy);
      }
    } else if (type === 'move' && this.start) {
      if (this.tool >= 3) this.shape(this.start[0], this.start[1], cx, cy);
      else { this.stroke(this.last[0], this.last[1], cx, cy); this.last = [cx, cy]; }
    } else if (type === 'up') { this.start = null; this.tmp = null; }
  }
  save(name) {
    const dr = this.d.sys.drive; if (!dr.disk) { this.d.alert('No disk in the drive.'); return; }
    let n = name.trim().toUpperCase(); if (!n) return; if (!n.endsWith('.PIC')) n = n.replace(/\.[A-Z]*$/, '') + '.PIC';
    const pet = asciiToPet(n), data = new Uint8Array(PW * PH / 8);
    for (let i = 0; i < PW * PH; i++) if (this.c[i]) data[i >> 3] |= 0x80 >> (i & 7);
    const go = () => { const f = { name: pet.slice(0, 16), type: 'SEQ', data }; const i = dr.disk.files.findIndex(x => x.name === pet); if (i >= 0) dr.disk.files[i] = f; else dr.disk.files.push(f); dr.persist(); dr.touch(1); this.name = pet; this.modified = false; this.win.title = n.slice(0, 14); this.d.dirty = true; };
    if (dr.disk.files.some(f => f.name === pet) && this.name !== pet) this.d.confirm('Replace ' + n + '?', ok => ok && go()); else go();
  }
  loadFile(name) {
    const f = this.d.sys.drive.disk && this.d.sys.drive.disk.files.find(x => x.name === name); if (!f) return;
    this.c.fill(0); for (let i = 0; i < PW * PH && (i >> 3) < f.data.length; i++) this.c[i] = (f.data[i >> 3] >> (7 - (i & 7))) & 1;
    this.name = name; this.modified = false; this.win.title = fileName(name).slice(0, 14);
  }
  draw(g, x, y) {
    this.tools.forEach((t, i) => button(g, x + 2, y + 2 + i * 13, 50, t, this.tool === i));
    [0, 1, 2].forEach(i => { const bx = x + 2 + i * 16, by = y + 82; g.rect(bx, by, 14, 11, 0); g.box(bx, by, 14, 11, 1); if (i === 0) g.rect(bx + 3, by + 2, 8, 7, 1); if (i === 2) g.gray(bx + 3, by + 2, 8, 7); if (this.pat === i) g.box(bx - 1, by - 1, 16, 13); });
    button(g, x + 2, y + 96, 50, 'Clear');
    button(g, x + 56, y + 116, 40, 'Save'); button(g, x + 98, y + 116, 40, 'Open');
    g.box(x + 55, y + 1, PW + 2, PH + 2);
    for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) if (this.c[j * PW + i]) g.px(x + 56 + i, y + 2 + j, 1);
  }
}

// ---------------------------------------------------------------- Calculator
class Calc {
  constructor(d, win) { this.d = d; this.win = win; this.cur = '0'; this.acc = null; this.op = null; this.fresh = true; }
  static keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'];
  press(k) {
    if (/[0-9]/.test(k)) { this.cur = this.fresh ? k : (this.cur === '0' ? k : this.cur + k); this.fresh = false; if (this.cur.length > 11) this.cur = this.cur.slice(0, 11); }
    else if (k === '.') { if (this.fresh) { this.cur = '0.'; this.fresh = false; } else if (!this.cur.includes('.')) this.cur += '.'; }
    else if (k === 'C') { this.cur = '0'; this.acc = null; this.op = null; this.fresh = true; }
    else { this.apply(); this.op = k === '=' ? null : k; this.fresh = true; }
  }
  apply() {
    const v = parseFloat(this.cur);
    if (this.op && this.acc !== null) {
      let r = this.acc;
      if (this.op === '+') r += v; else if (this.op === '-') r -= v; else if (this.op === '*') r *= v; else if (this.op === '/') r = v === 0 ? NaN : r / v;
      this.acc = r; this.cur = Number.isFinite(r) ? String(parseFloat(r.toPrecision(10))) : 'Error';
      if (this.cur.length > 11) this.cur = r.toExponential(4);
    } else this.acc = v;
    if (this.cur === 'Error') { this.acc = null; this.op = null; }
  }
  key(p) { const ch = keyChar(p); if (/[0-9.]/.test(ch)) this.press(ch); else if (['+', '-', '*', '/'].includes(ch)) this.press(ch); else if (p === 13 || ch === '=') this.press('='); else if (p === 20 || p === 147 || ch === 'c') this.press('C'); this.d.dirty = true; }
  mouse(type, x, y) {
    if (type !== 'down') return;
    for (let i = 0; i < 16; i++) { const bx = 4 + (i % 4) * 27, by = 24 + Math.floor(i / 4) * 17; if (inside(x, y, bx, by, 24, 14)) this.press(Calc.keys[i]); }
    if (inside(x, y, 4, 92, 108, 12)) this.press('C');
  }
  draw(g, x, y) {
    g.box(x + 3, y + 3, 108, 16); g.text(x + 108 - this.cur.length * 8, y + 7, this.cur);
    Calc.keys.forEach((k, i) => button(g, x + 4 + (i % 4) * 27, y + 24 + Math.floor(i / 4) * 17 - 0, 24, k, this.op === k && this.fresh));
    button(g, x + 4, y + 92, 108, 'Clear');
  }
}

// ---------------------------------------------------------------- Clock
class Clock {
  constructor(d, win) { this.d = d; this.win = win; this.t = -1; }
  tick() { const s = Math.floor(Date.now() / 1000); if (s !== this.t) { this.t = s; this.d.dirty = true; } }
  draw(g, x, y) {
    const d = new Date(), cx = x + 62, cy = y + 48, R = 42;
    for (let a = 0; a < 120; a++) { const t = a / 120 * Math.PI * 2; g.px(Math.round(cx + Math.cos(t) * R), Math.round(cy + Math.sin(t) * R)); }
    for (let h = 0; h < 12; h++) { const t = h / 12 * Math.PI * 2 - Math.PI / 2; g.line(Math.round(cx + Math.cos(t) * (R - 5)), Math.round(cy + Math.sin(t) * (R - 5)), Math.round(cx + Math.cos(t) * (R - 1)), Math.round(cy + Math.sin(t) * (R - 1))); }
    const hand = (frac, len, thick) => { const t = frac * Math.PI * 2 - Math.PI / 2, ex = Math.round(cx + Math.cos(t) * len), ey = Math.round(cy + Math.sin(t) * len); g.line(cx, cy, ex, ey); if (thick) { g.line(cx + 1, cy, ex + 1, ey); g.line(cx, cy + 1, ex, ey + 1); } };
    hand((d.getHours() % 12 + d.getMinutes() / 60) / 12, 22, true); hand((d.getMinutes() + d.getSeconds() / 60) / 60, 32, true); hand(d.getSeconds() / 60, 36, false);
    const ds = d.toDateString().slice(0, 10); g.text(x + 64 - ds.length * 4, y + 96, ds);
  }
}

// ---------------------------------------------------------------- File manager
class Files {
  constructor(d, win) { this.d = d; this.win = win; this.sel = -1; this.top = 0; this.lastT = 0; }
  files() { return this.d.sys.drive.disk ? this.d.sys.drive.disk.files : []; }
  openFile(f) {
    const d = this.d, n = fileName(f.name).toUpperCase();
    if (n.endsWith('.DOC')) d.open('notes', f.name);
    else if (n.endsWith('.PIC')) d.open('paint', f.name);
    else if (f.type === 'PRG') d.confirm('Run ' + n.slice(0, 14) + '?|Desk64 will close.', (ok) => { if (ok) { d.runAfter = f.name; d.quit(); } });
    else d.alert('Desk64 cannot open|this kind of file.');
  }
  mouse(type, x, y) {
    if (type !== 'down') return;
    const d = this.d, fs = this.files(), now = performance.now();
    if (y >= 16 && y < 16 + 9 * 11 && x < 214) {
      const i = this.top + Math.floor((y - 16) / 11);
      if (i < fs.length) { if (i === this.sel && now - this.lastT < 450) { this.openFile(fs[i]); return; } this.sel = i; this.lastT = now; }
      return;
    }
    if (x >= 216 && y >= 16 && y < 70) { if (y < 43 && this.top > 0) this.top--; else if (y >= 43 && this.top + 9 < fs.length) this.top++; return; }
    const f = fs[this.sel];
    if (inside(x, y, 3, 1, 40, 12)) { if (f) this.openFile(f); else d.alert('Select a file first.'); }
    else if (inside(x, y, 45, 1, 56, 12)) { if (f) d.confirm('Delete ' + fileName(f.name).slice(0, 14) + '?|This cannot be undone.', ok => { if (ok) { fs.splice(fs.indexOf(f), 1); d.sys.drive.persist(); this.sel = -1; d.dirty = true; } }); else d.alert('Select a file first.'); }
    else if (inside(x, y, 103, 1, 56, 12)) { if (f) d.prompt('Rename to:', fileName(f.name), t => { if (!t) return; const nn = asciiToPet(t.toUpperCase()); if (fs.some(o => o.name === nn)) d.alert('That name is taken.'); else { f.name = nn.slice(0, 16); d.sys.drive.persist(); } }); else d.alert('Select a file first.'); }
    else if (inside(x, y, 161, 1, 66, 12)) {
      const ids = d.sys.store.listDisks().filter(i => !i.startsWith('~'));
      d.choose('Switch disk', ids.map(id => petToAscii(d.sys.store.load(id).name).toUpperCase()), i => { if (i !== null && i !== undefined) { d.sys.drive.insert(d.sys.store.load(ids[i])); this.sel = -1; this.top = 0; d.sys.drive.touch(1.2); } });
    }
  }
  draw(g, x, y, w, h) {
    button(g, x + 3, y + 1, 40, 'Open'); button(g, x + 45, y + 1, 56, 'Delete'); button(g, x + 103, y + 1, 56, 'Rename'); button(g, x + 161, y + 1, 66, 'Disk...');
    g.line(x, y + 14, x + w, y + 14);
    const dr = this.d.sys.drive, fs = this.files();
    if (!dr.disk) { g.text(x + 8, y + 40, 'No disk in the drive'); return; }
    for (let r = 0; r < 9; r++) {
      const i = this.top + r; if (i >= fs.length) break; const f = fs[i], on = i === this.sel;
      g.rect(x + 1, y + 16 + r * 11, 213, 11, on ? 1 : 0);
      g.box(x + 3, y + 18 + r * 11, 7, 8, on ? 0 : 1);
      g.text(x + 14, y + 18 + r * 11, fileName(f.name).slice(0, 16).padEnd(16), on);
      g.text(x + 14 + 17 * 8, y + 18 + r * 11, (f.type + '    ').slice(0, 3) + String(dr.blocksOf(f)).padStart(4), on);
    }
    g.box(x + 215, y + 15, 14, 56); g.text(x + 218, y + 17, '^'); g.text(x + 218, y + 56, 'v');
    g.line(x, y + 117, x + w, y + 117);
    g.text(x + 4, y + 122, (petToAscii(dr.disk.name) + '').toUpperCase().slice(0, 14) + ' ' + dr.freeBlocks() + ' free');
  }
}
