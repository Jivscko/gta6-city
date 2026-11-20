// How everything that moves looks: cars with roofs, glass, lights and roof bars; people with torso,
// head and limbs that face where they aim; pickups; the pulsing mission marker; bullets and the
// player's aim reticle. All shapes, all in the game's own palette.

import { PALETTE } from './config.js';
import { rgba, roundRect, starPath } from './utils.js';

/** Shared car proportions by kind; w is across, l is along the car's heading. */
export const CAR_SHAPES = {
  sedan: { l: 48, w: 24 },
  sports: { l: 52, w: 22 },
  suv: { l: 50, w: 27 },
  van: { l: 58, w: 28 },
  taxi: { l: 48, w: 24 },
  police: { l: 52, w: 25 },
  swat: { l: 58, w: 28 },
};

/** A car from above, pointed along +x then rotated to its heading. */
export function drawCar(ctx, car, time = 0) {
  const shape = CAR_SHAPES[car.kind] ?? CAR_SHAPES.sedan;
  const l = shape.l;
  const w = shape.w;
  const hover = car.lift ?? 0;
  ctx.save();
  ctx.translate(car.x, car.y - hover);
  ctx.rotate(car.angle);

  // Ground shadow.
  ctx.fillStyle = 'rgba(16, 18, 26, 0.3)';
  roundRect(ctx, -l / 2 + 4, -w / 2 + 5, l, w, 7);
  ctx.fill();

  // Wheels.
  ctx.fillStyle = '#171a20';
  for (const [wx, wy] of [[-l * 0.28, -w / 2 - 1], [l * 0.28, -w / 2 - 1], [-l * 0.28, w / 2 - 4], [l * 0.28, w / 2 - 4]]) {
    roundRect(ctx, wx - 5, wy, 11, 5, 2);
    ctx.fill();
  }

  // Body with a sun-facing highlight.
  const paint = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  paint.addColorStop(0, rgba('#ffffff', 0.4));
  paint.addColorStop(0.12, car.color);
  paint.addColorStop(0.78, car.color);
  paint.addColorStop(1, rgba('#000000', 0.35));
  ctx.fillStyle = paint;
  roundRect(ctx, -l / 2, -w / 2, l, w, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(12, 14, 20, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Cabin, windshield and rear glass.
  ctx.fillStyle = 'rgba(22, 32, 40, 0.72)';
  roundRect(ctx, -l * 0.2, -w * 0.38, l * 0.4, w * 0.76, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(120, 175, 190, 0.55)';
  roundRect(ctx, l * 0.02, -w * 0.34, l * 0.14, w * 0.68, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(120, 175, 190, 0.32)';
  roundRect(ctx, -l * 0.3, -w * 0.3, l * 0.08, w * 0.6, 2);
  ctx.fill();

  // Roof, racing stripe on sports cars, taxi sign.
  ctx.fillStyle = rgba('#ffffff', 0.10);
  roundRect(ctx, -l * 0.16, -w * 0.3, l * 0.28, w * 0.6, 3);
  ctx.fill();
  if (car.kind === 'sports') {
    ctx.fillStyle = rgba('#f4e8cf', 0.5);
    ctx.fillRect(-l / 2 + 4, -2, l - 8, 4);
  }
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#f6d76a';
    ctx.fillRect(-2, -w * 0.22, 8, w * 0.44);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-1, -w * 0.16, 6, w * 0.32);
  }

  // Head and tail lights.
  ctx.fillStyle = car.lightsOn ? '#ffe9b0' : 'rgba(255, 240, 200, 0.55)';
  ctx.fillRect(l / 2 - 4, -w * 0.36, 4, 6);
  ctx.fillRect(l / 2 - 4, w * 0.22, 4, 6);
  ctx.fillStyle = 'rgba(220, 60, 55, 0.85)';
  ctx.fillRect(-l / 2, -w * 0.36, 3, 6);
  ctx.fillRect(-l / 2, w * 0.22, 3, 6);

  // Police roof bar: alternating red and blue with a bloom.
  if (car.kind === 'police' || car.kind === 'swat') {
    const phase = Math.floor((time * 7 + car.x * 0.01) % 2);
    ctx.fillStyle = '#141821';
    roundRect(ctx, -5, -w * 0.3, 11, w * 0.6, 2);
    ctx.fill();
    const red = phase === 0;
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = red ? '#ff4b57' : '#5b8ef0';
    ctx.fillStyle = red ? '#ff4b57' : '#5b8ef0';
    ctx.fillRect(-4, red ? -w * 0.28 : 1, 9, w * 0.26);
    ctx.restore();
    ctx.fillStyle = car.kind === 'swat' ? '#2a3140' : '#e9ecf2';
    ctx.fillRect(-l * 0.34, -4, l * 0.1, 8);
  }

  // Bullet holes and dents at low health.
  if (car.health < 65) {
    const holes = Math.floor((65 - car.health) / 12);
    ctx.fillStyle = 'rgba(12, 12, 16, 0.6)';
    for (let i = 0; i < holes; i += 1) {
      const hx = -l * 0.3 + ((i * 37 + car.x) % (l * 0.6));
      const hy = ((i * 19 + car.y) % (w * 0.5)) - w * 0.25;
      ctx.beginPath();
      ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** A person: shadow, torso, head, arms aiming, and anything they carry. */
export function drawPerson(ctx, person, time = 0) {
  const s = person.scale ?? 1;
  ctx.save();
  ctx.translate(person.x, person.y);
  if (person.state === 'down') {
    ctx.fillStyle = 'rgba(70, 20, 24, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20 * s, 12 * s, person.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = person.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15 * s, 8 * s, person.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = person.skin;
    ctx.beginPath();
    ctx.arc(Math.cos(person.angle) * 12 * s, Math.sin(person.angle) * 12 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Shadow.
  ctx.fillStyle = 'rgba(16, 18, 24, 0.3)';
  ctx.beginPath();
  ctx.ellipse(4, 6, 12 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  const swing = Math.sin(person.walkPhase) * 3.5 * s;
  const aim = person.aimAngle ?? person.angle;
  ctx.rotate(aim);

  // Legs, stepping with the walk cycle.
  if (person.onFoot !== false) {
    ctx.fillStyle = person.pants;
    roundRect(ctx, -3 * s, -8 * s + swing, 11 * s, 5 * s, 2);
    ctx.fill();
    roundRect(ctx, -3 * s, 3 * s - swing, 11 * s, 5 * s, 2);
    ctx.fill();
  }

  // Torso: an oval with a lighter sunlit edge.
  ctx.fillStyle = person.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 240, 210, 0.18)';
  ctx.beginPath();
  ctx.ellipse(-1 * s, -2 * s, 8 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(12, 14, 20, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Arms toward the aim direction; the gun sits at the hands.
  const arm = person.armed ? 15 : 10;
  ctx.strokeStyle = person.skin;
  ctx.lineWidth = 4 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1, -6 * s);
  ctx.lineTo(arm * s, -5 * s);
  ctx.moveTo(1, 6 * s);
  ctx.lineTo(arm * s, 5 * s);
  ctx.stroke();
  ctx.lineCap = 'butt';

  if (person.armed) {
    ctx.fillStyle = '#22262d';
    roundRect(ctx, arm * s - 2, -2.4 * s, 11 * s, 4.4 * s, 1);
    ctx.fill();
    ctx.fillStyle = '#4a505a';
    ctx.fillRect(arm * s + 6, -1.5 * s, 5 * s, 3 * s);
  }

  // Head, hair or a cap, and a little face shade.
  ctx.fillStyle = person.skin;
  ctx.beginPath();
  ctx.arc(2 * s, 0, 6.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = person.hair ?? '#2a2020';
  ctx.beginPath();
  ctx.arc(0.6 * s, 0, 5.6 * s, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  if (person.cap) {
    ctx.fillStyle = person.cap;
    ctx.beginPath();
    ctx.arc(1.4 * s, 0, 5.4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10, 12, 18, 0.5)';
    ctx.fillRect(4 * s, -4.4 * s, 3.4 * s, 8.8 * s);
  }
  ctx.restore();

  // A star over the player's head while a pickup hint is active.
  if (person.marker && time % 1 < 0.6) {
    ctx.fillStyle = rgba(PALETTE.gold, 0.85);
    starPath(ctx, person.x, person.y - 26, 4.2, 1.9);
    ctx.fill();
  }
}

/** A floating pickup: a glowing disc with a simple icon. */
export function drawPickup(ctx, item, time) {
  const bob = Math.sin(time * 2.4 + item.x * 0.05) * 2.5;
  const colors = {
    health: { glow: '#74d68b', face: '#f3f7ee', ink: '#2f7a49' },
    armor: { glow: '#69b7e8', face: '#eef5fb', ink: '#2f6288' },
    cash: { glow: '#ffcf6b', face: '#f6e6b8', ink: '#7a5a17' },
    ammo: { glow: '#ff9d6b', face: '#f2e3d2', ink: '#7a3f1d' },
  };
  const c = colors[item.type] ?? colors.health;
  ctx.save();
  ctx.translate(item.x, item.y + bob);
  ctx.shadowColor = c.glow;
  ctx.shadowBlur = 16;
  ctx.fillStyle = rgba(c.glow, 0.26 + Math.sin(time * 3 + item.x) * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = c.face;
  roundRect(ctx, -8, -8, 16, 16, 4);
  ctx.fill();
  ctx.strokeStyle = rgba(c.ink, 0.5);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = c.ink;
  if (item.type === 'health') {
    ctx.fillRect(-1.8, -5, 3.6, 10);
    ctx.fillRect(-5, -1.8, 10, 3.6);
  } else if (item.type === 'armor') {
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4.5, -2.5);
    ctx.lineTo(4, 3);
    ctx.lineTo(0, 5.5);
    ctx.lineTo(-4, 3);
    ctx.lineTo(-4.5, -2.5);
    ctx.closePath();
    ctx.fill();
  } else if (item.type === 'cash') {
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('$', 0, 4);
    ctx.textAlign = 'left';
  } else {
    ctx.fillRect(-5, -3.5, 10, 3);
    ctx.fillRect(-5, 0.5, 10, 3);
    ctx.fillStyle = '#d9b45a';
    ctx.fillRect(-5, -3.5, 3, 7);
  }
  ctx.restore();
}

/** The mission marker: a pool of gold light, a beam and a bobbing diamond. */
export function drawMarker(ctx, marker, time) {
  const pulse = 0.6 + Math.sin(time * 3) * 0.2;
  ctx.save();
  ctx.translate(marker.x, marker.y);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, marker.radius ?? 46);
  glow.addColorStop(0, rgba(PALETTE.marker, 0.42));
  glow.addColorStop(0.7, rgba(PALETTE.marker, 0.14));
  glow.addColorStop(1, rgba(PALETTE.marker, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, marker.radius ?? 46, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rgba(PALETTE.marker, pulse);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 30 + Math.sin(time * 3) * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rgba(PALETTE.marker, 0.3);
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.stroke();

  const lift = 46 + Math.sin(time * 2.4) * 5;
  const beam = ctx.createLinearGradient(0, -lift, 0, 0);
  beam.addColorStop(0, rgba(PALETTE.marker, 0));
  beam.addColorStop(0.6, rgba(PALETTE.marker, 0.12));
  beam.addColorStop(1, rgba(PALETTE.marker, 0.3));
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(-16, 0);
  ctx.lineTo(-5, -lift);
  ctx.lineTo(5, -lift);
  ctx.lineTo(16, 0);
  ctx.closePath();
  ctx.fill();

  ctx.translate(0, -lift);
  ctx.rotate(Math.PI / 4 + Math.sin(time) * 0.08);
  ctx.fillStyle = PALETTE.marker;
  ctx.shadowColor = PALETTE.marker;
  ctx.shadowBlur = 18;
  ctx.fillRect(-7, -7, 14, 14);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff3cf';
  ctx.fillRect(-3.5, -3.5, 7, 7);
  ctx.restore();
}

/** A bullet in flight: a hot core with a short tail. */
export function drawBullet(ctx, b) {
  const speed = Math.hypot(b.vx, b.vy) || 1;
  const nx = -b.vx / speed;
  const ny = -b.vy / speed;
  ctx.strokeStyle = b.enemy ? 'rgba(255, 170, 140, 0.55)' : 'rgba(255, 236, 180, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x + nx * 14, b.y + ny * 14);
  ctx.stroke();
  ctx.fillStyle = b.enemy ? '#ffb18f' : '#fff3c4';
  ctx.beginPath();
  ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

/** The mouse reticle, drawn in screen space by the HUD. */
export function drawReticle(ctx, x, y, spread = 0) {
  ctx.strokeStyle = 'rgba(255, 240, 208, 0.9)';
  ctx.lineWidth = 1.4;
  const gap = 4 + spread;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * gap, y + dy * gap);
    ctx.lineTo(x + dx * (gap + 6), y + dy * (gap + 6));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 240, 208, 0.7)';
  ctx.beginPath();
  ctx.arc(x, y, 1.3, 0, Math.PI * 2);
  ctx.fill();
}
