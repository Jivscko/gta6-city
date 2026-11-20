// The city itself: a seeded road grid of districts and blocks, the buildings that fill them, palms,
// lamps and beach furniture, the solid geometry everything collides with, and the road graph the
// traffic and the police navigate. It owns data only; cityart.js paints it.

import { CITY, CITY_EXTENT, DISTRICTS, PALETTE, PLACES, WORLD } from './config.js';
import { Random, clamp, dist, pointOnLoop, rectContains } from './utils.js';

const SIDEWALK = 24;
const BUILDING_INSET = SIDEWALK + 6;

/** Wall/roof palettes per district; each building picks a pair so a block reads as one place. */
const DISTRICT_COLORS = {
  towers: [['#5b6b7a', '#8fa0ad'], ['#6d6a78', '#a49fae'], ['#4f6470', '#8ba5ad'], ['#7a6a5c', '#b09a86'], ['#445a68', '#7f97a4']],
  shops: [['#9a5c4c', '#d0917a'], ['#7d5b71', '#b48ba4'], ['#6d6a52', '#a8a17c'], ['#4f6b70', '#87a7a7'], ['#a06a45', '#d6a274']],
  warehouses: [['#5f6668', '#8b9192'], ['#6f5c4a', '#a08a72'], ['#556068', '#87929a'], ['#6a5f57', '#9a8d81']],
  houses: [['#a56f5b', '#d9a68c'], ['#8d8570', '#c0b79c'], ['#7d8b72', '#b0bd9a'], ['#9c7f6d', '#cfae97']],
  apartments: [['#8c6f5f', '#c39d86'], ['#6f7a78', '#a3aeaa'], ['#8a7a8c', '#bdaec1'], ['#7d6a55', '#b39a7c']],
  beach: [['#b07a63', '#e0a88c'], ['#8fa0a2', '#c3d2d2'], ['#a8896a', '#d8b996']],
};

const STREET_NAMES = ['Alameda', 'Coral', 'Vela', 'Marisol', 'Dorado', 'Sombra', 'Brisa', 'Aurora', 'Marea', 'Salvia'];
const NEON_WORDS = ['LUNA', 'PALMA', 'SOL', 'MAREA', 'VELVET', 'RIO', 'CASA', 'OLA'];

/** The road graph: intersections are nodes, each pair of neighbours an edge cars can drive. */
function buildRoadGraph() {
  const nodes = [];
  const index = (i, j) => j * (CITY.cols + 1) + i;
  for (let j = 0; j <= CITY.rows; j += 1) {
    for (let i = 0; i <= CITY.cols; i += 1) {
      nodes.push({
        id: index(i, j),
        i,
        j,
        x: CITY_EXTENT.x0 + i * (CITY.blockW + CITY.road),
        y: CITY_EXTENT.y0 + j * (CITY.blockH + CITY.road),
        edges: [],
      });
    }
  }
  const edges = [];
  const addEdge = (a, b, axis) => {
    const length = dist(a.x, a.y, b.x, b.y);
    const edge = {
      id: edges.length,
      a: a.id,
      b: b.id,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      dx: (b.x - a.x) / length,
      dy: (b.y - a.y) / length,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      length,
      axis,
    };
    edges.push(edge);
    a.edges.push(edge.id);
    b.edges.push(edge.id);
  };
  for (let j = 0; j <= CITY.rows; j += 1) {
    for (let i = 0; i < CITY.cols; i += 1) addEdge(nodes[index(i, j)], nodes[index(i + 1, j)], 'h');
  }
  for (let i = 0; i <= CITY.cols; i += 1) {
    for (let j = 0; j < CITY.rows; j += 1) addEdge(nodes[index(i, j)], nodes[index(i, j + 1)], 'v');
  }
  return { nodes, edges };
}

