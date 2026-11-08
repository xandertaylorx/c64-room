// BASIC V2 interpreter. Programs live tokenised in RAM at $0801 exactly like on the real machine,
// so LOAD/SAVE of .PRG files, PEEK/POKE into the program, and LIST all behave authentically.

export const TOKENS = ['END', 'FOR', 'NEXT', 'DATA', 'INPUT#', 'INPUT', 'DIM', 'READ', 'LET', 'GOTO', 'RUN', 'IF', 'RESTORE', 'GOSUB', 'RETURN', 'REM', 'STOP', 'ON', 'WAIT', 'LOAD', 'SAVE', 'VERIFY', 'DEF', 'POKE', 'PRINT#', 'PRINT', 'CONT', 'LIST', 'CLR', 'CMD', 'SYS', 'OPEN', 'CLOSE', 'GET', 'NEW', 'TAB(', 'TO', 'FN', 'SPC(', 'THEN', 'NOT', 'STEP', '+', '-', '*', '/', '^', 'AND', 'OR', '>', '=', '<', 'SGN', 'INT', 'ABS', 'USR', 'FRE', 'POS', 'SQR', 'RND', 'LOG', 'EXP', 'COS', 'SIN', 'TAN', 'ATN', 'PEEK', 'LEN', 'STR$', 'VAL', 'ASC', 'CHR$', 'LEFT$', 'RIGHT$', 'MID$', 'GO'];
const T = {}; TOKENS.forEach((k, i) => { T[k] = 0x80 + i; });
const KW = TOKENS.map(k => [...k].map(c => c.charCodeAt(0)));
const PI_TOKEN = 0xff;

const MSG = {
  FILES: 'TOO MANY FILES', OPEN: 'FILE OPEN', NOTOPEN: 'FILE NOT OPEN', NOTFOUND: 'FILE NOT FOUND', DEVICE: 'DEVICE NOT PRESENT',
  NOTIN: 'NOT INPUT FILE', NOTOUT: 'NOT OUTPUT FILE', NAME: 'MISSING FILE NAME', ILLDEV: 'ILLEGAL DEVICE NUMBER',
  NEXT: 'NEXT WITHOUT FOR', SYNTAX: 'SYNTAX', RETURN: 'RETURN WITHOUT GOSUB', DATA: 'OUT OF DATA', QTY: 'ILLEGAL QUANTITY',
  OVERFLOW: 'OVERFLOW', MEMORY: 'OUT OF MEMORY', UNDEF: "UNDEF'D STATEMENT", SUBSCRIPT: 'BAD SUBSCRIPT', REDIM: "REDIM'D ARRAY",
  DIV0: 'DIVISION BY ZERO', DIRECT: 'ILLEGAL DIRECT', TYPE: 'TYPE MISMATCH', LONG: 'STRING TOO LONG', FDATA: 'FILE DATA',
  COMPLEX: 'FORMULA TOO COMPLEX', CONT: "CAN'T CONTINUE", UNDEFFN: "UNDEF'D FUNCTION", VERIFY: 'VERIFY', LOAD: 'LOAD',
};
class BasicError extends Error { constructor(code, line) { super(code); this.code = code; this.line = line; } }
const err = (c) => { throw new BasicError(c); };

const isDigit = (c) => c >= 0x30 && c <= 0x39;
const isAlpha = (c) => c >= 0x41 && c <= 0x5a;
const str = (arr) => String.fromCharCode(...arr);

// --- number formatting as the C64 prints it -------------------------------
export function fmtNum(n) {
  if (!isFinite(n)) err('OVERFLOW');
  if (n === 0) return ' 0';
  const neg = n < 0; const a = Math.abs(n);
  let [mant, exp] = a.toExponential(8).split('e');
  let e = parseInt(exp, 10);
  let digits = mant.replace('.', '').replace(/0+$/, '');
  if (digits === '') digits = '0';
  let out;
  if (e >= -2 && e <= 8) {
    if (e >= 0) {
      if (digits.length <= e + 1) out = digits + '0'.repeat(e + 1 - digits.length);
      else out = digits.slice(0, e + 1) + '.' + digits.slice(e + 1);
    } else out = '.' + '0'.repeat(-e - 1) + digits;
  } else {
    out = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'E' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
  }
  return (neg ? '-' : ' ') + out;
}

export function parseNumberText(s) {
  // VAL(): leading spaces ignored, stops at first non-numeric character
  let i = 0, t = '';
  const sk = () => { while (s[i] === ' ') i++; };
  sk();
  if (s[i] === '+' || s[i] === '-') { t += s[i++]; }
  sk();
  let any = false;
  while (i < s.length) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') { t += ch; any = true; i++; }
    else if (ch === '.' && !t.includes('.') && !t.includes('E')) { t += ch; i++; }
    else if (ch === ' ') i++;
    else if (ch === 'E' && any && !t.includes('E')) {
      let j = i + 1; while (s[j] === ' ') j++;
      let sign = ''; if (s[j] === '+' || s[j] === '-') { sign = s[j]; j++; }
      while (s[j] === ' ') j++;
      if (s[j] >= '0' && s[j] <= '9') { t += 'E' + sign; i = j; } else break;
    } else break;
  }
  const v = parseFloat(t);
  return isNaN(v) ? 0 : v;
}

// --- tokeniser ----------------------------------------------------------
export function crunch(txt) {
  const out = []; let i = 0, q = false, data = false, rem = false;
  while (i < txt.length) {
    const c = txt[i];
    if (rem) { out.push(c); i++; continue; }
    if (c === 34) { q = !q; out.push(c); i++; continue; }
    if (q) { out.push(c); i++; continue; }
    if (data) { if (c === 58) data = false; out.push(c); i++; continue; }
    if (c === 63) { out.push(T.PRINT); i++; continue; }
    if (c === 32 || (c >= 0x30 && c <= 0x3b) || c === 255) { out.push(c); i++; continue; }
    let tok = -1, len = 0;
    for (let k = 0; k < KW.length && tok < 0; k++) {
      const kw = KW[k]; let j = 0;
      while (j < kw.length) {
        const ic = txt[i + j];
        if (ic === kw[j]) { j++; continue; }
        if (j > 0 && ic === (kw[j] | 0x80) && isAlpha(kw[j])) { tok = k; len = j + 1; }
        break;
      }
      if (tok < 0 && j === kw.length) { tok = k; len = j; }
    }
    if (tok >= 0) {
      out.push(0x80 + tok); i += len;
      if (0x80 + tok === T.DATA) data = true;
      if (0x80 + tok === T.REM) rem = true;
      continue;
    }
    out.push(c); i++;
  }
  return out;
}

