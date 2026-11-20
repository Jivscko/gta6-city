// The HUD: cash, stars, weapon and ammo, condition bars, the mission card, the minimap and the
// speed readout while driving. Everything is painted on the same canvas in screen space, no images.

import { PALETTE, WORLD } from './config.js';
import { clamp, damp, dist, metres, money, roundRect, starPath } from './utils.js';
import { speedMph } from './vehicles.js';
import { drawReticle } from './sprites.js';

const MINIMAP = { w: 236, h: 164, pad: 8 };

export class Hud {
  constructor(game) {
    this.game = game;
    this.cashShown = game.player.cash;
    this.starFlash = 0;
    this.damageFlash = 0;
    this.lastHealth = game.player.health;
    this.pulse = 0;
    this.objectiveShown = '';
    this.copDots = [];
  }

  resize() {
    this.cashShown = this.game.player.cash;
  }

  update(dt) {
    const game = this.game;
    this.pulse += dt;
    this.cashShown = damp(this.cashShown, game.player.cash, 8, dt);
    this.starFlash = Math.max(0, this.starFlash - dt * 2.5);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.8);
    if (game.police.crimeFlash > 0) this.starFlash = Math.max(this.starFlash, game.police.crimeFlash);
    if (game.player.health < this.lastHealth) this.damageFlash = Math.min(1, this.damageFlash + 0.5);
    this.lastHealth = game.player.health;
    this.copDots = game.police.officers.filter((c) => !c.dead);
  }

  /** Wrap a string into lines that fit the given width. */
  wrap(ctx, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  draw(ctx) {
    const game = this.game;
    if (!game.started) return;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const s = clamp(Math.min(w / 1280, h / 720), 0.72, 1.35);
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    this.drawCash(ctx, 34 * s, 34 * s, s);
    this.drawStars(ctx, w - 34 * s, 34 * s, s);
    this.drawWeapon(ctx, w - 34 * s, 92 * s, s);
    this.drawObjective(ctx, 34 * s, 108 * s, s);
    this.drawCondition(ctx, w - 34 * s, h - 34 * s, s);
    this.drawMinimap(ctx, 30 * s, h - 30 * s - MINIMAP.h * s, s);
    if (game.player.inVehicle) this.drawSpeed(ctx, w / 2, h - 44 * s, s);

    if (this.damageFlash > 0.01) {
      const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
      grad.addColorStop(0, 'rgba(180, 20, 30, 0)');
      grad.addColorStop(1, `rgba(160, 12, 24, ${0.5 * this.damageFlash})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    if (!game.player.inVehicle && !game.player.dead) {
      const m = game.input.mouse;
      drawReticle(ctx, m.x, m.y, game.combat.reloading ? 6 : 0);
    }
    ctx.restore();
    if (game.showFps) this.drawFps(ctx, w, h, s);
  }

  drawCash(ctx, x, y, s) {
    const game = this.game;
    ctx.textAlign = 'left';
    ctx.font = `600 ${10 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(247, 236, 217, 0.55)';
    ctx.fillText('CASH', x + 2, y);
    ctx.font = `900 ${32 * s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = PALETTE.cash;
    ctx.fillText(money(this.cashShown), x, y + 30 * s);
    if (game.player.armor > 0) {
      ctx.font = `600 ${10 * s}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = 'rgba(105, 183, 232, 0.8)';
      ctx.fillText(`ARMOUR ${Math.round(game.player.armor)}`, x + 2, y + 46 * s);
    }
  }

  drawStars(ctx, right, y, s) {
    const stars = this.game.police.stars;
    const size = 19 * s;
    const gap = 6 * s;
    const total = size * 10 + gap * 4;
    const x0 = right - total;
    ctx.textAlign = 'left';
    for (let i = 0; i < 5; i += 1) {
      const cx = x0 + i * (size * 2 + gap);
      const lit = i < stars;
      const flash = lit && this.starFlash > 0.05 ? 1 + Math.sin(this.pulse * 18) * 0.12 : 1;
      starPath(ctx, cx, y + size * 0.55, size * flash, size * 0.45 * flash);
      ctx.fillStyle = lit ? (this.starFlash > 0 ? '#fff2c8' : PALETTE.gold) : 'rgba(20, 24, 34, 0.45)';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = lit ? 'rgba(255, 240, 200, 0.9)' : 'rgba(247, 236, 217, 0.22)';
      ctx.stroke();
    }
    if (stars > 0) {
      ctx.font = `700 ${9 * s}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255, 206, 106, 0.8)';
      ctx.textAlign = 'right';
      ctx.fillText(`WANTED ${stars}`, right, y + size * 1.9);
    }
  }

  drawWeapon(ctx, right, y, s) {
    const player = this.game.player;
    const def = player.weapon;
    const w = 148 * s;
    const h = 46 * s;
    const x = right - w;
    roundRect(ctx, x, y, w, h, 3);
    ctx.fillStyle = 'rgba(12, 16, 25, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(247, 236, 217, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = `700 ${10 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(247, 236, 217, 0.5)';
    ctx.fillText('WEAPON', x + 10 * s, y + 13 * s);
    ctx.font = `700 ${14 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = '#f7ecd9';
    ctx.fillText(def.name.toUpperCase(), x + 10 * s, y + 31 * s);
    ctx.textAlign = 'right';
    ctx.font = `900 ${22 * s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = def.melee ? 'rgba(247, 236, 217, 0.4)' : this.game.combat.reloading ? PALETTE.neon : PALETTE.gold;
    if (def.melee) ctx.fillText('—', x + w - 10 * s, y + 32 * s);
    else {
      const clip = player.clip[def.id] ?? 0;
      const reserve = player.ammo[def.id] ?? 0;
      ctx.font = `900 ${20 * s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(`${clip}`, x + w - 10 * s, y + 32 * s);
      ctx.font = `600 ${10 * s}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = 'rgba(247, 236, 217, 0.5)';
      ctx.fillText(`/ ${reserve}`, x + w - 10 * s, y + 14 * s);
    }
    if (this.game.combat.reloading) {
      ctx.textAlign = 'right';
      ctx.font = `600 ${9 * s}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = PALETTE.neon;
      ctx.fillText('RELOADING', right, y + h + 11 * s);
    }
  }

  drawObjective(ctx, x, y, s) {
    const missions = this.game.missions;
    if (!missions.objective) return;
    const maxW = 382 * s;
    ctx.font = `600 ${13 * s}px "Helvetica Neue", Arial, sans-serif`;
    const lines = this.wrap(ctx, missions.objective, maxW - 32 * s);
    const cardH = 40 * s + lines.length * 17 * s + (missions.hint ? 16 * s : 0);
    roundRect(ctx, x, y, maxW, cardH, 3);
    ctx.fillStyle = 'rgba(12, 16, 25, 0.7)';
    ctx.fill();
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(x, y, 3, cardH);
    ctx.textAlign = 'left';
    ctx.font = `700 ${9 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255, 206, 106, 0.8)';
    ctx.fillText('CURRENT JOB', x + 14 * s, y + 17 * s);
    ctx.font = `600 ${13 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = '#f7ecd9';
    lines.forEach((line, i) => ctx.fillText(line, x + 14 * s, y + 34 * s + i * 17 * s));
    if (missions.hint) {
      ctx.font = `500 ${10 * s}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = 'rgba(247, 236, 217, 0.5)';
      ctx.fillText(missions.hint, x + 14 * s, y + 34 * s + lines.length * 17 * s + 2 * s);
    }
    if (missions.marker) {
      const d = dist(this.game.player.x, this.game.player.y, missions.marker.x, missions.marker.y);
      ctx.textAlign = 'right';
      ctx.font = `700 ${10 * s}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = 'rgba(255, 206, 106, 0.75)';
      ctx.fillText(metres(d), x + maxW - 12 * s, y + 17 * s);
      ctx.textAlign = 'left';
    }
  }

  drawCondition(ctx, right, bottom, s) {
    const player = this.game.player;
    const w = 244 * s;
    const x = right - w;
    const barH = 10 * s;
    const y = bottom - 56 * s;
    this.bar(ctx, x, y, w, barH, player.healthPct, '#74d68b', '#2f7a49', s);
    this.bar(ctx, x, y + 26 * s, w, barH * 0.72, player.armorPct, '#69b7e8', '#2f6288', s);
    ctx.textAlign = 'left';
    ctx.font = `700 ${9 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(247, 236, 217, 0.6)';
    ctx.fillText(`HP ${Math.ceil(player.health)}`, x, y - 5 * s);
    ctx.textAlign = 'right';
    ctx.fillText(`AP ${Math.ceil(player.armor)}`, right, y - 5 * s);
    ctx.textAlign = 'left';
  }

  bar(ctx, x, y, w, h, pct, color, dark, s) {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(10, 13, 21, 0.72)';
    ctx.fill();
    if (pct > 0.001) {
      ctx.save();
      roundRect(ctx, x, y, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = dark;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w * pct, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(x, y, w * pct, h * 0.4);
      ctx.restore();
    }
    ctx.font = `600 ${9 * s}px "Helvetica Neue", Arial, sans-serif`;
  }

  drawSpeed(ctx, cx, y, s) {
    const car = this.game.player.vehicle;
    if (!car) return;
    const mph = speedMph(car);
    ctx.textAlign = 'center';
    ctx.font = `900 ${34 * s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = '#f7ecd9';
    ctx.fillText(`${mph}`, cx, y);
    ctx.font = `700 ${9 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(247, 236, 217, 0.55)';
    ctx.fillText('MPH', cx, y + 12 * s);
    if (car.health < car.maxHealth) {
      const w = 120 * s;
      const pct = clamp(car.health / car.maxHealth, 0, 1);
      roundRect(ctx, cx - w / 2, y + 20 * s, w, 4 * s, 2);
      ctx.fillStyle = 'rgba(10, 13, 21, 0.7)';
      ctx.fill();
      ctx.fillStyle = pct > 0.4 ? PALETTE.gold : PALETTE.policeRed;
      ctx.fillRect(cx - w / 2, y + 20 * s, w * pct, 4 * s);
    }
    ctx.textAlign = 'left';
  }

  /** The minimap: a compressed plan of the city, the player, cops and the job marker. */
  drawMinimap(ctx, x, y, s) {
    const game = this.game;
    const w = MINIMAP.w * s;
    const h = MINIMAP.h * s;
    const pad = MINIMAP.pad * s;
    const sx = (w - pad * 2) / WORLD.width;
    const sy = (h - pad * 2) / WORLD.height;
    const sc = Math.min(sx, sy);
    const ox = x + (w - WORLD.width * sc) / 2;
    const oy = y + (h - WORLD.height * sc) / 2;

    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = 'rgba(10, 13, 21, 0.82)';
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, w, h, 4);
    ctx.clip();

    // Sea, sand, city ground.
    ctx.fillStyle = '#123c48';
    ctx.fillRect(ox, oy, WORLD.width * sc, WORLD.height * sc);
    ctx.fillStyle = 'rgba(217, 192, 147, 0.85)';
    ctx.fillRect(ox, oy + WORLD.boardwalkY * sc, WORLD.width * sc, (WORLD.height - WORLD.boardwalkY) * sc);
    ctx.fillStyle = '#3a3c40';
    ctx.fillRect(ox, oy, WORLD.width * sc, WORLD.boardwalkY * sc);

    // Roads as light lines.
    ctx.strokeStyle = 'rgba(190, 198, 208, 0.32)';
    ctx.lineWidth = Math.max(1, 2.6 * sc);
    for (const road of game.world.roads) {
      ctx.beginPath();
      if (road.axis === 'h') {
        ctx.moveTo(ox + road.x * sc, oy + (road.y + road.h / 2) * sc);
        ctx.lineTo(ox + (road.x + road.w) * sc, oy + (road.y + road.h / 2) * sc);
      } else {
        ctx.moveTo(ox + (road.x + road.w / 2) * sc, oy + road.y * sc);
        ctx.lineTo(ox + (road.x + road.w / 2) * sc, oy + (road.y + road.h) * sc);
      }
      ctx.stroke();
    }

    // A few building blocks as texture.
    ctx.fillStyle = 'rgba(18, 22, 30, 0.5)';
    for (const b of game.world.buildings) {
      ctx.fillRect(ox + b.x * sc, oy + b.y * sc, Math.max(1, b.w * sc), Math.max(1, b.h * sc));
    }

    // Cop dots.
    for (const cop of this.copDots) {
      ctx.fillStyle = this.pulse % 0.8 < 0.4 ? '#5b8ef0' : '#e8556b';
      ctx.beginPath();
      ctx.arc(ox + cop.x * sc, oy + cop.y * sc, 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const unit of game.police.cars) {
      ctx.fillStyle = 'rgba(105, 142, 240, 0.9)';
      ctx.fillRect(ox + unit.car.x * sc - 2 * s, oy + unit.car.y * sc - 2 * s, 4 * s, 4 * s);
    }

    // Mission marker: a pulsing diamond.
    if (game.missions.marker) {
      const mx = ox + game.missions.marker.x * sc;
      const my = oy + game.missions.marker.y * sc;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      const size = (4 + Math.sin(this.pulse * 4) * 1.2) * s;
      ctx.fillStyle = PALETTE.marker;
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.restore();
    }

    // Player arrow, rotated to the body/facing angle.
    const px = ox + game.player.x * sc;
    const py = oy + game.player.y * sc;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(game.player.inVehicle && game.player.vehicle ? game.player.vehicle.angle : game.player.angle);
    ctx.fillStyle = '#fff6e2';
    ctx.beginPath();
    ctx.moveTo(6 * s, 0);
    ctx.lineTo(-4 * s, 4 * s);
    ctx.lineTo(-2 * s, 0);
    ctx.lineTo(-4 * s, -4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
    roundRect(ctx, x, y, w, h, 4);
    ctx.strokeStyle = 'rgba(247, 236, 217, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const district = game.world.districtAt(game.player.x, game.player.y);
    ctx.font = `700 ${10 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(247, 236, 217, 0.82)';
    ctx.textAlign = 'left';
    ctx.fillText(district.name.toUpperCase(), x + 10 * s, y + h - 8 * s);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(247, 236, 217, 0.35)';
    ctx.font = `600 ${9 * s}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText('N', x + w - 10 * s, y + 14 * s);
    ctx.textAlign = 'left';
  }

  drawFps(ctx, w, h, s) {
    ctx.font = `600 ${11 * s}px "Helvetica Neue", monospace`;
    ctx.fillStyle = 'rgba(247, 236, 217, 0.65)';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.game.fps} FPS`, w - 90 * s, h - 12 * s);
  }
}