/** A building footprint plus the roof furniture the painter draws. */
function makeBuilding(rng, rect, style, district) {
  const palette = DISTRICT_COLORS[style] ?? DISTRICT_COLORS.shops;
  const [wall, roof] = rng.pick(palette);
  const floors = style === 'towers'
    ? rng.int(6, 26)
    : style === 'warehouses' ? rng.int(1, 3)
      : style === 'houses' ? rng.int(1, 2) : rng.int(2, 9);
  return {
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    style,
    wall,
    roof,
    lift: style === 'towers' ? Math.min(46, 10 + floors * 1.7) : Math.min(20, 4 + floors * 2.2),
    floors,
    detail: rng.int(0, 3),
    sign: rng.chance(style === 'shops' ? 0.55 : 0.16) ? rng.pick(NEON_WORDS) : null,
    signColor: rng.pick([PALETTE.neon, PALETTE.gold, '#5fd0d8', '#e879b9']),
    name: `${rng.pick(STREET_NAMES)} ${district.kind === 'towers' ? 'Tower' : 'House'}`,
    ac: Array.from({ length: rng.int(1, 4) }, () => ({
      x: rng.range(0.15, 0.72),
      y: rng.range(0.18, 0.72),
      w: rng.range(0.12, 0.24),
      h: rng.range(0.1, 0.2),
    })),
    tank: rng.chance(style === 'warehouses' ? 0.2 : 0.45),
    deck: style === 'towers' && rng.chance(0.3),
  };
}

/** Carve a block into one to four lots and put a building on each. */
function fillBlock(rng, block, district, buildings) {
  const style = district.kind === 'beach' ? 'apartments' : district.kind;
  const inner = {
    x: block.x + BUILDING_INSET,
    y: block.y + BUILDING_INSET,
    w: block.w - BUILDING_INSET * 2,
    h: block.h - BUILDING_INSET * 2,
  };
  if (block.lot) return; // a parking lot block, kept empty for parked cars
  const columns = style === 'houses' ? 2 : style === 'warehouses' ? 1 : rng.chance(0.55) ? 2 : 1;
  const rows = style === 'houses' ? 1 : style === 'towers' ? (rng.chance(0.5) ? 2 : 1) : 1;
  const gap = 12;
  const cellW = (inner.w - gap * (columns - 1)) / columns;
  const cellH = (inner.h - gap * (rows - 1)) / rows;
  for (let c = 0; c < columns; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const jitter = style === 'houses' ? rng.range(2, 18) : rng.range(1, 7);
      const rect = {
        x: inner.x + c * (cellW + gap) + jitter * 0.4,
        y: inner.y + r * (cellH + gap) + jitter,
        w: cellW - jitter * 0.8,
        h: cellH - jitter * 1.6,
      };
      // Houses keep a front garden: shrink toward the back of the lot.
      if (style === 'houses') {
        rect.h *= 0.72;
        rect.w *= 0.84;
        rect.x += (cellW - rect.w) / 2;
      }
      if (rect.w < 60 || rect.h < 60) continue;
      buildings.push(makeBuilding(rng, rect, style, district));
    }
  }
}

/** A palm: trunk, lean and frond count for the painter. */
function makePalm(rng, x, y, scale = 1) {
  return { type: 'palm', x, y, len: rng.range(30, 52) * scale, lean: rng.range(-0.28, 0.28), seed: rng.int(0, 999) };
}

/** Street furniture and beach props, all placed on sidewalks and sand. */
function decorateBlock(rng, block, district, props) {
  const corners = [
    { x: block.x + 12, y: block.y + 12 },
    { x: block.x + block.w - 12, y: block.y + 12 },
    { x: block.x + 12, y: block.y + block.h - 12 },
    { x: block.x + block.w - 12, y: block.y + block.h - 12 },
  ];
  for (const c of corners) {
    if (rng.chance(0.55)) props.push(makePalm(rng, c.x, c.y, rng.range(0.85, 1.2)));
    else props.push({ type: 'lamp', x: c.x, y: c.y });
  }
  const edges = [
    { x: block.x + block.w / 2, y: block.y + 10, horizontal: true },
    { x: block.x + block.w / 2, y: block.y + block.h - 10, horizontal: true },
    { x: block.x + 10, y: block.y + block.h / 2, horizontal: false },
    { x: block.x + block.w - 10, y: block.y + block.h / 2, horizontal: false },
  ];
  for (const e of edges) {
    if (rng.chance(0.6)) props.push(makePalm(rng, e.x, e.y, rng.range(0.8, 1.1)));
    if (rng.chance(0.5)) props.push({ type: 'hydrant', x: e.x + rng.range(-22, 22), y: e.y + rng.range(-8, 8) });
    if (rng.chance(0.35)) props.push({ type: 'bin', x: e.x + rng.range(-30, 30), y: e.y + rng.range(-6, 6) });
    if (district.kind === 'shops' && rng.chance(0.5)) {
      props.push({ type: 'awning', x: e.x + rng.range(-40, 40), y: e.y, horizontal: e.horizontal, color: rng.pick([PALETTE.neon, PALETTE.gold, '#4fb0b8']) });
    }
  }
  if (district.kind === 'warehouses' && rng.chance(0.7)) {
    props.push({ type: 'crates', x: block.x + rng.range(40, block.w - 40), y: block.y + block.h - 40 });
  }
}