export class Basic {
  constructor(sys) {
    this.sys = sys; this.m = sys.m; this.k = sys.k;
    this.state = 'direct';
    this.vars = new Map(); this.arrays = new Map(); this.fns = new Map();
    this.stack = []; this.files = new Map();
    this.p = 0; this.line = -1; this.lineAddr = 0;
    this.cont = null; this.st = 0; this.rndSeed = 0x12345;
    this.lastRnd = 0.5;
    this.index = null; this.outFile = null; this.cmdFile = null;
    this.timer = 0; this.pending = null;
    this.breakReq = false;
  }
  get ram() { return this.m.ram; }
  rd16(a) { return this.ram[a] | (this.ram[a + 1] << 8); }
  wr16(a, v) { this.ram[a] = v & 0xff; this.ram[a + 1] = (v >> 8) & 0xff; }
  get txtTab() { return this.rd16(43); }
  get varTab() { return this.rd16(45); }

  // ---- program storage -------------------------------------------------
  newProgram() {
    const s = this.txtTab; this.ram[s] = 0; this.ram[s + 1] = 0; this.wr16(45, s + 2);
    this.index = null; this.clr(); this.cont = null;
  }
  lines() {
    const out = []; let a = this.txtTab, guard = 0;
    while (guard++ < 20000) {
      const next = this.rd16(a);
      if (next === 0 || this.ram[a + 1] === 0) break;
      out.push({ addr: a, num: this.rd16(a + 2), next });
      a = next;
      if (a < 0x0801 || a > 0xffff) break;
    }
    return out;
  }
  relink() {
    let a = this.txtTab, guard = 0;
    while (guard++ < 20000) {
      if (this.ram[a + 1] === 0 && this.ram[a] === 0) break;
      let e = a + 4; while (this.ram[e] !== 0 && e < 0xffff) e++;
      const next = e + 1;
      this.wr16(a, next);
      a = next;
      if (this.rd16(a) === 0) { break; }
    }
    this.wr16(45, a + 2);
    this.index = null;
  }
  storeLine(num, bytes) {
    const all = this.lines().map(l => {
      let e = l.addr + 4; while (this.ram[e] !== 0) e++;
      return [l.num, Array.from(this.ram.subarray(l.addr + 4, e))];
    });
    const i = all.findIndex(l => l[0] >= num);
    if (i >= 0 && all[i][0] === num) all.splice(i, 1);
    if (bytes.length) { const j = all.findIndex(l => l[0] > num); all.splice(j < 0 ? all.length : j, 0, [num, bytes]); }
    let a = this.txtTab;
    for (const [n, b] of all) {
      const next = a + 4 + b.length + 1;
      if (next > 0x9fff) err('MEMORY');
      this.wr16(a, next); this.wr16(a + 2, n);
      this.ram.set(b, a + 4); this.ram[next - 1] = 0; a = next;
    }
    this.ram[a] = 0; this.ram[a + 1] = 0; this.wr16(45, a + 2);
    this.index = null; this.clr(); this.cont = null;
  }
  findLine(num) {
    if (!this.index) { this.index = new Map(); for (const l of this.lines()) this.index.set(l.num, l.addr); }
    const a = this.index.get(num);
    if (a === undefined) err('UNDEF');
    return a;
  }
  clr() {
    this.vars.clear(); this.arrays.clear(); this.fns.clear(); this.stack = [];
    this.dataAddr = null; this.dataP = 0; this.dataNeed = false;
    this.closeAll();
  }
  closeAll() {
    for (const f of this.files.values()) this.closeDev(f);
    this.files.clear(); this.outFile = null; this.cmdFile = null; this.k.output = null;
  }

  // ---- output ----------------------------------------------------------
  out(c) {
    const f = this.outFile ?? this.cmdFile;
    if (f) this.fileWrite(f, c); else this.k.out(c);
  }
  print(s) { for (let i = 0; i < s.length; i++) this.out(s.charCodeAt(i)); }
  pos() { return this.k.logicalCol(); }

  ready() {
    this.outFile = null; this.cmdFile = null; this.k.output = null;
    this.k.print('\rREADY.\r');
    this.toDirect();
  }
  toDirect() {
    this.state = 'direct'; this.line = -1; this.outFile = null; this.cmdFile = null; this.k.output = null;
    this.k.beginInput((txt) => this.enterLine(txt), false);
  }
  error(e) {
    if (!(e instanceof BasicError)) { console.error(e); e = new BasicError('SYNTAX'); }
    this.outFile = null; this.cmdFile = null; this.k.output = null;
    this.sys.onError && this.sys.onError();
    if (this.k.col !== 0) this.k.out(13);
    const ln = e.line ?? this.line;
    if (e.code === 'BREAK') this.k.print('BREAK');
    else this.k.print('?' + MSG[e.code] + '  ERROR');
    if (ln >= 0) this.k.print(' IN ' + ln);
    if (e.code !== 'BREAK') this.cont = null;
    this.ready();
  }

  // ---- direct mode -----------------------------------------------------
  enterLine(txt) {
    let i = 0; while (txt[i] === 32) i++;
    if (i >= txt.length) { this.toDirect(); return; }
    if (isDigit(txt[i])) {
      let n = 0; while (i < txt.length && (isDigit(txt[i]) || txt[i] === 32)) { if (txt[i] !== 32) n = n * 10 + txt[i] - 48; i++; if (n > 63999) break; }
      if (n > 63999) { this.error(new BasicError('SYNTAX', -1)); return; }
      try { this.storeLine(n, crunch(txt.slice(i))); } catch (e) { this.error(e); return; }
      this.toDirect();
      return;
    }
    const tok = crunch(txt.slice(i));
    if (tok.length > 88) { this.error(new BasicError('LONG', -1)); return; }
    this.ram.set(tok, 0x200); this.ram[0x200 + tok.length] = 0;
    this.p = 0x200; this.line = -1; this.lineAddr = 0;
    this.state = 'run';
  }

  // ---- execution loop ----------------------------------------------------
  // runs up to `budget` statements; returns when paused/finished
  run(budget) {
    let n = 0;
    while (this.state === 'run' && n < budget) {
      if (this.breakReq) { this.breakReq = false; this.doBreak(); return; }
      try { this.statement(); } catch (e) { this.error(e); return; }
      n++;
    }
  }
  doBreak() {
    if (this.line >= 0) { this.cont = { p: this.p, line: this.line, lineAddr: this.lineAddr }; }
    this.error(new BasicError('BREAK'));
  }

