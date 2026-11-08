// Screen editor / KERNAL I/O re-implemented in JS. State lives in the usual zero-page and
// page-2 locations so PEEK/POKE tricks (646 colour, 198/631 key buffer, 211/214 cursor...) work.

export const COLS = 40, ROWS = 25;
const COLOR_CODES = { 144: 0, 5: 1, 28: 2, 159: 3, 156: 4, 30: 5, 31: 6, 158: 7, 129: 8, 149: 9, 150: 10, 151: 11, 152: 12, 153: 13, 154: 14, 155: 15 };

export function petToScreen(c) {
  if (c < 0x20) return c | 0x80;           // shouldn't happen for printables
  if (c < 0x40) return c;
  if (c < 0x60) return c - 0x40;
  if (c < 0x80) return c - 0x20;
  if (c < 0xa0) return (c - 0x40) | 0x80;
  if (c < 0xc0) return c - 0x40;
  if (c < 0xff) return c - 0x80;
  return 0x5e;
}
export function screenToPet(sc, inQuote) {
  const rev = sc & 0x80, b = sc & 0x7f;
  if (rev && inQuote) {
    if (b < 0x20) return b;
    if (b >= 0x40 && b < 0x60) return b + 0x40;
  }
  if (b < 0x20) return b + 0x40;
  if (b < 0x40) return b;
  if (b < 0x60) return b + 0x80;
  return b + 0x40;
}

export class Kernal {
  constructor(m) {
    this.m = m;
    this.links = new Array(ROWS).fill(false); // true = row continues the previous row
    this.row = 0; this.col = 0;
    this.quote = false; this.insert = 0; this.rvs = false;
    this.blinkOn = false; this.blinkT = 0; this.cursorUnder = 32; this.cursorUnderColor = 14;
    this.inputActive = false; this.onLine = null;
    this.inputStart = null;
    this.output = null; // redirect hook (CMD / files)
  }

  get ram() { return this.m.ram; }
  get textColor() { return this.ram[646] & 15; }
  set textColor(v) { this.ram[646] = v & 15; }
  get screenBase() { return (this.ram[648] || 4) * 256; }

  coldStart() {
    const r = this.ram;
    r[646] = 14; r[648] = 4; r[649] = 10; r[198] = 0; r[650] = 0; r[657] = 0;
    r[43] = 0x01; r[44] = 0x08; r[55] = 0x00; r[56] = 0xa0;
    r[0x314] = 0x31; r[0x315] = 0xea; r[0x318] = 0x47; r[0x319] = 0xfe;
    r[785] = 0x48; r[786] = 0xb2; // USR -> ILLEGAL QUANTITY
    // KERNAL vectors at top of memory point into our trap area
    r[0xfffe] = 0x48; r[0xffff] = 0xff; r[0xfffa] = 0x43; r[0xfffb] = 0xfe;
    this.clear();
  }

  // --- low level screen access -----------------------------------
  put(row, col, sc, color) {
    const i = row * COLS + col;
    this.ram[this.screenBase + i] = sc;
    this.m.color[i] = color;
  }
  get(row, col) { return this.ram[this.screenBase + row * COLS + col]; }

  hideCursor() {
    if (this.blinkOn) { this.put(this.row, this.col, this.cursorUnder, this.cursorUnderColor); this.blinkOn = false; }
  }
  tickCursor(dt, enabled) {
    if (!enabled) { this.hideCursor(); return; }
    this.blinkT += dt;
    if (this.blinkT >= 0.333) {
      this.blinkT = 0;
      if (this.blinkOn) this.hideCursor();
      else {
        this.cursorUnder = this.get(this.row, this.col);
        this.cursorUnderColor = this.m.color[this.row * COLS + this.col];
        this.put(this.row, this.col, this.cursorUnder ^ 0x80, this.textColor);
        this.blinkOn = true;
      }
    }
  }

