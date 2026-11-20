// The player: walking, sprinting, aiming, holding guns, taking damage, stealing and leaving cars,
// dying and coming back at the hospital. State lives here; main.js drives the loop and the HUD reads it.

import { PLAYER, PLACES, WEAPONS } from './config.js';
import { clamp, damp, dist } from './utils.js';

export class Player {
  constructor(game) {
    this.game = game;
    const start = game.world.startPoint;
    this.x = start.x;
    this.y = start.y;
    this.vx = 0;
    this.vy = 0;
    this.radius = PLAYER.radius;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.cash = 250;
    this.weaponId = 'pistol';
    this.unlocked = { smg: false };
    this.clip = { fists: 0, pistol: 12, smg: 30 };
    this.ammo = { pistol: 36, smg: 0 };
    this.inVehicle = false;
    this.vehicle = null;
    this.angle = 0;
    this.aimAngle = 0;
    this.walkPhase = 0;
    this.punchTimer = 0;
    this.invuln = 0;
    this.dead = false;
    this.stepTimer = 0;
    this.ramTimer = 0;
    this.leaving = false;
    // Fields drawPerson reads directly.
    this.color = '#2f6f8f';
    this.pants = '#2e3440';
    this.skin = '#c98d63';
    this.hair = '#2b211c';
    this.cap = null;
    this.scale = 1.03;
    this.onFoot = true;
    this.marker = false;
    this.kind = 'player';
  }

  /** Ammo reserves are the same table save.js writes. */
  get reserve() {
    return this.ammo;
  }

  get weapon() {
    return WEAPONS[this.weaponId] ?? WEAPONS.fists;
  }

  get armed() {
    return this.weaponId !== 'fists';
  }

  get speed() {
    return this.inVehicle && this.vehicle ? Math.abs(this.vehicle.speed) : Math.hypot(this.vx, this.vy);
  }

  get healthPct() {
    return clamp(this.health / PLAYER.maxHealth, 0, 1);
  }

  get armorPct() {
    return clamp(this.armor / PLAYER.maxArmor, 0, 1);
  }

  reset() {
    const start = this.game.world.startPoint;
    this.x = start.x;
    this.y = start.y;
    this.vx = 0;
    this.vy = 0;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.cash = 250;
    this.weaponId = 'pistol';
    this.unlocked.smg = false;
    this.clip.pistol = 12;
    this.clip.smg = 30;
    this.ammo.pistol = 36;
    this.ammo.smg = 0;
    this.inVehicle = false;
    this.vehicle = null;
    this.dead = false;
    this.invuln = 1.5;
    this.punchTimer = 0;
    this.placeOnFoot(this.game.world);
  }

  /** Push the body out of walls and back onto land. */
  placeOnFoot(world) {
    const land = world.clampToLand(this.x, this.y, this.radius);
    this.x = land.x;
    this.y = land.y;
    const hit = world.collideCircle(this.x, this.y, this.radius + 1);
    if (hit) {
      this.x = hit.x;
      this.y = hit.y;
    }
  }

  setWeapon(id, game) {
    if (!WEAPONS[id]) return false;
    if (id === 'smg' && !this.unlocked.smg) {
      if (game) game.toast('The SMG is not yours yet — do a job first');
      return false;
    }
    if (this.weaponId === id) return false;
    this.weaponId = id;
    if (game) {
      game.audio.ui();
      game.toast(`${WEAPONS[id].name} in hand`);
    }
    return true;
  }

  cycleWeapon(game, dir = 1) {
    const owned = ['fists', 'pistol'];
    if (this.unlocked.smg) owned.push('smg');
    const i = owned.indexOf(this.weaponId);
    const next = owned[(i + dir + owned.length) % owned.length];
    this.setWeapon(next, game);
  }

  giveAmmo(kind, amount) {
    if (!this.ammo[kind] && this.ammo[kind] !== 0) return;
    this.ammo[kind] += amount;
    if (kind === 'smg') this.unlocked.smg = true;
  }

  addCash(amount, game, quiet = false) {
    this.cash = Math.max(0, Math.round(this.cash + amount));
    if (game && !quiet) {
      game.effects.text(this.x, this.y - 26, `${amount >= 0 ? '+' : '-'}$${Math.abs(Math.round(amount))}`, amount >= 0 ? '#7fdc8b' : '#e8556b');
    }
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }

  addArmor(amount) {
    this.armor = Math.min(PLAYER.maxArmor, this.armor + amount);
  }

