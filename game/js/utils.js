// Small maths and helper functions shared by every system: angles, distances, a seeded random
// generator so the city and the screenshot scenes come out the same every run, and colour work.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));

/** Frame-rate independent smoothing: `rate` is roughly how fast the value catches up. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Smoothly turn angle `a` toward `b` by at most `maxStep`. */
export function turnToward(a, b, maxStep) {
  const d = angleDelta(a, b);
  return a + clamp(d, -maxStep, maxStep);
}

export function rectContains(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Closest point on a rectangle to (x, y). */
export function closestOnRect(r, x, y) {
  return { x: clamp(x, r.x, r.x + r.w), y: clamp(y, r.y, r.y + r.h) };
}

/** A point along a rectangle's perimeter, 0..1 clockwise; used by pedestrians on sidewalks. */
export function pointOnLoop(r, t) {
  const w = r.w;
  const h = r.h;
  const perimeter = 2 * (w + h);
  let d = ((t % 1) + 1) % 1 * perimeter;
  if (d < w) return { x: r.x + d, y: r.y, nx: 0, ny: 1 };
  d -= w;
  if (d < h) return { x: r.x + w, y: r.y + d, nx: -1, ny: 0 };
  d -= h;
  if (d < w) return { x: r.x + w - d, y: r.y + h, nx: 0, ny: -1 };
  d -= w;
  return { x: r.x, y: r.y + h - d, nx: 1, ny: 0 };
}

/** Deterministic 32-bit hash, so names and colours can be derived from strings. */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a tiny seeded PRNG with a `next()` in [0, 1) and convenience picks. */
export class Random {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }
  int(lo, hi) {
    return Math.floor(this.range(lo, hi + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
  chance(p) {
    return this.next() < p;
  }
}

/** Mix two hex colours; t 0 gives a, 1 gives b. */
export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(lerp(v, cb[i], t)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A hex colour lightened (positive) or darkened (negative) toward white/black. */
export function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return `rgb(${Math.round(lerp(r, target, t))}, ${Math.round(lerp(g, target, t))}, ${Math.round(lerp(b, target, t))})`;
}

export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Formatting for the HUD: thousands separators and a compact distance in metres. */
export const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
export const metres = (n) => `${Math.max(0, Math.round(n / 10))} m`;

/** A rounded rectangle path, since canvas roundRect is not everywhere. */
export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** A five-point star path, used for the wanted meter. */
export function starPath(ctx, x, y, outer, inner, rotation = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Linear interpolation of a hex palette by index, handy for gradient UI strips. */
export function pickWeighted(rng, entries) {
  let total = 0;
  for (const e of entries) total += e.weight;
  let roll = rng.next() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.value;
  }
  return entries[entries.length - 1].value;
}
