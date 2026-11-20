// Pedestrians: walkers who circle their block on the sidewalk, scatter from gunfire and speeding
// cars, go down when hit, and pick themselves up unless the hit was too much. They are the city's
// background life and its most fragile crime statistic.

import { Random, clamp, dist, pointOnLoop } from './utils.js';
import { drawPerson } from './sprites.js';

const COUNT = 82;

const SHIRTS = ['#d7c8ae', '#b45a4c', '#4f7fa3', '#d8a44c', '#6a8f68', '#c9c1b4', '#8a5a72', '#3f4f63', '#e0d6c2', '#a4573f'];
const PANTS = ['#3b4250', '#5a5044', '#2c3038', '#7a6a54', '#4a5560', '#8c8272'];
const SKIN = ['#e3b48c', '#c98d63', '#9a6642', '#70452c', '#f0c8a4', '#b6794d'];
const HAIR = ['#221a16', '#3a2618', '#52341f', '#151515', '#7a5a38', '#2b211c'];

export class Pedestrians {
  constructor(game) {
    this.game = game;
    this.rng = new Random(game.world.seed * 31 + 11);
    this.peds = [];
    this.populate();
  }

  populate() {
    const world = this.game.world;
    const rng = this.rng;
    for (let i = 0; i < COUNT; i += 1) {
      const point = world.randomPedPoint(rng);
      this.peds.push({
        x: point.x,
        y: point.y,
        loop: point.loop,
        t: rng.next(),
        dir: rng.chance(0.5) ? 1 : -1,
        speed: rng.range(13, 24),
        angle: 0,
        walkPhase: rng.range(0, 6),
        state: 'walk',
        threatX: 0,
        threatY: 0,
        fleeTimer: 0,
        downTimer: 0,
        dead: false,
        health: 28,
        color: rng.pick(SHIRTS),
        pants: rng.pick(PANTS),
        skin: rng.pick(SKIN),
        hair: rng.pick(HAIR),
        scale: rng.range(0.92, 1.06),
        armed: false,
        onFoot: true,
        kind: 'ped',
      });
    }
  }

  /** Panic everyone near a point: gunshots, explosions, a carjacking. */
  scareAt(x, y, strength = 1) {
    for (const ped of this.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if (dist(ped.x, ped.y, x, y) < 170 + strength * 60) {
        ped.state = 'flee';
        ped.threatX = x;
        ped.threatY = y;
        ped.fleeTimer = 2.5 + this.rng.next() * 2.5;
        ped.speed = this.rng.range(58, 92);
      }
    }
  }

  /** The nearest walker within a radius, for bullets and bumpers. */
  nearest(x, y, radius) {
    let best = null;
    for (const ped of this.peds) {
      if (ped.dead || ped.state === 'down') continue;
      const d = dist(ped.x, ped.y, x, y);
      if (d < radius && (!best || d < best.d)) best = { ped, d };
    }
    return best;
  }

  /** A car has hit someone: knock them down, hurt them, sometimes kill them. */
  hitByCar(x, y, angle, force, game) {
    const found = this.nearest(x, y, 34);
    if (!found) return false;
    const ped = found.ped;
    ped.health -= force * 0.55;
    ped.state = 'down';
    ped.downTimer = ped.health <= 0 ? 999 : 3.4;
    ped.dead = ped.health <= 0;
    ped.angle = angle;
    game.effects.blood(ped.x, ped.y, angle, 10);
    game.effects.dust(ped.x, ped.y, 4);
    game.audio.impact(0.5);
    game.camera.addShake(6);
    if (ped.dead) {
      game.police.reportCrime('manslaughter', ped.x, ped.y);
      if (Math.random() < 0.4) game.pickups.drop('cash', ped.x, ped.y);
      game.stats.kills += 1;
    } else {
      game.police.reportCrime('assault', ped.x, ped.y);
    }
    return true;
  }

  /** A bullet or a fist landed on a pedestrian. */
  damage(ped, amount, game, angle = 0) {
    if (ped.dead) return;
    ped.health -= amount;
    game.effects.blood(ped.x, ped.y, angle, 6);
    game.peds === this && this.scareAt(ped.x, ped.y, 1);
    if (ped.health <= 0) {
      ped.dead = true;
      ped.state = 'down';
      ped.downTimer = 999;
      game.stats.kills += 1;
      game.police.reportCrime('homicide', ped.x, ped.y);
      if (Math.random() < 0.5) game.pickups.drop('cash', ped.x, ped.y);
    } else {
      ped.state = 'flee';
      ped.threatX = game.player.x;
      ped.threatY = game.player.y;
      ped.fleeTimer = 3.5;
      ped.speed = 80;
      game.police.reportCrime('assault', ped.x, ped.y);
    }
  }