  cur() { let c; while ((c = this.ram[this.p]) === 32) this.p++; return c; }
  next() { this.p++; return this.cur(); }
  expect(c) { if (this.cur() !== c) err('SYNTAX'); this.p++; }
  atEnd() { const c = this.cur(); return c === 0 || c === 58; }
  skipStatement() {
    let q = false;
    for (; ;) { const c = this.ram[this.p]; if (c === 0) return; if (c === 34) q = !q; if (!q && c === 58) return; this.p++; }
  }
  skipLine() { while (this.ram[this.p] !== 0) this.p++; }

  nextLine() {
    if (this.line < 0) { this.finishDirect(); return false; }
    const next = this.rd16(this.lineAddr);
    if (!next || this.ram[next + 1] === 0) { this.endProgram(); return false; }
    this.lineAddr = next; this.line = this.rd16(next + 2); this.p = next + 4;
    return true;
  }
  finishDirect() { if (this.state === 'run') this.ready(); }
  endProgram() { this.cont = null; this.ready(); }
  gotoLine(num) { const a = this.findLine(num); this.lineAddr = a; this.line = num; this.p = a + 4; this.jumped = true; }

  statement() {
    let c = this.cur();
    if (c === 58) { this.p++; return; }
    if (c === 0) { this.nextLine(); return; }
    this.p++;
    this.jumped = false;
    if ((c >= 0x80 && c <= 0xa2) || c === T.GO) this.exec(c);
    else if (isAlpha(c)) { this.p--; this.let(); }
    else if (c === PI_TOKEN) err('SYNTAX');
    else err('SYNTAX');
    if (this.state === 'run' && !this.jumped) {
      const e = this.cur();
      if (e !== 0 && e !== 58) err('SYNTAX');
    }
  }

  exec(tok) {
    switch (tok) {
      case T.END: if (this.line >= 0) this.cont = { p: this.p, line: this.line, lineAddr: this.lineAddr }; this.ready(); return;
      case T.STOP: if (this.line >= 0) this.cont = { p: this.p, line: this.line, lineAddr: this.lineAddr }; this.error(new BasicError('BREAK')); return;
      case T.FOR: return this.forStmt();
      case T.NEXT: return this.nextStmt();
      case T.DATA: this.skipStatement(); return;
      case T.REM: this.skipLine(); return;
      case T['INPUT#']: return this.inputFile();
      case T.INPUT: return this.input();
      case T.DIM: return this.dim();
      case T.READ: return this.read();
      case T.LET: return this.let();
      case T.GOTO: { const n = this.lineNum(); this.gotoLine(n); return; }
      case T.GO: { this.expect(T.TO); const n = this.lineNum(); this.gotoLine(n); return; }
      case T.RUN: return this.runStmt();
      case T.IF: return this.ifStmt();
      case T.RESTORE: this.dataAddr = null; this.dataNeed = false; return;
      case T.GOSUB: return this.gosub();
      case T.RETURN: return this.returnStmt();
      case T.ON: return this.onStmt();
      case T.WAIT: return this.waitStmt();
      case T.LOAD: return this.loadStmt('LOAD');
      case T.SAVE: return this.saveStmt();
      case T.VERIFY: return this.loadStmt('VERIFY');
      case T.DEF: return this.defStmt();
      case T.POKE: { const a = this.uint16(); this.expect(44); const v = this.byteExpr(); this.m.write(a, v); this.sys.onPoke && this.sys.onPoke(a, v); return; }
      case T['PRINT#']: return this.printFile();
      case T.PRINT: return this.printStmt();
      case T.CONT: return this.contStmt();
      case T.LIST: return this.list();
      case T.CLR: this.clr(); return;
      case T.CMD: return this.cmdStmt();
      case T.SYS: { const a = this.uint16(); this.sys.doSys(a); return; }
      case T.OPEN: return this.openStmt();
      case T.CLOSE: { const l = this.byteExpr(); const f = this.files.get(l); if (f) { this.closeDev(f); this.files.delete(l); if (this.cmdFile === f) this.cmdFile = null; } return; }
      case T.GET: return this.get(false);
      case T.NEW: this.newProgram(); if (this.line >= 0) this.ready(); return;
      default: err('SYNTAX');
    }
  }

  lineNum() {
    let c = this.cur(), n = 0, any = false;
    while (isDigit(c)) { n = n * 10 + c - 48; any = true; c = this.next(); }
    if (!any && c !== 0 && c !== 58 && c !== 44) err('SYNTAX');
    if (n > 63999) err('SYNTAX');
    return n;
  }

  // ---- variables ---------------------------------------------------------
  readName() {
    let c = this.cur();
    if (!isAlpha(c)) err('SYNTAX');
    let name = String.fromCharCode(c); this.p++;
    for (; ;) {
      c = this.ram[this.p];
      if (isAlpha(c) || isDigit(c)) { if (name.length < 2) name += String.fromCharCode(c); this.p++; }
      else if (c === 32) this.p++;
      else break;
    }
    c = this.ram[this.p];
    let type = '';
    if (c === 36) { type = '$'; this.p++; } else if (c === 37) { type = '%'; this.p++; }
    return name + type;
  }
  // returns a reference {get(), set(v), type}
  varRef(allowFnSpecial = true) {
    const key = this.readName();
    const type = key.endsWith('$') ? '$' : key.endsWith('%') ? '%' : '';
    if (this.cur() === 40) {
      this.p++;
      const idx = [];
      do { idx.push(this.intExprNonNeg()); } while (this.cur() === 44 && (this.p++, true));
      this.expect(41);
      const arr = this.getArray(key, idx.length);
      let off = 0;
      for (let i = 0; i < idx.length; i++) {
        if (idx[i] >= arr.dims[i]) err('SUBSCRIPT');
        off = off * arr.dims[i] + idx[i];
      }
      return { type, get: () => arr.data[off], set: (v) => { arr.data[off] = this.coerce(v, type); } };
    }
    if (allowFnSpecial) {
      if (key === 'TI') return { type, get: () => this.sys.jiffies(), set: () => err('SYNTAX') };
      if (key === 'ST') return { type, get: () => this.st, set: () => err('SYNTAX') };
      if (key === 'TI$') return { type, get: () => this.sys.tiString(), set: (v) => this.sys.setTi(v) };
    }
    return {
      type,
      get: () => { const v = this.vars.get(key); return v === undefined ? (type === '$' ? '' : 0) : v; },
      set: (v) => { this.vars.set(key, this.coerce(v, type)); },
    };
  }
  coerce(v, type) {
    if (type === '$') { if (typeof v !== 'string') err('TYPE'); if (v.length > 255) err('LONG'); return v; }
    if (typeof v !== 'number') err('TYPE');
    if (type === '%') { const i = Math.floor(v); if (i < -32768 || i > 32767) err('QTY'); return i; }
    if (!isFinite(v) || Math.abs(v) > 1.70141183e38) err('OVERFLOW');
    return v;
  }
  getArray(key, ndims, dims) {
    let a = this.arrays.get(key);
    if (!a) {
      dims = dims || new Array(ndims).fill(11);
      const size = dims.reduce((x, y) => x * y, 1);
      if (size > 200000) err('MEMORY');
      a = { dims, data: new Array(size).fill(key.endsWith('$') ? '' : 0) };
      this.arrays.set(key, a);
    } else if (a.dims.length !== ndims) err('SUBSCRIPT');
    return a;
  }

