// The heat: a 0..100 meter shown as zero to five stars, police cruisers and officers that spawn
// out of sight and chase, guns that hurt, an arrest when they get close enough, and a meter that
// cools only while nobody is looking at you.

import { PALETTE, WANTED } from './config.js';
import { Random, clamp, dist, damp, turnToward } from './utils.js';
import { makePoliceCar } from './vehicles.js';
import { drawPerson } from './sprites.js';

const CRIME_HEAT = {
  gunfire: 12,
  assault: 11,
  carjacking: 15,
  manslaughter: 19,
  homicide: 27,
  copshot: 24,
  copkilled: 38,
  explosion: 21,
  reckless: 6,
  cargrandtheft: 14,
};

const COP = {
  health: 90,
  speed: 108,
  shootRange: 330,
  shootCooldown: 1.15,
  damage: 11,
  arrestRange: 46,
};

export class Police {
  constructor(game) {
    this.game = game;
    this.rng = new Random((game.world.seed ?? 7) * 71 + 5);
    this.heat = 0;
    this.officers = [];
    this.cars = [];
    this.spawnTimer = 0;
    this.unseen = 0;
    this.crimeFlash = 0;
    this.lastCrime = null;
    this.arrestProgress = 0;
    this.siren = false;
    this.starsShown = 0;
    this.wasStars = 0;
    this.copHeatCooldown = 0;
  }

  get stars() {
    let n = 0;
    for (const band of WANTED.bands) if (this.heat >= band) n += 1;
    return n;
  }

  get wanted() {
    return this.stars;
  }

  reset() {
    this.heat = 0;
    this.officers = [];
    this.cars = [];
    this.spawnTimer = 0;
    this.unseen = 0;
    this.lastCrime = null;
    this.arrestProgress = 0;
    this.crimeFlash = 0;
    this.wasStars = 0;
    this.game.audio.setSiren(false);
  }

  clearHeat() {
    this.heat = 0;
    this.unseen = 0;
    this.wasStars = 0;
    this.arrestProgress = 0;
    this.game.audio.setSiren(false);
  }

  clearUnits() {
    this.officers = [];
    this.cars = [];
    this.spawnTimer = 0;
    this.game.audio.setSiren(false);
  }

  /** A crime happened; the city remembers it, seen or not. */
  reportCrime(type, x, y) {
    const amount = CRIME_HEAT[type] ?? 10;
    const before = this.stars;
    this.heat = clamp(this.heat + amount, 0, 100);
    this.lastCrime = { x, y, age: 0 };
    this.unseen = 0;
    this.crimeFlash = 1;
    this.spawnTimer = Math.min(this.spawnTimer, 0.4);
    const after = this.stars;
    if (after > before && this.game.started && !this.game.sceneShot) {
      this.game.toast(`${'★'.repeat(after)}  WANTED LEVEL ${after}`);
      this.game.audio.ui();
    }
    return after;
  }

  /** Is any officer or cruiser close enough with a clear line of sight? */
  seenByPolice(x, y, radius = 440) {
    const game = this.game;
    for (const cop of this.officers) {
      if (cop.dead) continue;
      if (dist(cop.x, cop.y, x, y) > radius) continue;
      if (game.combat.lineOfSight(cop.x, cop.y, x, y)) return true;
    }
    for (const unit of this.cars) {
      if (unit.car.dead) continue;
      if (dist(unit.car.x, unit.car.y, x, y) > radius + 120) continue;
      if (game.combat.lineOfSight(unit.car.x, unit.car.y, x, y)) return true;
    }
    return false;
  }