  /** Walk the beat: advance along the block loop, or run from whatever scared them. */
  update(dt) {
    const game = this.game;
    const player = game.player;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'flee';
          ped.fleeTimer = 1.8;
          ped.threatX = player.x;
          ped.threatY = player.y;
          ped.speed = 72;
          this.reattach(ped);
        }
        continue;
      }
      if (ped.state === 'flee') {
        const dx = ped.x - ped.threatX;
        const dy = ped.y - ped.threatY;
        const len = Math.hypot(dx, dy) || 1;
        const wobble = Math.sin(ped.walkPhase * 0.7) * 0.3;
        const vx = (dx / len) * ped.speed + Math.cos(ped.angle + 1.4 + wobble) * 12;
        const vy = (dy / len) * ped.speed + Math.sin(ped.angle + 1.4 + wobble) * 12;
        let nx = ped.x + vx * dt;
        let ny = ped.y + vy * dt;
        const hit = game.world.collideCircle(nx, ny, 9);
        if (hit) {
          nx = hit.x;
          ny = hit.y;
          ped.threatX = nx + (nx - ped.threatX) * 0.6;
          ped.threatY = ny + (ny - ped.threatY) * 0.6;
        }
        const land = game.world.clampToLand(nx, ny, 10);
        ped.x = land.x;
        ped.y = land.y;
        ped.angle = Math.atan2(vy, vx);
        ped.walkPhase += dt * 16;
        ped.fleeTimer -= dt;
        if (ped.fleeTimer <= 0) {
          ped.state = 'walk';
          ped.speed = this.rng.range(13, 24);
          this.reattach(ped);
        }
        continue;
      }

      // Walking a block's sidewalk loop.
      const perimeter = 2 * (ped.loop.w + ped.loop.h);
      ped.t += (ped.dir * ped.speed * dt) / perimeter;
      if (ped.t > 1) ped.t -= 1;
      if (ped.t < 0) ped.t += 1;
      const here = pointOnLoop(ped.loop, ped.t);
      const ahead = pointOnLoop(ped.loop, ped.t + 0.004 * ped.dir);
      ped.x = here.x;
      ped.y = here.y;
      ped.angle = Math.atan2(ahead.y - here.y, ahead.x - here.x);
      ped.walkPhase += dt * (ped.speed * 0.34);

      // A speeding car nearby scatters them.
      if (player.inVehicle && player.vehicle && Math.abs(player.vehicle.speed) > 95) {
        if (dist(ped.x, ped.y, player.vehicle.x, player.vehicle.y) < 110) {
          this.scareAt(ped.x, ped.y, 0.4);
        }
      }
    }
  }

  /** After a sprint, put a walker back on the nearest sidewalk loop. */
  reattach(ped) {
    let best = null;
    for (const loop of this.game.world.pedLoops) {
      const clampedX = clamp(ped.x, loop.x, loop.x + loop.w);
      const clampedY = clamp(ped.y, loop.y, loop.y + loop.h);
      const d = dist(ped.x, ped.y, clampedX, clampedY);
      if (!best || d < best.d) best = { loop, x: clampedX, y: clampedY, d };
    }
    if (!best) return;
    ped.loop = best.loop;
    // Approximate the loop parameter from distance along the top and left edges.
    const w = best.loop.w;
    const h = best.loop.h;
    const perimeter = 2 * (w + h);
    const rx = best.x - best.loop.x;
    const ry = best.y - best.loop.y;
    let along = 0;
    if (ry < 6) along = rx;
    else if (rx > w - 6) along = w + ry;
    else if (ry > h - 6) along = w + h + (w - rx);
    else along = 2 * w + h + (h - ry);
    ped.t = (along / perimeter) % 1;
    ped.x = best.x;
    ped.y = best.y;
  }

  draw(ctx, view) {
    for (const ped of this.peds) {
      if (ped.x < view.x - 60 || ped.x > view.x + view.w + 60 || ped.y < view.y - 60 || ped.y > view.y + view.h + 60) continue;
      drawPerson(ctx, ped);
    }
  }
}