  let() {
    const ref = this.varRef();
    this.expect(T['=']);
    ref.set(this.expr());
  }

  // ---- expressions -------------------------------------------------------
  expr() { return this.orExpr(); }
  num(v) { if (typeof v !== 'number') err('TYPE'); return v; }
  strv(v) { if (typeof v !== 'string') err('TYPE'); return v; }
  int16(v) { v = Math.floor(this.num(v)); if (v < -32768 || v > 32767) err('QTY'); return v; }
  numExpr() { return this.num(this.expr()); }
  intExprNonNeg() { const v = Math.floor(this.numExpr()); if (v < 0 || v > 32767) err('QTY'); return v; }
  byteExpr() { const v = Math.floor(this.numExpr()); if (v < 0 || v > 255) err('QTY'); return v; }
  uint16() { const v = Math.floor(this.numExpr()); if (v < 0 || v > 65535) err('QTY'); return v; }

  orExpr() {
    let l = this.andExpr();
    while (this.cur() === T.OR) { this.p++; const r = this.andExpr(); l = this.int16(l) | this.int16(r); }
    return l;
  }
  andExpr() {
    let l = this.notExpr();
    while (this.cur() === T.AND) { this.p++; const r = this.notExpr(); l = this.int16(l) & this.int16(r); }
    return l;
  }
  notExpr() {
    if (this.cur() === T.NOT) { this.p++; return ~this.int16(this.notExpr()); }
    return this.relExpr();
  }
  relExpr() {
    let l = this.addExpr();
    for (; ;) {
      let c = this.cur(), op = 0;
      while (c === T['>'] || c === T['='] || c === T['<']) { op |= c === T['>'] ? 1 : c === T['='] ? 2 : 4; c = this.next(); }
      if (!op) return l;
      const r = this.addExpr();
      if (typeof l !== typeof r) err('TYPE');
      const cmp = l < r ? 4 : l > r ? 1 : 2;
      l = (cmp & op) ? -1 : 0;
    }
  }
  addExpr() {
    let l = this.mulExpr();
    for (; ;) {
      const c = this.cur();
      if (c === T['+']) {
        this.p++; const r = this.mulExpr();
        if (typeof l === 'string') { if (typeof r !== 'string') err('TYPE'); l = l + r; if (l.length > 255) err('LONG'); }
        else l = this.num(l) + this.num(r);
      } else if (c === T['-']) { this.p++; l = this.num(l) - this.num(this.mulExpr()); }
      else return l;
    }
  }
  mulExpr() {
    let l = this.unary();
    for (; ;) {
      const c = this.cur();
      if (c === T['*']) { this.p++; l = this.num(l) * this.num(this.unary()); }
      else if (c === T['/']) { this.p++; const r = this.num(this.unary()); if (r === 0) err('DIV0'); l = this.num(l) / r; }
      else return l;
    }
  }
  unary() {
    const c = this.cur();
    if (c === T['-']) { this.p++; return -this.num(this.unary()); }
    if (c === T['+']) { this.p++; return this.unary(); }
    return this.power();
  }
  power() {
    let l = this.atom();
    while (this.cur() === T['^']) {
      this.p++;
      let neg = false; while (this.cur() === T['-'] || this.cur() === T['+']) { if (this.cur() === T['-']) neg = !neg; this.p++; }
      let r = this.num(this.atom()); if (neg) r = -r;
      l = this.num(l);
      if (l === 0 && r < 0) err('DIV0');
      l = Math.pow(l, r);
      if (isNaN(l)) err('QTY');
    }
    return l;
  }
  numberLiteral() {
    let s = ''; let c = this.ram[this.p];
    for (; ;) {
      if (isDigit(c) || c === 46) s += String.fromCharCode(c);
      else if (c === 69) {
        s += 'E'; this.p++; let d = this.cur();
        if (d === T['-'] || d === 45) { s += '-'; this.p++; } else if (d === T['+'] || d === 43) this.p++;
        c = this.cur(); continue;
      }
      else if (c !== 32) break;
      this.p++; c = this.ram[this.p];
    }
    if (s === '.') return 0;
    const v = parseFloat(s);
    if (isNaN(v)) err('SYNTAX');
    if (!isFinite(v)) err('OVERFLOW');
    return v;
  }
  stringLiteral() {
    let s = ''; let c;
    while ((c = this.ram[this.p]) !== 0 && c !== 34) { s += String.fromCharCode(c); this.p++; }
    if (c === 34) this.p++;
    return s;
  }
  args(n) {
    this.expect(40); const a = [this.expr()];
    while (a.length < n && this.cur() === 44) { this.p++; a.push(this.expr()); }
    this.expect(41); return a;
  }
  atom() {
    const c = this.cur();
    if (isDigit(c) || c === 46) return this.numberLiteral();
    if (c === 34) { this.p++; return this.stringLiteral(); }
    if (c === 40) { this.p++; const v = this.expr(); this.expect(41); return v; }
    if (c === PI_TOKEN) { this.p++; return Math.PI; }
    if (isAlpha(c)) return this.varRef().get();
    if (c === T.FN) { this.p++; return this.callFn(); }
    if (c >= T.SGN && c <= T['MID$']) { this.p++; return this.func(c); }
    if (c === T['-']) { this.p++; return -this.num(this.atom()); }
    if (c === T.NOT) { this.p++; return ~this.int16(this.relExpr()); }
    err('SYNTAX');
  }
  func(t) {
    const one = () => { const [v] = this.args(1); return v; };
    switch (t) {
      case T.SGN: return Math.sign(this.num(one()));
      case T.INT: return Math.floor(this.num(one()));
      case T.ABS: return Math.abs(this.num(one()));
      case T.USR: { this.num(one()); err('QTY'); break; }
      case T.FRE: { one(); const free = Math.max(0, 40960 - this.varTab - this.vars.size * 7 - 2); return free > 32767 ? free - 65536 : free; }
      case T.POS: one(); return this.pos();
      case T.SQR: { const v = this.num(one()); if (v < 0) err('QTY'); return Math.sqrt(v); }
      case T.RND: return this.rnd(this.num(one()));
      case T.LOG: { const v = this.num(one()); if (v <= 0) err('QTY'); return Math.log(v); }
      case T.EXP: { const v = Math.exp(this.num(one())); if (!isFinite(v)) err('OVERFLOW'); return v; }
      case T.COS: return Math.cos(this.num(one()));
      case T.SIN: return Math.sin(this.num(one()));
      case T.TAN: { const v = this.num(one()); if (Math.abs(Math.cos(v)) < 1e-12) err('DIV0'); return Math.tan(v); }
      case T.ATN: return Math.atan(this.num(one()));
      case T.PEEK: { const v = Math.floor(this.num(one())); if (v < 0 || v > 65535) err('QTY'); return this.sys.peek(v); }
      case T.LEN: return this.strv(one()).length;
      case T['STR$']: return fmtNum(this.num(one()));
      case T.VAL: return parseNumberText(this.strv(one()));
      case T.ASC: { const s = this.strv(one()); if (!s.length) err('QTY'); return s.charCodeAt(0); }
      case T['CHR$']: { const v = Math.floor(this.num(one())); if (v < 0 || v > 255) err('QTY'); return String.fromCharCode(v); }
      case T['LEFT$']: { const [s, n] = this.args(2); const k = this.byteArg(n); return this.strv(s).slice(0, k); }
      case T['RIGHT$']: { const [s, n] = this.args(2); const k = this.byteArg(n); const ss = this.strv(s); return k === 0 ? '' : ss.slice(-k); }
      case T['MID$']: {
        const a = this.args(3); const s = this.strv(a[0]); const st = this.byteArg(a[1]);
        if (st < 1) err('QTY');
        const ln = a.length > 2 ? this.byteArg(a[2]) : 255;
        return s.substr(st - 1, ln);
      }
    }
    err('SYNTAX');
  }
  byteArg(v) { v = Math.floor(this.num(v)); if (v < 0 || v > 255) err('QTY'); return v; }
  rnd(x) {
    const step = () => { this.rndSeed = (Math.imul(this.rndSeed, 1103515245) + 12345) >>> 0; return this.rndSeed / 4294967296; };
    if (x < 0) { this.rndSeed = (Math.floor(Math.abs(x) * 1e6) ^ 0x5DEECE6) >>> 0; this.lastRnd = step(); return this.lastRnd; }
    if (x === 0) { this.lastRnd = ((performance.now() * 997) % 1 + Math.random()) % 1; return this.lastRnd; }
    this.lastRnd = step(); return this.lastRnd;
  }

