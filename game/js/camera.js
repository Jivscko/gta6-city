// The camera: follows the player or the car with a little look-ahead, eases its zoom as speed
// rises, and turns impact impulses into a decaying screen shake.

import { clamp, damp } from './utils.js';

export class Camera {
  constructor(width, height) {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.baseScale = 1;
    this.width = width;
    this.height = height;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.shakeEnabled = true;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.baseScale = Math.min(width / 1280, height / 720);
  }

  get scale() {
    return this.baseScale * this.zoom;
  }

  snapTo(x, y) {
    this.x = x;
    this.y = y;
    this.lookX = 0;
    this.lookY = 0;
  }

  addShake(amount) {
    if (!this.shakeEnabled) return;
    this.shake = Math.min(26, this.shake + amount);
  }

  /** Follow a focus point; `pace` 0..1 is how fast the car is going, which pulls the zoom back. */
  follow(focusX, focusY, velocityX, velocityY, pace, dt, driving) {
    const lead = driving ? 26 : 12;
    const targetLookX = clamp(velocityX * 0.09, -lead * 2, lead * 2);
    const targetLookY = clamp(velocityY * 0.09, -lead * 2, lead * 2);
    this.lookX = damp(this.lookX, targetLookX, 3, dt);
    this.lookY = damp(this.lookY, targetLookY, 3, dt);
    this.x = damp(this.x, focusX + this.lookX, 6.5, dt);
    this.y = damp(this.y, focusY + this.lookY, 6.5, dt);

    const targetZoom = driving ? 1 - 0.16 * clamp(pace, 0, 1) : 1.06;
    this.zoom = damp(this.zoom, targetZoom, 2.4, dt);

    this.shake = damp(this.shake, 0, 7, dt);
    if (this.shake > 0.15) {
      this.shakeX = (Math.random() * 2 - 1) * this.shake;
      this.shakeY = (Math.random() * 2 - 1) * this.shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  /** The camera transform for world-space drawing; call restore() when done. */
  apply(ctx) {
    ctx.save();
    const s = this.scale;
    ctx.translate(this.width / 2 + this.shakeX, this.height / 2 + this.shakeY);
    ctx.scale(s, s);
    ctx.translate(-this.x, -this.y);
  }

  restore(ctx) {
    ctx.restore();
  }

  /** The world-space rectangle on screen, padded for effects at the edges. */
  get view() {
    const s = this.scale;
    const w = this.width / s;
    const h = this.height / s;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  screenToWorld(x, y) {
    const s = this.scale;
    return {
      x: this.x + (x - this.width / 2 - this.shakeX) / s,
      y: this.y + (y - this.height / 2 - this.shakeY) / s,
    };
  }

  worldToScreen(x, y) {
    const s = this.scale;
    return {
      x: (x - this.x) * s + this.width / 2 + this.shakeX,
      y: (y - this.y) * s + this.height / 2 + this.shakeY,
    };
  }
}
