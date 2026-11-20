# gta6-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Jivscko/gta6-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Jivscko/gta6-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Heat** — an original top-down open-world crime game in plain JavaScript and one canvas. Walk a sun-soaked coastal city, steal cars, take three story jobs, carry fists, a pistol and an SMG, and outrun a five-star police response. Every pixel is drawn by the game, every sound is synthesised with the Web Audio API, and no file is loaded from the network.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

`game/` is static: any static file server works (`python3 -m http.server` from `game/` included). There is nothing to build or install — the modules are plain ES modules and the page loads only relative files.

To rebuild the hand-in output and dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| On foot | |
| --- | --- |
| `W A S D` / arrows | Walk |
| `Shift` | Sprint |
| Mouse | Aim |
| Left click | Attack / fire |
| `1` `2` `3` | Fists / pistol / SMG |
| `R` | Reload |
| `E` | Enter or exit a vehicle |

| Driving | |
| --- | --- |
| `W` | Accelerate |
| `S` | Brake / reverse |
| `A` `D` | Steer |
| `Space` | Handbrake |
| `H` | Horn |
| `E` | Exit the car |
| Mouse wheel | Cycle weapon |

| Around the city | |
| --- | --- |
| `Tab` | Mission log |
| `Esc` | Pause menu |
| `Space` / click | Advance dialogue |
| `M` | Mute |
| `F5` | Quick save |

Walk into the gold marker in Marina Flats to start the first job. The three missions — *Sunset Handoff*, *The Orange Vanto* and *Boardwalk Shakedown* — chain from there, pay cash, unlock the SMG and are recorded in the mission log and the browser save.

## What is in here

- `game/js/world.js`, `ground.js`, `cityart.js` — a seeded city grid, painted ground chunks, buildings and beach props.
- `game/js/player.js`, `vehicles.js`, `traffic.js` — on-foot movement, car theft, an arcade driving model and lane-following traffic.
- `game/js/police.js` — a 0–100 heat meter, five wanted stars, spawning cruisers, foot officers, arrest and unseen decay.
- `game/js/missions.js` — three jobs with markers, dialogue, a crew fight, rewards and the mission log.
- `game/js/hud.js` — cash, stars, weapon/ammo, condition bars, minimap, objective card and speed.
- `game/js/audio.js`, `effects.js`, `sprites.js` — synthesised audio, particles, and every shape drawn in code.
- `screenshots/` — four fresh 1280×800 renders: title, on foot, chase, mission dialogue.

---

<sub>Entered on [make.fun](https://make.fun/r/s9rnvy2k?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
