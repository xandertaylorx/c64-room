// SID 6581 sound chip: 3 oscillators (tri/saw/pulse/noise, sync, ring), ADSR envelopes,
// multimode resonant filter. Runs in an AudioWorklet fed with register writes.

const WORKLET = `
const CLOCK = 985248;
const ATK = [2,8,16,24,38,56,68,80,100,250,500,800,1000,3000,5000,8000];
const DR = ATK.map(v => v * 3);
class Voice {
  constructor() { this.acc = 0; this.noise = 0x7ffff8; this.env = 0; this.state = 3; this.prevGate = 0; this.prevBit19 = 0; this.out = 0; }
}
class SIDProc extends AudioWorkletProcessor {
  constructor() {
    super();
    this.r = new Uint8Array(32);
    this.v = [new Voice(), new Voice(), new Voice()];
    this.lp = 0; this.bp = 0; this.muted = false;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.mute !== undefined) { this.muted = d.mute; return; }
      for (let i = 0; i < d.length; i += 2) this.r[d[i]] = d[i + 1];
    };
  }
  process(_in, outputs) {
    const out = outputs[0][0], r = this.r, v = this.v;
    const step = CLOCK / sampleRate;
    const vol = (r[0x18] & 15) / 15;
    const cutoff = ((r[0x15] & 7) | (r[0x16] << 3));
    const fc = 30 + cutoff / 2047 * 11000;
    const f = 2 * Math.sin(Math.PI * Math.min(fc, sampleRate / 6) / sampleRate);
    const q = 1.4 - ((r[0x17] >> 4) / 15) * 1.15;
    const route = r[0x17] & 15, mode = r[0x18];
    for (let s = 0; s < out.length; s++) {
      let filt = 0, direct = 0;
      for (let n = 0; n < 3; n++) {
        const b = n * 7, vc = v[n];
        const freq = r[b] | (r[b + 1] << 8);
        const pw = r[b + 2] | ((r[b + 3] & 15) << 8);
        const ctl = r[b + 4];
        const ad = r[b + 5], sr = r[b + 6];
        // envelope
        const gate = ctl & 1;
        if (gate && !vc.prevGate) vc.state = 0;
        if (!gate && vc.prevGate) vc.state = 3;
        vc.prevGate = gate;
        const sus = (sr >> 4) * 17;
        if (vc.state === 0) { vc.env += 255 / (ATK[ad >> 4] * sampleRate / 1000); if (vc.env >= 255) { vc.env = 255; vc.state = 1; } }
        else if (vc.state === 1) { const k = 1 / (DR[ad & 15] * sampleRate / 1000) * 4; vc.env -= (vc.env - sus) * k + 0.0001; if (vc.env <= sus) { vc.env = sus; vc.state = 2; } }
        else if (vc.state === 2) { vc.env = sus; }
        else { const k = 1 / (DR[sr & 15] * sampleRate / 1000) * 4; vc.env -= vc.env * k; if (vc.env < 0.01) vc.env = 0; }
        // oscillator
        if (ctl & 8) { vc.acc = 0; }
        else {
          const prev = vc.acc;
          vc.acc = (vc.acc + freq * step) % 16777216;
          if (vc.acc < prev) { // overflow -> hard sync target
            const t = v[(n + 1) % 3]; if (r[((n + 1) % 3) * 7 + 4] & 2) t.acc = 0;
          }
          const bit19 = (vc.acc >> 19) & 1;
          if (bit19 && !vc.prevBit19) {
            const nb = ((vc.noise >> 22) ^ (vc.noise >> 17)) & 1;
            vc.noise = ((vc.noise << 1) | nb) & 0x7fffff;
          }
          vc.prevBit19 = bit19;
        }
        let w = 0xfff, any = false;
        const acc = vc.acc | 0;
        if (ctl & 0x10) {
          let msb = acc & 0x800000;
          if (ctl & 4) msb ^= (v[(n + 2) % 3].acc | 0) & 0x800000;
          w &= ((msb ? ~acc : acc) >> 11) & 0xfff; any = true;
        }
        if (ctl & 0x20) { w &= (acc >> 12) & 0xfff; any = true; }
        if (ctl & 0x40) { w &= ((acc >> 12) >= pw) ? 0xfff : 0; any = true; }
        if (ctl & 0x80) {
          const nz = vc.noise;
          w &= (((nz >> 20) & 1) << 11 | ((nz >> 18) & 1) << 10 | ((nz >> 14) & 1) << 9 | ((nz >> 11) & 1) << 8 |
               ((nz >> 9) & 1) << 7 | ((nz >> 5) & 1) << 6 | ((nz >> 2) & 1) << 5 | (nz & 1) << 4); any = true;
        }
        const o = any ? ((w - 2048) / 2048) * (vc.env / 255) : 0;
        if (n === 2 && (mode & 0x80) && !(route & 4)) continue;
        if (route & (1 << n)) filt += o; else direct += o;
      }
      // state variable filter
      const hp = filt - this.lp - q * this.bp;
      this.bp += f * hp; this.lp += f * this.bp;
      if (!isFinite(this.lp) || Math.abs(this.lp) > 50) { this.lp = 0; this.bp = 0; }
      let fo = 0;
      if (mode & 0x10) fo += this.lp;
      if (mode & 0x20) fo += this.bp;
      if (mode & 0x40) fo += hp;
      out[s] = this.muted ? 0 : ((direct + fo) * vol * 0.28);
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('sid-proc', SIDProc);
`;

export class SID {
  constructor() {
    this.ctx = null; this.node = null; this.pending = []; this.regs = new Uint8Array(32); this.muted = false;
  }
  async start() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(this.ctx, 'sid-proc', { outputChannelCount: [2] });
      this.node.connect(this.ctx.destination);
      const all = []; for (let i = 0; i < 32; i++) all.push(i, this.regs[i]);
      this.node.port.postMessage(all);
      this.node.port.postMessage({ mute: this.muted });
    } catch (e) { console.warn('SID audio unavailable', e); }
  }
  write(r, v) { this.regs[r] = v; this.pending.push(r, v); }
  flush() { if (this.node && this.pending.length) { this.node.port.postMessage(this.pending); } this.pending = []; }
  setMuted(m) { this.muted = m; if (this.node) this.node.port.postMessage({ mute: m }); }
}

// Short sound effects for the hardware (1541 drive head, key clicks) - plain WebAudio
export class Foley {
  constructor(sid) { this.sid = sid; }
  get ctx() { return this.sid.ctx; }
  click(vol = 0.05) {
    const ctx = this.ctx; if (!ctx || this.sid.muted) return;
    const t = ctx.currentTime, len = 0.025;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length / 6));
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(ctx.destination); src.start(t);
  }
  driveSeek(seconds = 1) {
    const ctx = this.ctx; if (!ctx || this.sid.muted) return;
    const t = ctx.currentTime;
    for (let i = 0; i < seconds * 14; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 90 + Math.random() * 40;
      g.gain.setValueAtTime(0, t + i / 14); g.gain.linearRampToValueAtTime(0.025, t + i / 14 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i / 14 + 0.05);
      o.connect(g).connect(ctx.destination); o.start(t + i / 14); o.stop(t + i / 14 + 0.06);
    }
    // motor hum
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 50;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    g.gain.setValueAtTime(0.03, t); g.gain.setValueAtTime(0.03, t + seconds); g.gain.linearRampToValueAtTime(0, t + seconds + 0.2);
    o.connect(lp).connect(g).connect(ctx.destination); o.start(t); o.stop(t + seconds + 0.25);
  }
}
