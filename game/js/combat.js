// Weapons, bullets and melee. The player's guns fire along the aim line with a little spread;
// bullets are stepped every frame, stop on buildings and water, and hand their damage to whoever
// they reach. Enemies use the same path with an `enemy` flag, so one hit test serves both.

import { WEAPONS } from './config.js';
import { drawBullet } from './sprites.js';
import { clamp } from './utils.js';

export class Combat {
  constructor(game) {
    this.game = game;
    this.bullets = [];
    this.playerCooldown = 0;
    this.reloadTimer = 0;
    this.lastShot = 0;
  }

  reset() {
    this.bullets.length = 0;
    this.playerCooldown = 0;
    this.reloadTimer = 0;
  }

  get weapon() {
    return WEAPONS[this.game.player.weaponId] ?? WEAPONS.fists;
  }

  /** Where the muzzle is, in world space, given the player's aim. */
  muzzlePoint(player, angle) {
    return {
      x: player.x + Math.cos(angle) * 18,
      y: player.y + Math.sin(angle) * 18 - 2,
    };
  }

  /** Left click: swing or shoot, depending on what is in hand. */
  attack(player, angle, dt) {
    const def = this.weapon;
    if (this.reloadTimer > 0) return;
    if (this.playerCooldown > 0) return;
    if (def.melee) {
      this.playerCooldown = def.rate;
      this.melee(player, angle);
      return;
    }
    if (player.clip[def.id] <= 0) {
      this.playerCooldown = 0.35;
      this.game.audio.tick();
      this.reload(player);
      return;
    }
    player.clip[def.id] -= 1;
    this.playerCooldown = def.rate;
    this.lastShot = performance.now();
    const muzzle = this.muzzlePoint(player, angle);
    for (let i = 0; i < (def.pellets ?? 1); i += 1) {
      const spread = (Math.random() - 0.5) * def.spread * 2;
      this.spawnBullet(muzzle.x, muzzle.y, angle + spread, def, false);
    }
    this.game.effects.muzzle(muzzle.x, muzzle.y, angle);
    this.game.effects.spark(muzzle.x, muzzle.y, angle, 3, 130);
    this.game.audio.gunshot(def.id);
    this.game.camera.addShake(def.id === 'smg' ? 2.2 : 3.2);
    this.game.peds.scareAt(player.x, player.y, 1.6);
    this.game.police.reportCrime('gunfire', player.x, player.y);
    if (def.id === 'smg') this.recoil = 1;
  }

