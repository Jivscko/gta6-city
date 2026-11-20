// Pickups: the floating discs of cash, health, armour and ammo dotted around the city, plus the
// small drops left by people who go down. Walking over one collects it; spent ones come back.

import { Random, dist } from './utils.js';
import { drawPickup } from './sprites.js';

const STATIC_SPAWNS = [
  { type: 'health', x: 812, y: 2078, near: 'Marisol' },
  { type: 'cash', x: 2460, y: 1690, near: 'Neon Row' },
  { type: 'ammo', x: 3534, y: 1456, near: 'Dockworks' },
  { type: 'armor', x: 2850, y: 2668, near: 'Boardwalk' },
  { type: 'health', x: 2092, y: 1300, near: 'Hospital' },
  { type: 'cash', x: 780, y: 2760, near: 'Pier' },
  { type: 'ammo', x: 1180, y: 2380, near: 'Marina' },
  { type: 'armor', x: 2760, y: 1760, near: 'Shops' },
];

const RESPAWN_SECONDS = 42;

export class Pickups {
  constructor(game) {
    this.game = game;
    this.rng = new Random((game.world.seed ?? 7) * 53 + 19);
    this.items = [];
    this.effects = [];
    this.static = STATIC_SPAWNS.map((spawn, index) => ({
      id: `static-${index}`,
      type: spawn.type,
      x: spawn.x,
      y: spawn.y,
      life: Infinity,
      cooldown: 0,
      spin: this.rng.range(0, 6),
    }));
    this.items = this.static.map((s) => this.snapshot(s));
  }

  snapshot(source) {
    return { ...source, alive: true, bob: this.rng.range(0, 6), timer: source.life };
  }

  /** Lay down a temporary drop from a pedestrian, car or mission. */
  drop(type, x, y, life = 75) {
    if (this.items.length > 34) this.items.shift();
    this.items.push({
      id: `drop-${this.rng.int(1, 1e9)}`,
      type,
      x,
      y,
      life,
      timer: life,
      alive: true,
      bob: this.rng.range(0, 6),
      drop: true,
    });
  }

  /** Walk-over collection, called every frame by the player. */
  collect(player, game) {
    for (const item of this.items) {
      if (!item.alive) continue;
      if (dist(player.x, player.y, item.x, item.y) > 24) continue;
      this.apply(item, player, game);
      item.alive = false;
      item.timer = RESPAWN_SECONDS;
      const source = this.static.find((s) => s.id === item.id);
      if (source) source.cooldown = RESPAWN_SECONDS;
      game.effects.text(item.x, item.y - 18, this.label(item.type), this.colorOf(item.type));
      game.audio.pickup(item.type);
      if (item.drop) this.items = this.items.filter((i) => i !== item);
    }
  }

  colorOf(type) {
    return type === 'health' ? '#74d68b' : type === 'armor' ? '#69b7e8' : type === 'ammo' ? '#ff9d6b' : '#ffcf6b';
  }

  label(type) {
    return type === 'health' ? '+HEALTH' : type === 'armor' ? '+ARMOUR' : type === 'ammo' ? '+AMMO' : '+CASH';
  }

  apply(item, player, game) {
    if (item.type === 'health') {
      player.heal(28);
      game.toast('Patched up');
    } else if (item.type === 'armor') {
      player.addArmor(35);
      game.toast('Armour on');
    } else if (item.type === 'ammo') {
      const kind = player.unlocked.smg && player.weaponId === 'smg' ? 'smg' : 'pistol';
      player.giveAmmo(kind, kind === 'smg' ? 40 : 24);
      game.toast(kind === 'smg' ? 'SMG rounds' : 'Pistol rounds');
    } else {
      const cash = Math.round(this.rng.range(35, 110));
      player.addCash(cash, game, true);
      game.toast(`$${cash} picked up`);
    }
  }

  update(dt, game) {
    for (const item of this.items) {
      if (!item.alive) {
        if (item.life !== Infinity) {
          item.timer -= dt;
          if (item.timer <= 0) this.revive(item);
        }
        continue;
      }
      if (item.life !== Infinity) {
        item.timer -= dt;
        if (item.timer <= 0) {
          item.alive = false;
          item.timer = RESPAWN_SECONDS;
        }
      }
      item.bob += dt;
    }

    // Put static pickups back where they belong, never inside a wall.
    for (const source of this.static) {
      if (source.cooldown > 0) {
        source.cooldown -= dt;
        if (source.cooldown <= 0) {
          const existing = this.items.find((i) => i.id === source.id);
          if (existing) this.revive(existing);
          else this.items.push(this.snapshot(source));
        }
      }
    }
    this.items = this.items.filter((i) => i.alive || i.timer > 0 || i.life === Infinity);
  }

  revive(item) {
    const land = this.game.world.clampToLand(item.x, item.y, 8);
    item.x = land.x;
    item.y = land.y;
    item.alive = true;
    item.timer = item.life;
    const source = this.static.find((s) => s.id === item.id);
    if (source) source.cooldown = 0;
  }

  draw(ctx, view, time) {
    for (const item of this.items) {
      if (!item.alive) continue;
      if (item.x < view.x - 40 || item.x > view.x + view.w + 40 || item.y < view.y - 40 || item.y > view.y + view.h + 40) continue;
      drawPickup(ctx, item, time + item.bob);
    }
  }
}
