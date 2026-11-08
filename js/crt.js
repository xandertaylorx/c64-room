// Composites the raw 384x272 VIC frame into a CRT-looking image (glow, scanlines, curvature
// vignette, power on/off animation). The result is used as the 3D screen texture and the 2D view.
import { W, H } from './c64/machine.js';

export class CRT {
  constructor(machine) {
    this.m = machine;
    this.raw = document.createElement('canvas'); this.raw.width = W; this.raw.height = H;
    this.rctx = this.raw.getContext('2d');
    this.img = this.rctx.createImageData(W, H);
    this.buf32 = new Uint32Array(this.img.data.buffer);
    this.canvas = document.createElement('canvas'); this.canvas.width = 1024; this.canvas.height = 768;
    this.ctx = this.canvas.getContext('2d');
    this.effects = true;
    this.power = 0;       // 0..1 animated
    this.on = false;
    this.flash = 0;
    this.avg = [0, 0, 0];
    this.filterOK = typeof this.ctx.filter === 'string';
    this.makeOverlay();
  }
  makeOverlay() {
    const o = document.createElement('canvas'); o.width = 1024; o.height = 768;
    const c = o.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < 768; y += 3) c.fillRect(0, y, 1024, 1);
    const g = c.createRadialGradient(512, 384, 200, 512, 384, 640);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 768);
    this.overlay = o;
  }
  setPower(on) { this.on = on; if (on) this.flash = 1; }

  draw(dt) {
    const target = this.on ? 1 : 0;
    this.power += (target - this.power) * Math.min(1, dt * (this.on ? 3.5 : 7));
    if (Math.abs(target - this.power) < 0.002) this.power = target;
    this.flash = Math.max(0, this.flash - dt * 1.5);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = '#060606'; ctx.fillRect(0, 0, 1024, 768);
    if (this.power <= 0.001) { this.avg = [0, 0, 0]; return; }

    if (this.on) {
      this.m.render();
      this.buf32.set(this.m.frameBuf);
      this.rctx.putImageData(this.img, 0, 0);
      this.sampleAvg();
    }
    // picture area (slight overscan like a real monitor)
    const p = this.power;
    const ix = 70, iy = 62, iw = 1024 - ix * 2, ih = 768 - iy * 2;
    const sy = this.on ? Math.min(1, p * 1.6) : Math.max(0.004, p * p);
    const sx = this.on ? 1 : Math.max(0.02, p);
    const w = iw * sx, h = ih * sy, x = 512 - w / 2, y = 384 - h / 2;
    ctx.imageSmoothingEnabled = !this.effects ? false : true;
    ctx.save();
    ctx.beginPath(); roundRect(ctx, x, y, w, h, 48 * sy); ctx.clip();
    ctx.globalAlpha = Math.min(1, p * 1.3);
    if (this.on) ctx.drawImage(this.raw, x, y, w, h);
    else { ctx.fillStyle = '#e8f0ff'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    if (this.effects && this.on) {
      if (this.filterOK) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35; ctx.filter = 'blur(10px)';
        ctx.drawImage(this.raw, x, y, w, h);
        ctx.filter = 'none';
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.drawImage(this.overlay, 0, 0);
    }
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.flash * 0.5;
      ctx.fillStyle = '#9fb4ff'; ctx.fillRect(0, 0, 1024, 768);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  sampleAvg() {
    const b = this.m.frameBuf; let r = 0, g = 0, bl = 0, n = 0;
    for (let i = 0; i < b.length; i += 97) { const v = b[i]; r += v & 255; g += (v >> 8) & 255; bl += (v >> 16) & 255; n++; }
    this.avg = [r / n / 255, g / n / 255, bl / n / 255];
  }
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