  /** One frame of life. main only calls this while the world is running. */
  update(dt, game) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.ramTimer = Math.max(0, this.ramTimer - dt);
    this.onFoot = !this.inVehicle;
    if (this.dead) return;

    if (this.inVehicle && this.vehicle) {
      this.updateDriving(dt, game);
      return;
    }

    if (this.inVehicle) this.inVehicle = false;
    this.updateOnFoot(dt, game);
  }

  updateOnFoot(dt, game) {
    const input = game.input;
    const axis = input.moveAxis();
    const pace = input.sprinting ? PLAYER.runSpeed : PLAYER.walkSpeed;
    this.vx = damp(this.vx, axis.x * pace, axis.any ? PLAYER.accel : PLAYER.friction, dt);
    this.vy = damp(this.vy, axis.y * pace, axis.any ? PLAYER.accel : PLAYER.friction, dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const hit = game.world.collideCircle(this.x, this.y, this.radius);
    if (hit) {
      this.x = hit.x;
      this.y = hit.y;
      this.vx *= 0.4;
      this.vy *= 0.4;
    }
    const land = game.world.clampToLand(this.x, this.y, this.radius);
    this.x = land.x;
    this.y = land.y;

    // Aim at the mouse, in world space; the body turns with it.
    const mouse = game.camera.screenToWorld(input.mouse.x, input.mouse.y);
    this.aimAngle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    this.angle = this.aimAngle;
    const moving = Math.hypot(this.vx, this.vy);
    this.walkPhase += dt * (moving * 0.34 + 1.4);

    this.stepTimer -= dt;
    if (moving > 40 && this.stepTimer <= 0) {
      this.stepTimer = 0.32;
      game.audio.footstep();
    }

    // Weapons: 1/2/3, wheel, R to reload, click to hit or fire.
    if (input.pressed('Digit1')) this.setWeapon('fists', game);
    if (input.pressed('Digit2')) this.setWeapon('pistol', game);
    if (input.pressed('Digit3')) this.setWeapon('smg', game);
    if (input.mouse.wheel) this.cycleWeapon(game, input.mouse.wheel > 0 ? 1 : -1);
    if (input.pressed('KeyR')) game.combat.reload(this);

    if (!game.missions.dialogue.active) {
      const def = this.weapon;
      const wants = def.auto ? input.mouse.down : input.mouse.pressed;
      if (wants) game.combat.attack(this, this.aimAngle, dt);
    }

    if (input.pressed('KeyE')) {
      if (!this.tryEnterVehicle(game)) game.toast('Nothing to get into — find a car');
    }

    // Pick up cash/health/ammo lying around.
    game.pickups.collect(this, game);
  }

  updateDriving(dt, game) {
    const car = this.vehicle;
    const input = game.input;
    const controls = {
      throttle: (input.held('KeyW') || input.held('ArrowUp') ? 1 : 0) - (input.held('KeyS') || input.held('ArrowDown') ? 1 : 0),
      steer: (input.held('KeyD') || input.held('ArrowRight') ? 1 : 0) - (input.held('KeyA') || input.held('ArrowLeft') ? 1 : 0),
      handbrake: input.held('Space'),
    };
    car.updateDriven(game, controls, dt);
    this.x = car.x;
    this.y = car.y;
    this.angle = car.angle;
    this.aimAngle = car.angle;

    if (input.pressed('KeyH')) {
      game.audio.horn();
      game.peds.scareAt(car.x, car.y, 0.4);
    }

    // Bumpers: pedestrians go down, other cars get shoved and dented.
    const force = Math.abs(car.speed);
    if (force > 55) {
      game.peds.hitByCar(car.nose.x, car.nose.y, car.angle, force, game);
      if (force > 120 && this.ramTimer <= 0) this.ramCars(game, car);
    }

    if (input.pressed('KeyE')) this.exitVehicle(game);
  }

  /** Shove the nearest car aside when ramming it, hurting both bodies a little. */
  ramCars(game, car) {
    const others = [...game.traffic.allCars(), ...game.vehicles, ...game.police.cars.map((c) => c.car)];
    for (const other of others) {
      if (other === car || other.dead) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d > 46) continue;
      const nx = (other.x - car.x) / (d || 1);
      const ny = (other.y - car.y) / (d || 1);
      other.x += nx * 8;
      other.y += ny * 8;
      if (other.isTraffic && game.traffic) game.traffic.bump(other, nx, ny, Math.abs(car.speed) * 0.4, game);
      const hit = Math.min(24, 8 + Math.abs(car.speed) * 0.05);
      other.damage(hit * 0.5, game);
      car.damage(hit * 0.3, game);
      game.effects.sparks(car.x + nx * 18, car.y + ny * 18, Math.atan2(ny, nx), 6, 150);
      game.audio.impact(0.5);
      game.camera.addShake(4);
      this.ramTimer = 0.4;
      break;
    }
  }

  /** E on foot: climb into the closest car, stolen or not. */
  tryEnterVehicle(game) {
    const candidates = [];
    const near = game.traffic.nearestEnterable(this.x, this.y, 84);
    if (near) candidates.push({ car: near.car, d: near.d });
    for (const car of game.vehicles) {
      if (car.dead) continue;
      const d = dist(this.x, this.y, car.x, car.y);
      if (d < 84) candidates.push({ car, d });
    }
    for (const unit of game.police.cars) {
      const car = unit.car;
      if (car.dead) continue;
      const d = dist(this.x, this.y, car.x, car.y);
      if (d < 84) candidates.push({ car, d });
    }
    if (candidates.length === 0) return false;
    candidates.sort((a, b) => a.d - b.d);
    const car = candidates[0].car;
    if (car.locked) {
      game.toast('Locked. Find another ride');
      return false;
    }

    if (car.isTraffic) game.traffic.steal(car, game);
    if (car.isPolice) game.police.onCarStolen(car, game);
    car.isTraffic = false;
    car.driver = 'player';
    car.parked = false;
    if (!game.vehicles.includes(car)) game.vehicles.push(car);
    car.health = Math.max(45, car.health);
    this.inVehicle = true;
    this.vehicle = car;
    this.x = car.x;
    this.y = car.y;
    this.vx = 0;
    this.vy = 0;
    game.peds.scareAt(car.x, car.y, 0.5);
    game.audio.ui();
    game.toast(`${car.name} — hot-wired`);
    if (car.missionCar) game.missions.onMissionCarTaken?.(car, game);
    return true;
  }

  exitVehicle(game) {
    const car = this.vehicle;
    if (!car) return false;
    if (Math.abs(car.speed) > 160) {
      game.toast('Too fast to bail out — brake first');
      return false;
    }
    const spot = car.exitPoint(game.world);
    this.inVehicle = false;
    this.vehicle = null;
    this.x = spot.x;
    this.y = spot.y;
    this.vx = 0;
    this.vy = 0;
    car.driver = 'none';
    car.speed *= 0.2;
    car.vx *= 0.2;
    car.vy *= 0.2;
    game.effects.dust(this.x, this.y, 3);
    game.audio.ui();
    return true;
  }

  takeDamage(amount, game, angle = 0) {
    if (this.dead || this.invuln > 0 || this.inVehicle) return;
    let left = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, left * 0.62);
      this.armor -= absorbed;
      left -= absorbed;
    }
    this.health -= left;
    this.invuln = 0.18;
    game.effects.blood(this.x, this.y, angle, 4);
    game.camera.addShake(3);
    if (this.health <= 0) {
      this.health = 0;
      this.die(game, 'shot down in Solara');
    }
  }

  die(game, reason) {
    if (this.dead) return;
    this.dead = true;
    this.vx = 0;
    this.vy = 0;
    if (this.vehicle) {
      this.vehicle.driver = 'none';
      this.vehicle = null;
      this.inVehicle = false;
    }
    game.audio.wasted();
    game.onPlayerDeath?.(reason);
  }

  respawn(game) {
    this.dead = false;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.cash = Math.max(0, this.cash - PLAYER.respawnFee);
    this.unlocked.smg = this.unlocked.smg && this.cash > 400;
    this.x = PLACES.hospital.x + (Math.random() * 40 - 20);
    this.y = PLACES.hospital.y + 40;
    this.inVehicle = false;
    this.vehicle = null;
    this.vx = 0;
    this.vy = 0;
    this.invuln = 3;
    this.placeOnFoot(game.world);
    game.camera.snapTo(this.x, this.y);
    game.police.clearHeat();
    game.police.clearUnits();
  }

  /** The HUD's compact condition line. */
  get condition() {
    return `${Math.ceil(this.health)} HP · $${this.cash}`;
  }
  // __PLAYER_END__
}
