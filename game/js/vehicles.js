// Cars: the arcade driving model the player feels, the stats for each body style, the damage and
// explosions, and a small pursuit driver the police share. Traffic cars reuse the same body and
// paint job but move along the road graph instead of this physics.

import { CAR, PALETTE } from './config.js';
import { Random, clamp, damp, dist } from './utils.js';

/** How each body style handles: top speed, acceleration, steer rate, lateral grip, hit points. */
export const CAR_STATS = {
  sedan: { maxSpeed: 208, accel: 152, turn: 2.45, grip: 7.2, health: 100, label: 'Corsa LX' },
  sports: { maxSpeed: 306, accel: 272, turn: 2.9, grip: 8.4, health: 92, label: 'Vanto GT' },
  suv: { maxSpeed: 198, accel: 156, turn: 2.1, grip: 6.4, health: 130, label: 'Mesa 4x4' },
  van: { maxSpeed: 174, accel: 138, turn: 2.0, grip: 6.0, health: 150, label: 'Haul-All' },
  taxi: { maxSpeed: 204, accel: 150, turn: 2.4, grip: 7.0, health: 100, label: 'Sun Cab' },
  police: { maxSpeed: 268, accel: 238, turn: 2.7, grip: 7.6, health: 135, label: 'SPD Cruiser' },
  swat: { maxSpeed: 226, accel: 192, turn: 2.2, grip: 7.0, health: 190, label: 'SPD Riot' },
};

const PAINTS = {
  sedan: ['#b8b2a4', '#8d99a6', '#a34f45', '#3f5a6b', '#6b6f5a', '#c5a26a', '#7d5c78', '#d5d0c4'],
  sports: ['#ff6b45', '#f0b429', '#2f9e9e', '#d94f70', '#e8e2d2', '#cf2f2f', '#4f6ed4'],
  suv: ['#4c5b52', '#6e5b4a', '#3c4654', '#8b8470', '#5a4b46'],
  van: ['#e7e1d2', '#b5b0a4', '#79838c', '#a24f43'],
  taxi: ['#f2c14e'],
  police: ['#e9ecf2'],
  swat: ['#2c3340'],
};

export class Vehicle {
  constructor(kind, x, y, angle, options = {}) {
    const stats = CAR_STATS[kind] ?? CAR_STATS.sedan;
    this.kind = kind;
    this.stats = stats;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.steer = 0;
    this.throttle = 0;
    this.handbrake = false;
    this.maxSpeed = stats.maxSpeed * (options.speedScale ?? 1);
    this.health = stats.health;
    this.maxHealth = stats.health;
    this.color = options.color ?? '#b8b2a4';
    this.name = options.name ?? stats.label;
    this.driver = options.driver ?? 'none';
    this.locked = options.locked ?? false;
    this.heat = 0;
    this.lightsOn = true;
    this.honkTimer = 0;
    this.skidTimer = 0;
    this.smokeTimer = 0;
    this.isTraffic = false;
    this.isPolice = false;
    this.missionCar = options.missionCar ?? null;
    this.parked = options.parked ?? false;
    this.dead = false;
    this.driverSeat = { x: 0, y: 0 };
  }

  get forwardX() {
    return Math.cos(this.angle);
  }

  get forwardY() {
    return Math.sin(this.angle);
  }

