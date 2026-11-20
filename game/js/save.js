// Progress saved into the browser's localStorage: cash, condition, gear and where the story stands.
// Every access is guarded because a file:// page or a private window may refuse storage.

import { SAVE_KEY } from './config.js';

/** Read the save, or null when there is none or it cannot be trusted. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Write a snapshot of the run. Returns true when the browser accepted it. */
export function writeSave(snapshot) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), ...snapshot }));
    return true;
  } catch {
    return false;
  }
}

/** Whether a saved run exists, for the title screen's Continue button. */
export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/** The fields a run keeps across a reload. */
export function snapshotOf(game) {
  const p = game.player;
  return {
    cash: p.cash,
    health: p.health,
    armor: p.armor,
    wantedHeat: game.police.heat,
    weapons: { current: p.weaponId, pistolAmmo: p.ammo.pistol, smgAmmo: p.ammo.smg, smgOwned: p.unlocked.smg },
    completed: game.missions.completed.slice(),
    activeIndex: game.missions.activeIndex,
    step: game.missions.stepIndex,
    x: p.x,
    y: p.y,
    inVehicle: false,
    time: game.stats.playSeconds,
    kills: game.stats.kills,
    missionsDone: game.stats.missionsDone,
  };
}

/** Restore a saved run into a freshly reset game. */
export function applySave(game, data) {
  const p = game.player;
  p.cash = data.cash ?? 0;
  p.health = Math.max(20, Math.min(100, data.health ?? 100));
  p.armor = Math.max(0, Math.min(100, data.armor ?? 0));
  p.ammo.pistol = data.weapons?.pistolAmmo ?? 36;
  p.ammo.smg = data.weapons?.smgAmmo ?? 0;
  p.unlocked.smg = Boolean(data.weapons?.smgOwned);
  p.setWeapon(data.weapons?.current ?? 'pistol', game);
  p.x = data.x ?? p.x;
  p.y = data.y ?? p.y;
  p.vx = 0;
  p.vy = 0;
  game.player.placeOnFoot(game.world);
  game.camera.snapTo(p.x, p.y);
  game.police.heat = data.wantedHeat ?? 0;
  game.missions.completed = Array.isArray(data.completed) ? data.completed.slice() : [];
  game.missions.activeIndex = Number.isInteger(data.activeIndex) ? data.activeIndex : -1;
  game.missions.stepIndex = Number.isInteger(data.step) ? data.step : 0;
  game.stats.kills = data.kills ?? 0;
  game.stats.missionsDone = data.missionsDone ?? game.missions.completed.length;
  game.missions.refreshObjective(game);
  game.toast('Progress loaded — welcome back to Solara');
}