/** The beach strip: boardwalk palms, umbrellas, towels and lifeguard towers. */
function decorateBeach(rng, props) {
  const width = WORLD.width;
  for (let x = 120; x < width - 80; x += rng.range(70, 130)) {
    if (rng.chance(0.75)) props.push(makePalm(rng, x, WORLD.boardwalkY + 34, rng.range(0.9, 1.3)));
    if (rng.chance(0.5)) props.push({ type: 'bench', x: x + 22, y: WORLD.boardwalkY + 62 });
  }
  for (let x = 90; x < width - 90; x += rng.range(90, 180)) {
    const y = rng.range(WORLD.sandY + 50, WORLD.waterY - 70);
    if (rng.chance(0.6)) props.push({ type: 'umbrella', x, y, color: rng.pick(['#ff6f59', '#ffce6a', '#5fb6c4', '#f0f0e6']) });
    if (rng.chance(0.4)) props.push({ type: 'towel', x: x + rng.range(-30, 30), y: y + rng.range(-20, 26), angle: rng.range(0, 3) });
  }
  for (let x = 420; x < width - 200; x += 900) {
    props.push({ type: 'lifeguard', x, y: WORLD.sandY + rng.range(60, 110) });
  }
}

export class World {
  constructor(seed = 7) {
    this.seed = seed;
    this.rng = new Random(seed);
    this.districts = DISTRICTS;
    this.buildings = [];
    this.props = [];
    this.blocks = [];
    this.solids = [];
    this.solidGrid = new Map();
    this.parkingSpots = [];
    this.roads = [];
    this.pedLoops = [];
    this.crosswalks = [];
    this.neonSigns = [];
    this.generate();
  }

  generate() {
    const rng = this.rng;
    const { nodes, edges } = buildRoadGraph();
    this.nodes = nodes;
    this.edges = edges;

    // Road rectangles, one per centreline, overlapping at intersections.
    const half = CITY.road / 2;
    const left = CITY_EXTENT.x0 - half;
    const top = CITY_EXTENT.y0 - half;
    const right = CITY_EXTENT.x1 + half;
    const bottom = CITY_EXTENT.y1 + half;
    for (let j = 0; j <= CITY.rows; j += 1) {
      const y = CITY_EXTENT.y0 + j * (CITY.blockH + CITY.road);
      this.roads.push({ x: left, y: y - half, w: right - left, h: CITY.road, axis: 'h' });
    }
    for (let i = 0; i <= CITY.cols; i += 1) {
      const x = CITY_EXTENT.x0 + i * (CITY.blockW + CITY.road);
      this.roads.push({ x: x - half, y: top, w: CITY.road, h: bottom - top, axis: 'v' });
    }
    for (const node of nodes) {
      this.crosswalks.push({ x: node.x, y: node.y });
    }

    // Blocks and their buildings.
    for (let j = 0; j < CITY.rows; j += 1) {
      for (let i = 0; i < CITY.cols; i += 1) {
        const x = CITY_EXTENT.x0 + i * (CITY.blockW + CITY.road) + half;
        const y = CITY_EXTENT.y0 + j * (CITY.blockH + CITY.road) + half;
        const block = { x, y, w: CITY.blockW, h: CITY.blockH, i, j };
        const district = this.districtAt(x + block.w / 2, y + block.h / 2);
        block.district = district;
        block.lot = rng.chance(0.1);
        this.blocks.push(block);
        const before = this.buildings.length;
        fillBlock(rng, block, district, this.buildings);
        if (this.buildings.length === before) block.lot = true;
        decorateBlock(rng, block, district, this.props);
        this.pedLoops.push({
          x: x + SIDEWALK / 2,
          y: y + SIDEWALK / 2,
          w: block.w - SIDEWALK,
          h: block.h - SIDEWALK,
          block,
        });
        // Curb parking on the block's street sides.
        const spots = [
          { x: x + 70, y: y - 26, angle: 0 },
          { x: x + block.w - 70, y: y - 26, angle: 0 },
          { x: x + 70, y: y + block.h + 26, angle: Math.PI },
          { x: x + block.w - 70, y: y + block.h + 26, angle: Math.PI },
          { x: x - 26, y: y + block.h / 2, angle: Math.PI / 2 },
          { x: x + block.w + 26, y: y + block.h / 2, angle: -Math.PI / 2 },
        ];
        for (const spot of spots) if (rng.chance(0.45)) this.parkingSpots.push(spot);
        for (const b of this.buildings.slice(before)) {
          this.addSolid(b.x, b.y, b.w, b.h, 'building');
          if (b.sign) this.neonSigns.push({ x: b.x + b.w / 2, y: b.y + b.h, text: b.sign, color: b.signColor });
        }
      }
    }

    decorateBeach(rng, this.props);

    // A few city-limit palms and dunes so the edges do not read as a hard cut.
    for (let x = 40; x < WORLD.width; x += rng.range(160, 320)) {
      this.props.push(makePalm(rng, x, rng.range(60, 150), 1.1));
      if (x < 1560) this.props.push(makePalm(rng, x, rng.range(2400, 2540), 1.0));
    }
    this.props.sort((a, b) => a.y - b.y);
    this.buildingGrid = null;
  }