  get speedPace() {
    return clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1);
  }

  /** Where the car's body points in world units; used for collisions and exiting. */
  get nose() {
    return { x: this.x + this.forwardX * 18, y: this.y + this.forwardY * 18 };
  }

  /**
   * Player-driven physics: throttle along the nose, steering that scales with speed, lateral grip
   * that can be broken by the handbrake for a slide, and drag that settles the car when coasting.
   */
  updateDriven(game, controls, dt) {
    const throttle = controls.throttle;
    const steer = controls.steer;
    this.handbrake = controls.handbrake;
    this.throttle = throttle;

    const fx = this.forwardX;
    const fy = this.forwardY;
    let forward = this.vx * fx + this.vy * fy;
    let lateral = -this.vx * fy + this.vy * fx;

    if (throttle > 0) {
      forward += this.stats.accel * throttle * dt * (1 - clamp(forward / this.maxSpeed, 0, 0.98));
    } else if (throttle < 0) {
      if (forward > 24) forward -= this.stats.accel * 2.4 * dt;
      else forward = Math.max(-this.maxSpeed * 0.34, forward - this.stats.accel * 0.7 * dt);
    } else {
      forward -= forward * 0.65 * dt;
    }
    if (this.handbrake) forward -= forward * 1.9 * dt;

    // Steering only bites when the car is moving, and reverses when backing up.
    const steerAuthority = clamp(Math.abs(forward) / 150, 0.12, 1) * (1 - 0.28 * this.speedPace);
    this.angle += steer * this.stats.turn * steerAuthority * dt * (forward < -6 ? -1 : 1);
    this.steer = damp(this.steer, steer, 12, dt);

    // Lateral grip: the handbrake cuts it, so the rear steps out.
    const grip = this.handbrake ? this.stats.grip * 0.16 : this.stats.grip;
    lateral *= Math.exp(-grip * dt);
    forward *= Math.exp(-0.45 * dt);
    this.vx = fx * forward - fy * lateral;
    this.vy = fy * forward + fx * lateral;
    this.speed = forward;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.collideWithCity(game, dt);
    this.makeSkidMarks(game, lateral, dt);
  }

  /** Keeps the car out of buildings and off the water, with an impact when it arrives hot. */
  collideWithCity(game, dt) {
    const front = { x: this.x + this.forwardX * 17, y: this.y + this.forwardY * 17 };
    const back = { x: this.x - this.forwardX * 15, y: this.y - this.forwardY * 15 };
    let impact = 0;
    for (const point of [front, back]) {
      const hit = game.world.collideCircle(point.x, point.y, 14);
      if (hit) {
        const pushX = hit.x - point.x;
        const pushY = hit.y - point.y;
        this.x += pushX;
        this.y += pushY;
        impact = Math.max(impact, Math.abs(this.vx * hit.nx + this.vy * hit.ny));
        const normalSpeed = this.vx * hit.nx + this.vy * hit.ny;
        if (normalSpeed < 0) {
          this.vx -= hit.nx * normalSpeed * 1.15;
          this.vy -= hit.ny * normalSpeed * 1.15;
        }
        this.vx *= 0.55;
        this.vy *= 0.55;
        this.speed *= 0.35;
      }
    }
    const ahead = { x: this.x + this.forwardX * 22, y: this.y + this.forwardY * 22 };
    if (!game.world.isLand(ahead.x, ahead.y, 18) || !game.world.isLand(this.x, this.y, 14)) {
      const cx = clamp(this.x, 30, game.world.width ?? 4000);
      this.x = damp(this.x, cx, 8, dt);
      const edge = game.world.isLand(this.x, game.world.waterY - 80) ? game.world.waterY - 80 : game.world.boardwalkY - 30;
      this.y = Math.min(this.y, edge);
      this.vx *= 0.3;
      this.vy *= 0.3;
      this.speed *= 0.3;
      impact = Math.max(impact, 40);
    }
    if (impact > 130) {
      const damage = (impact - 130) * 0.06;
      this.damage(damage, game);
      game.effects.sparks(front.x, front.y, this.angle + Math.PI, 6, 140);
      game.camera.addShake(Math.min(10, impact / 40));
      if (impact > 260) game.audio.impact(0.8);
    }
  }

  makeSkidMarks(game, lateral, dt) {
    if (Math.abs(lateral) > 55 || (this.handbrake && Math.abs(this.speed) > 40)) {
      this.skidTimer -= dt;
      if (this.skidTimer <= 0) {
        this.skidTimer = 0.045;
        game.effects.tyreMark(this.x - this.forwardX * 14, this.y - this.forwardY * 14, this.angle, 0.7);
        if (Math.random() < 0.25) game.audio.skid();
      }
    }
    if (this.health < 40) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.1;
        game.effects.smoke(this.x + this.forwardX * 16, this.y + this.forwardY * 16, 1, 0.7);
      }
    }
  }

  /** Simple steering for police and mission drivers: aim at a point and go. */
  driveToward(targetX, targetY, dt, stopDistance = 0) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const targetAngle = Math.atan2(dy, dx);
    let delta = targetAngle - this.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const steer = clamp(delta * 2.4, -1, 1);
    const d = Math.hypot(dx, dy);
    const throttle = d < stopDistance ? 0 : Math.abs(delta) > 1.5 ? 0.35 : 1;
    this.updateSimple(throttle, steer, dt);
  }

  /** Kinematic steering used by police (and any non-player driver). */
  updateSimple(throttle, steer, dt) {
    const targetSpeed = throttle * this.maxSpeed * (throttle < 0 ? 0.4 : 1);
    this.speed = damp(this.speed, targetSpeed, 2.6, dt);
    const steerAuthority = clamp(Math.abs(this.speed) / 160, 0.15, 1);
    this.angle += steer * this.stats.turn * steerAuthority * dt;
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  damage(amount, game, source = null) {
    if (this.dead) return;
    this.health -= amount;
    if (game) {
      game.effects.sparks(this.x, this.y, this.angle, 4, 90);
      if (source === 'player') game.audio.hitMarker();
    }
    if (this.health <= 0) this.explode(game);
  }

  explode(game) {
    if (this.dead) return;
    this.dead = true;
    if (!game) return;
    game.effects.explosion(this.x, this.y);
    game.audio.explosion();
    game.camera.addShake(16);
    const burn = { x: this.x, y: this.y, life: 14 };
    game.burningWrecks.push(burn);
    game.onVehicleDestroyed(this);
  }

  /** A safe spot beside the driver's door, clear of buildings and water. */
  exitPoint(world) {
    const side = this.x * 0.001 + this.angle;
    for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
      const a = this.angle + offset + (Math.sin(side) > 0 ? 0.05 : 0);
      const x = this.x + Math.cos(a) * 30;
      const y = this.y + Math.sin(a) * 30;
      const hit = world.collideCircle(x, y, 11);
      if (!hit && world.isLand(x, y, 12)) return { x, y };
    }
    return { x: this.x, y: this.y };
  }

  distanceToPlayer(game) {
    return dist(this.x, this.y, game.player.x, game.player.y);
  }
}

