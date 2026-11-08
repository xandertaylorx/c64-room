// 1541 floppy drive: disks are kept in localStorage. Supports PRG/SEQ files, directory,
// wildcards, DOS commands (S:, R:, N:, I, V), error channel and .D64 / .PRG import.

const LS_PREFIX = 'c64.disk.';
const LS_CURRENT = 'c64.currentDisk';
const BLOCKS = 664;

function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
function unb64(s) { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

export function petStr(s) { return s; } // our strings are already PETSCII char codes
export function asciiToPet(s) {
  let o = '';
  for (const ch of s) {
    let c = ch.charCodeAt(0);
    if (c >= 97 && c <= 122) c -= 32; else if (c > 255) c = 63;
    o += String.fromCharCode(c);
  }
  return o;
}
export function petToAscii(s) {
  let o = '';
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xc1 && c <= 0xda) c -= 0x80;      // shifted letters
    else if (c >= 0x41 && c <= 0x5a) c += 32;   // unshifted letters → lower in file names
    else if (c < 32 || c > 126) c = 95;
    o += String.fromCharCode(c);
  }
  return o;
}

function safeStorage() {
  try { const k = '__t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch { return null; }
}

export class DiskStore {
  constructor() {
    this.ls = safeStorage();
    this.mem = {}; // fallback when storage is blocked
  }
  _get(k) { return this.ls ? this.ls.getItem(k) : this.mem[k] ?? null; }
  _set(k, v) { if (this.ls) { try { this.ls.setItem(k, v); } catch (e) { console.warn(e); } } else this.mem[k] = v; }
  _del(k) { if (this.ls) this.ls.removeItem(k); else delete this.mem[k]; }
  listDisks() {
    const out = [];
    if (this.ls) { for (let i = 0; i < this.ls.length; i++) { const k = this.ls.key(i); if (k.startsWith(LS_PREFIX)) out.push(k.slice(LS_PREFIX.length)); } }
    else out.push(...Object.keys(this.mem).filter(k => k.startsWith(LS_PREFIX)).map(k => k.slice(LS_PREFIX.length)));
    return out.sort();
  }
  load(id) {
    const raw = this._get(LS_PREFIX + id);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return { id, name: j.name, diskId: j.diskId, files: j.files.map(f => ({ name: f.name, type: f.type, data: unb64(f.data) })) };
  }
  save(disk) {
    this._set(LS_PREFIX + disk.id, JSON.stringify({ name: disk.name, diskId: disk.diskId, files: disk.files.map(f => ({ name: f.name, type: f.type, data: b64(f.data) })) }));
  }
  remove(id) { this._del(LS_PREFIX + id); }
  get(k) { return this._get(k); }
  set(k, v) { this._set(k, v); }
  get current() { return this._get(LS_CURRENT); }
  set current(id) { this._set(LS_CURRENT, id); }
}

export function matchName(pattern, name) {
  // CBM DOS wildcards: '*' matches rest, '?' one char
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i];
    if (p === '*') return true;
    if (i >= name.length) return false;
    if (p !== '?' && p !== name[i]) return false;
  }
  return pattern.length === name.length;
}

export class Drive1541 {
  constructor(store) {
    this.store = store;
    this.disk = null;
    this.status = [0, ' OK', 0, 0];
    this.channels = {}; // sa -> {file, pos, mode, buf}
    this.activity = 0;  // seconds of LED/motor activity remaining
    this.onActivity = null;
  }
  insert(disk) { this.disk = disk; this.store.current = disk ? disk.id : ''; this.setStatus(0, ' OK'); }
  eject() { this.disk = null; }
  persist() { if (this.disk) this.store.save(this.disk); }
  touch(sec = 0.8) { this.activity = Math.max(this.activity, sec); this.onActivity && this.onActivity(sec); }
  setStatus(code, msg, t = 0, s = 0) { this.status = [code, msg, t, s]; }
  statusString() {
    const [c, m, t, s] = this.status;
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return pad(c) + ',' + m + ',' + pad(t) + ',' + pad(s);
  }
  blocksOf(f) { return Math.max(1, Math.ceil(f.data.length / 254)); }
  freeBlocks() { return this.disk ? Math.max(0, BLOCKS - this.disk.files.reduce((a, f) => a + this.blocksOf(f), 0)) : 0; }
  find(pattern, type) {
    if (!this.disk) return null;
    return this.disk.files.find(f => matchName(pattern, f.name) && (!type || f.type === type)) || null;
  }
  parseName(raw) {
    // "0:NAME,S,W" -> {name, type, mode, overwrite}
    let s = raw, overwrite = false;
    if (s.startsWith('@')) { overwrite = true; s = s.slice(1); }
    const colon = s.indexOf(':');
    if (colon >= 0 && colon <= 1) s = s.slice(colon + 1);
    const parts = s.split(',');
    const name = parts[0];
    let type = null, mode = null;
    for (const p of parts.slice(1)) {
      const c = p[0];
      if (c === 'S') type = 'SEQ'; else if (c === 'P') type = 'PRG'; else if (c === 'U') type = 'USR';
      else if (c === 'W') mode = 'W'; else if (c === 'R') mode = 'R'; else if (c === 'A') mode = 'A';
    }
    return { name, type, mode, overwrite };
  }

