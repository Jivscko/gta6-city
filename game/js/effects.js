// Particles, floating HUD text, tyre marks and the screen shake hook. One pooled system for sparks,
// smoke, blood, sand, glass and explosions, plus lingering skid decals painted under the cars.

import { clamp } from './utils.js';

const MAX_PARTICLES = 520;
const MAX_DECALS = 160;

export class Effects {
  constructor(camera) {
    this.camera = camera;
    this.particles = [];
    this.texts = [];
    this.decals = [];
  }

  clear() {
    this.particles.length = 0;
    this.texts.length = 0;
    this.decals.length = 0;
  }

  _push(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      vx: 0,
      vy: 0,
      life: 0.5,
      maxLife: 0.5,
      size: 3,
      drag: 2,
      gravity: 0,
      color: '#fff',
      shape: 'dot',
      additive: false,
      ...p,
    });
  }

  spark(x, y, angle, count = 6, speed = 260) {
    for (let i = 0; i < count; i += 1) {
      const a = angle + (Math.random() - 0.5) * 1.4;
      const s = speed * (0.4 + Math.random());
      this._push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.22 + Math.random() * 0.3,
        maxLife: 0.5,
        size: 1.4 + Math.random() * 1.8,
        color: Math.random() > 0.4 ? '#ffd98a' : '#ff9a5c',
        additive: true,
        drag: 3,
      });
    }
  }

  /** Alias used by the vehicle, combat and police code. */
  sparks(x, y, angle, count = 6, speed = 260) {
    this.spark(x, y, angle, count, speed);
  }

  muzzle(x, y, angle) {
    this.spark(x, y, angle, 4, 220);
    this._push({
      x: x - Math.cos(angle) * 6,
      y: y - Math.sin(angle) * 6,
      life: 0.07,
      maxLife: 0.07,
      size: 12,
      color: 'rgba(255, 226, 160, 0.9)',
      additive: true,
      shape: 'flash',
      drag: 0,
    });
    this.smoke(x, y, 1, 0.4);
  }

  smoke(x, y, count = 3, scale = 1) {
    for (let i = 0; i < count; i += 1) {
      this._push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 24,
        vy: -14 - Math.random() * 20,
        life: 0.9 + Math.random() * 1.1,
        maxLife: 2,
        size: (10 + Math.random() * 16) * scale,
        color: 'rgba(150, 148, 145, 0.32)',
        shape: 'smoke',
        drag: 0.7,
      });
    }
  }

  blood(x, y, angle, count = 8) {
    for (let i = 0; i < count; i += 1) {
      const a = angle + (Math.random() - 0.5) * 1.8;
      const s = 60 + Math.random() * 160;
      this._push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.4,
        maxLife: 0.75,
        size: 1.4 + Math.random() * 2.4,
        color: Math.random() > 0.5 ? '#8d2633' : '#631823',
        drag: 4,
      });
    }
  }

  dust(x, y, count = 6, color = 'rgba(210, 190, 150, 0.5)') {
    for (let i = 0; i < count; i += 1) {
      this._push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 18,
        vx: (Math.random() - 0.5) * 90,
        vy: (Math.random() - 0.5) * 90,
        life: 0.3 + Math.random() * 0.4,
        maxLife: 0.7,
        size: 3 + Math.random() * 6,
        color,
        shape: 'smoke',
        drag: 3,
      });
    }
  }

  glass(x, y, angle, count = 10) {
    for (let i = 0; i < count; i += 1) {
      const a = angle + (Math.random() - 0.5) * 2.4;
      this._push({
        x,
        y,
        vx: Math.cos(a) * (80 + Math.random() * 240),
        vy: Math.sin(a) * (80 + Math.random() * 240),
        life: 0.3 + Math.random() * 0.5,
        maxLife: 0.8,
        size: 1.2 + Math.random() * 2,
        color: '#cfe8ea',
        additive: true,
        drag: 2.5,
      });
    }
  }

  explosion(x, y) {
    this.camera.addShake(18);
    for (let i = 0; i < 26; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 260;
      this._push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.6,
        maxLife: 0.95,
        size: 4 + Math.random() * 10,
        color: Math.random() > 0.45 ? '#ffb05e' : '#ff6a3d',
        additive: true,
        drag: 2,
      });
    }
    this.smoke(x, y, 8, 1.8);
    this._push({ x, y, life: 0.18, maxLife: 0.18, size: 60, color: 'rgba(255, 214, 150, 0.9)', additive: true, shape: 'flash', drag: 0 });
  }

  splash(x, y) {
    for (let i = 0; i < 14; i += 1) {
      this._push({
        x,
        y,
        vx: (Math.random() - 0.5) * 120,
        vy: -40 - Math.random() * 90,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 1.5 + Math.random() * 3,
        color: 'rgba(210, 240, 240, 0.8)',
        gravity: 260,
        drag: 1,
      });
    }
  }

  tyreMark(x, y, angle, strength = 1) {
    this.decals.push({ x, y, angle, life: 26, maxLife: 26, strength: clamp(strength, 0.3, 1) });
    if (this.decals.length > MAX_DECALS) this.decals.shift();
  }

  text(x, y, text, color = '#ffcf6b', size = 15) {
    this.texts.push({ x, y, text, color, size, life: 1.2, maxLife: 1.2 });
    if (this.texts.length > 18) this.texts.shift();
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt;
      p.vy += (p.gravity ?? 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.decals.length - 1; i >= 0; i -= 1) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) this.decals.splice(i, 1);
    }
  }

  /** Skid marks and scorch, drawn under the cars. */
  drawGround(ctx) {
    for (const d of this.decals) {
      const alpha = (d.life / d.maxLife) * 0.28 * d.strength;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.fillStyle = `rgba(16, 16, 22, ${alpha})`;
      ctx.fillRect(-11, -9, 22, 4);
      ctx.fillRect(-11, 5, 22, 4);
      ctx.restore();
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, t));
      if (p.shape === 'flash') {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'rgba(255, 190, 120, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Floating numbers/words live in screen space so they stay readable at any zoom. */
  drawTexts(ctx, camera) {
    for (const t of this.texts) {
      const screen = camera.worldToScreen(t.x, t.y);
      const a = Math.min(1, t.life / 0.4);
      ctx.globalAlpha = a;
      ctx.font = `bold ${t.size}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10, 12, 18, 0.55)';
      ctx.fillText(t.text, screen.x + 1, screen.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, screen.x, screen.y);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }
}