  addSolid(x, y, w, h, kind) {
    const solid = { x, y, w, h, kind };
    this.solids.push(solid);
    const cell = 256;
    for (let cy = Math.floor(y / cell); cy <= Math.floor((y + h) / cell); cy += 1) {
      for (let cx = Math.floor(x / cell); cx <= Math.floor((x + w) / cell); cx += 1) {
        const key = `${cx},${cy}`;
        if (!this.solidGrid.has(key)) this.solidGrid.set(key, []);
        this.solidGrid.get(key).push(solid);
      }
    }
    return solid;
  }

  /** The district a world point falls in, with Sunset Beach covering the south strip. */
  districtAt(x, y) {
    if (y > WORLD.boardwalkY - 30) return this.districts.find((d) => d.id === 'beach');
    for (const d of this.districts) {
      if (d.id === 'beach') continue;
      if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
    }
    return this.districts[1];
  }

  /** Whether a point is on asphalt: within half a road of a centreline and inside the grid. */
  isRoad(x, y) {
    const half = CITY.road / 2;
    const px = (x - CITY_EXTENT.x0) / (CITY.blockW + CITY.road);
    const py = (y - CITY_EXTENT.y0) / (CITY.blockH + CITY.road);
    if (x < CITY_EXTENT.x0 - half || x > CITY_EXTENT.x1 + half || y < CITY_EXTENT.y0 - half || y > CITY_EXTENT.y1 + half) return false;
    const dx = Math.abs(px - Math.round(px)) * (CITY.blockW + CITY.road);
    const dy = Math.abs(py - Math.round(py)) * (CITY.blockH + CITY.road);
    return dx <= half || dy <= half;
  }