  loadFile(rawName) {
    this.touch(1.4);
    if (!this.disk) { this.setStatus(74, 'DRIVE NOT READY'); return null; }
    const { name } = this.parseName(rawName);
    if (name === '$') return this.directoryPrg();
    const f = this.find(name, null);
    if (!f) { this.setStatus(62, 'FILE NOT FOUND'); return null; }
    this.setStatus(0, ' OK');
    return f;
  }
  saveFile(rawName, data) {
    this.touch(1.6);
    if (!this.disk) { this.setStatus(74, 'DRIVE NOT READY'); return false; }
    const { name, overwrite } = this.parseName(rawName);
    if (!name) { this.setStatus(34, 'SYNTAX ERROR'); return false; }
    const ex = this.disk.files.findIndex(f => f.name === name);
    if (ex >= 0 && !overwrite) { this.setStatus(63, 'FILE EXISTS'); return false; }
    const file = { name: name.slice(0, 16), type: 'PRG', data };
    if (Math.ceil(data.length / 254) > this.freeBlocks() + (ex >= 0 ? this.blocksOf(this.disk.files[ex]) : 0)) { this.setStatus(72, 'DISK FULL'); return false; }
    if (ex >= 0) this.disk.files[ex] = file; else this.disk.files.push(file);
    this.persist(); this.setStatus(0, ' OK');
    return true;
  }

  directoryPrg() {
    // build a BASIC program listing the directory (as a real 1541 does)
    const lines = [];
    const d = this.disk;
    const hdr = '\x12"' + (d.name + '                ').slice(0, 16) + '" ' + (d.diskId + '   ').slice(0, 2) + ' 2A';
    lines.push([0, hdr]);
    for (const f of d.files) {
      const b = this.blocksOf(f);
      const pad = b < 10 ? '   ' : b < 100 ? '  ' : ' ';
      const q = '"' + f.name + '"';
      lines.push([b, pad + (q + '                  ').slice(0, 18) + ' ' + f.type]);
    }
    lines.push([this.freeBlocks(), 'BLOCKS FREE.             ']);
    let addr = 0x0801; const bytes = [0x01, 0x08];
    for (const [num, txt] of lines) {
      const next = addr + 4 + txt.length + 1;
      bytes.push(next & 0xff, next >> 8, num & 0xff, num >> 8);
      for (let i = 0; i < txt.length; i++) bytes.push(txt.charCodeAt(i));
      bytes.push(0); addr = next;
    }
    bytes.push(0, 0);
    this.setStatus(0, ' OK');
    return { name: '$', type: 'PRG', data: new Uint8Array(bytes) };
  }

  // --- channels for OPEN/CLOSE/PRINT#/INPUT#/GET# ---------------------
  open(sa, rawName) {
    this.touch(0.6);
    if (sa === 15) { if (rawName) this.command(rawName); this.channels[15] = { cmd: true, out: '', pos: 0 }; return true; }
    if (!this.disk) { this.setStatus(74, 'DRIVE NOT READY'); return false; }
    const p = this.parseName(rawName);
    if (p.name === '$') { const f = this.directoryPrg(); this.channels[sa] = { file: f, pos: 0, mode: 'R' }; return true; }
    const mode = p.mode || (sa === 1 ? 'W' : 'R');
    if (mode === 'R') {
      const f = this.find(p.name, p.type);
      if (!f) { this.setStatus(62, 'FILE NOT FOUND'); return false; }
      this.channels[sa] = { file: f, pos: sa === 0 ? 0 : 0, mode: 'R' };
    } else {
      let f = this.disk.files.find(x => x.name === p.name);
      if (f && mode === 'W' && !p.overwrite) { this.setStatus(63, 'FILE EXISTS'); return false; }
      const type = p.type || (sa === 1 ? 'PRG' : 'SEQ');
      const buf = mode === 'A' && f ? Array.from(f.data) : [];
      if (!f) { f = { name: p.name.slice(0, 16), type, data: new Uint8Array(0) }; this.disk.files.push(f); }
      this.channels[sa] = { file: f, buf, mode: 'W' };
    }
    this.setStatus(0, ' OK');
    return true;
  }
  close(sa) {
    const ch = this.channels[sa];
    if (ch && ch.mode === 'W') { ch.file.data = new Uint8Array(ch.buf); this.persist(); this.touch(0.6); }
    if (sa === 15) { this.channels = {}; } // closing the command channel closes all files
    delete this.channels[sa];
  }
  write(sa, byte) {
    const ch = this.channels[sa];
    if (!ch) return;
    if (ch.cmd) { if (byte === 13) { this.command(ch.out); ch.out = ''; } else ch.out += String.fromCharCode(byte); return; }
    if (ch.mode === 'W') ch.buf.push(byte);
  }
  // returns [byte, eof]
  read(sa) {
    const ch = this.channels[sa];
    if (!ch) return [13, true];
    if (ch.cmd) {
      const s = this.statusString() + '\r';
      const b = s.charCodeAt(ch.pos++);
      const eof = ch.pos >= s.length;
      if (eof) { ch.pos = 0; this.setStatus(0, ' OK'); }
      return [b, eof];
    }
    const d = ch.file.data;
    if (ch.pos >= d.length) return [13, true];
    const b = d[ch.pos++];
    return [b, ch.pos >= d.length];
  }