/** Builds a parked or mission car with a paint job and stats from its kind. */
export function makeCar(kind, x, y, angle, options = {}) {
  const rng = options.rng ?? new Random(1);
  const color = options.color ?? rng.pick(PAINTS[kind] ?? PAINTS.sedan);
  return new Vehicle(kind, x, y, angle, { ...options, color });
}

/** The car that waits outside the player's first job, so a steal is always one key away. */
export function makeStarterCar(x, y, angle = 0) {
  return makeCar('sedan', x, y, angle, { color: '#a34f45', driver: 'none', name: 'Corsa LX', parked: true });
}

/** The orange sports car mission two asks for. */
export function makeMissionCar(x, y, angle = Math.PI / 2) {
  return makeCar('sports', x, y, angle, { color: '#ff6b45', missionCar: 'vanto', name: 'Vanto GT', driver: 'none', parked: true });
}

/** Police cruisers and riot vans share the pursuit driver. */
export function makePoliceCar(kind, x, y, angle) {
  const car = makeCar(kind, x, y, angle, { color: kind === 'swat' ? '#2c3340' : '#e9ecf2', driver: 'police' });
  car.isPolice = true;
  car.health = car.maxHealth;
  return car;
}

/** Paint for the HUD's speed readout: world units per second to a believable mph. */
export function speedMph(vehicle) {
  return Math.round(Math.abs(vehicle.speed) * 0.32);
}

export { PALETTE, CAR };
