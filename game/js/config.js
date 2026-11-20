// Tunable constants for Solara Heat: one place for the city's grid, the palette the whole game
// paints from, the weapon table and the player's movement numbers.

/** Internal render size the layout is designed at; the canvas scales to the window from here. */
export const VIEW = { width: 1280, height: 720 };

/** The road grid: blocks sit between the road centrelines, a road is `road` wide. */
export const CITY = {
  margin: 200,
  blockW: 420,
  blockH: 340,
  road: 112,
  cols: 7,
  rows: 5,
};

/** Derived city bounds: the last road centreline, where pavement ends and the beach starts. */
export const CITY_EXTENT = {
  x0: CITY.margin,
  y0: CITY.margin,
  x1: CITY.margin + CITY.cols * (CITY.blockW + CITY.road),
  y1: CITY.margin + CITY.rows * (CITY.blockH + CITY.road),
  get width() {
    return this.x1 + CITY.margin;
  },
  get height() {
    return this.y1 + CITY.margin;
  },
};

/** The map: the city, then the boardwalk, the sand and the bay to the south. */
export const WORLD = {
  width: CITY_EXTENT.width,
  height: 3460,
  boardwalkY: CITY_EXTENT.y1 + CITY.road / 2,
  sandY: CITY_EXTENT.y1 + CITY.road / 2 + 86,
  waterY: 2980,
  pier: { x: 690, y: 2890, w: 132, h: 380 },
  marina: { x: 1570, y: 2950, w: 250, h: 120 },
};

/** A late-afternoon palette: warm concrete, teal bay, coral signage, deep ink for the shadows. */
export const PALETTE = {
  ink: '#101521',
  inkSoft: '#1b2233',
  asphalt: '#2b2f3a',
  asphaltLight: '#343a46',
  sidewalk: '#a89a8a',
  sidewalkEdge: '#8d8172',
  lot: '#6f6a63',
  grass: '#5c7a4b',
  sand: '#d9c093',
  sandDark: '#c7ab7c',
  water: '#1f7f92',
  waterDeep: '#125f76',
  foam: '#bfe3e2',
  shadow: 'rgba(18, 20, 32, 0.34)',
  paint: '#e8d9b0',
  paintCool: '#cfd8d4',
  brick: '#9c5f4a',
  stucco: '#c9a98c',
  glass: '#4f7f92',
  metal: '#77808a',
  roofTar: '#4c4a4a',
  neon: '#ff6b57',
  gold: '#ffcf6b',
  cash: '#7fdc8b',
  health: '#74d68b',
  armor: '#69b7e8',
  policeRed: '#e8556b',
  policeBlue: '#5b8ef0',
  marker: '#ffd35c',
  sky: '#f6c98a',
  blood: '#8d2633',
};

/** The three weapons the player can hold; `melee` ones swing, `auto` ones hold to fire. */
export const WEAPONS = {
  fists: { id: 'fists', name: 'Fists', melee: true, damage: 16, range: 40, rate: 0.32, arc: 1.5 },
  pistol: { id: 'pistol', name: 'Pistol', melee: false, damage: 17, rate: 0.22, clip: 12, spread: 0.035, speed: 1350, range: 900, pellets: 1 },
  smg: { id: 'smg', name: 'SMG', melee: false, auto: true, damage: 10, rate: 0.075, clip: 30, spread: 0.075, speed: 1400, range: 820, pellets: 1 },
};

/** On-foot movement and durability. */
export const PLAYER = {
  radius: 12,
  walkSpeed: 158,
  runSpeed: 248,
  accel: 12,
  friction: 14,
  maxHealth: 100,
  maxArmor: 100,
  respawnFee: 100,
};

/** Drawing scale of a car's collision circle and how hard a ram hurts. */
export const CAR = {
  radius: 15,
  ramDamage: 34,
};

/** Wanted thresholds: heat 0..100 maps to 0..5 stars, each star a band. */
export const WANTED = {
  bands: [10, 28, 48, 68, 88],
  decayDelay: 5.5,
  decayPerSecond: 7.5,
  loseStarHeat: 8,
};

/** Districts: named regions the HUD names under the minimap and the buildings style themselves by. */
export const DISTRICTS = [
  { id: 'palm', name: 'Palm Grove', x0: 0, x1: 1560, y0: 0, y1: 1380, tint: '#7c8a63', tall: 0.25, kind: 'houses' },
  { id: 'old', name: 'Old Solara', x0: 1560, x1: 2980, y0: 0, y1: 1120, tint: '#8b8073', tall: 1, kind: 'towers' },
  { id: 'docks', name: 'Dockworks', x0: 2980, x1: 9999, y0: 0, y1: 1980, tint: '#6d7478', tall: 0.35, kind: 'warehouses' },
  { id: 'neon', name: 'Neon Row', x0: 1560, x1: 2980, y0: 1120, y1: 2600, tint: '#8a6f6d', tall: 0.7, kind: 'shops' },
  { id: 'marina', name: 'Marina Flats', x0: 0, x1: 1560, y0: 1380, y1: 2600, tint: '#7d8578', tall: 0.5, kind: 'apartments' },
  { id: 'beach', name: 'Sunset Beach', x0: 0, x1: 9999, y0: 2600, y1: 9999, tint: '#c9b184', tall: 0, kind: 'beach' },
];

/** Story contact markers and mission destinations, in world coordinates. */
export const PLACES = {
  marisol: { x: 790, y: 2118, name: 'Marisol — Marina Flats' },
  pierDrop: { x: 742, y: 2814, name: 'The old pier' },
  vanto: { x: 2470, y: 1720, name: 'Neon Row lot' },
  garage: { x: 3560, y: 1488, name: 'Dockworks lock-up' },
  boardwalk: { x: 2860, y: 2696, name: 'Boardwalk arcade' },
  hospital: { x: 2110, y: 1330, name: 'Solara General' },
};

/** Every sound is synthesised: these keep the mix in one place. */
export const AUDIO = {
  master: 0.55,
  engine: 0.16,
  siren: 0.1,
  ambience: 0.07,
};

/** The save key; bumping the suffix retires old saves cleanly. */
export const SAVE_KEY = 'solara-heat-save-v1';