  command(cmd) {
    cmd = cmd.replace(/\r$/, '');
    this.touch(0.8);
    const c = cmd[0];
    if (!this.disk && c !== 'I' && c !== 'U') { this.setStatus(74, 'DRIVE NOT READY'); return; }
    const arg = cmd.slice(cmd.indexOf(':') + 1);
    if (c === 'S') {
      const pats = arg.split(',');
      const before = this.disk.files.length;
      this.disk.files = this.disk.files.filter(f => !pats.some(p => matchName(p, f.name)));
      this.persist(); this.setStatus(1, 'FILES SCRATCHED', before - this.disk.files.length, 0);
    } else if (c === 'R') {
      const [nn, on] = arg.split('=');
      const f = this.disk.files.find(x => x.name === on);
      if (!f) return this.setStatus(62, 'FILE NOT FOUND');
      if (this.disk.files.some(x => x.name === nn)) return this.setStatus(63, 'FILE EXISTS');
      f.name = nn; this.persist(); this.setStatus(0, ' OK');
    } else if (c === 'N') {
      const [n, id] = arg.split(',');
      this.disk.name = n.slice(0, 16);
      if (id !== undefined) { this.disk.diskId = id.slice(0, 2); this.disk.files = []; }
      this.persist(); this.setStatus(0, ' OK'); this.touch(3);
    } else if (c === 'C') {
      const [nn, on] = arg.split('=');
      const f = this.disk.files.find(x => x.name === on);
      if (!f) return this.setStatus(62, 'FILE NOT FOUND');
      this.disk.files.push({ name: nn, type: f.type, data: f.data.slice() }); this.persist(); this.setStatus(0, ' OK');
    } else if (c === 'I' || c === 'V') { this.setStatus(0, ' OK'); }
    else if (c === 'U' && (cmd[1] === 'J' || cmd[1] === ':' || cmd[1] === '9' || cmd[1] === 'I')) { this.setStatus(73, 'CBM DOS V2.6 1541'); }
    else this.setStatus(31, 'SYNTAX ERROR');
  }
}

// --- import helpers -----------------------------------------------------
const SECTORS = (t) => t <= 17 ? 21 : t <= 24 ? 19 : t <= 30 ? 18 : 17;
function d64Offset(t, s) { let o = 0; for (let i = 1; i < t; i++) o += SECTORS(i); return (o + s) * 256; }
function trimPet(bytes) { let s = ''; for (const b of bytes) { if (b === 0xa0) break; s += String.fromCharCode(b); } return s; }

export function parseD64(u8, id) {
  const bam = d64Offset(18, 0);
  const disk = { id, name: trimPet(u8.slice(bam + 0x90, bam + 0xa0)), diskId: String.fromCharCode(u8[bam + 0xa2], u8[bam + 0xa3]), files: [] };
  let t = 18, s = 1, guard = 0;
  const types = { 1: 'SEQ', 2: 'PRG', 3: 'USR', 4: 'REL' };
  while (t && guard++ < 40) {
    const o = d64Offset(t, s);
    for (let e = 0; e < 8; e++) {
      const eo = o + e * 32;
      const ft = u8[eo + 2];
      if (!(ft & 0x80) || !types[ft & 7]) continue;
      const name = trimPet(u8.slice(eo + 5, eo + 21));
      const data = [];
      let ft2 = u8[eo + 3], fs = u8[eo + 4], g2 = 0;
      while (ft2 && g2++ < 800) {
        const so = d64Offset(ft2, fs);
        const nt = u8[so], ns = u8[so + 1];
        const end = nt === 0 ? ns + 1 : 256;
        for (let i = 2; i < end; i++) data.push(u8[so + i]);
        ft2 = nt; fs = ns;
      }
      disk.files.push({ name, type: types[ft & 7], data: new Uint8Array(data) });
    }
    t = u8[o]; s = u8[o + 1];
  }
  return disk;
}
