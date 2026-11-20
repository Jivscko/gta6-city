// Paints the city's flat world once into cached chunks: land, asphalt, lane paint, crosswalks,
// sidewalks, parking lots, the boardwalk, sand and the bay. Caching by chunk keeps the per-frame
// cost to a handful of drawImage calls while the detail stays high.

import { CITY, CITY_EXTENT, PALETTE, WORLD } from './config.js';
import { Random, clamp, rgba, shade } from './utils.js';

const CHUNK = 640;
const SCALE = 1.35;
const MAX_CHUNKS = 14;

export class GroundRenderer {
  constructor(world) {
    this.world = world;
    this.cache = new Map();
  }

  /** World-space rectangle currently visible, padded so chunks enter before their edge shows. */
  visibleChunks(view) {
    const list = [];
    const x0 = Math.floor(view.x / CHUNK);
    const y0 = Math.floor(view.y / CHUNK);
    const x1 = Math.floor((view.x + view.w) / CHUNK);
    const y1 = Math.floor((view.y + view.h) / CHUNK);
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) list.push({ cx, cy });
    }
    return list;
  }

  draw(ctx, view) {
    for (const { cx, cy } of this.visibleChunks(view)) {
      const key = `${cx},${cy}`;
      let chunk = this.cache.get(key);
      if (!chunk) {
        chunk = this.paintChunk(cx, cy);
        this.cache.set(key, chunk);
        if (this.cache.size > MAX_CHUNKS) {
          const oldest = this.cache.keys().next().value;
          this.cache.delete(oldest);
        }
      }
      ctx.drawImage(chunk.canvas, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
    }
  }

  paintChunk(cx, cy) {
    const size = Math.ceil(CHUNK * SCALE);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.translate(-cx * CHUNK, -cy * CHUNK);
    const rng = new Random((cx * 73856093) ^ (cy * 19349663) ^ 0x9e3779b9);
    this.paintLand(ctx, rng, cx * CHUNK, cy * CHUNK);
    this.paintRoads(ctx, rng);
    this.paintBlocks(ctx, rng);
    this.paintBeach(ctx, rng);
    this.paintGroundDetail(ctx, rng);
    return { canvas };
  }

  /** Base terrain: city concrete, the sand strip and the water, with their gradients. */
  paintLand(ctx, rng, originX, originY) {
    const w = WORLD.width;
    ctx.fillStyle = '#4d4a44';
    ctx.fillRect(0, 0, w, WORLD.boardwalkY + 40);

    // A soft vignette of empty lots and scrub beyond the road grid.
    ctx.fillStyle = rgba(PALETTE.grass, 0.35);
    ctx.fillRect(0, 0, CITY_EXTENT.x0 - CITY.road / 2, WORLD.boardwalkY);
    ctx.fillRect(CITY_EXTENT.x1 + CITY.road / 2, 0, w - CITY_EXTENT.x1, WORLD.boardwalkY);
    ctx.fillStyle = rgba('#3d3a35', 0.6);
    ctx.fillRect(0, WORLD.boardwalkY - 26, w, 26);

    // Boardwalk planks.
    ctx.fillStyle = '#8a6a4f';
    ctx.fillRect(0, WORLD.boardwalkY, w, WORLD.sandY - WORLD.boardwalkY);
    ctx.strokeStyle = 'rgba(60, 40, 26, 0.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, WORLD.boardwalkY);
      ctx.lineTo(x, WORLD.sandY);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 235, 200, 0.1)';
    ctx.fillRect(0, WORLD.boardwalkY, w, 3);

    // Sand.
    const sandGradient = ctx.createLinearGradient(0, WORLD.sandY, 0, WORLD.waterY);
    sandGradient.addColorStop(0, PALETTE.sandDark);
    sandGradient.addColorStop(0.55, PALETTE.sand);
    sandGradient.addColorStop(1, '#b99f74');
    ctx.fillStyle = sandGradient;
    ctx.fillRect(0, WORLD.sandY, w, WORLD.waterY - WORLD.sandY);

    // Water.
    const sea = ctx.createLinearGradient(0, WORLD.waterY, 0, WORLD.height);
    sea.addColorStop(0, '#2a96a4');
    sea.addColorStop(0.25, PALETTE.water);
    sea.addColorStop(1, PALETTE.waterDeep);
    ctx.fillStyle = sea;
    ctx.fillRect(0, WORLD.waterY, w, WORLD.height - WORLD.waterY);

    // Gentle depth bands.
    for (let i = 0; i < 7; i += 1) {
      const y = WORLD.waterY + 26 + i * 72;
      ctx.fillStyle = rgba('#0d5568', 0.12 + i * 0.02);
      ctx.fillRect(0, y, w, 42);
    }

    // Foam along the shore, a wobbly line so it reads as water meeting sand.
    ctx.strokeStyle = rgba(PALETTE.foam, 0.55);
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 18) {
      const y = WORLD.waterY + Math.sin(x * 0.011) * 5 + Math.sin(x * 0.031) * 2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(PALETTE.foam, 0.22);
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 24) {
        const y = WORLD.waterY + 40 + i * 34 + Math.sin(x * 0.008 + i) * 6;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  /** Asphalt, curbs, lane paint, crosswalks and turn arrows. */
  paintRoads(ctx, rng) {
    for (const road of this.world.roads) {
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(road.x, road.y, road.w, road.h);
      // A lighter centre wear band.
      if (road.axis === 'h') {
        ctx.fillStyle = rgba('#3a3f4b', 0.6);
        ctx.fillRect(road.x, road.y + road.h * 0.32, road.w, road.h * 0.36);
      } else {
        ctx.fillStyle = rgba('#3a3f4b', 0.6);
        ctx.fillRect(road.x + road.w * 0.32, road.y, road.w * 0.36, road.h);
      }

      // Curbs: a pale lip at each edge.
      ctx.fillStyle = PALETTE.sidewalkEdge;
      if (road.axis === 'h') {
        ctx.fillRect(road.x, road.y, road.w, 3);
        ctx.fillRect(road.x, road.y + road.h - 3, road.w, 3);
      } else {
        ctx.fillRect(road.x, road.y, 3, road.h);
        ctx.fillRect(road.x + road.w - 3, road.y, 3, road.h);
      }

      const half = CITY.road / 2;
      ctx.strokeStyle = rgba(PALETTE.paint, 0.72);
      ctx.lineWidth = 2;
      if (road.axis === 'h') {
        for (let x = road.x + 20; x < road.x + road.w - 20; x += 46) {
          const nearNode = Math.abs(((x - CITY_EXTENT.x0) % (CITY.blockW + CITY.road) + (CITY.blockW + CITY.road)) % (CITY.blockW + CITY.road) - 0);
          if (nearNode < half + 16) continue;
          ctx.beginPath();
          ctx.moveTo(x, road.y + half);
          ctx.lineTo(x + 22, road.y + half);
          ctx.stroke();
        }
        ctx.strokeStyle = rgba(PALETTE.paint, 0.3);
        ctx.beginPath();
        ctx.moveTo(road.x, road.y + half - 30);
        ctx.lineTo(road.x + road.w, road.y + half - 30);
        ctx.moveTo(road.x, road.y + half + 30);
        ctx.lineTo(road.x + road.w, road.y + half + 30);
        ctx.stroke();
      } else {
        for (let y = road.y + 20; y < road.y + road.h - 20; y += 46) {
          const nearNode = Math.abs(((y - CITY_EXTENT.y0) % (CITY.blockH + CITY.road) + (CITY.blockH + CITY.road)) % (CITY.blockH + CITY.road) - 0);
          if (nearNode < half + 16) continue;
          ctx.beginPath();
          ctx.moveTo(road.x + half, y);
          ctx.lineTo(road.x + half, y + 22);
          ctx.stroke();
        }
        ctx.strokeStyle = rgba(PALETTE.paint, 0.3);
        ctx.beginPath();
        ctx.moveTo(road.x + half - 30, road.y);
        ctx.lineTo(road.x + half - 30, road.y + road.h);
        ctx.moveTo(road.x + half + 30, road.y);
        ctx.lineTo(road.x + half + 30, road.y + road.h);
        ctx.stroke();
      }
    }

    // Crosswalks and stop bars at every intersection.
    for (const cw of this.world.crosswalks) {
      const half = CITY.road / 2;
      ctx.fillStyle = rgba('#e9e1cf', 0.62);
      for (let i = 0; i < 6; i += 1) {
        const offset = -half + 12 + i * 15;
        ctx.fillRect(cw.x + offset, cw.y - half, 8, 15);
        ctx.fillRect(cw.x + offset, cw.y + half - 15, 8, 15);
        ctx.fillRect(cw.x - half, cw.y + offset, 15, 8);
        ctx.fillRect(cw.x + half - 15, cw.y + offset, 15, 8);
      }
    }

    // Tyre marks and patches so the asphalt is not uniform.
    for (let i = 0; i < 26; i += 1) {
      const road = rng.pick(this.world.roads);
      const x = road.axis === 'h' ? rng.range(road.x, road.x + road.w - 120) : road.x + rng.range(14, road.w - 30);
      const y = road.axis === 'h' ? road.y + rng.range(14, road.h - 24) : rng.range(road.y, road.y + road.h - 120);
      if (rng.chance(0.5)) {
        ctx.fillStyle = rgba('#1b1d24', 0.18);
        ctx.fillRect(x, y, rng.range(30, 80), rng.range(4, 8));
      } else {
        ctx.fillStyle = rgba('#22252c', 0.3);
        ctx.beginPath();
        ctx.ellipse(x, y, rng.range(10, 22), rng.range(6, 12), rng.range(0, 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Sidewalk aprons and the lot inside each block, with seams and planting. */
  paintBlocks(ctx, rng) {
    for (const block of this.world.blocks) {
      const district = block.district;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.fillStyle = rgba(PALETTE.sidewalkEdge, 0.8);
      ctx.fillRect(block.x, block.y + block.h - 4, block.w, 4);
      ctx.fillStyle = rgba('#ffffff', 0.12);
      ctx.fillRect(block.x, block.y, block.w, 2);

      // Sidewalk seams.
      ctx.strokeStyle = rgba('#6d6459', 0.35);
      ctx.lineWidth = 1;
      for (let x = block.x + 36; x < block.x + block.w - 10; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x, block.y + 2);
        ctx.lineTo(x, block.y + 22);
        ctx.moveTo(x, block.y + block.h - 22);
        ctx.lineTo(x, block.y + block.h - 2);
        ctx.stroke();
      }
      for (let y = block.y + 36; y < block.y + block.h - 10; y += 46) {
        ctx.beginPath();
        ctx.moveTo(block.x + 2, y);
        ctx.lineTo(block.x + 22, y);
        ctx.moveTo(block.x + block.w - 22, y);
        ctx.lineTo(block.x + block.w - 2, y);
        ctx.stroke();
      }

      const lot = { x: block.x + 26, y: block.y + 26, w: block.w - 52, h: block.h - 52 };
      if (block.lot) {
        // Parking lot with painted stalls.
        ctx.fillStyle = '#45474d';
        ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
        ctx.strokeStyle = rgba('#d9d6c9', 0.4);
        ctx.lineWidth = 2;
        for (let x = lot.x + 24; x < lot.x + lot.w - 12; x += 42) {
          ctx.beginPath();
          ctx.moveTo(x, lot.y + 18);
          ctx.lineTo(x, lot.y + 78);
          ctx.stroke();
        }
        continue;
      }
      const green = district.kind === 'houses' || district.kind === 'apartments';
      ctx.fillStyle = green ? rgba(PALETTE.grass, 0.55) : rgba('#7d756a', 0.55);
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      // Planters at the corners of the lot.
      ctx.fillStyle = rgba('#3f4a37', 0.45);
      for (const [px, py] of [[lot.x, lot.y], [lot.x + lot.w - 26, lot.y], [lot.x, lot.y + lot.h - 26], [lot.x + lot.w - 26, lot.y + lot.h - 26]]) {
        ctx.fillRect(px, py, 26, 26);
      }
    }
  }

  /** The pier, marina docks and beach details painted into the ground. */
  paintBeach(ctx, rng) {
    const pier = WORLD.pier;
    ctx.fillStyle = '#7a5a41';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(50, 32, 20, 0.4)';
    ctx.lineWidth = 1;
    for (let y = pier.y; y < pier.y + pier.h; y += 12) {
      ctx.beginPath();
      ctx.moveTo(pier.x, y);
      ctx.lineTo(pier.x + pier.w, y);
      ctx.stroke();
    }
    for (let x = pier.x; x <= pier.x + pier.w; x += 22) {
      ctx.fillStyle = 'rgba(45, 30, 20, 0.55)';
      ctx.fillRect(x, pier.y, 4, pier.h);
    }
    ctx.fillStyle = '#5c4230';
    ctx.fillRect(pier.x, pier.y + pier.h - 8, pier.w, 8);

    const marina = WORLD.marina;
    ctx.fillStyle = '#6f523c';
    ctx.fillRect(marina.x, marina.y, marina.w, marina.h);
    for (let x = marina.x; x < marina.x + marina.w; x += 18) {
      ctx.fillStyle = 'rgba(40, 26, 16, 0.35)';
      ctx.fillRect(x, marina.y, 3, marina.h);
    }

    // Dune grass tufts and shells on the sand.
    for (let i = 0; i < 90; i += 1) {
      const x = rng.range(20, WORLD.width - 20);
      const y = rng.range(WORLD.sandY + 14, WORLD.waterY - 14);
      if (rng.chance(0.55)) {
        ctx.strokeStyle = rgba('#8c9a6a', 0.5);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k < 4; k += 1) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + rng.range(-7, 7), y - rng.range(5, 13));
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba('#efe2c6', 0.55);
        ctx.beginPath();
        ctx.arc(x, y, rng.range(1.4, 3.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Boat shapes moored at the marina.
    for (let i = 0; i < 5; i += 1) {
      const bx = marina.x + 24 + i * 44;
      const by = marina.y + marina.h + 18;
      ctx.fillStyle = rng.pick(['#e9e4d8', '#c9dfe2', '#d8c19a']);
      ctx.beginPath();
      ctx.ellipse(bx, by, 17, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba('#2a2f38', 0.5);
      ctx.fillRect(bx - 6, by - 4, 12, 5);
    }
  }

  /** Manholes, drains, sand streaks: small marks that keep large flat areas alive. */
  paintGroundDetail(ctx, rng) {
    for (let i = 0; i < 24; i += 1) {
      const road = rng.pick(this.world.roads);
      const x = rng.range(road.x + 10, road.x + road.w - 10);
      const y = rng.range(road.y + 10, road.y + road.h - 10);
      ctx.fillStyle = rgba('#15171d', 0.55);
      ctx.beginPath();
      ctx.arc(x, y, rng.range(5, 8), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba('#5a5e66', 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, rng.range(5, 8), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 20; i += 1) {
      const x = rng.range(0, WORLD.width);
      const y = rng.range(WORLD.sandY, WORLD.waterY);
      ctx.fillStyle = rgba('#a98f68', 0.25);
      ctx.beginPath();
      ctx.ellipse(x, y, rng.range(20, 60), rng.range(3, 7), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