  defStmt() {
    if (this.line < 0) err('DIRECT');
    this.expect(T.FN);
    const name = this.readName();
    if (name.endsWith('$')) err('SYNTAX');
    this.expect(40); const param = this.readName(); this.expect(41); this.expect(T['=']);
    this.fns.set(name, { param, ptr: this.p });
    this.skipStatement();
  }
  callFn() {
    const name = this.readName();
    const f = this.fns.get(name); if (!f) err('UNDEFFN');
    this.expect(40); const arg = this.num(this.expr()); this.expect(41);
    const save = this.p, old = this.vars.get(f.param);
    this.vars.set(f.param, arg); this.p = f.ptr;
    const v = this.num(this.expr());
    this.p = save;
    if (old === undefined) this.vars.delete(f.param); else this.vars.set(f.param, old);
    return v;
  }

  // ---- statements ----------------------------------------------------------
  printStmt(file) {
    let sep = false;
    const isScreen = !(this.outFile ?? this.cmdFile);
    const right = (n) => { for (let i = 0; i < n; i++) this.out(isScreen ? 29 : 32); };
    for (; ;) {
      const c = this.cur();
      if (c === 0 || c === 58) { if (!sep) { this.out(13); if (!isScreen && this.outFile && this.outFile.dev >= 128) this.out(10); } break; }
      if (c === T['TAB('] || c === T['SPC(']) {
        this.p++; const n = this.byteExpr(); this.expect(41);
        if (c === T['TAB(']) { const col = isScreen ? this.pos() : 0; if (n > col) right(n - col); }
        else right(n);
        sep = true; continue;
      }
      if (c === 59) { this.p++; sep = true; continue; }
      if (c === 44) { this.p++; const col = isScreen ? this.pos() : 0; right(10 - (col % 10)); sep = true; continue; }
      const v = this.expr();
      if (typeof v === 'number') this.print(fmtNum(v) + ' '); else this.print(v);
      sep = false;
    }
    void file;
  }

  input() {
    if (this.line < 0) err('DIRECT');
    let prompt = '';
    if (this.cur() === 34) { this.p++; prompt = this.stringLiteral(); this.expect(59); }
    const varsPtr = this.p;
    this.skipStatement();
    const after = this.p;
    const ask = (more) => {
      this.print(more ? '?? ' : prompt + '? ');
      this.state = 'input';
      this.k.beginInput((txt) => this.receiveInput(txt), true);
    };
    this.inputCtx = { varsPtr, after, prompt, fields: [], ask };
    ask(false);
  }
  splitFields(txt) {
    const s = str(txt), out = []; let i = 0;
    while (i <= s.length) {
      while (s[i] === ' ') i++;
      let f = '';
      if (s[i] === '"') { i++; while (i < s.length && s[i] !== '"') f += s[i++]; i++; while (i < s.length && s[i] !== ',' && s[i] !== ':') i++; }
      else { while (i < s.length && s[i] !== ',' && s[i] !== ':') f += s[i++]; f = f.replace(/ +$/, ''); }
      out.push(f);
      if (s[i] === ',') { i++; continue; }
      break;
    }
    return out;
  }
  receiveInput(txt) {
    const ctx = this.inputCtx;
    this.state = 'run';
    if (txt.length === 0 && ctx.fields.length === 0) { this.p = ctx.after; return; }
    ctx.fields.push(...this.splitFields(txt));
    // assign
    this.p = ctx.varsPtr;
    let i = 0;
    for (; ;) {
      const ref = this.varRef();
      if (i >= ctx.fields.length) { this.state = 'input'; ctx.ask(true); ctx.fields = ctx.fields.slice(0, i); return; }
      const f = ctx.fields[i++];
      if (ref.type === '$') ref.set(f);
      else {
        if (!/^ *[+-]? *[0-9. ]*(E *[+-]? *[0-9 ]+)? *$/.test(f)) {
          this.print('?REDO FROM START\r'); ctx.fields = []; this.p = ctx.varsPtr; ctx.ask(false); return;
        }
        ref.set(parseNumberText(f));
      }
      if (this.cur() === 44) { this.p++; continue; }
      break;
    }
    if (i < ctx.fields.length) this.print('?EXTRA IGNORED\r');
    this.p = ctx.after;
  }