  spawnBullet(x, y, angle, def, enemy, speedOverride) {
    const speed = speedOverride ?? def.speed;
    this.bullets.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: (def.range ?? 800) / speed,
      damage: def.damage,
      enemy,
      ownerAngle: angle,
    });
    if (this.bullets.length > 120) this.bullets.shift();
  }

  /** A swing in front of the player: everyone in the arc takes it. */
  melee(player, angle) {
    const def = WEAPONS.fists;
    this.game.audio.punch();
    this.game.camera.addShake(1.4);
    player.punchTimer = 0.24;
    let hitSomeone = false;
    for (const target of this.game.combatTargets()) {
      if (target.type === 'vehicle') continue;
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d > def.range + target.r) continue;
      const a = Math.atan2(dy, dx);
      let delta = Math.abs(a - angle);
      while (delta > Math.PI) delta = Math.abs(delta - Math.PI * 2);
      if (delta > def.arc) continue;
      this.applyHit(target, def.damage, angle, true);
      hitSomeone = true;
    }
    if (hitSomeone) {
      this.game.camera.addShake(4);
      this.game.audio.impact(0.45);
      this.game.effects.spark(player.x + Math.cos(angle) * 26, player.y + Math.sin(angle) * 26, angle, 4, 110);
    }
  }

  /** Start a reload if there is a magazine to swap in. */
  reload(player) {
    const def = this.weapon;
    if (def.melee || this.reloadTimer > 0) return;
    const reserve = player.reserve[def.id] ?? 0;
    const clip = player.clip[def.id] ?? 0;
    if (clip >= def.clip || reserve <= 0) {
      if (reserve <= 0 && clip <= 0) this.game.toast('Out of ammo');
      return;
    }
    this.reloadTimer = 1.15;
    this.reloadWeapon = def.id;
    this.game.audio.tick();
  }

  update(dt) {
    this.playerCooldown = Math.max(0, this.playerCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const player = this.game.player;
        const def = WEAPONS[this.reloadWeapon];
        if (def) {
          const need = def.clip - (player.clip[def.id] ?? 0);
          const give = Math.min(need, player.reserve[def.id] ?? 0);
          player.clip[def.id] = (player.clip[def.id] ?? 0) + give;
          player.reserve[def.id] = (player.reserve[def.id] ?? 0) - give;
          this.game.audio.toneReload?.();
        }
      }
    }

    if (this.bullets.length === 0) return;
    const targets = this.game.combatTargets();
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const b = this.bullets[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.bullets.splice(i, 1);
        continue;
      }
      const steps = 2;
      let dead = false;
      for (let s = 0; s < steps && !dead; s += 1) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;

        if (b.y > this.game.world.waterY - 4) {
          this.game.effects.splash(b.x, b.y);
          dead = true;
          break;
        }
        const solid = this.game.world.collideCircle(b.x, b.y, 2.5);
        if (solid) {
          this.game.effects.sparks(b.x, b.y, Math.atan2(b.vy, b.vx) + Math.PI, 3, 90);
          dead = true;
          break;
        }
        for (const target of targets) {
          if (target.type === 'vehicle' && target.ref === this.game.player.vehicle) continue;
          if (b.enemy && target.type === 'player' === false) continue;
          if (!b.enemy && target.type === 'player') continue;
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const r = target.r + 3;
          if (dx * dx + dy * dy > r * r) continue;
          this.applyHit(target, b.damage, Math.atan2(b.vy, b.vx), false, b.enemy);
          this.game.effects.sparks(b.x, b.y, Math.atan2(b.vy, b.vx) + Math.PI, b.enemy ? 3 : 4, 130);
          if (!b.enemy) this.game.audio.hitMarker();
          dead = true;
          break;
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  /** Route one hit to the right owner of the target. */
  applyHit(target, damage, angle, melee, enemy = false) {
    const game = this.game;
    if (target.type === 'ped') game.peds.damage(target.ref, damage, game, angle);
    else if (target.type === 'cop') game.police.damageOfficer(target.ref, damage, game, angle);
    else if (target.type === 'gang') game.gangs.damage(target.ref, damage, game, angle);
    else if (target.type === 'vehicle') target.ref.damage(damage * 0.9, game, enemy ? 'enemy' : 'player');
    else if (target.type === 'player') game.player.takeDamage(damage, game, angle);
    if (!melee) game.effects.blood(target.x, target.y, angle, 5);
  }

  /** An enemy fires: same bullet path, from their muzzle, aimed at the player. */
  enemyShoot(x, y, angle, damage = 12, spread = 0.09) {
    const fake = { speed: 1150, range: 760, damage };
    this.spawnBullet(
      x + Math.cos(angle) * 16,
      y + Math.sin(angle) * 16,
      angle + (Math.random() - 0.5) * spread * 2,
      fake,
      true,
    );
    this.game.effects.muzzle(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18, angle);
    this.game.audio.gunshot('pistol');
  }

  /** Is there a clear line from a to b, free of buildings? Used by police and gangs to shoot. */
  lineOfSight(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.min(18, Math.ceil(d / 40));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const hit = this.game.world.collideCircle(ax + (bx - ax) * t, ay + (by - ay) * t, 3);
      if (hit) return false;
    }
    return true;
  }

  draw(ctx) {
    for (const b of this.bullets) drawBullet(ctx, b);
  }

  get reloading() {
    return this.reloadTimer > 0;
  }
}
