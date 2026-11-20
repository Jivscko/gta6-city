// Solara Heat — a gta6-01 entry (Node 22, standard library only). The playable game is this
// directory's game/ folder: plain static files a desktop browser loads offline (index.html plus its
// ES modules, no library and no network request). This program hands it in: it copies game/ and
// screenshots/ beside this file into $MAKEFUN_OUTPUT_DIR (default /output) and writes dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The game itself: an original top-down open-world crime game in a sun-soaked coastal city —
// walking, sprinting, fists/pistol/SMG combat, car theft, an arcade driving model, traffic and
// pedestrians, a 0..5 star wanted system with spawning police, three story missions with markers,
// dialogue and rewards, a mission log, a browser save, and a HUD with cash, condition, a minimap
// and mission objectives. Four fresh screenshots live in screenshots/, the first by name the cover.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error(`game/index.html is missing: ${gameDir} is not a playable game folder`);
}
if (!existsSync(shotsDir)) {
  throw new Error(`screenshots/ is missing: this entry needs three or four fresh renders`);
}
const shots = readdirSync(shotsDir).filter((name) => /\.(?:png|jpe?g)$/i.test(name)).sort();
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`screenshots/ must hold 3 or 4 PNG/JPEG renders, found ${shots.length}`);
}

// A clean copy each run makes the output and the dossier deterministic: no stale files survive.
// Never clean when the output is this repository itself, so a mistyped MAKEFUN_OUTPUT_DIR cannot
// delete the game folder we are handing in.
mkdirSync(out, { recursive: true });
if (out !== here) {
  rmSync(join(out, 'game'), { recursive: true, force: true });
  rmSync(join(out, 'screenshots'), { recursive: true, force: true });
}
cpSync(gameDir, join(out, 'game'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others
// refuse an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more than
// 993 files in game/ or 48 MiB of game files; a path under game/ over 1000 bytes).
const writeBuffer = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), writeBuffer);

const gameFiles = readdirSync(gameDir, { recursive: true }).length;
const dossierBytes = statSync(join(out, 'dossier.json')).size;
const digest = createHash('sha256').update(writeBuffer).digest('hex');
console.log(`Solara Heat → ${out}`);
console.log(`  game/        ${gameFiles} entries`);
console.log(`  screenshots/ ${shots.join(', ')}`);
console.log(`  dossier.json ${dossierBytes} bytes  sha256 ${digest.slice(0, 16)}…`);