  get(fromFile) {
    let lfn = null;
    if (fromFile) { lfn = this.byteExpr(); this.expect(44); }
    if (this.line < 0) err('DIRECT');
    for (; ;) {
      const ref = this.varRef();
      let ch;
      if (lfn !== null) { const b = this.fileRead(lfn); ch = b === 0 ? '' : String.fromCharCode(b); }
      else { const k = this.k.getKey(); ch = k ? String.fromCharCode(k) : ''; }
      if (ref.type === '$') ref.set(ch);
      else {
        if (ch === '') ref.set(0);
        else { const cc = ch.charCodeAt(0); if (cc >= 48 && cc <= 57) ref.set(cc - 48); else if (cc === 32 || cc === 13) ref.set(0); else err('SYNTAX'); }
      }
      if (this.cur() === 44) { this.p++; continue; }
      break;
    }
  }

  forStmt() {
    const key = this.readName();
    if (key.endsWith('$') || key.endsWith('%')) err('TYPE');
    this.expect(T['=']);
    const start = this.numExpr();
    this.vars.set(key, start);
    this.expect(T.TO);
    const limit = this.numExpr();
    let step = 1;
    if (this.cur() === T.STEP) { this.p++; step = this.numExpr(); }
    // remove an existing loop on the same variable
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const f = this.stack[i];
      if (f.type === 'gosub') break;
      if (f.key === key) { this.stack.length = i; break; }
    }
    if (this.stack.length > 120) err('MEMORY');
    this.stack.push({ type: 'for', key, limit, step, p: this.p, line: this.line, lineAddr: this.lineAddr });
  }
  nextStmt() {
    for (; ;) {
      let key = null;
      if (!this.atEnd()) key = this.readName();
      let idx = -1;
      for (let i = this.stack.length - 1; i >= 0; i--) {
        const f = this.stack[i];
        if (f.type === 'gosub') break;
        if (key === null || f.key === key) { idx = i; break; }
      }
      if (idx < 0) err('NEXT');
      this.stack.length = idx + 1;
      const f = this.stack[idx];
      const v = this.vars.get(f.key) + f.step;
      this.vars.set(f.key, v);
      const d = Math.sign(v - f.limit);
      if (d !== Math.sign(f.step)) {
        this.p = f.p; this.line = f.line; this.lineAddr = f.lineAddr; return;
      }
      this.stack.pop();
      if (this.cur() === 44) { this.p++; continue; }
      return;
    }
  }
  gosubPush() {
    if (this.stack.length > 120) err('MEMORY');
    const save = this.p; this.skipStatement();
    this.stack.push({ type: 'gosub', p: this.p, line: this.line, lineAddr: this.lineAddr });
    this.p = save;
  }
  gosub() {
    const n = this.lineNum();
    this.gosubPush();
    this.gotoLine(n);
  }
  returnStmt() {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].type === 'gosub') {
        const f = this.stack[i]; this.stack.length = i;
        this.p = f.p; this.line = f.line; this.lineAddr = f.lineAddr; return;
      }
    }
    err('RETURN');
  }
  onStmt() {
    const v = Math.floor(this.numExpr());
    if (v < 0 || v > 255) err('QTY');
    const t = this.cur();
    if (t !== T.GOTO && t !== T.GOSUB) err('SYNTAX');
    this.p++;
    let i = 1;
    for (; ;) {
      const n = this.lineNum();
      if (i === v) {
        if (t === T.GOSUB) this.gosubPush();
        this.gotoLine(n); return;
      }
      if (this.cur() !== 44) return;
      this.p++; i++;
    }
  }
  ifStmt() {
    const v = this.expr();
    const truth = typeof v === 'string' ? v.length > 0 : v !== 0;
    const c = this.cur();
    if (c === T.THEN) {
      this.p++;
      if (!truth) { this.skipLine(); return; }
      if (isDigit(this.cur())) { const n = this.lineNum(); this.gotoLine(n); }
      this.jumped = true;
      return;
    }
    if (c === T.GOTO) {
      this.p++;
      if (!truth) { this.skipLine(); return; }
      const n = this.lineNum(); this.gotoLine(n); return;
    }
    err('SYNTAX');
  }
  runStmt() {
    let start = null;
    if (isDigit(this.cur())) start = this.lineNum();
    this.clr(); this.index = null; this.cont = null;
    this.sys.onRun && this.sys.onRun();
    const ls = this.lines();
    if (!ls.length) { this.ready(); return; }
    if (start !== null) this.gotoLine(start);
    else { this.lineAddr = ls[0].addr; this.line = ls[0].num; this.p = ls[0].addr + 4; }
    this.state = 'run'; this.jumped = true;
  }
  contStmt() {
    if (this.line >= 0) err('CONT');
    if (!this.cont) err('CONT');
    const c = this.cont;
    this.p = c.p; this.line = c.line; this.lineAddr = c.lineAddr; this.jumped = true;
  }
  dim() {
    for (; ;) {
      const key = this.readName();
      this.expect(40);
      const dims = [];
      do { dims.push(this.intExprNonNeg() + 1); } while (this.cur() === 44 && (this.p++, true));
      this.expect(41);
      if (this.arrays.has(key)) err('REDIM');
      this.getArray(key, dims.length, dims);
      if (this.cur() === 44) { this.p++; continue; }
      break;
    }
  }

  // DATA handling
  findData() {
    // starting at dataP inside line dataAddr, find next DATA token
    let p = this.dataP, a = this.dataAddr, q = false;
    for (; ;) {
      const c = this.ram[p];
      if (c === 0) {
        const next = this.rd16(a);
        if (!next || this.ram[next + 1] === 0) err('DATA');
        a = next; p = next + 4; q = false; continue;
      }
      if (c === 34) q = !q;
      else if (!q && c === T.DATA) { this.dataAddr = a; this.dataP = p + 1; this.dataNeed = true; return; }
      else if (!q && c === T.REM) { while (this.ram[p] !== 0) p++; continue; }
      p++;
    }
  }
  nextDataItem() {
    if (this.dataAddr === null || this.dataAddr === undefined) {
      const ls = this.lines(); if (!ls.length) err('DATA');
      this.dataAddr = ls[0].addr; this.dataP = ls[0].addr + 4; this.dataNeed = false;
    }
    if (!this.dataNeed) {
      let p = this.dataP; while (this.ram[p] === 32) p++;
      if (this.ram[p] === 44) { this.dataP = p + 1; this.dataNeed = true; }
      else { this.dataP = p; this.findData(); }
    }
    let p = this.dataP; while (this.ram[p] === 32) p++;
    let s = '';
    if (this.ram[p] === 34) { p++; while (this.ram[p] !== 0 && this.ram[p] !== 34) s += String.fromCharCode(this.ram[p++]); if (this.ram[p] === 34) p++; while (this.ram[p] === 32) p++; }
    else { while (this.ram[p] !== 0 && this.ram[p] !== 44 && this.ram[p] !== 58) s += String.fromCharCode(this.ram[p++]); s = s.replace(/ +$/, ''); }
    this.dataP = p; this.dataNeed = false;
    return s;
  }
  read() {
    for (; ;) {
      const ref = this.varRef();
      const s = this.nextDataItem();
      if (ref.type === '$') ref.set(s);
      else {
        if (!/^[+-]? *[0-9. ]*(E *[+-]? *[0-9 ]+)?$/.test(s)) { throw new BasicError('SYNTAX', this.rd16(this.dataAddr + 2)); }
        ref.set(parseNumberText(s));
      }
      if (this.cur() === 44) { this.p++; continue; }
      break;
    }
  }

  waitStmt() {
    const a = this.uint16(); this.expect(44); const mask = this.byteExpr();
    let x = 0; if (this.cur() === 44) { this.p++; x = this.byteExpr(); }
    const ok = () => ((this.sys.peek(a) ^ x) & mask) !== 0;
    if (!ok()) { this.state = 'wait'; this.waitFn = ok; }
  }
  serviceWait() {
    if (this.breakReq) { this.breakReq = false; this.state = 'run'; this.doBreak(); return; }
    if (this.waitFn()) this.state = 'run';
  }

  list() {
    let from = 0, to = 63999;
    const c = this.cur();
    if (isDigit(c)) { from = this.lineNum(); to = from; }
    if (this.cur() === T['-']) { this.p++; to = isDigit(this.cur()) ? this.lineNum() : 63999; }
    if (!this.atEnd()) err('SYNTAX');
    const ls = this.lines().filter(l => l.num >= from && l.num <= to);
    this.listQueue = ls; this.listIdx = 0;
    this.state = 'list';
  }
  serviceList(n) {
    for (let i = 0; i < n && this.listIdx < this.listQueue.length; i++) {
      if (this.breakReq) { this.breakReq = false; this.listQueue = []; break; }
      const l = this.listQueue[this.listIdx++];
      this.out(13);
      this.print(String(l.num) + ' ');
      let a = l.addr + 4, q = false;
      while (this.ram[a] !== 0) {
        const b = this.ram[a++];
        if (b === 34) q = !q;
        if (!q && b >= 0x80 && b <= 0xcb) this.print(TOKENS[b - 0x80]);
        else this.out(b);
      }
      this.k.quote = false; this.k.insert = 0; this.k.rvs = false;
    }
    if (this.listIdx >= this.listQueue.length) {
      this.listQueue = [];
      if (this.line >= 0 || true) { this.state = 'direct'; this.cont = null; this.ready(); }
    }
  }

  // ---- files & devices -------------------------------------------------
  parseIoArgs(needName) {
    let name = '', dev = 1, sa = 0, haveSa = false;
    if (!this.atEnd()) {
      const v = this.expr(); name = this.strv(v);
      if (this.cur() === 44) { this.p++; dev = this.byteExpr(); if (this.cur() === 44) { this.p++; sa = this.byteExpr(); haveSa = true; } }
    } else if (needName) err('NAME');
    return { name, dev, sa, haveSa };
  }
  openStmt() {
    const lfn = this.byteExpr();
    if (lfn === 0) err('QTY');
    let dev = 1, sa = -1, name = '';
    if (this.cur() === 44) { this.p++; dev = this.byteExpr(); if (this.cur() === 44) { this.p++; sa = this.byteExpr(); if (this.cur() === 44) { this.p++; name = this.strv(this.expr()); } } }
    if (this.files.has(lfn)) err('OPEN');
    if (this.files.size >= 10) err('FILES');
    const f = { lfn, dev, sa: sa < 0 ? (dev === 8 ? 0 : 0) : sa, name };
    if (dev === 8 || dev === 1) {
      const drive = dev === 8 ? this.sys.drive : this.sys.tape;
      if (dev === 8 && !drive) err('DEVICE');
      const sa2 = sa < 0 ? 0 : sa;
      if (!drive.open(sa2, name)) { this.st = 0x40; f.failed = true; }
      f.sa = sa2;
    } else if (dev === 4) { this.sys.printer.open(sa); }
    else if (dev !== 0 && dev !== 3) err('DEVICE');
    this.files.set(lfn, f);
  }
  closeDev(f) {
    if (f.dev === 8) this.sys.drive.close(f.sa);
    else if (f.dev === 1) this.sys.tape.close(f.sa);
    else if (f.dev === 4) this.sys.printer.flush();
  }
  fileWrite(f, c) {
    if (f.dev === 3) { this.k.out(c); return; }
    if (f.dev === 4) { this.sys.printer.write(c); return; }
    if (f.dev === 8) { this.sys.drive.write(f.sa, c); return; }
    if (f.dev === 1) { this.sys.tape.write(f.sa, c); return; }
    if (f.dev === 0) err('NOTOUT');
  }
  fileRead(lfn) {
    const f = this.files.get(lfn);
    if (!f) err('NOTOPEN');
    if (f.dev === 4) err('NOTIN');
    if (f.dev === 0 || f.dev === 3) { return this.k.getKey(); }
    const drive = f.dev === 8 ? this.sys.drive : this.sys.tape;
    const [b, eof] = drive.read(f.sa);
    this.st = eof ? 0x40 : 0;
    return b;
  }
  printFile() {
    const lfn = this.byteExpr();
    const f = this.files.get(lfn); if (!f) err('NOTOPEN');
    if (this.cur() === 44) this.p++;
    this.outFile = f;
    try { this.printStmt(); } finally { this.outFile = null; }
  }
  cmdStmt() {
    const lfn = this.byteExpr();
    const f = this.files.get(lfn); if (!f) err('NOTOPEN');
    this.cmdFile = f;
    if (this.cur() === 44) { this.p++; this.printStmt(); }
  }
  inputFile() {
    const lfn = this.byteExpr(); this.expect(44);
    const f = this.files.get(lfn); if (!f) err('NOTOPEN');
    for (; ;) {
      const ref = this.varRef();
      let s = '', q = false, guard = 0;
      // read a field terminated by CR or comma (outside quotes)
      for (; ;) {
        const b = this.fileRead(lfn);
        if (b === 34) { q = !q; if (guard++ > 300) break; if (this.st & 0x40) break; continue; }
        if (!q && (b === 13 || b === 44)) break;
        s += String.fromCharCode(b);
        if (this.st & 0x40) break;
        if (++guard > 255) err('LONG');
      }
      if (ref.type === '$') ref.set(s.replace(/^ +/, ''));
      else ref.set(parseNumberText(s));
      if (this.cur() === 44) { this.p++; continue; }
      break;
    }
  }

  saveStmt() {
    const { name, dev } = this.parseIoArgs(false);
    if (dev !== 1 && dev !== 8) err(dev === 0 || dev === 3 ? 'ILLDEV' : 'DEVICE');
    if (dev === 8 && !name) err('NAME');
    const start = this.txtTab, end = this.varTab;
    const data = new Uint8Array(end - start + 2);
    data[0] = start & 0xff; data[1] = start >> 8;
    data.set(this.ram.subarray(start, end), 2);
    const drive = dev === 8 ? this.sys.drive : this.sys.tape;
    const msgs = this.line >= 0 ? [] : dev === 1 ? ['\rPRESS RECORD & PLAY ON TAPE', '\rOK', '\rSAVING ' + name] : ['\rSAVING ' + name];
    this.deviceOp(msgs, dev, () => {
      if (!drive.saveFile(dev === 1 ? (name || 'UNTITLED') : name, data)) {
        if (drive.status[0] === 74) err('DEVICE');
      }
    }, drive, 1.2 + data.length / 6000);
  }

  loadStmt(kind) {
    const { name, dev, sa } = this.parseIoArgs(false);
    if (dev !== 1 && dev !== 8) err(dev === 0 || dev === 3 ? 'ILLDEV' : 'DEVICE');
    if (dev === 8 && !name) err('NAME');
    const drive = dev === 8 ? this.sys.drive : this.sys.tape;
    const inProgram = this.line >= 0;
    const pre = inProgram ? [] : dev === 1 ? ['\rPRESS PLAY ON TAPE', '\rOK', '\rSEARCHING' + (name ? ' FOR ' + name : '')] : ['\rSEARCHING FOR ' + name];
    const f0 = drive.disk ? (name === '$' && dev === 8 ? { data: { length: 400 } } : drive.find(dev === 1 && !name ? '*' : drive.parseName(name).name, null)) : null;
    const dur = 0.8 + (f0 ? f0.data.length / 2500 : 0.2);
    this.deviceOp(pre, dev, () => {
      const f = drive.loadFile(dev === 1 && !name ? '*' : name);
      if (!f) { if (drive.status[0] === 74) err('DEVICE'); err('NOTFOUND'); }
      if (!inProgram) {
        if (dev === 1) this.print('\rFOUND ' + f.name);
        this.print(kind === 'LOAD' ? '\rLOADING' : '\rVERIFYING');
      }
      const d = f.data;
      const fileAddr = d[0] | (d[1] << 8);
      const addr = sa ? fileAddr : this.txtTab;
      const body = d.subarray(2);
      if (kind === 'VERIFY') {
        for (let i = 0; i < body.length; i++) if (this.ram[addr + i] !== body[i]) err('VERIFY');
        if (!inProgram) this.print('\rOK');
        return;
      }
      if (addr + body.length > 0xffff) err('MEMORY');
      // write through RAM directly (loads ignore I/O banking)
      this.ram.set(body, addr);
      const end = addr + body.length;
      this.ram[0xae] = end & 0xff; this.ram[0xaf] = end >> 8;
      if (!sa || addr === this.txtTab) {
        this.wr16(45, end);
        this.relink();
        this.index = null; this.cont = null;
      }
      this.sys.onLoad && this.sys.onLoad(f);
      if (inProgram) {
        // chain loading: restart program from the beginning, variables kept
        const ls = this.lines();
        this.stack = []; this.dataAddr = null;
        if (ls.length && (!sa || addr === this.txtTab)) { this.lineAddr = ls[0].addr; this.line = ls[0].num; this.p = ls[0].addr + 4; this.state = 'run'; this.pendingResume = true; }
      }
    }, drive, dur);
  }

  // perform a slow device operation: print messages, wait while the drive works, then complete
  deviceOp(msgs, dev, fn, drive, seconds) {
    msgs.forEach((m) => this.print(m));
    const savedLine = this.line;
    const resume = { p: this.p, line: this.line, lineAddr: this.lineAddr };
    this.state = 'device';
    drive.touch(seconds);
    this.sys.onDiskBusy && this.sys.onDiskBusy(dev, seconds);
    this.pending = {
      t: this.sys.turbo ? Math.min(0.3, seconds) : seconds,
      fn: () => {
        this.pendingResume = false;
        fn();
        if (this.pendingResume) return;
        if (savedLine >= 0) { this.p = resume.p; this.line = resume.line; this.lineAddr = resume.lineAddr; this.state = 'run'; }
        else { this.line = -1; this.state = 'run'; this.p = resume.p; this.ready(); }
      },
    };
  }
  serviceDevice(dt) {
    if (!this.pending) { this.state = 'run'; return; }
    this.pending.t -= dt;
    if (this.pending.t <= 0) {
      const p = this.pending; this.pending = null; this.state = 'run';
      try { p.fn(); } catch (e) { this.error(e); }
    }
  }
}

export { T as TOK, BasicError };