  clear() {
    this.hideCursor();
    for (let i = 0; i < 1000; i++) { this.ram[this.screenBase + i] = 32; this.m.color[i] = this.textColor; }
    this.links.fill(false);
    this.row = 0; this.col = 0; this.syncPos();
  }
  syncPos() {
    // 211 = column within logical line, 214 = physical row
    this.ram[214] = this.row;
    this.ram[211] = this.col + (this.links[this.row] ? 40 : 0);
    this.ram[212] = this.quote ? 1 : 0; this.ram[216] = this.insert; this.ram[199] = this.rvs ? 1 : 0;
  }
  readPos() {
    // honour POKEs to 211/214 (used by SYS 58732)
    let r = this.ram[214], c = this.ram[211];
    if (r > 24) r = 24;
    if (c >= 40) { c -= 40; if (r < 24) r++; }
    this.row = r; this.col = Math.min(c, 39);
  }
  setCursor(r, c) { this.hideCursor(); this.row = Math.max(0, Math.min(24, r)); this.col = Math.max(0, Math.min(39, c)); this.syncPos(); }
  lineStart(r = this.row) { while (r > 0 && this.links[r]) r--; return r; }
  lineEnd(r = this.row) { const s = this.lineStart(r); return (s < 24 && this.links[s + 1]) ? s + 1 : s; }
  logicalCol() { return this.col + (this.links[this.row] ? 40 : 0); }

  scrollUp() {
    const base = this.screenBase, r = this.ram, cr = this.m.color;
    r.copyWithin(base, base + 40, base + 1000); cr.copyWithin(0, 40, 1000);
    for (let i = 960; i < 1000; i++) { r[base + i] = 32; cr[i] = this.textColor; }
    this.links.shift(); this.links.push(false); this.links[0] = false;
    if (this.inputStart) this.inputStart.row--;
  }
  insertRow(at) { // insert blank physical row at `at`, pushing rows below down
    const base = this.screenBase, r = this.ram, cr = this.m.color;
    if (at > 24) return;
    r.copyWithin(base + (at + 1) * 40, base + at * 40, base + 960);
    cr.copyWithin((at + 1) * 40, at * 40, 960);
    for (let i = 0; i < 40; i++) { r[base + at * 40 + i] = 32; cr[at * 40 + i] = this.textColor; }
    this.links.splice(at, 0, false); this.links.pop();
  }

  newline() {
    const end = this.lineEnd();
    this.col = 0;
    if (end >= 24) { this.scrollUp(); this.row = 24; if (this.links[24]) this.links[24] = false; }
    else this.row = end + 1;
    this.links[this.row] = false;
    this.quote = false; this.insert = 0; this.rvs = false;
  }

  advance() {
    if (this.col < 39) { this.col++; return; }
    // wrapping past column 39
    if (!this.links[this.row]) {
      // first physical row of the logical line: link the next row
      if (this.row === 24) { this.scrollUp(); this.row = 23; }
      if (!(this.row < 24 && this.links[this.row + 1])) this.insertRow(this.row + 1);
      this.links[this.row + 1] = true;
      this.row++; this.col = 0;
    } else {
      // end of an 80 column logical line: start a new line
      if (this.row === 24) { this.scrollUp(); this.row = 24; }
      else this.row++;
      this.links[this.row] = false; this.col = 0;
      this.quote = false;
    }
  }

  // logical line as array of [row,col] cells
  cells(r = this.row) {
    const s = this.lineStart(r), e = this.lineEnd(r), out = [];
    for (let rr = s; rr <= e; rr++) for (let c = 0; c < 40; c++) out.push([rr, c]);
    return out;
  }

  del() {
    const cells = this.cells(), pos = this.logicalCol();
    if (pos === 0) {
      // at start of a logical line: cursor moves to end of previous line (no delete)
      if (this.row > 0) { this.row--; this.col = 39; }
      return;
    }
    for (let i = pos; i < cells.length; i++) {
      const [r, c] = cells[i], [pr, pc] = cells[i - 1];
      this.put(pr, pc, this.get(r, c), this.m.color[r * 40 + c]);
    }
    const [lr, lc] = cells[cells.length - 1];
    this.put(lr, lc, 32, this.textColor);
    if (this.col > 0) this.col--; else { this.row--; this.col = 39; }
  }
  inst() {
    let cells = this.cells(), pos = this.logicalCol();
    const [lr, lc] = cells[cells.length - 1];
    if ((this.get(lr, lc) & 0x7f) !== 32) {
      if (cells.length >= 80) return;
      // need another physical row
      const end = this.lineEnd();
      if (end === 24) { this.scrollUp(); this.row--; }
      const e2 = this.lineEnd();
      this.insertRow(e2 + 1); this.links[e2 + 1] = true;
      cells = this.cells(); pos = this.logicalCol();
    }
    for (let i = cells.length - 1; i > pos; i--) {
      const [r, c] = cells[i], [pr, pc] = cells[i - 1];
      this.put(r, c, this.get(pr, pc), this.m.color[pr * 40 + pc]);
    }
    this.put(this.row, this.col, 32, this.textColor);
    this.insert++;
  }

