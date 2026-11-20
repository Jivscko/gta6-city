// The story: three jobs that hand the player markers, objectives, dialogue and money, keep a mission
// log, spawn a crew of thugs for the last one, and fit into the save file through completed/active/step.

import { PALETTE, PLACES } from './config.js';
import { Random, clamp, dist, turnToward } from './utils.js';
import { drawPerson } from './sprites.js';
import { makeMissionCar } from './vehicles.js';

export const MISSIONS = [
  {
    id: 'handoff',
    title: 'Sunset Handoff',
    contact: 'marisol',
    place: PLACES.marisol,
    brief: 'Marisol has a package that needs to leave the marina without a receipt.',
    reward: 600,
    steps: [
      {
        text: 'Meet Marisol in Marina Flats',
        hint: 'Follow the gold marker',
        x: PLACES.marisol.x,
        y: PLACES.marisol.y,
        radius: 82,
        lines: [
          { speaker: 'MARISOL', text: 'You made it. I was starting to think you had a conscience.' },
          { speaker: 'YOU', text: 'I was starting to think you had a job.' },
          { speaker: 'MARISOL', text: 'A package. Old pier, south end. Hand it to the man in the blue shirt and do not open it.' },
          { speaker: 'MARISOL', text: 'And if the police ask, you were nowhere near the marina tonight.' },
        ],
      },
      {
        text: 'Deliver the package to the old pier',
        hint: 'South along the beach, under the pier lights',
        x: PLACES.pierDrop.x,
        y: PLACES.pierDrop.y,
        radius: 74,
        lines: [
          { speaker: 'MARISOL', text: 'Clean drop. Payment is moving. Do not spend it all on the same car.' },
        ],
      },
    ],
  },
  {
    id: 'vanto',
    title: 'The Orange Vanto',
    contact: 'vanto',
    place: PLACES.vanto,
    brief: 'A collector in Neon Row keeps a Vanto GT he should not have. Bring it to the Dockworks lock-up.',
    reward: 1400,
    steps: [
      {
        mode: 'take-car',
        car: 'vanto',
        text: 'Steal the orange Vanto GT from the Neon Row lot',
        hint: 'The Vanto is parked in the lot',
        x: PLACES.vanto.x,
        y: PLACES.vanto.y,
        radius: 120,
      },
      {
        mode: 'reach-vehicle',
        car: 'vanto',
        text: 'Drive the Vanto to the Dockworks lock-up',
        hint: 'Keep the paint clean',
        x: PLACES.garage.x,
        y: PLACES.garage.y,
        radius: 100,
        lines: [
          { speaker: 'VANTO', text: 'Twelve cylinders and not one scratch. You are better than the last one.' },
          { speaker: 'VANTO', text: 'Money is on the hood. Take the SMG too. You are going to need it.' },
        ],
      },
    ],
  },
  {
    id: 'boardwalk',
    title: 'Boardwalk Shakedown',
    contact: 'boardwalk',
    place: PLACES.boardwalk,
    brief: 'Diaz’s crew is leaning on the arcade. Marisol wants the boardwalk quiet again.',
    reward: 2400,
    steps: [
      {
        text: 'Meet Marisol at the Boardwalk arcade',
        hint: 'Diaz’s crew is already there',
        x: PLACES.boardwalk.x,
        y: PLACES.boardwalk.y,
        radius: 88,
        lines: [
          { speaker: 'MARISOL', text: 'Diaz has three boys on the arcade. They break a machine every hour until I pay.' },
          { speaker: 'MARISOL', text: 'I am done paying. Make them leave. Make sure they do not come back.' },
        ],
      },
      {
        mode: 'kills',
        text: 'Take out Diaz’s crew',
        hint: 'Three hostiles on the boardwalk',
        x: PLACES.boardwalk.x,
        y: PLACES.boardwalk.y,
        radius: 90,
        enemies: 3,
        lines: [
          { speaker: 'MARISOL', text: 'That is the last of them. The arcade is mine again.' },
          { speaker: 'MARISOL', text: 'Come back to the marina. We should talk about your future in this city.' },
        ],
      },
      {
        text: 'Return to Marisol in Marina Flats',
        hint: 'The story closes where it started',
        x: PLACES.marisol.x,
        y: PLACES.marisol.y,
        radius: 82,
        lines: [
          { speaker: 'MARISOL', text: 'You did good. Solara is going to know your name now — for better and worse.' },
          { speaker: 'MARISOL', text: 'Keep the engine running. There is always another job.' },
        ],
      },
    ],
  },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.defs = MISSIONS;
    this.rng = new Random((game.world.seed ?? 7) * 97 + 13);
    this.completed = [];
    this.activeIndex = -1;
    this.stepIndex = 0;
    this.marker = null;
    this.objective = '';
    this.hint = '';
    this.dialogue = { active: false, speaker: '', text: '', queue: [] };
    this.pendingAdvance = false;
    this.enemies = [];
    this.missionCars = [];
    this.stepFlags = {};
    this.gangApi = { damage: (ref, amount, g, angle) => this.damageEnemy(ref, amount, g, angle) };
  }

  get active() {
    return this.activeIndex >= 0 ? this.defs[this.activeIndex] : null;
  }

  get availableIndex() {
    return this.defs.findIndex((d) => !this.completed.includes(d.id));
  }

  reset(game) {
    this.completed = [];
    this.activeIndex = -1;
    this.stepIndex = 0;
    this.marker = null;
    this.objective = '';
    this.hint = '';
    this.pendingAdvance = false;
    this.enemies = [];
    this.stepFlags = {};
    this.clearDialogue(game);
  }
  startDialogue(lines, game) {
    if (!lines || lines.length === 0) return;
    this.dialogue.queue = lines.slice(1);
    this.dialogue.active = true;
    const first = lines[0];
    this.dialogue.speaker = first.speaker;
    this.dialogue.text = first.text;
    game.showDialogue?.(first.speaker, first.text);
  }

  advanceDialogue(game) {
    if (!this.dialogue.active) return false;
    if (this.dialogue.queue.length > 0) {
      const next = this.dialogue.queue.shift();
      this.dialogue.speaker = next.speaker;
      this.dialogue.text = next.text;
      game.showDialogue?.(next.speaker, next.text);
      game.audio.tick();
      return true;
    }
    this.dialogue.active = false;
    this.dialogue.text = '';
    game.hideDialogue?.();
    return true;
  }

  clearDialogue(game) {
    this.dialogue.active = false;
    this.dialogue.queue = [];
    this.dialogue.text = '';
    game?.hideDialogue?.();
  }

  /** Per-frame story logic: contact hand-off, marker reach, dialogue pacing, thug fights. */
  update(dt, game) {
    this.updateEnemies(dt, game);

    if (this.dialogue.active) return;

    if (this.pendingAdvance) {
      this.pendingAdvance = false;
      this.advanceStep(game);
      return;
    }

    if (this.activeIndex < 0) {
      const index = this.availableIndex;
      if (index < 0) {
        this.marker = null;
        this.objective = 'All jobs done — Solara is yours';
        this.hint = '';
        return;
      }
      const def = this.defs[index];
      this.marker = { x: def.place.x, y: def.place.y, radius: 64 };
      this.objective = `New job: meet your contact at ${def.place.name}`;
      this.hint = 'Walk into the gold marker';
      if (dist(game.player.x, game.player.y, def.place.x, def.place.y) < 90) this.start(index, game);
      return;
    }

    const def = this.active;
    const step = def.steps[this.stepIndex];
    if (!step) {
      this.complete(game);
      return;
    }

    if (step.mode === 'kills') {
      if (this.enemies.every((e) => e.dead) && this.enemies.length > 0) this.reach(step, game);
      return;
    }

    if (step.mode === 'take-car') {
      const car = game.player.vehicle;
      if (game.player.inVehicle && car && car.missionCar === step.car) this.reach(step, game);
      return;
    }

    const d = dist(game.player.x, game.player.y, step.x, step.y);
    if (d > step.radius) return;
    if (step.mode === 'reach-vehicle') {
      const car = game.player.vehicle;
      if (!game.player.inVehicle || !car || car.missionCar !== step.car) {
        if (!this.stepFlags.warned) {
          this.stepFlags.warned = true;
          game.toast('You need the Vanto for this');
        }
        return;
      }
    }
    this.reach(step, game);
  }

  reach(step, game) {
    if (step.lines && !this.stepFlags.linesShown) {
      this.stepFlags.linesShown = true;
      this.startDialogue(step.lines, game);
      this.pendingAdvance = true;
      return;
    }
    this.advanceStep(game);
  }

  start(index, game) {
    const def = this.defs[index];
    if (!def) return;
    this.activeIndex = index;
    this.stepIndex = 0;
    this.completed = this.completed.filter((id) => id !== def.id);
    this.clearDialogue(game);
    this.beginStep(game);
    game.toast(`JOB: ${def.title}`);
    game.audio.ui();
  }

  beginStep(game) {
    const def = this.active;
    if (!def) return;
    const step = def.steps[this.stepIndex];
    if (!step) {
      this.complete(game);
      return;
    }
    this.objective = step.text;
    this.hint = step.hint ?? '';
    this.marker = { x: step.x, y: step.y, radius: step.radius ?? 70 };
    this.stepFlags = {};
    this.pendingAdvance = false;

    if (step.mode === 'take-car') this.ensureMissionCar(step.car, game);
    if (step.mode === 'kills') this.spawnEnemies(step.enemies ?? 3, step.x, step.y, game);
  }

  ensureMissionCar(kind, game) {
    const existing = game.vehicles.find((car) => car.missionCar === kind && !car.dead);
    if (existing) {
      this.missionCars.push(existing);
      return existing;
    }
    const spawn = PLACES.vanto;
    const car = makeMissionCar(spawn.x, spawn.y, Math.PI / 2);
    const land = game.world.clampToLand(spawn.x, spawn.y, 20);
    car.x = land.x;
    car.y = land.y;
    car.locked = false;
    game.vehicles.push(car);
    this.missionCars.push(car);
    return car;
  }

  onMissionCarTaken(car, game) {
    const step = this.active?.steps[this.stepIndex];
    if (step && step.mode === 'take-car' && car.missionCar === step.car) {
      game.toast('That is the car. Move it to the lock-up');
    }
  }

  advanceStep(game) {
    if (!this.active) return;
    this.stepIndex += 1;
    const def = this.active;
    if (this.stepIndex >= def.steps.length) {
      this.complete(game);
      return;
    }
    this.beginStep(game);
    game.audio.tick();
  }

  complete(game) {
    const def = this.active;
    if (!def) return;
    const reward = def.reward ?? 500;
    game.player.addCash(reward, game);
    if (!this.completed.includes(def.id)) this.completed.push(def.id);
    game.stats.missionsDone = this.completed.length;
    if (def.id === 'vanto') {
      game.player.giveAmmo('smg', 90);
      game.player.unlocked.smg = true;
    }
    this.activeIndex = -1;
    this.stepIndex = 0;
    this.marker = null;
    this.enemies = [];
    this.objective = `Job complete: ${def.title}`;
    this.hint = '';
    game.audio.missionComplete();
    game.toast(`${def.title} complete — $${reward}`);
    game.camera.addShake(2);
    if (this.completed.length >= this.defs.length) {
      game.toast('Story complete. Solara is yours — keep the engine running');
    }
  }

  failCurrent(game) {
    if (!this.active) return;
    this.clearDialogue(game);
    this.enemies = [];
    this.stepIndex = 0;
    this.activeIndex = this.activeIndex;
    this.beginStep(game);
    game.toast('Job failed — the marker is waiting when you are');
  }

  /** Restore the HUD state after a save is loaded, without replaying dialogue or spawns. */
  refreshObjective(game) {
    this.clearDialogue(game);
    this.enemies = [];
    if (this.activeIndex >= 0 && this.defs[this.activeIndex]) {
      const def = this.defs[this.activeIndex];
      this.stepIndex = clamp(this.stepIndex, 0, def.steps.length - 1);
      const step = def.steps[this.stepIndex];
      this.objective = step.text;
      this.hint = step.hint ?? '';
      this.marker = { x: step.x, y: step.y, radius: step.radius ?? 70 };
      if (step.mode === 'take-car') this.ensureMissionCar(step.car, game);
    } else {
      const index = this.availableIndex;
      if (index >= 0) {
        const def = this.defs[index];
        this.marker = { x: def.place.x, y: def.place.y, radius: 64 };
        this.objective = `New job: meet your contact at ${def.place.name}`;
        this.hint = 'Walk into the gold marker';
      }
    }
  }

  logEntries() {
    return this.defs.map((def, index) => ({
      id: def.id,
      title: def.title,
      brief: def.brief,
      reward: def.reward,
      done: this.completed.includes(def.id),
      active: this.activeIndex === index,
      locked: index > (this.availableIndex < 0 ? this.defs.length : this.availableIndex) && !this.completed.includes(def.id),
    }));
  }
  /** Diaz’s crew: armed men on foot with a short leash, placed around the mission marker. */
  spawnEnemies(count, x, y, game) {
    this.enemies = [];
    const shirts = ['#8a3b34', '#3f3a54', '#6b4a2e', '#4c5a44', '#7a3350'];
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + this.rng.range(-0.4, 0.4);
      let ex = x + Math.cos(a) * this.rng.range(70, 128);
      let ey = y + Math.sin(a) * this.rng.range(70, 128);
      const land = game.world.clampToLand(ex, ey, 12);
      ex = land.x;
      ey = land.y;
      const hit = game.world.collideCircle(ex, ey, 11);
      if (hit) {
        ex = hit.x;
        ey = hit.y;
      }
      this.enemies.push({
        x: ex,
        y: ey,
        angle: Math.atan2(game.player.y - ey, game.player.x - ex),
        aimAngle: 0,
        health: 72,
        maxHealth: 72,
        speed: 96,
        walkPhase: this.rng.range(0, 6),
        shootTimer: this.rng.range(0.8, 2),
        state: 'walk',
        dead: false,
        downTimer: 0,
        color: this.rng.pick(shirts),
        pants: '#2b3038',
        skin: this.rng.pick(['#e3b48c', '#c98d63', '#9a6642', '#70452c']),
        hair: '#1d1714',
        cap: i === 0 ? '#5a2626' : null,
        scale: this.rng.range(0.98, 1.1),
        armed: true,
        onFoot: true,
        kind: 'thug',
        r: 11,
      });
    }
  }

  updateEnemies(dt, game) {
    const player = game.player;
    for (const enemy of this.enemies) {
      if (enemy.dead) {
        enemy.downTimer += dt;
        continue;
      }
      if (this.dialogue.active) continue;
      const d = dist(enemy.x, enemy.y, player.x, player.y);
      if (d > 720) continue;
      const targetAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      enemy.aimAngle = targetAngle;
      enemy.angle = turnToward(enemy.angle, targetAngle, 7 * dt);
      enemy.shootTimer -= dt;

      if (d > 150) {
        let nx = enemy.x + Math.cos(enemy.angle) * enemy.speed * dt;
        let ny = enemy.y + Math.sin(enemy.angle) * enemy.speed * dt;
        const hit = game.world.collideCircle(nx, ny, 9);
        if (hit) {
          nx = hit.x;
          ny = hit.y;
        }
        const land = game.world.clampToLand(nx, ny, 10);
        enemy.x = land.x;
        enemy.y = land.y;
        enemy.walkPhase += dt * 8;
      } else if (d < 42 && enemy.shootTimer <= 0) {
        enemy.shootTimer = 1.4;
        player.takeDamage(7, game, targetAngle);
        game.audio.punch();
      }

      if (enemy.shootTimer <= 0 && d < 360 && d > 34 && game.combat.lineOfSight(enemy.x, enemy.y, player.x, player.y)) {
        enemy.shootTimer = 1.35 + this.rng.next() * 0.8;
        game.combat.enemyShoot(enemy.x, enemy.y, targetAngle, 9, 0.15);
      }
    }
  }

  damageEnemy(enemy, amount, game, angle = 0) {
    if (!enemy || enemy.dead) return;
    enemy.health -= amount;
    game.effects.blood(enemy.x, enemy.y, angle, 5);
    if (enemy.health <= 0) {
      enemy.dead = true;
      enemy.state = 'down';
      enemy.downTimer = 0;
      game.stats.kills += 1;
      game.effects.text(enemy.x, enemy.y - 20, '+CREW DOWN', '#ff9d6b');
      if (this.rng.chance(0.7)) game.pickups.drop('cash', enemy.x, enemy.y);
      game.audio.impact(0.3);
      const left = this.enemies.filter((e) => !e.dead).length;
      if (left > 0 && !game.sceneShot) game.toast(`${left} of Diaz’s crew left`);
    }
  }

  combatTargets() {
    const targets = [];
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      targets.push({ x: enemy.x, y: enemy.y, r: 11, type: 'gang', ref: enemy });
    }
    return targets;
  }

  draw(ctx, view, time) {
    for (const enemy of this.enemies) {
      if (enemy.x < view.x - 60 || enemy.x > view.x + view.w + 60 || enemy.y < view.y - 60 || enemy.y > view.y + view.h + 60) continue;
      drawPerson(ctx, enemy, time);
    }
  }
  // __MISSIONS_END__
}
