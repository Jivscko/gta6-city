// Traffic: cars that follow the road graph, keep their lane, slow for whatever is in front and pick
// a way through each junction, plus the parked cars at the kerb. Stolen traffic cars are handed
// over to the player and the driver runs off on foot.

import { Random, clamp, dist } from './utils.js';
import { makeCar } from './vehicles.js';

const TRAFFIC_COUNT = 46;
const PARKED_COUNT = 26;
const LANE = 28;
const KINDS = [
  { kind: 'sedan', weight: 5 },
  { kind: 'suv', weight: 3 },
  { kind: 'taxi', weight: 2 },
  { kind: 'van', weight: 1.5 },
  { kind: 'sports', weight: 1.2 },
];

export class Traffic {
  constructor(game) {
    this.game = game;
    this.rng = new Random(game.world.seed * 17 + 3);
    this.cars = [];
    this.parked = [];
    this.populate();
  }

  pickKind() {
    const total = KINDS.reduce((s, k) => s + k.weight, 0);
    let roll = this.rng.next() * total;
    for (const k of KINDS) {
      roll -= k.weight;
      if (roll <= 0) return k.kind;
    }
    return 'sedan';
  }

  populate() {
    const world = this.game.world;
    const edges = world.edges;
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      const edge = edges[this.rng.int(0, edges.length - 1)];
      const dir = this.rng.chance(0.5) ? 1 : -1;
      const car = makeCar(this.pickKind(), edge.ax, edge.ay, edge.angle, {
        rng: this.rng,
        driver: 'civilian',
      });
      car.isTraffic = true;
      car.traffic = {
        edgeId: edge.id,
        t: this.rng.range(20, edge.length - 20),
        dir,
        lane: LANE,
        cruise: this.rng.range(74, 112),
        speed: this.rng.range(50, 90),
        blocked: 0,
        pushX: 0,
        pushY: 0,
        drift: 0,
      };
      this.placeOnLane(car);
      this.cars.push(car);
    }

    // Parked cars at the kerb, away from the player's start so the first steal is staged.
    const spots = world.parkingSpots.slice();
    for (let i = spots.length - 1; i > 0; i -= 1) {
      const j = this.rng.int(0, i);
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    let placed = 0;
    for (const spot of spots) {
      if (placed >= PARKED_COUNT) break;
      if (dist(spot.x, spot.y, world.startPoint.x, world.startPoint.y) < 90) continue;
      if (!world.isLand(spot.x, spot.y, 20)) continue;
      const car = makeCar(this.pickKind(), spot.x, spot.y, spot.angle, { rng: this.rng, driver: 'none' });
      car.parked = true;
      this.parked.push(car);
      placed += 1;
    }
  }

  /** Put a traffic car on its lane, including any shove from a collision. */
  placeOnLane(car) {
    const t = car.traffic;
    const edge = this.game.world.edges[t.edgeId];
    const sign = t.dir > 0 ? 1 : -1;
    const hx = edge.dx * sign;
    const hy = edge.dy * sign;
    const sx = t.dir > 0 ? edge.ax : edge.bx;
    const sy = t.dir > 0 ? edge.ay : edge.by;
    const lane = LANE + t.drift;
    car.x = sx + hx * t.t - hy * lane + t.pushX;
    car.y = sy + hy * t.t + hx * lane + t.pushY;
    car.angle = Math.atan2(hy, hx);
    car.vx = hx * t.speed;
    car.vy = hy * t.speed;
    car.speed = t.speed;
  }

  /** Pick the next edge at a junction, preferring to stay straight and never U-turning. */
  nextEdge(edge, dir, nodeId) {
    const world = this.game.world;
    const node = world.nodes[nodeId];
    const cameFrom = dir > 0 ? edge.a : edge.b;
    const options = node.edges.filter((id) => id !== edge.id && !(world.edges[id].a === cameFrom && world.edges[id].b === nodeId));
    if (options.length === 0) return { edge, dir: -dir };
    const straight = options.filter((id) => world.edges[id].axis === edge.axis);
    const pick = this.rng.chance(0.6) && straight.length > 0 ? this.rng.pick(straight) : this.rng.pick(options);
    const next = world.edges[pick];
    return { edge: next, dir: next.a === nodeId ? 1 : -1 };
  }

