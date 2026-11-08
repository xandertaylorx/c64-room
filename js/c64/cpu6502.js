// MOS 6510 CPU core (all documented opcodes). Used by SYS / machine code programs.
// KERNAL entry points are trapped (onTrap) because the system ROMs are re-implemented in JS.

const C = 1, Z = 2, I = 4, D = 8, B = 16, U = 32, V = 64, N = 128;

export class CPU {
  constructor(mem) {
    this.mem = mem; // {read(a), write(a,v)}
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xff; this.p = U | I; this.pc = 0;
    this.cycles = 0;
    this.onTrap = null; // (pc) => true if handled (then an RTS is performed)
    this.halted = false;
    this.build();
  }
  rd(a) { return this.mem.read(a & 0xffff); }
  wr(a, v) { this.mem.write(a & 0xffff, v & 0xff); }
  rd16(a) { return this.rd(a) | (this.rd(a + 1) << 8); }
  rd16zp(a) { return this.rd(a & 0xff) | (this.rd((a + 1) & 0xff) << 8); }
  push(v) { this.wr(0x100 + this.sp, v); this.sp = (this.sp - 1) & 0xff; }
  pop() { this.sp = (this.sp + 1) & 0xff; return this.rd(0x100 + this.sp); }
  nz(v) { this.p = (this.p & ~(N | Z)) | (v & N) | (v ? 0 : Z); return v; }
  fetch() { const v = this.rd(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  fetch16() { const v = this.rd16(this.pc); this.pc = (this.pc + 2) & 0xffff; return v; }
  rts() { const lo = this.pop(), hi = this.pop(); this.pc = ((hi << 8 | lo) + 1) & 0xffff; }
  irq(nmi) {
    if (!nmi && (this.p & I)) return;
    this.push(this.pc >> 8); this.push(this.pc & 0xff); this.push((this.p | U) & ~B);
    this.p |= I; this.pc = this.rd16(nmi ? 0xfffa : 0xfffe);
  }

  // addressing modes return an effective address
  build() {
    const s = this;
    const m = {
      imm: () => { const a = s.pc; s.pc = (s.pc + 1) & 0xffff; return a; },
      zp: () => s.fetch(),
      zpx: () => (s.fetch() + s.x) & 0xff,
      zpy: () => (s.fetch() + s.y) & 0xff,
      abs: () => s.fetch16(),
      abx: () => (s.fetch16() + s.x) & 0xffff,
      aby: () => (s.fetch16() + s.y) & 0xffff,
      izx: () => s.rd16zp((s.fetch() + s.x) & 0xff),
      izy: () => (s.rd16zp(s.fetch()) + s.y) & 0xffff,
    };
    const ops = new Array(256);
    const def = (codes, fn, cyc) => { for (const [op, mode] of codes) ops[op] = [fn, m[mode], cyc]; };
    const adc = (v) => {
      const c = s.p & C;
      if (s.p & D) {
        let lo = (s.a & 15) + (v & 15) + c, hi = (s.a >> 4) + (v >> 4);
        if (lo > 9) { lo += 6; hi++; }
        const bin = s.a + v + c;
        s.p = (s.p & ~(Z | N | V | C)) | ((bin & 0xff) ? 0 : Z);
        if (hi & 8) s.p |= N;
        if (~(s.a ^ v) & (s.a ^ (hi << 4)) & 0x80) s.p |= V;
        if (hi > 9) hi += 6;
        if (hi > 15) s.p |= C;
        s.a = ((hi << 4) | (lo & 15)) & 0xff;
      } else {
        const r = s.a + v + c;
        s.p = (s.p & ~(C | V)) | (r > 0xff ? C : 0) | ((~(s.a ^ v) & (s.a ^ r) & 0x80) ? V : 0);
        s.a = s.nz(r & 0xff);
      }
    };
    const sbc = (v) => {
      if (s.p & D) {
        const c = (s.p & C) ? 0 : 1;
        let lo = (s.a & 15) - (v & 15) - c, hi = (s.a >> 4) - (v >> 4);
        if (lo & 16) { lo -= 6; hi--; }
        if (hi & 16) hi -= 6;
        const r = s.a - v - c;
        s.p = (s.p & ~(C | V | Z | N)) | (r < 0 ? 0 : C) | (((s.a ^ v) & (s.a ^ r) & 0x80) ? V : 0);
        s.nz(r & 0xff);
        s.a = ((hi << 4) | (lo & 15)) & 0xff;
      } else adc(v ^ 0xff);
    };
    const cmp = (r, v) => { const t = r - v; s.p = (s.p & ~C) | (t >= 0 ? C : 0); s.nz(t & 0xff); };
    const br = (cond) => { const o = s.fetch(); if (cond) { s.pc = (s.pc + (o < 128 ? o : o - 256)) & 0xffff; s.cycles++; } };
    const rmw = (fn) => (a) => { if (a === -1) { s.a = fn(s.a); } else s.wr(a, fn(s.rd(a))); };
    const asl = (v) => { s.p = (s.p & ~C) | ((v >> 7) & 1); return s.nz((v << 1) & 0xff); };
    const lsr = (v) => { s.p = (s.p & ~C) | (v & 1); return s.nz(v >> 1); };
    const rol = (v) => { const c = s.p & C; s.p = (s.p & ~C) | ((v >> 7) & 1); return s.nz(((v << 1) | c) & 0xff); };
    const ror = (v) => { const c = s.p & C; s.p = (s.p & ~C) | (v & 1); return s.nz((v >> 1) | (c << 7)); };

    def([[0x69, 'imm'], [0x65, 'zp'], [0x75, 'zpx'], [0x6d, 'abs'], [0x7d, 'abx'], [0x79, 'aby'], [0x61, 'izx'], [0x71, 'izy']], (a) => adc(s.rd(a)), 4);
    def([[0xe9, 'imm'], [0xe5, 'zp'], [0xf5, 'zpx'], [0xed, 'abs'], [0xfd, 'abx'], [0xf9, 'aby'], [0xe1, 'izx'], [0xf1, 'izy'], [0xeb, 'imm']], (a) => sbc(s.rd(a)), 4);
    def([[0x29, 'imm'], [0x25, 'zp'], [0x35, 'zpx'], [0x2d, 'abs'], [0x3d, 'abx'], [0x39, 'aby'], [0x21, 'izx'], [0x31, 'izy']], (a) => { s.a = s.nz(s.a & s.rd(a)); }, 4);
    def([[0x09, 'imm'], [0x05, 'zp'], [0x15, 'zpx'], [0x0d, 'abs'], [0x1d, 'abx'], [0x19, 'aby'], [0x01, 'izx'], [0x11, 'izy']], (a) => { s.a = s.nz(s.a | s.rd(a)); }, 4);
    def([[0x49, 'imm'], [0x45, 'zp'], [0x55, 'zpx'], [0x4d, 'abs'], [0x5d, 'abx'], [0x59, 'aby'], [0x41, 'izx'], [0x51, 'izy']], (a) => { s.a = s.nz(s.a ^ s.rd(a)); }, 4);
    def([[0xc9, 'imm'], [0xc5, 'zp'], [0xd5, 'zpx'], [0xcd, 'abs'], [0xdd, 'abx'], [0xd9, 'aby'], [0xc1, 'izx'], [0xd1, 'izy']], (a) => cmp(s.a, s.rd(a)), 4);
    def([[0xe0, 'imm'], [0xe4, 'zp'], [0xec, 'abs']], (a) => cmp(s.x, s.rd(a)), 3);
    def([[0xc0, 'imm'], [0xc4, 'zp'], [0xcc, 'abs']], (a) => cmp(s.y, s.rd(a)), 3);
    def([[0x24, 'zp'], [0x2c, 'abs']], (a) => { const v = s.rd(a); s.p = (s.p & ~(N | V | Z)) | (v & (N | V)) | ((v & s.a) ? 0 : Z); }, 4);
    def([[0xa9, 'imm'], [0xa5, 'zp'], [0xb5, 'zpx'], [0xad, 'abs'], [0xbd, 'abx'], [0xb9, 'aby'], [0xa1, 'izx'], [0xb1, 'izy']], (a) => { s.a = s.nz(s.rd(a)); }, 4);
    def([[0xa2, 'imm'], [0xa6, 'zp'], [0xb6, 'zpy'], [0xae, 'abs'], [0xbe, 'aby']], (a) => { s.x = s.nz(s.rd(a)); }, 4);
    def([[0xa0, 'imm'], [0xa4, 'zp'], [0xb4, 'zpx'], [0xac, 'abs'], [0xbc, 'abx']], (a) => { s.y = s.nz(s.rd(a)); }, 4);
    def([[0x85, 'zp'], [0x95, 'zpx'], [0x8d, 'abs'], [0x9d, 'abx'], [0x99, 'aby'], [0x81, 'izx'], [0x91, 'izy']], (a) => s.wr(a, s.a), 4);
    def([[0x86, 'zp'], [0x96, 'zpy'], [0x8e, 'abs']], (a) => s.wr(a, s.x), 3);
    def([[0x84, 'zp'], [0x94, 'zpx'], [0x8c, 'abs']], (a) => s.wr(a, s.y), 3);
    def([[0xe6, 'zp'], [0xf6, 'zpx'], [0xee, 'abs'], [0xfe, 'abx']], (a) => s.wr(a, s.nz((s.rd(a) + 1) & 0xff)), 6);
    def([[0xc6, 'zp'], [0xd6, 'zpx'], [0xce, 'abs'], [0xde, 'abx']], (a) => s.wr(a, s.nz((s.rd(a) - 1) & 0xff)), 6);
    def([[0x06, 'zp'], [0x16, 'zpx'], [0x0e, 'abs'], [0x1e, 'abx']], rmw(asl), 6);
    def([[0x46, 'zp'], [0x56, 'zpx'], [0x4e, 'abs'], [0x5e, 'abx']], rmw(lsr), 6);
    def([[0x26, 'zp'], [0x36, 'zpx'], [0x2e, 'abs'], [0x3e, 'abx']], rmw(rol), 6);
    def([[0x66, 'zp'], [0x76, 'zpx'], [0x6e, 'abs'], [0x7e, 'abx']], rmw(ror), 6);
    const imp = (op, fn, cyc = 2) => { ops[op] = [fn, null, cyc]; };
    imp(0x0a, () => { s.a = asl(s.a); }); imp(0x4a, () => { s.a = lsr(s.a); });
    imp(0x2a, () => { s.a = rol(s.a); }); imp(0x6a, () => { s.a = ror(s.a); });
    imp(0xaa, () => { s.x = s.nz(s.a); }); imp(0x8a, () => { s.a = s.nz(s.x); });
    imp(0xa8, () => { s.y = s.nz(s.a); }); imp(0x98, () => { s.a = s.nz(s.y); });
    imp(0xba, () => { s.x = s.nz(s.sp); }); imp(0x9a, () => { s.sp = s.x; });
    imp(0xe8, () => { s.x = s.nz((s.x + 1) & 0xff); }); imp(0xca, () => { s.x = s.nz((s.x - 1) & 0xff); });
    imp(0xc8, () => { s.y = s.nz((s.y + 1) & 0xff); }); imp(0x88, () => { s.y = s.nz((s.y - 1) & 0xff); });
    imp(0x18, () => { s.p &= ~C; }); imp(0x38, () => { s.p |= C; });
    imp(0x58, () => { s.p &= ~I; }); imp(0x78, () => { s.p |= I; });
    imp(0xd8, () => { s.p &= ~D; }); imp(0xf8, () => { s.p |= D; });
    imp(0xb8, () => { s.p &= ~V; }); imp(0xea, () => { });
    imp(0x48, () => s.push(s.a), 3); imp(0x68, () => { s.a = s.nz(s.pop()); }, 4);
    imp(0x08, () => s.push(s.p | B | U), 3); imp(0x28, () => { s.p = (s.pop() & ~B) | U; }, 4);
    imp(0x40, () => { s.p = (s.pop() & ~B) | U; const lo = s.pop(), hi = s.pop(); s.pc = hi << 8 | lo; }, 6);
    imp(0x60, () => s.rts(), 6);
    imp(0x00, () => { s.pc = (s.pc + 1) & 0xffff; s.push(s.pc >> 8); s.push(s.pc & 0xff); s.push(s.p | B | U); s.p |= I; s.brk = true; s.pc = s.rd16(0xfffe); }, 7);
    imp(0x4c, () => { s.pc = s.fetch16(); }, 3);
    imp(0x6c, () => { const a = s.fetch16(); s.pc = s.rd(a) | (s.rd((a & 0xff00) | ((a + 1) & 0xff)) << 8); }, 5);
    imp(0x20, () => { const t = s.fetch16(); const r = (s.pc - 1) & 0xffff; s.push(r >> 8); s.push(r & 0xff); s.pc = t; }, 6);
    imp(0x10, () => br(!(s.p & N))); imp(0x30, () => br(s.p & N));
    imp(0x50, () => br(!(s.p & V))); imp(0x70, () => br(s.p & V));
    imp(0x90, () => br(!(s.p & C))); imp(0xb0, () => br(s.p & C));
    imp(0xd0, () => br(!(s.p & Z))); imp(0xf0, () => br(s.p & Z));
    // common NOP variants used by some code
    for (const op of [0x1a, 0x3a, 0x5a, 0x7a, 0xda, 0xfa]) imp(op, () => { });
    for (const op of [0x80, 0x82, 0x89, 0xc2, 0xe2, 0x04, 0x44, 0x64, 0x14, 0x34, 0x54, 0x74, 0xd4, 0xf4]) imp(op, () => { s.pc = (s.pc + 1) & 0xffff; }, 3);
    for (const op of [0x0c, 0x1c, 0x3c, 0x5c, 0x7c, 0xdc, 0xfc]) imp(op, () => { s.pc = (s.pc + 2) & 0xffff; }, 4);
    this.ops = ops;
  }

  // execute one instruction; returns false on illegal opcode (JAM)
  step() {
    if (this.onTrap && this.onTrap(this.pc)) { this.cycles += 6; return true; }
    const op = this.fetch();
    const e = this.ops[op];
    if (!e) { this.halted = true; this.pc = (this.pc - 1) & 0xffff; return false; }
    const [fn, mode, cyc] = e;
    if (mode) {
      const isAcc = false;
      fn(isAcc ? -1 : mode());
    } else fn();
    this.cycles += cyc;
    return true;
  }
}
