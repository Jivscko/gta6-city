// Solara Heat boots here: build the city, wire every system, run the loop, own the menus, pause,
// saves, the wasted/busted flow, the title and the four staged screenshot scenes.

import { PALETTE, VIEW, WORLD } from './config.js';
import { clamp, damp, dist } from './utils.js';
import { World } from './world.js';
import { GroundRenderer } from './ground.js';
import * as CityArt from './cityart.js';
import * as Sprites from './sprites.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { Effects } from './effects.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Pickups } from './pickups.js';
import { Hud } from './hud.js';
import { applySave, hasSave, loadSave, snapshotOf, writeSave } from './save.js';
import { makeCar, makeStarterCar } from './vehicles.js';
import { drawMarker } from './sprites.js';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.input = new Input();
    this.input.attach(canvas);

    this.world = new World(7);
    this.camera = new Camera(canvas.width, canvas.height);
    this.camera.snapTo(1180, 2260);
    this.effects = new Effects(this.camera);
    this.audio = new GameAudio();
    this.sprites = Sprites;
    this.ground = new GroundRenderer(this.world);

    this.vehicles = [];
    this.burningWrecks = [];
    this.stats = { playSeconds: 0, kills: 0, missionsDone: 0 };
    this.state = 'title';
    this.started = false;
    this.sceneShot = null;
    this.showFps = false;
    this.fps = 60;
    this.wastedTimer = 0;
    this.busted = false;
    this.toastTimer = 0;
    this.locationTimer = 0;
    this.district = null;
    this.lastFrame = 0;
    this.time = 0;
    this.returnScreen = 'title';
    this.shotFrames = 0;

    this.pickups = new Pickups(this);
    this.player = new Player(this);
    this.traffic = new Traffic(this);
    this.peds = new Pedestrians(this);
    this.police = new Police(this);
    this.missions = new Missions(this);
    this.gangs = this.missions.gangApi;
    this.combat = new Combat(this);
    this.hud = new Hud(this);
    this.prepareStarterCar();

    this.dom = {};
    for (const id of [
      'title-screen', 'controls-screen', 'pause-screen', 'settings-screen', 'log-screen',
      'dialogue', 'dialogue-speaker', 'dialogue-text', 'hint', 'hint-text', 'toast', 'wasted',
      'wasted-line', 'wasted-title', 'location-card', 'loc-name', 'loc-district', 'notice',
      'save-line', 'save-note', 'pause-summary', 'log-list',
    ]) this.dom[id] = document.getElementById(id);
    this.bindUi();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    const shot = new URLSearchParams(window.location.search).get('shot');
    if (shot) this.applyScene(shot);
    else this.refreshSaveLine();
  }

  /**
   * Gameplay hooks other systems call.
   */
  canControl() {
    return this.state === 'playing' && this.wastedTimer <= 0 && !this.player.dead;
  }

  prepareStarterCar() {
    const spot = this.world.startPoint;
    const point = this.world.clampToLand(spot.x + 34, spot.y + 58, 20);
    this.vehicles = [makeStarterCar(point.x, point.y, 0)];
  }

  resize() {
    const w = Math.max(640, window.innerWidth);
    const h = Math.max(480, window.innerHeight);
    this.canvas.width = w;
    this.canvas.height = h;
    this.camera.resize(w, h);
    if (this.hud) this.hud.resize();
  }

  bindUi() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (e) => {
        e.preventDefault();
        this.audio.init();
        fn();
      });
    };
    on('btn-play', () => this.startGame());
    on('btn-continue', () => this.startFromSave());
    on('btn-controls', () => this.openControls('title'));
    on('btn-settings', () => this.openSettings('title'));
    on('btn-resume', () => this.resume());
    on('btn-save', () => this.quickSave());
    on('btn-pause-controls', () => this.openControls('pause'));
    on('btn-pause-settings', () => this.openSettings('pause'));
    on('btn-quit', () => this.toTitle());
    for (const el of document.querySelectorAll('[data-back]')) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.back();
      });
    }
    const sound = document.getElementById('toggle-sound');
    if (sound) sound.addEventListener('click', () => {
      this.audio.init();
      this.audio.toggleMuted();
      sound.setAttribute('aria-checked', String(!this.audio.muted));
    });
    const shake = document.getElementById('toggle-shake');
    if (shake) shake.addEventListener('click', () => {
      this.camera.shakeEnabled = !this.camera.shakeEnabled;
      shake.setAttribute('aria-checked', String(this.camera.shakeEnabled));
    });
    const fps = document.getElementById('toggle-fps');
    if (fps) fps.addEventListener('click', () => {
      this.showFps = !this.showFps;
      fps.setAttribute('aria-checked', String(this.showFps));
    });
  }

  showOnly(id) {
    for (const key of ['title-screen', 'controls-screen', 'pause-screen', 'settings-screen', 'log-screen']) {
      const el = this.dom[key];
      if (el) el.classList.toggle('hidden', key !== id);
    }
  }

  refreshSaveLine() {
    const has = hasSave();
    if (this.dom['save-line']) this.dom['save-line'].textContent = has ? 'Saved run found — Continue' : 'No save yet — New Game';
    const btn = document.getElementById('btn-continue');
    if (btn) btn.style.opacity = has ? '1' : '0.55';
  }

  startGame(opts = {}) {
    this.audio.init();
    this.effects.clear();
    this.burningWrecks = [];
    this.stats = { playSeconds: 0, kills: 0, missionsDone: 0 };
    this.wastedTimer = 0;
    this.busted = false;
    this.district = null;
    this.locationTimer = 0;
    this.toastTimer = 0;
    this.time = 0;

    this.pickups = new Pickups(this);
    this.player = new Player(this);
    this.traffic = new Traffic(this);
    this.peds = new Pedestrians(this);
    this.police = new Police(this);
    this.missions = new Missions(this);
    this.gangs = this.missions.gangApi;
    this.combat = new Combat(this);
    this.hud = new Hud(this);
    this.prepareStarterCar();

    if (opts.save) applySave(this, opts.save);
    this.camera.snapTo(this.player.x, this.player.y);
    this.started = true;
    this.sceneShot = null;
    this.state = 'playing';
    this.showOnly(null);
    this.hideDialogue();
    if (this.dom.wasted) this.dom.wasted.classList.add('hidden');
    this.dom['toast']?.classList.remove('show');
    if (!opts.silent) {
      this.showLocation('Marina Flats');
      this.toast(opts.save ? 'Welcome back to Solara' : 'Welcome to Solara — meet Marisol at the gold marker');
    }
    this.refreshHint();
    this.refreshSaveLine();
    this.lastFrame = 0;
  }

  startFromSave() {
    const data = loadSave();
    if (!data) {
      this.toast('No saved run yet — start a new game');
      return;
    }
    this.startGame({ save: data });
  }

  quickSave() {
    const ok = writeSave(snapshotOf(this));
    const note = this.dom['save-note'];
    if (note) note.textContent = ok ? 'Saved to this browser' : 'This browser refused the save';
    this.toast(ok ? 'Game saved' : 'Could not save in this browser');
    this.refreshSaveLine();
    return ok;
  }

  toTitle() {
    this.started = false;
    this.state = 'title';
    this.showOnly('title-screen');
    this.hideDialogue();
    this.camera.snapTo(1180, 2260);
    this.refreshSaveLine();
  }

  openPause() {
    if (this.state !== 'playing' || this.wastedTimer > 0) return;
    this.state = 'paused';
    const p = this.player;
    if (this.dom['pause-summary']) {
      this.dom['pause-summary'].textContent = `${p.condition} · wanted ${this.police.stars}/5 · ${this.missions.completed.length}/${this.missions.defs.length} jobs done`;
    }
    this.showOnly('pause-screen');
    this.dom['save-note'].textContent = '';
    this.audio.setSiren(false);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.showOnly(null);
    this.lastFrame = 0;
  }

  openControls(from) {
    this.returnScreen = from;
    this.state = 'controls';
    this.showOnly('controls-screen');
  }

  openSettings(from) {
    this.returnScreen = from;
    this.state = 'settings';
    this.showOnly('settings-screen');
  }

  openLog() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.returnScreen = this.state === 'paused' ? 'pause' : 'playing';
    this.state = 'log';
    this.renderLog();
    this.showOnly('log-screen');
  }

  back() {
    this.audio.ui();
    if (this.state === 'log') {
      if (this.returnScreen === 'pause') this.state = 'paused';
      else this.state = 'playing';
      this.showOnly(this.returnScreen === 'pause' ? 'pause-screen' : null);
      return;
    }
    if (this.state === 'controls' || this.state === 'settings') {
      if (this.returnScreen === 'pause') {
        this.state = 'paused';
        this.showOnly('pause-screen');
      } else if (this.returnScreen === 'title') {
        this.toTitle();
      } else {
        this.state = 'playing';
        this.showOnly(null);
      }
    }
  }

  renderLog() {
    const list = this.dom['log-list'];
    if (!list) return;
    list.textContent = '';
    for (const entry of this.missions.logEntries()) {
      const li = document.createElement('li');
      li.className = `log-item${entry.active ? ' active' : ''}${entry.done ? ' done' : ''}`;
      const h = document.createElement('h3');
      h.textContent = entry.title;
      const status = document.createElement('span');
      status.textContent = entry.done ? 'Complete' : entry.active ? 'Active' : entry.locked ? 'Locked' : 'Available';
      h.appendChild(status);
      const p = document.createElement('p');
      p.textContent = `${entry.brief} — $${entry.reward}`;
      li.appendChild(h);
      li.appendChild(p);
      list.appendChild(li);
    }
  }

  showDialogue(speaker, text) {
    if (!this.dom.dialogue) return;
    this.dom.dialogue.classList.remove('hidden');
    if (this.dom['dialogue-speaker']) this.dom['dialogue-speaker'].textContent = speaker;
    if (this.dom['dialogue-text']) this.dom['dialogue-text'].textContent = text;
    const portrait = document.getElementById('dialogue-portrait');
    if (portrait) {
      const tone = speaker === 'MARISOL' ? '#ffd9a0, #d8794f' : speaker === 'VANTO' ? '#ffe0a8, #b06a3c' : '#cfe8ea, #4f8f9e';
      portrait.style.background = `radial-gradient(circle at 35% 30%, ${tone} 48%, #3a2222 100%)`;
    }
  }

  hideDialogue() {
    this.dom.dialogue?.classList.add('hidden');
  }

  toast(message) {
    const el = this.dom.toast;
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    this.toastTimer = 2.8;
  }

  showLocation(name) {
    if (this.sceneShot) return;
    const card = this.dom['location-card'];
    if (!card) return;
    if (this.dom['loc-name']) this.dom['loc-name'].textContent = name;
    if (this.dom['loc-district']) this.dom['loc-district'].textContent = this.world.districtAt(this.player.x, this.player.y).name;
    card.classList.remove('hidden');
    this.locationTimer = 3.4;
  }

  refreshHint() {
    if (!this.dom.hint || !this.dom['hint-text']) return;
    const p = this.player;
    let text = 'E — steal a car · Tab — jobs · Esc — pause';
    if (p.inVehicle) text = 'E — get out · Space — handbrake · H — horn';
    else if (this.traffic.nearestEnterable(p.x, p.y, 84)) text = 'E — get in';
    else if (this.missions.marker && dist(p.x, p.y, this.missions.marker.x, this.missions.marker.y) < 160) text = 'Walk into the gold marker';
    this.dom['hint-text'].textContent = text;
    this.dom.hint.classList.remove('hidden');
    this.hintTimer = 0;
  }

  onPlayerDeath(reason) {
    if (this.wastedTimer > 0) return;
    this.wastedTimer = 3.2;
    this.busted = false;
    this.hideDialogue();
    const title = this.dom.wasted?.querySelector('h2');
    if (title) title.textContent = 'WASTED';
    if (this.dom['wasted-line']) this.dom['wasted-line'].textContent = reason ?? 'Solara wins again';
    this.dom.wasted?.classList.remove('hidden');
    this.audio.setSiren(false);
  }

  onPlayerBusted() {
    if (this.wastedTimer > 0) return;
    this.wastedTimer = 3.2;
    this.busted = true;
    this.player.dead = true;
    this.player.cash = Math.max(0, this.player.cash - 250);
    this.hideDialogue();
    const title = this.dom.wasted?.querySelector('h2');
    if (title) title.textContent = 'BUSTED';
    if (this.dom['wasted-line']) this.dom['wasted-line'].textContent = 'The SPD took $250 and your dignity';
    this.dom.wasted?.classList.remove('hidden');
    this.audio.setSiren(false);
  }

  finishDown() {
    this.dom.wasted?.classList.add('hidden');
    this.player.respawn(this);
    this.missions.failCurrent(this);
    this.showLocation('Solara General');
    this.toast(this.busted ? 'Released with a fine and a headache' : 'Patched up at Solara General');
    this.busted = false;
    this.lastFrame = 0;
  }
  update(dt) {
    if (this.state === 'title') {
      this.updateAmbient(dt);
      return;
    }
    if (this.state !== 'playing') return;

    this.time += dt;

    if (this.wastedTimer > 0) {
      this.wastedTimer -= dt;
      this.effects.update(dt);
      if (this.wastedTimer <= 0) this.finishDown();
      return;
    }

    this.stats.playSeconds += dt;

    if (this.input.pressed('Escape')) {
      this.openPause();
      return;
    }
    if (this.input.pressed('Tab')) {
      this.openLog();
      return;
    }
    if (this.input.pressed('KeyM')) this.toast(this.audio.toggleMuted() ? 'Sound off' : 'Sound on');
    if (this.input.pressed('F5')) this.quickSave();
    if (this.missions.dialogue.active && (this.input.pressed('Space') || this.input.mouse.pressed)) {
      this.missions.advanceDialogue(this);
    }

    this.player.update(dt, this);
    this.traffic.update(dt);
    this.peds.update(dt);
    this.police.update(dt, this);
    this.missions.update(dt, this);
    this.pickups.update(dt, this);
    this.combat.update(dt);
    this.effects.update(dt);
    this.hud.update(dt);
    this.updateWrecks(dt);

    const p = this.player;
    if (p.inVehicle && p.vehicle) {
      this.camera.follow(p.vehicle.x, p.vehicle.y, p.vehicle.vx, p.vehicle.vy, p.vehicle.speedPace, dt, true);
      this.audio.updateEngine(p.vehicle.speed, true);
      this.audio.updateMusic(dt, 1);
    } else {
      this.camera.follow(p.x, p.y, p.vx, p.vy, 0, dt, false);
      this.audio.updateEngine(0, false);
      this.audio.updateMusic(dt, 0.55);
    }

    const district = this.world.districtAt(p.x, p.y);
    if (!this.district || district.id !== this.district.id) {
      this.district = district;
      if (!this.sceneShot) this.showLocation(district.name);
    }

    this.locationTimer -= dt;
    if (this.locationTimer <= 0) this.dom['location-card']?.classList.add('hidden');

    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.dom.toast?.classList.remove('show');

    this.hintTimer = (this.hintTimer ?? 0) + dt;
    if (this.hintTimer > 0.6) {
      this.hintTimer = 0;
      this.refreshHint();
    }
    this.districtTimer = (this.districtTimer ?? 0) + dt;
  }

  updateAmbient(dt) {
    this.time += dt;
    this.peds.update(dt);
    this.traffic.update(dt);
    this.effects.update(dt);
    const driftX = 1240 + Math.sin(this.time * 0.07) * 150;
    const driftY = 2420 + Math.cos(this.time * 0.055) * 70;
    this.camera.x = damp(this.camera.x, driftX, 0.6, dt);
    this.camera.y = damp(this.camera.y, driftY, 0.6, dt);
    this.camera.zoom = damp(this.camera.zoom, 1, 1.2, dt);
    this.camera.shake = 0;
  }

  updateWrecks(dt) {
    for (let i = this.burningWrecks.length - 1; i >= 0; i -= 1) {
      const wreck = this.burningWrecks[i];
      wreck.life -= dt;
      if (Math.random() < dt * 2.4) this.effects.smoke(wreck.x, wreck.y, 1, 1.2);
      if (wreck.life <= 0) this.burningWrecks.splice(i, 1);
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(0, 0, w, h);
    const view = this.camera.view;

    this.camera.apply(ctx);
    this.ground.draw(ctx, view);
    this.effects.drawGround(ctx);
    if (this.missions.marker) drawMarker(ctx, this.missions.marker, this.time);
    CityArt.drawCity(ctx, this.world, view, this.time);
    this.pickups.draw(ctx, view, this.time);
    for (const car of this.vehicles) {
      if (car.dead) continue;
      if (car.x < view.x - 90 || car.x > view.x + view.w + 90 || car.y < view.y - 90 || car.y > view.y + view.h + 90) continue;
      this.sprites.drawCar(ctx, car, this.time);
    }
    this.traffic.draw(ctx, view);
    this.missions.draw(ctx, view, this.time);
    this.peds.draw(ctx, view);
    this.police.draw(ctx, view, this.time);
    if (!this.player.inVehicle && !this.player.dead) this.sprites.drawPerson(ctx, this.player, this.time);
    this.combat.draw(ctx);
    this.effects.draw(ctx);
    CityArt.drawLighting(ctx, view, w, h);
    this.camera.restore(ctx);

    this.effects.drawTexts(ctx, this.camera);
    if (this.started) this.hud.draw(ctx);
  }

  /** Staged scenes for the four screenshots; also handy for a quick look at each system. */
  applyScene(name) {
    this.sceneShot = name;
    if (name === 'cover') {
      this.state = 'title';
      this.started = false;
      this.showOnly('title-screen');
      this.camera.snapTo(1240, 2420);
      return;
    }

    this.startGame({ silent: true });
    this.sceneShot = name;
    const p = this.player;

    if (name === 'city') {
      p.x = 706;
      p.y = 2252;
      p.placeOnFoot(this.world);
      p.aimAngle = -0.35;
      p.angle = p.aimAngle;
      this.missions.activeIndex = -1;
      this.missions.update(0, this);
    } else if (name === 'chase') {
      p.x = 1264;
      p.y = 1530;
      p.placeOnFoot(this.world);
      const car = makeCar('sports', 1264, 1570, -Math.PI / 2, { color: '#ff6b45', name: 'Vanto GT' });
      this.vehicles.push(car);
      p.inVehicle = true;
      p.vehicle = car;
      p.x = car.x;
      p.y = car.y;
      car.speed = 170;
      car.vx = Math.cos(car.angle) * car.speed;
      car.vy = Math.sin(car.angle) * car.speed;
      this.police.stageChase(this, 3);
      this.missions.activeIndex = -1;
      this.missions.update(0, this);
    } else if (name === 'mission') {
      this.missions.start(0, this);
      p.x = 660;
      p.y = 2128;
      p.placeOnFoot(this.world);
      p.aimAngle = 0;
      p.angle = 0;
      const lines = this.missions.defs[0].steps[0].lines;
      this.missions.startDialogue(lines, this);
      this.missions.pendingAdvance = false;
    }

    this.camera.snapTo(p.x + (name === 'mission' ? 70 : 0), p.y);
    this.district = null;
    this.state = 'playing';
    this.showOnly(null);
    this.refreshHint();
    this.lastFrame = 0;
  }

  /** Everything a bullet can reach. Police, thugs, pedestrians, the player and loose cars. */
  combatTargets() {
    const list = [{ x: this.player.x, y: this.player.y, r: 12, type: 'player', ref: this.player }];
    for (const ped of this.peds.peds) {
      if (ped.dead || ped.state === 'down') continue;
      list.push({ x: ped.x, y: ped.y, r: 11, type: 'ped', ref: ped });
    }
    list.push(...this.police.combatTargets());
    list.push(...this.missions.combatTargets());
    const seen = new Set();
    const cars = [...this.traffic.allCars(), ...this.vehicles, ...this.police.cars.map((u) => u.car)];
    for (const car of cars) {
      if (!car || car.dead || seen.has(car)) continue;
      seen.add(car);
      if (car === this.player.vehicle) continue;
      list.push({ x: car.x, y: car.y, r: 21, type: 'vehicle', ref: car });
    }
    return list;
  }

  onVehicleDestroyed(vehicle) {
    if (this.player.vehicle === vehicle) {
      this.player.inVehicle = false;
      this.player.vehicle = null;
      this.player.takeDamage(16, this, 0);
      this.toast('Your ride is scrap — get clear');
    }
    this.vehicles = this.vehicles.filter((v) => v !== vehicle);
  }

  frame(now) {
    if (!this.lastFrame) this.lastFrame = now;
    const dt = clamp((now - this.lastFrame) / 1000, 0, 0.05);
    this.lastFrame = now;
    this.fps = Math.round(this.fps * 0.9 + (1 / Math.max(dt, 0.001)) * 0.1);

    this.update(dt);
    this.render();
    this.input.endFrame();

    if (this.sceneShot) {
      this.shotFrames += 1;
      if (this.shotFrames >= 3) window.__shotReady = true;
    }
    requestAnimationFrame((t) => this.frame(t));
  }
  // __MAIN_END__
}

export function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) return null;
  const game = new Game(canvas);
  window.__game = game;
  requestAnimationFrame((t) => game.frame(t));
  return game;
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => boot());
  else boot();
}