  /** Is something in the lane just ahead that this car should not drive through? */
  blockedAhead(car, look = 56) {
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const ax = car.x + fx * look;
    const ay = car.y + fy * look;
    const player = this.game.player;
    if (!player.inVehicle) {
      const p = player;
      const dx = p.x - car.x;
      const dy = p.y - car.y;
      if (dx * dx + dy * dy < look * look && dx * fx + dy * fy > 0) return true;
    } else if (player.vehicle) {
      const dx = player.vehicle.x - car.x;
      const dy = player.vehicle.y - car.y;
      if (dx * dx + dy * dy < (look + 22) * (look + 22) && dx * fx + dy * fy > 0) return true;
    }
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      if (dx * dx + dy * dy > (look + 26) * (look + 26)) continue;
      if (dx * fx + dy * fy > 6) return true;
    }
    // A wall or the sea directly ahead: let the junction logic turn instead of ramming.
    const ahead = this.game.world.collideCircle(ax, ay, 16);
    if (ahead && dist(car.x, car.y, ax, ay) < 40) return true;
    return false;
  }

  update(dt) {
    const game = this.game;
    for (const car of this.cars) {
      if (car.dead) continue;
      const t = car.traffic;
      const edge = game.world.edges[t.edgeId];
      t.pushX *= Math.exp(-2.2 * dt);
      t.pushY *= Math.exp(-2.2 * dt);
      t.drift *= Math.exp(-0.8 * dt);

      const blocked = this.blockedAhead(car, 62);
      const scared = dist(car.x, car.y, game.player.x, game.player.y) < 150 && game.player.armed;
      const target = blocked ? 0 : scared ? t.cruise * 1.4 : t.cruise;
      t.speed = clamp(t.speed + (target - t.speed) * Math.min(1, 3.4 * dt), 0, 160);

      if (blocked) {
        t.blocked += dt;
        if (t.blocked > 3 && t.blocked < 3.05 && Math.random() < 0.4) game.audio.horn();
      } else {
        t.blocked = 0;
      }

      t.t += t.speed * dt;
      if (t.t >= edge.length) {
        const nodeId = t.dir > 0 ? edge.b : edge.a;
        const next = this.nextEdge(edge, t.dir, nodeId);
        t.edgeId = next.edge.id;
        t.dir = next.dir;
        t.t = 0;
        const overshoot = Math.max(0, t.t - edge.length);
        t.t += overshoot;
      }
      this.placeOnLane(car);
      car.speed = t.speed;
      if (!blocked && t.speed > 10) {
        car.vx = Math.cos(car.angle) * t.speed;
        car.vy = Math.sin(car.angle) * t.speed;
      }
      // Traffic takes light damage from being shoved around, and gives up when wrecked.
      if (car.health < car.maxHealth && Math.random() < dt * 0.8) game.effects.smoke(car.x, car.y, 1, 0.5);
      if (car.health < 25) this.abandon(car, game);
    }
  }

  /** Every car the player can get into, traffic and parked alike. */
  allCars() {
    return [...this.parked, ...this.cars.filter((c) => !c.dead)];
  }

  nearestEnterable(x, y, range = 78) {
    let best = null;
    for (const car of this.allCars()) {
      const d = Math.hypot(car.x - x, car.y - y);
      if (d <= range && (!best || d < best.d)) best = { car, d };
    }
    return best;
  }

  /** The player has taken this car: pull it out of traffic and send the driver running. */
  steal(car, game) {
    const wasTraffic = car.isTraffic;
    if (wasTraffic) {
      this.cars = this.cars.filter((c) => c !== car);
      car.isTraffic = false;
      car.driver = 'player';
      game.peds.scareAt(car.x, car.y, 2);
      if (game.police.seenByPolice(car.x, car.y, 420)) game.police.reportCrime('carjacking', car.x, car.y);
    } else {
      this.parked = this.parked.filter((c) => c !== car);
      car.driver = 'player';
      car.parked = false;
    }
    car.health = Math.max(45, car.health);
    return car;
  }

  /** Called by a collision: shove a traffic car and make its driver give up if it is wrecked. */
  bump(car, nx, ny, force, game) {
    if (!car.traffic) return;
    car.traffic.pushX += nx * force;
    car.traffic.pushY += ny * force;
    car.traffic.speed *= 0.55;
    if (force > 40) game.effects.sparks(car.x, car.y, Math.atan2(ny, nx), 5, 120);
    if (car.health <= 0) this.abandon(car, game);
  }

  /** A wrecked or abandoned car: the body stays, the driver is gone, the lane is blocked. */
  abandon(car, game) {
    if (!car.traffic) return;
    car.health = 0;
    car.dead = true;
    car.isTraffic = false;
    this.cars = this.cars.filter((c) => c !== car);
    this.parked.push(car);
    car.parked = true;
    car.driver = 'none';
    game.effects.smoke(car.x, car.y, 5, 1);
    if (game.peds) game.peds.scareAt(car.x, car.y, 1);
  }

  /** Parked cars are drawn with their lights off, traffic with them on. */
  draw(ctx, view) {
    for (const car of this.allCars()) {
      if (car.x < view.x - 80 || car.x > view.x + view.w + 80 || car.y < view.y - 80 || car.y > view.y + view.h + 80) continue;
      this.game.sprites.drawCar(ctx, car);
    }
  }
}