  /** A road node that is out of the camera but not across the map. */
  spawnPoint(nearX, nearY, minDist = 560, maxDist = 1200) {
    const view = this.game.camera.view;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const range = this.rng.range(minDist, maxDist);
      const x = nearX + Math.cos(angle) * range;
      const y = nearY + Math.sin(angle) * range;
      if (x < view.x - 80 || x > view.x + view.w + 80 || y < view.y - 80 || y > view.y + view.h + 80) {
        const road = this.game.world.nearestRoadPoint(x, y);
        if (road) return road;
      }
    }
    return this.game.world.nearestRoadPoint(nearX + maxDist, nearY);
  }

  spawnCruiser(nearX, nearY, minDist = 560) {
    const point = this.spawnPoint(nearX, nearY, minDist, 1300);
    if (!point) return null;
    const angle = Math.atan2(nearY - point.y, nearX - point.x);
    const car = makePoliceCar(this.stars >= 4 ? 'swat' : 'police', point.x, point.y, angle);
    car.lightsOn = true;
    this.cars.push({
      car,
      deployed: false,
      deployTimer: 0,
      shootTimer: this.rng.range(0.6, 1.6),
      lostTimer: 0,
    });
    return car;
  }

  /** A parked cruiser for screenshots and staged chases. */
  addCruiserAt(x, y, angle, occupied = false) {
    const car = makePoliceCar('police', x, y, angle);
    const unit = { car, deployed: occupied, deployTimer: 0, shootTimer: 0.8, lostTimer: 0 };
    this.cars.push(unit);
    if (occupied) this.deployOfficers(unit, 2);
    return unit;
  }

  deployOfficers(unit, count = 2) {
    if (unit.deployed) return;
    unit.deployed = true;
    const car = unit.car;
    for (let i = 0; i < count; i += 1) {
      const side = i === 0 ? Math.PI / 2 : -Math.PI / 2;
      const a = car.angle + side;
      this.addOfficer(car.x + Math.cos(a) * 26, car.y + Math.sin(a) * 26, car.angle);
    }
  }

  addOfficer(x, y, angle) {
    const cop = {
      x,
      y,
      angle,
      aimAngle: angle,
      health: COP.health,
      speed: COP.speed,
      state: 'walk',
      walkPhase: this.rng.range(0, 6),
      shootTimer: this.rng.range(0.5, 1.5),
      aggro: true,
      dead: false,
      downTimer: 0,
      color: '#2b3a55',
      pants: '#1f2733',
      skin: this.rng.pick(['#e3b48c', '#c98d63', '#9a6642', '#70452c']),
      hair: '#221a16',
      cap: '#22314a',
      scale: 1.02,
      armed: true,
      onFoot: true,
      kind: 'cop',
      r: 11,
    };
    this.officers.push(cop);
    return cop;
  }
  update(dt, game) {
    const player = game.player;
    this.crimeFlash = Math.max(0, this.crimeFlash - dt * 1.6);
    this.copHeatCooldown = Math.max(0, this.copHeatCooldown - dt);
    if (this.lastCrime) this.lastCrime.age += dt;

    if (this.heat > 0) {
      const seen = !player.dead && this.seenByPolice(player.x, player.y, 470);
      if (seen) this.unseen = 0;
      else this.unseen += dt;

      if (this.unseen > WANTED.decayDelay) {
        const before = this.stars;
        this.heat = Math.max(0, this.heat - WANTED.decayPerSecond * dt * (1 + before * 0.12));
        if (this.stars < before && this.stars > 0 && !game.sceneShot) game.toast(`Heat dropping — ${this.stars} star${this.stars === 1 ? '' : 's'} left`);
      }
      if (this.heat <= 0) {
        this.heat = 0;
        this.clearUnits();
        if (this.wasStars > 0 && !game.sceneShot) game.toast('You lost the heat');
      }
      this.wasStars = this.stars;
    }

    // Spawn what the star count asks for, out of sight.
    if (this.heat > 0 && game.started && !player.dead) {
      const desiredCars = clamp(this.stars, 0, 5);
      const desiredCops = this.stars >= 2 ? this.stars * 2 : 0;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.cars.length < desiredCars) {
        this.spawnCruiser(player.x, player.y, 600);
        this.spawnTimer = Math.max(0.9, 2.4 - this.stars * 0.24);
      } else if (this.spawnTimer <= 0 && this.officers.length < desiredCops) {
        const point = this.spawnPoint(player.x, player.y, 520, 900);
        if (point) this.addOfficer(point.x, point.y, Math.atan2(player.y - point.y, player.x - point.x));
        this.spawnTimer = 1.4;
      }
    }

    this.updateCars(dt, game);
    this.updateOfficers(dt, game);

    const near = this.officers.some((c) => !c.dead && dist(c.x, c.y, player.x, player.y) < 1000)
      || this.cars.some((u) => !u.car.dead && dist(u.car.x, u.car.y, player.x, player.y) < 1100);
    const siren = this.heat > 0 && near && game.state === 'playing' && !game.sceneShot;
    if (siren !== this.siren) {
      this.siren = siren;
      game.audio.setSiren(siren);
    }
  }

  updateCars(dt, game) {
    const player = game.player;
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      const unit = this.cars[i];
      const car = unit.car;
      if (car.dead) {
        this.cars.splice(i, 1);
        continue;
      }
      const px = player.inVehicle && player.vehicle ? player.vehicle.x + player.vehicle.vx * 0.35 : player.x;
      const py = player.inVehicle && player.vehicle ? player.vehicle.y + player.vehicle.vy * 0.35 : player.y;
      const d = dist(car.x, car.y, px, py);

      car.driveToward(px, py, dt, 46);
      car.collideWithCity(game, dt);

      if (d < 150 && !player.inVehicle && Math.abs(car.speed) < 110) this.deployOfficers(unit, this.stars >= 4 ? 3 : 2);

      if (unit.deployed) {
        // A deployed cruiser blocks the road and its crew fights on foot.
        car.updateSimple(0, 0, dt);
      }

      if (player.inVehicle && player.vehicle && d < 52) {
        player.vehicle.damage(10 * dt * 6, game);
        const nx = (player.vehicle.x - car.x) / (d || 1);
        const ny = (player.vehicle.y - car.y) / (d || 1);
        player.vehicle.x += nx * 4;
        player.vehicle.y += ny * 4;
        car.x -= nx * 3;
        car.y -= ny * 3;
        if (Math.random() < dt * 2) game.camera.addShake(2);
      } else if (!player.inVehicle && d < 34 && Math.abs(car.speed) > 80 && !player.dead) {
        player.takeDamage(22, game, car.angle);
        game.effects.dust(player.x, player.y, 4);
      }

      unit.shootTimer -= dt;
      if (unit.shootTimer <= 0 && this.stars >= 2 && d < 380 && d > 60 && game.combat.lineOfSight(car.x, car.y, player.x, player.y)) {
        unit.shootTimer = 1.6 + this.rng.next();
        game.combat.enemyShoot(car.x, car.y, Math.atan2(player.y - car.y, player.x - car.x), 8, 0.12);
      }

      if (d > 2800) {
        this.cars.splice(i, 1);
      }
    }
  }

  updateOfficers(dt, game) {
    const player = game.player;
    for (let i = this.officers.length - 1; i >= 0; i -= 1) {
      const cop = this.officers[i];
      if (cop.dead) {
        cop.downTimer -= dt;
        if (cop.downTimer <= -30) this.officers.splice(i, 1);
        continue;
      }
      const d = dist(cop.x, cop.y, player.x, player.y);
      const targetAngle = Math.atan2(player.y - cop.y, player.x - cop.x);
      cop.aimAngle = targetAngle;
      cop.shootTimer -= dt;

      if (!player.dead && d > COP.arrestRange * 0.75) {
        cop.angle = turnToward(cop.angle, targetAngle, 7 * dt);
        const speed = d > 240 ? COP.speed * 1.5 : COP.speed;
        let nx = cop.x + Math.cos(cop.angle) * speed * dt;
        let ny = cop.y + Math.sin(cop.angle) * speed * dt;
        const hit = game.world.collideCircle(nx, ny, 9);
        if (hit) {
          nx = hit.x;
          ny = hit.y;
        }
        const land = game.world.clampToLand(nx, ny, 10);
        cop.x = land.x;
        cop.y = land.y;
        cop.walkPhase += dt * (speed * 0.28);
      }

      if (!player.dead && d < 120 && game.combat.lineOfSight(cop.x, cop.y, player.x, player.y)) {
        cop.x = damp(cop.x, cop.x, 1, dt);
      }

      if (cop.shootTimer <= 0 && !player.dead && d < COP.shootRange && d > 34 && game.combat.lineOfSight(cop.x, cop.y, player.x, player.y)) {
        cop.shootTimer = COP.shootCooldown + this.rng.next() * 0.7;
        if (player.inVehicle && player.vehicle) {
          player.vehicle.damage(8, game, 'enemy');
          game.effects.sparks(player.vehicle.x, player.vehicle.y, cop.aimAngle, 3, 90);
        } else {
          game.combat.enemyShoot(cop.x, cop.y, targetAngle, COP.damage, 0.13);
        }
      }

      if (!player.dead && !player.inVehicle && d < COP.arrestRange) {
        this.arrestProgress += dt * (this.stars >= 3 ? 1.6 : 1);
        if (this.arrestProgress > 1.05) {
          this.arrestProgress = 0;
          game.onPlayerBusted?.();
        }
      }
    }
    if (this.arrestProgress > 0 && player.inVehicle) this.arrestProgress = 0;
    else if (this.arrestProgress > 0) this.arrestProgress = Math.max(0, this.arrestProgress - dt * 0.6);
  }

  /** A bullet or fist hit an officer. */
  damageOfficer(cop, amount, game, angle = 0) {
    if (cop.dead) return;
    cop.health -= amount;
    game.effects.blood(cop.x, cop.y, angle, 6);
    if (cop.health <= 0) {
      cop.dead = true;
      cop.state = 'down';
      cop.downTimer = 0;
      cop.walkPhase = 0;
      game.stats.kills += 1;
      if (this.rng.chance(0.5)) game.pickups.drop('ammo', cop.x, cop.y);
      this.heat = clamp(this.heat + CRIME_HEAT.copkilled, 0, 100);
      if (!game.sceneShot) game.toast('Officer down — the city is going to remember that');
      game.camera.addShake(5);
    } else if (this.copHeatCooldown <= 0) {
      this.copHeatCooldown = 2.5;
      this.reportCrime('copshot', cop.x, cop.y);
    }
  }

  onCarStolen(car, game) {
    car.isPolice = false;
    this.cars = this.cars.filter((unit) => unit.car !== car);
    if (game.police.seenByPolice(car.x, car.y, 500)) this.reportCrime('cargrandtheft', car.x, car.y);
    this.heat = clamp(this.heat + 6, 0, 100);
  }

  /** Line up a staged chase for a screenshot: cruisers behind the player on the road. */
  stageChase(game, stars = 3) {
    this.clearUnits();
    this.heat = WANTED.bands[Math.min(4, stars - 1)] + 6;
    this.unseen = 0;
    const p = game.player;
    const angle = p.inVehicle && p.vehicle ? p.vehicle.angle : p.angle;
    const back = angle + Math.PI;
    for (let i = 0; i < stars; i += 1) {
      const offset = (i - (stars - 1) / 2) * 64;
      const x = p.x + Math.cos(back) * (150 + i * 30) + Math.cos(angle + Math.PI / 2) * offset;
      const y = p.y + Math.sin(back) * (150 + i * 30) + Math.sin(angle + Math.PI / 2) * offset;
      this.addCruiserAt(x, y, angle + Math.PI / 2, i > 0);
    }
    this.spawnTimer = 99;
    game.audio.setSiren(false);
  }

  combatTargets() {
    const targets = [];
    for (const cop of this.officers) {
      if (cop.dead) continue;
      targets.push({ x: cop.x, y: cop.y, r: 11, type: 'cop', ref: cop });
    }
    for (const unit of this.cars) {
      if (unit.car.dead) continue;
      targets.push({ x: unit.car.x, y: unit.car.y, r: 21, type: 'vehicle', ref: unit.car });
    }
    return targets;
  }

  draw(ctx, view, time) {
    for (const unit of this.cars) {
      const car = unit.car;
      if (car.x < view.x - 90 || car.x > view.x + view.w + 90 || car.y < view.y - 90 || car.y > view.y + view.h + 90) continue;
      this.game.sprites.drawCar(ctx, car, time);
    }
    for (const cop of this.officers) {
      if (cop.x < view.x - 60 || cop.x > view.x + view.w + 60 || cop.y < view.y - 60 || cop.y > view.y + view.h + 60) continue;
      drawPerson(ctx, cop, time);
    }
  }
  // __POLICE_END__
}