  // CHROUT to screen
  out(c) {
    if (this.output) { this.output(c); return; }
    this.screenOut(c);
  }
  print(str) { for (let i = 0; i < str.length; i++) this.out(str.charCodeAt(i)); }

  screenOut(c) {
    this.hideCursor();
    c &= 0xff;
    const literal = (this.quote || this.insert > 0) && c !== 13 && c !== 141 && !(c === 20 && this.quote && !this.insert);
    if (c === 13 || c === 141) { this.newline(); this.syncPos(); return; }
    if ((c < 32 || (c >= 128 && c < 160)) && !literal) {
      this.control(c); this.syncPos(); return;
    }
    let sc;
    if (c < 32) sc = c | 0x80;
    else if (c >= 128 && c < 160) sc = ((c - 0x40) | 0x80);
    else { sc = petToScreen(c); if (this.rvs) sc |= 0x80; }
    if (c === 34) this.quote = !this.quote;
    if (this.insert > 0) this.insert--;
    this.put(this.row, this.col, sc, this.textColor);
    this.advance();
    this.syncPos();
  }

  control(c) {
    if (COLOR_CODES[c] !== undefined) { this.textColor = COLOR_CODES[c]; return; }
    switch (c) {
      case 147: this.clear(); break;
      case 19: this.row = 0; this.col = 0; break;
      case 17: if (this.row < 24) this.row++; else { this.scrollUp(); } break;
      case 145: if (this.row > 0) this.row--; break;
      case 29: this.advanceCursorOnly(); break;
      case 157: if (this.col > 0) this.col--; else if (this.row > 0) { this.row--; this.col = 39; } break;
      case 20: this.del(); break;
      case 148: this.inst(); break;
      case 18: this.rvs = true; break;
      case 146: this.rvs = false; break;
      case 14: this.m.vic[0x18] |= 2; break;
      case 142: this.m.vic[0x18] &= ~2; break;
      case 8: this.ram[657] = 0x80; break;
      case 9: this.ram[657] = 0; break;
      default: break;
    }
  }
  advanceCursorOnly() {
    if (this.col < 39) this.col++;
    else if (this.row < 24) { this.row++; this.col = 0; }
    else { this.scrollUp(); this.col = 0; }
  }

  // --- keyboard buffer ----------------------------------------------
  pushKey(p) {
    const r = this.ram, n = r[198];
    if (n >= (r[649] || 10)) return false;
    r[631 + n] = p; r[198] = n + 1; return true;
  }
  getKey() {
    const r = this.ram, n = r[198];
    if (!n) return 0;
    const k = r[631];
    r.copyWithin(631, 632, 631 + n); r[198] = n - 1;
    return k;
  }

  // --- line input (direct mode / INPUT) ------------------------------
  beginInput(onLine, fromPrompt) {
    this.inputActive = true; this.onLine = onLine;
    this.inputStart = fromPrompt ? { row: this.row, col: this.logicalCol(), line: this.lineStart() } : null;
    this.quote = false; this.insert = 0;
  }
  // feed pending keys to the editor; returns true when a line was completed
  serviceInput() {
    if (!this.inputActive) return false;
    let k;
    while (this.inputActive && (k = this.getKey())) {
      if (k === 13) { this.finishLine(); return true; }
      if (k === 3) continue;                   // RUN/STOP ignored while editing
      if (k === 131) { this.injectString('LOAD\rRUN\r'); continue; }
      this.screenOut(k);
    }
    return false;
  }
  injectString(s) { for (const ch of s) this.pushKey(ch.charCodeAt(0)); }

  readLogicalLine(fromCol = 0) {
    const cells = this.cells();
    let txt = []; let q = false;
    for (let i = fromCol; i < cells.length; i++) {
      const [r, c] = cells[i];
      const sc = this.get(r, c);
      const p = screenToPet(sc, q);
      if (p === 34) q = !q;
      txt.push(p);
    }
    while (txt.length && txt[txt.length - 1] === 32) txt.pop();
    return txt;
  }

  finishLine() {
    this.hideCursor();
    let from = 0;
    if (this.inputStart && this.lineStart() === this.inputStart.line) from = this.inputStart.col;
    const txt = this.readLogicalLine(from);
    // move the cursor to the line after the logical line
    const end = this.lineEnd();
    this.row = end; this.col = 39;
    this.newline();
    this.syncPos();
    this.inputActive = false;
    const cb = this.onLine; this.onLine = null; this.inputStart = null;
    cb && cb(txt);
  }
}