  /** Buildings near a point, from the 256-unit bucket grid. */
  solidsNear(x, y, radius = 64) {
    const cell = 256;
    const found = [];
    const seen = new Set();
    for (let cy = Math.floor((y - radius) / cell); cy <= Math.floor((y + radius) / cell); cy += 1) {
      for (let cx = Math.floor((x - radius) / cell); cx <= Math.floor((x + radius) / cell); cx += 1) {
        const bucket = this.solidGrid.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const s of bucket) {
          if (seen.has(s)) continue;
          seen.add(s);
          found.push(s);
        }
      }
    }
    return found;
  }

  /**
   * Push a circle out of the nearest solid it overlaps. Returns the corrected centre and the
   * surface normal, or null when the circle is clear.
   */
  collideCircle(x, y, r) {
    let hit = null;
    for (const s of this.solidsNear(x, y, r + 8)) {
      const cx = clamp(x, s.x, s.x + s.w);
      const cy = clamp(y, s.y, s.y + s.h);
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const overlap = r - d;
      let nx = dx / d;
      let ny = dy / d;
      if (d2 < 0.0001) {
        // Centre inside the box: push out along the shallowest axis.
        const left = x - s.x;
        const rightEdge = s.x + s.w - x;
        const top = y - s.y;
        const bottomEdge = s.y + s.h - y;
        const m = Math.min(left, rightEdge, top, bottomEdge);
        nx = m === left ? -1 : m === rightEdge ? 1 : 0;
        ny = m === top ? -1 : m === bottomEdge ? 1 : 0;
      }
      x += nx * (overlap + 0.5);
      y += ny * (overlap + 0.5);
      hit = { x, y, nx, ny, solid: s };
    }
    return hit;
  }

  /** Whether a person may stand at (x, y): not in the sea, off the pier only. */
  isLand(x, y, r = 0) {
    if (y + r <= WORLD.boardwalkY + 6) return true;
    const pier = WORLD.pier;
    if (x >= pier.x - 6 && x <= pier.x + pier.w + 6 && y <= pier.y + pier.h - r) return true;
    return y + r < WORLD.waterY;
  }

  /** Clamp a position to the map and out of the water. */
  clampToLand(x, y, r = 0) {
    const nx = clamp(x, r + 6, WORLD.width - r - 6);
    let ny = clamp(y, r + 6, WORLD.height - r - 6);
    if (!this.isLand(nx, ny, r)) {
      ny = this.isLand(nx, WORLD.waterY - 120, r) ? WORLD.waterY - 120 : WORLD.boardwalkY - 20;
    }
    return { x: nx, y: ny };
  }

  /** Nearest point on a road centreline, for spawning pursuit units outside the view. */
  nearestRoadPoint(x, y) {
    let best = null;
    const horizontalLine = CITY_EXTENT.y0 + Math.round((y - CITY_EXTENT.y0) / (CITY.blockH + CITY.road)) * (CITY.blockH + CITY.road);
    const verticalLine = CITY_EXTENT.x0 + Math.round((x - CITY_EXTENT.x0) / (CITY.blockW + CITY.road)) * (CITY.blockW + CITY.road);
    const clampedY = clamp(horizontalLine, CITY_EXTENT.y0, CITY_EXTENT.y1);
    const clampedX = clamp(verticalLine, CITY_EXTENT.x0, CITY_EXTENT.x1);
    const dh = Math.abs(y - clampedY);
    const dv = Math.abs(x - clampedX);
    if (dh <= dv) best = { x: clamp(x, CITY_EXTENT.x0, CITY_EXTENT.x1), y: clampedY, dist: dh };
    else best = { x: clampedX, y: clamp(y, CITY_EXTENT.y0, CITY_EXTENT.y1), dist: dv };
    return best;
  }

  /** A random point on a sidewalk loop, used to fill the city with walkers. */
  randomPedPoint(rng) {
    const loop = this.pedLoops[rng.int(0, this.pedLoops.length - 1)];
    const p = pointOnLoop(loop, rng.next());
    return { x: p.x, y: p.y, loop };
  }

  /** Parked-car candidates near a point, for the player's first steal and scene staging. */
  nearestParkingSpot(x, y) {
    let best = null;
    for (const spot of this.parkingSpots) {
      const d = dist(x, y, spot.x, spot.y);
      if (!best || d < best.d) best = { ...spot, d };
    }
    return best;
  }

  /** Where the player starts: a Marina Flats sidewalk with a car at the kerb and the contact nearby. */
  get startPoint() {
    return { x: PLACES.marisol.x - 96, y: PLACES.marisol.y - 64, angle: 0 };
  }

  /** Mission points exported for the missions module and the minimap. */
  get places() {
    return PLACES;
  }

  /** A rough measure of how built-up a point is, used by the HUD for the district label. */
  buildingCountNear(x, y, radius) {
    let n = 0;
    for (const b of this.buildings) {
      if (rectContains({ x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 }, b.x + b.w / 2, b.y + b.h / 2)) n += 1;
    }
    return n;
  }
}
