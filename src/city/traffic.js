// Road traffic round the player, on the lane graph (plan/lanes.js):
//  • car following by the Intelligent Driver Model (each driver with their own speed, headway and pace), looking
//    ahead across the junction to the lane beyond, braking for bends, stopping for the player on the road;
//  • junctions: the lights (city/signals.js — stop on red, on amber when it can stop, don't block the box), right turns
//    wait in the junction for a gap in the oncoming traffic (右折待ち) and clear on the change; unsignalled: the road
//    through has priority, streets stop at 止まれ and go when the priority traffic leaves a gap; merges wait their turn;
//  • level crossings: every vehicle stops, goes only when the barriers are up and there is room beyond;
//  • routes chosen a junction ahead (big roads preferred, dead ends avoided), lanes chosen for the next turn and
//    changed when a gap opens, indicators on for turns and lane changes, brake lamps when braking;
//  • vehicles spawn and leave at the edge of a ~420 m circle round the player; on a jump the circle is refilled and
//    run for a few seconds so queues and gaps look settled.
import { buildLanes, lanesNear, linkDist } from '../plan/lanes.js';
import { groundAt } from '../plan/ground.js';
import { prng } from '../plan/geom.js';
import { MAP } from '../plan/terrain.js';
import { VehicleRenderer } from './vehicles/render.js';
import { PAINT, PLATE_KIND } from './vehicles/models.js';
import { plateTile } from './vehicles/plates.js';
import { seated } from './people/looks.js';
import { PART } from './people/body.js';

const R_SIM = 420, R_QUIET = 95, MAX_VEH = 460;            // simulated circle; no spawning nearer than this (in play); cap
/** Vehicle types: model, weight on roads / streets, palette, IDM (a max, comfortable b, headway T, gap s0), speed factor. */
const TYPES = [
  { name: 'keiWagon', road: 12, street: 22, paint: 'kei', a: 1.3, b: 2.2, T: 1.3, s0: 2.0, vf: 0.95 },
  { name: 'keiHatch', road: 6, street: 10, paint: 'kei', a: 1.3, b: 2.2, T: 1.3, s0: 2.0, vf: 0.95 },
  { name: 'compact', road: 16, street: 14, paint: 'car', a: 1.6, b: 2.3, T: 1.2, s0: 2.0, vf: 1.0 },
  { name: 'sedan', road: 12, street: 6, paint: 'car', a: 1.8, b: 2.4, T: 1.1, s0: 2.0, vf: 1.05 },
  { name: 'minivan', road: 14, street: 12, paint: 'car', a: 1.5, b: 2.2, T: 1.3, s0: 2.0, vf: 1.0 },
  { name: 'suv', road: 8, street: 5, paint: 'car', a: 1.7, b: 2.3, T: 1.2, s0: 2.0, vf: 1.03 },
  { name: 'taxi', road: 6, street: 2, paint: 'taxi', a: 1.6, b: 2.3, T: 1.1, s0: 2.0, vf: 1.0 },
  { name: 'taxiSedan', road: 3, street: 1, paint: 'taxiSedan', a: 1.6, b: 2.3, T: 1.1, s0: 2.0, vf: 1.0 },
  { name: 'police', road: 0.5, street: 0.2, paint: 'police', a: 1.8, b: 2.4, T: 1.2, s0: 2.0, vf: 1.0 },
  { name: 'van', road: 5, street: 4, paint: 'work', a: 1.3, b: 2.1, T: 1.4, s0: 2.2, vf: 0.95 },
  { name: 'keiTruck', road: 3, street: 6, paint: 'work', a: 1.2, b: 2.0, T: 1.4, s0: 2.2, vf: 0.9 },
  { name: 'boxTruck', road: 4, street: 0.5, paint: 'work', a: 0.9, b: 1.8, T: 1.6, s0: 2.5, vf: 0.9 },
  { name: 'bus', road: 2.5, street: 0, paint: 'bus', a: 0.8, b: 1.6, T: 1.7, s0: 2.5, vf: 0.85 },
  // two-wheelers: 50 cc ones keep to 30 km/h and don't turn right across big junctions (二段階右折); all keep left in the lane
  { name: 'scooter', road: 3, street: 5, paint: 'moto', a: 1.5, b: 2.6, T: 1.0, s0: 1.6, vf: 0.95, vcap: 8.3, moto: true },
  { name: 'cub', road: 1.5, street: 3, paint: 'cub', a: 1.4, b: 2.6, T: 1.0, s0: 1.6, vf: 0.95, vcap: 8.3, moto: true },
  { name: 'delivery', road: 1.2, street: 2.2, paint: 'delivery', a: 1.3, b: 2.5, T: 1.1, s0: 1.6, vf: 0.9, vcap: 8.3, moto: true },
  { name: 'bike250', road: 2, street: 0.6, paint: 'moto', a: 2.2, b: 3.0, T: 0.9, s0: 1.6, vf: 1.05, moto: true },
];
/** Vehicles per metre of lane, by class (a late spring afternoon). */
const DENSITY = { national: 0.024, arterial: 0.02, collector: 0.013, old: 0.01, street: 0.0028 };
const CLASS_W = { national: 3, arterial: 2.6, collector: 1.8, old: 1.3, street: 0.45 };
const TURN_W = { S: 1, L: 0.34, R: 0.3, U: 0.02 };

export class Traffic {
  constructor(ctx, { signals, crossings } = {}) {
    this.ctx = ctx; this.signals = signals; this.crossings = crossings;
    this.G = buildLanes();
    this.render = new VehicleRenderer(ctx, { keiWagon: 110, keiHatch: 60, compact: 110, sedan: 80, minivan: 100, suv: 60, taxi: 60, taxiSedan: 30, police: 6, van: 40, keiTruck: 40, boxTruck: 30, bus: 16, scooter: 36, cub: 24, delivery: 14, bike250: 24 });
    this.root = this.render.root;
    this.dims = {}; for (const T of TYPES) this.dims[T.name] = this.render.dims(T.name);
    this.veh = []; this.parked = []; this.rng = prng(0x7aff1c); this.nextId = 1; this.spawnT = 0; this.center = null; this.t = 0; this.count = {};
    this.hooks = []; this._dist = new Map();                          // (the rotary: city/rotary.js); route-finding tables
    // level crossings: the crossing object for each lane's lx record (by position)
    if (crossings) for (const L of this.G.links) for (const x of L.lx) {
      const q = L.way.align.at(x.s); let best = null, bd = 30;
      for (const it of crossings.items) { const d = Math.hypot(it.c.x - q.x, it.c.z - q.z); if (d < bd) { bd = d; best = it; } }
      x.item = best;
    }
    // the player can't walk through a vehicle
    ctx.physics.addDynamic(() => {
      const P = ctx.player && ctx.player.position, out = []; if (!P) return out;
      // (the body's middle lies off the axles' by the difference of the overhangs)
      const box = (v) => { const o = v.fo + v.wb / 2 - v.L / 2; out.push({ cx: v.x + Math.sin(v.yaw) * o, cz: v.z + Math.cos(v.yaw) * o, w: v.W, d: v.L, rotY: v.yaw, y0: v.y - 1, y1: v.y + v.H }); };
      for (const v of this.veh) if (Math.abs(v.x - P.x) < 18 && Math.abs(v.z - P.z) < 18) box(v);
      for (const v of this.parked) if (Math.abs(v.x - P.x) < 18 && Math.abs(v.z - P.z) < 18) box(v);
      return out;
    });
  }

  /** A vehicle standing still somewhere (the taxi pool, the bus berths). */
  addParked(name, x, z, yaw, color) {
    const d = this.render.dims(name), y = groundAt(x, z) + 0.06;
    this.parked.push({ name, x, y, z, yaw, color, L: d.L, W: d.W, H: d.H, fo: d.fo, wb: d.wb, plate: plateTile(PLATE_KIND[name] ?? 'white', this.rng) });
  }

  // ---------------------------------------------------------------- positions on the graph
  /** Point + heading at u along an element (lane or connector) → o { x, y, z, hx, hz }. */
  pos(el, u, o) {
    if (el.link) {                                                               // a lane
      const L = el.link, w = L.way, s = Math.max(0, Math.min(w.length, el.sOf(Math.max(0, Math.min(el.len, u))))), q = w.align.at(s);
      o.x = q.x - q.hz * el.d; o.z = q.z + q.hx * el.d; o.hx = q.hx * L.dir; o.hz = q.hz * L.dir;
      o.y = w.kind === 'road' ? w.yAt(s) + 0.06 : groundAt(o.x, o.z) + 0.06;
      return o;
    }
    const c = el, cum = c.cum, pts = c.pts, uu = Math.max(0, Math.min(c.len, u));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= uu) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, t = (uu - cum[lo]) / seg, a = pts[lo], b = pts[hi];
    o.x = a[0] + (b[0] - a[0]) * t; o.z = a[1] + (b[1] - a[1]) * t;
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
    if (l > 1e-6) { o.hx = dx / l; o.hz = dz / l; } else { const p = this.pos(c.to, 0, {}); o.hx = p.hx; o.hz = p.hz; }
    if (c.y0 === undefined) { c.y0 = this.pos(c.from, c.from.len, {}).y; c.y1 = this.pos(c.to, 0, {}).y; }
    o.y = c.len > 0 ? c.y0 + (c.y1 - c.y0) * (uu / c.len) : c.y0;
    return o;
  }
  /** Point at u along the vehicle's path, looking back into the element before when u < 0. */
  pathPos(v, u, o) {
    if (u >= 0 || !v.prev) return this.pos(v.el, u, o);
    return this.pos(v.prev, v.prev.len + u, o);
  }

  // ---------------------------------------------------------------- the model
  idm(v, v0, s, vl, s0 = v.s0) {
    const sStar = s0 + Math.max(0, v.v * v.T + (v.v * (v.v - vl)) / (2 * Math.sqrt(v.a * v.b)));
    return v.a * (1 - Math.pow(v.v / Math.max(v0, 0.1), 4) - (sStar / Math.max(s, 0.05)) ** 2);
  }
  /** Gap to the vehicle ahead (its rear), and its speed. */
  leader(v) {
    const el = v.el, i = el.veh.indexOf(v);
    let best = Infinity, bv = 0;
    if (i >= 0 && i + 1 < el.veh.length) { const l = el.veh[i + 1]; best = l.u - l.L - v.u; bv = l.v; }
    // vehicles that have moved on but whose tail is still here
    for (const l of el.tail) { if (l === v) continue; const g = el.len + (l.u - l.L) - v.u; if (g > -0.5 && g < best) { best = g; bv = l.v; } }
    // on a connector: others that left the same lane by a neighbouring connector are still in the way at first
    if (!el.link && v.u < 14) for (const c of el.from.out) {
      if (c === el) continue;
      for (const l of c.veh) { if (l.u > v.u && l.u < 16) { const g = l.u - l.L - v.u; if (g < best) { best = g; bv = l.v; } } }
    }
    if (best < Infinity) return [best, bv];
    let dist = el.len - v.u, next = el.link ? v.next : el.to, hops = 0;
    while (next && dist < 140 && hops < 3) {
      if (next.veh.length) { const l = next.veh[0]; return [dist + l.u - l.L, l.v]; }
      dist += next.len; next = next.link ? null : next.to; hops++;
    }
    return [Infinity, 0];
  }
  /** Can v, at the end of its lane, go into its connector now? */
  canEnter(v, t) {
    const lane = v.el, L = lane.link, c = v.next; if (!c) return false;
    if (L.control === 'signal' && this.signals) {
      const st = this.signals.vehState(L.node.id, L.group, t);
      if (st === 'r') return false;
      if (st === 'y' && L.stopAt - v.u > (v.v * v.v) / (2 * 3.5) + 0.5) return false;
    }
    if (L.control === 'stop' && v.stopT < 0.8) return false;
    // don't block the junction: room on the lane beyond
    const out = c.to.veh[0]; if (out && out.u - out.L < v.L + 1.5 && out.v < 1.5) return false;
    const clearT = (ua) => (ua + v.L) / Math.max(v.v, 1.5);                              // how long v needs to get past a point
    for (const cf of c.conflicts) {
      const c2 = cf.c;
      for (const w of c2.veh) {
        if (w.u - w.L > cf.ub + 1) continue;                                                // already past
        if (cf.merge ? w.u > cf.ub - 2 : w.u > cf.ub - 2.5) return false;                  // in the conflict zone now
        if (w.v > 0.5 && (cf.ub - w.u) / w.v < clearT(cf.ua) + 0.5) return false;          // moving, and gets there first
      }
      if (!cf.yields) continue;
      if (c.kind === 'R' && L.control === 'signal' && !cf.merge) continue;          // waits inside the junction instead
      // the gap it needs: to get through (from a standstill it takes a while) plus a margin
      const need = Math.min(8, (cf.ua + v.L) / Math.max(v.v, 1.2) * (v.v < 2 ? 0.8 : 1) + (cf.merge ? 2.0 : 1.5));
      if (this.approaching(c2, cf.ub, t, need)) return false;
    }
    return true;
  }
  /** Is someone about to drive through connector c2 (reaching distance ub along it within tmax s) with right of way? */
  approaching(c2, ub, t, tmax) {
    const l2 = c2.from, L2 = l2.link;
    if (L2.control === 'stop') return false;
    if (L2.control === 'signal' && this.signals && this.signals.vehState(L2.node.id, L2.group, t) === 'r') return false;
    for (let k = l2.veh.length - 1; k >= 0 && k >= l2.veh.length - 2; k--) {
      const w = l2.veh[k]; if (w.next !== c2) continue;
      const dist = l2.len - w.u + ub;
      if (dist / Math.max(w.v, 1.5) < tmax) return true;
    }
    return false;
  }
  /** People walking at the edge of the street v is on (no sidewalks): the distance to one in its way (follow them), and
   *  whether it passes someone close (then slowly). */
  streetPeds(v) {
    const el = v.el, Pd = this.peds; if (!Pd || !el.link || el.link.cls !== 'street') return null;
    const edges = Pd.edgesOfWay(el.link.way); if (!edges) return null;
    const hx = Math.sin(v.yaw), hz = Math.cos(v.yaw), front = v.fo + v.wb / 2; let best = Infinity, slow = false;
    for (const e of edges) for (const p of e.peds) {
      const dx = p.x - v.x, dz = p.z - v.z; if (Math.abs(dx) > 24 || Math.abs(dz) > 24) continue;
      const along = dx * hx + dz * hz - front, side = Math.abs(-dx * hz + dz * hx);
      if (along < -v.L || along > 20) continue;
      const clear = side - v.W / 2;
      if (clear < 0.15 && along > -0.5) best = Math.min(best, along - 1.2);
      else if (clear < 0.7) slow = true;
    }
    return { best, slow };
  }
  /** Distance to a crossing ahead (this element, the next, the one after) where someone is walking across v's path. */
  pedAhead(v) {
    const Pd = this.peds; if (!Pd) return Infinity;
    let best = Infinity, el = v.el, base = -v.u;
    for (let hop = 0; hop < 3 && el && base < 40; hop++) {
      if (el.pedX) for (const x of el.pedX) {
        const d = base + x.uEl;
        if (d < 1.2 || d > 40) continue;                                                   // on it already: carry on through
        if (Pd.occupied(x.e, x.uZ)) best = Math.min(best, d - 2.8);
      }
      base += el.len;
      el = el.link ? (hop === 0 ? v.next : null) : el.to;
    }
    return best;
  }
  /** Distance to where v must stop (Infinity: none). */
  stopAhead(v, t) {
    const pd = this.pedAhead(v);
    const d0 = this.stopAhead0(v, t);
    return pd < Infinity ? Math.min(d0, Math.max(0.05, pd)) : d0;
  }
  stopAhead0(v, t) {
    const el = v.el;
    if (el.link) {
      let d = Infinity;
      const L = el.link;
      // a stop on this lane (a bus berth, the head of the taxi queue): pull up there, wait till it may go
      const st = v.stops && v.stops[0];
      if (st && st.lane === el) {
        const dist = st.u - v.u;
        if (dist < 1.2 && v.v < 0.3) {
          if (!st.at) { st.at = true; st.t = 0; if (st.arrive) st.arrive(v, st); }
          st.t += this.dt;
          if (st.t >= st.dwell && (!st.ready || st.ready(v, st))) { v.stops.shift(); v.lcBlink = 2; v.lcT = 2.5; if (st.depart) st.depart(v, st); }
          else d = Math.max(0.05, dist);
        } else if (dist > -2) d = Math.max(0.05, dist);
      }
      for (const x of L.lx) {                                                          // level crossings: always stop, go when clear
        if (v.u > x.u + 0.8 || v.lxPassed === x) continue;
        const dist = x.u - v.u;
        if (dist < 1.2 && v.v < 0.3) { v.lxWait = (v.lxWait || 0) + this.dt; if (v.lxWait > 1.2 && this.lxClear(x, v, el)) { v.lxPassed = x; v.lxWait = 0; continue; } }
        d = Math.min(d, dist);
      }
      if (v.target && v.target !== el && el.len - v.u < 30) d = Math.min(d, el.len - 12 - v.u);   // lane change still to do
      if (!v.next) return Math.min(d, el.len - 1 - v.u);                                  // nowhere to go
      if (v.u <= L.stopAt + 0.3 && L.control !== 'free') {
        const dist = L.stopAt - v.u;
        if (dist < 40 + v.v * v.v / 3) {
          if (dist < 1.0 && v.v < 0.25) v.stopT += this.dt; else if (dist > 3) v.stopT = 0;
          if (!this.canEnter(v, t)) d = Math.min(d, dist);
        }
      }
      return d;
    }
    const c = el;
    let d = Infinity;
    // in the junction: before each crossing point, let whoever gets there first (or has the right of way) go first
    for (const cf of c.conflicts) {
      if (v.u > cf.ua - (cf.merge ? v.L + 1 : 2.5)) continue;
      const tv = (cf.ua - v.u) / Math.max(v.v, 1);
      for (const w of cf.c.veh) {
        if (w.u - w.L > cf.ub + 1) continue;                                                // it has cleared the point
        if (w.v < 0.3 && w.u < cf.ub - 2.5) continue;                                       // standing back (giving way itself)
        // the same comparison from both sides (the right of way worth 1.5 s), so exactly one of the two waits
        const inZone = w.u > cf.ub - 2.5, tw = (cf.ub - w.u) / Math.max(w.v, 1) + (cf.yields ? 0 : 1.5), tvv = tv + (cf.yields ? 1.5 : 0);
        if (inZone || tw < tvv || (tw === tvv && w.id < v.id)) { d = Math.min(d, cf.ua - (cf.merge ? v.L + 1.5 : 3) - v.u); break; }
      }
    }
    // the lights of the junction just beyond (close junctions): stop in time for them too
    const Lb = c.to.link;
    if (Lb.control === 'signal' && this.signals && Lb.stopAt < 25) {
      const st = this.signals.vehState(Lb.node.id, Lb.group, t), dd = c.len - v.u + Lb.stopAt;
      if (st === 'r' || (st === 'y' && dd > (v.v * v.v) / 7 + 0.5)) d = Math.min(d, Math.max(0.1, dd));
    }
    // a right turn at the lights waits for a gap in the oncoming traffic
    if (c.kind === 'R' && c.from.link.control === 'signal' && !v.cleared) {
      let uw = Infinity;
      for (const cf of c.conflicts) if (cf.yields && !cf.merge) uw = Math.min(uw, cf.ua - 2.5);
      if (uw < Infinity && v.u < uw + 0.5) {
        let clear = true;
        for (const cf of c.conflicts) {
          if (!cf.yields || cf.merge) continue;
          for (const w of cf.c.veh) if (w.u - w.L < cf.ub + 2 && w.u > cf.ub - 30) clear = false;
          if (clear && this.approaching(cf.c, cf.ub, t, 4.5)) clear = false;
          if (!clear) break;
        }
        if (clear) v.cleared = true; else return Math.min(d, Math.max(0.1, uw - v.u));
      }
    }
    return d < Infinity ? Math.max(0.05, d) : Infinity;
  }
  lxClear(x, v, lane) {
    const it = x.item; if (it && (it.active || it.down > 0.05)) return false;
    for (const w of lane.veh) if (w.u > x.uEnd && w.u - w.L - x.uEnd < v.L + 2) return false;   // room beyond
    return true;
  }

  // ---------------------------------------------------------------- routing and lanes
  /** Choose the connector at the end of lane `ln`'s link; returns it (and sets v.target when another lane is needed). */
  route(v, ln) {
    const L = ln.link, opts = [];
    // on the way somewhere (v.plan: the links to reach, in turn): the connector on the shortest way to the next
    if (v.plan && v.plan.length) {
      const D = this.distTo(v.plan[0], v.type.street === 0);
      let pick = null, best = Infinity;
      for (const l of L.lanes) for (const c of l.out) {
        const d = D[c.to.link.id]; if (!(d < Infinity)) continue;
        const cost = c.len + d + (l === ln ? 0 : L.len < 35 ? 40 : 8);
        if (cost < best) { best = cost; pick = c; }
      }
      if (pick) { v.next = pick; v.target = pick.from === ln ? null : pick.from; v.waitLC = 0; v.blink = pick.kind === 'L' ? 1 : pick.kind === 'R' ? 2 : 0; return pick; }
      v.plan = null;                                                                      // no way there from here
    }
    let tot = 0;
    for (const l of L.lanes) for (const c of l.out) {
      const Lo = c.to.link;
      if (Lo.private && !L.private) continue;                                              // the station's own lanes
      let w = TURN_W[c.kind] * (CLASS_W[Lo.cls] ?? 0.4);
      if (Lo.cls === 'street' && v.type.street === 0) w *= 0.01;                          // buses keep to the roads
      const end = c.to.link.to; if (!end || (end.plain && end.arms.length < 2)) w *= 0.03;   // into a dead end / off the map
      if (Lo.way === L.way) w *= 1.8;                                                      // carry on along the same way
      if (l !== ln && c.kind !== 'S' && L.len < 35) w *= 0.15;                             // no time to change lanes
      if (v.type.vcap && c.kind === 'R' && L.control === 'signal' && L.lanes.length >= 2) w *= 0.02;   // 原付: 二段階右折
      opts.push([c, w]); tot += w;
    }
    if (!opts.length) { v.next = null; v.target = null; return null; }
    let x = this.rng() * tot, pick = opts[0][0];
    for (const [c, w] of opts) { x -= w; if (x <= 0) { pick = c; break; } }
    // straight on: stay in lane if it goes that way
    if (pick.kind === 'S' && pick.from !== ln) { const same = ln.out.find(c => c.to.link === pick.to.link); if (same) pick = same; }
    v.next = pick; v.target = pick.from === ln ? null : pick.from; v.waitLC = 0;
    v.blink = pick.kind === 'L' ? 1 : pick.kind === 'R' ? 2 : 0;
    return pick;
  }
  /** Driving distances to link `goal` from every link (cached): buses keep off the streets; nobody passes through the
   *  station's private lanes except to a goal among them. */
  distTo(goal, bus = false) {
    const key = goal.id * 2 + (bus ? 1 : 0);
    let D = this._dist.get(key);
    if (!D) { D = linkDist(goal, (L) => (!L.private || L.private === goal.private) && !(bus && L.cls === 'street' && !L.private)); this._dist.set(key, D); }
    return D;
  }
  tryLaneChange(v) {
    const el = v.el, L = el.link, tk = v.target.k, k = el.k, step = tk > k ? 1 : -1, to = L.lanes[k + step];
    if (!to) { v.target = null; return; }
    let ahead = null, behind = null;
    for (const w of to.veh) { if (w.u >= v.u) { if (!ahead || w.u < ahead.u) ahead = w; } else if (!behind || w.u > behind.u) behind = w; }
    const gA = ahead ? ahead.u - ahead.L - v.u : 1e9, gB = behind ? v.u - v.L - behind.u : 1e9;
    if (gA < Math.max(4, v.v * 0.9) || gB < Math.max(4, (behind ? behind.v : 0) * 1.1)) return;
    // move across: keep the drawn position continuous and ease into the new lane
    el.veh.splice(el.veh.indexOf(v), 1);
    let i = 0; while (i < to.veh.length && to.veh[i].u < v.u) i++;
    to.veh.splice(i, 0, v);
    v.lat += L.dir * (el.d - to.d); v.el = to; v.lcBlink = step > 0 ? 2 : 1; v.lcT = 2.5;
    if (to === v.target) v.target = null;
  }

  // ---------------------------------------------------------------- spawn / leave
  pickType(onStreet, near) {
    const w = (T) => (this.count[T.name] >= this.render.models[T.name].n ? 0 : (onStreet ? T.street : T.road) * (T.name.startsWith('taxi') && near ? 2.5 : 1));
    let tot = 0; for (const T of TYPES) tot += w(T);
    if (tot <= 0) return null;
    let x = this.rng() * tot;
    for (const T of TYPES) { x -= w(T); if (x <= 0) return T; }
    return null;
  }
  paintOf(T) {
    const P = PAINT[T.paint]; let tot = 0; for (const [, w] of P) tot += w;
    let x = this.rng() * tot; for (const [c, w] of P) { x -= w; if (x <= 0) return c; } return P[0][0];
  }
  spawn(ln, u, v0) {
    const onStreet = ln.link.cls === 'street';
    if (onStreet && ln.link.way.cw * 2 < 4.8 && this.rng() < 0.5) return null;
    const q = this.pos(ln, u, {}), hub = Math.hypot(q.x + 420, q.z + 150) < 500;
    if (this.veh.length >= MAX_VEH || !ln.out.length) return null;
    const T = this.pickType(onStreet, hub); if (!T) return null;
    const d = this.dims[T.name];
    if (u < d.L) return null;
    for (const w of ln.veh) if (Math.abs(w.u - u) < d.L + 8) return null;
    return this.make(T, ln, u, v0, q);
  }
  /** A vehicle of type T on lane ln at u (its front), moving at v0 (default: most of the limit). */
  make(T, ln, u, v0, q = this.pos(ln, u, {}), extra = null) {
    const r = this.rng, d = this.dims[T.name];
    const v = { id: this.nextId++, type: T, name: T.name, color: this.paintOf(T), L: d.L, W: d.W, H: d.H, wb: d.wb, rt: d.rt, fo: d.fo, plate: plateTile(PLATE_KIND[T.name] ?? 'white', this.rng),
      a: T.a * (0.85 + r() * 0.3), b: T.b, T: T.T * (0.85 + r() * 0.35), s0: T.s0, vf: T.vf * (0.9 + r() * 0.18),
      v: 0, u, el: ln, prev: null, next: null, target: null, lat: 0, stopT: 0, cleared: false, spin: r() * 6, acc: 0, blink: 0, lcBlink: 0, lcT: 0,
      x: q.x, y: q.y, z: q.z, yaw: Math.atan2(q.hx, q.hz), brake: 0, latK: T.moto ? -0.8 - r() * 0.3 : 0, roll: 0 };
    v.v = Math.min(v0 ?? ln.link.vmax * 0.8, ln.link.vmax) * v.vf;
    if (extra) Object.assign(v, extra);
    if (v.station && ln.link.private) v.station.inside = true;
    if (v.plan && v.plan[0] === ln.link) v.plan.shift();
    let i = 0; while (i < ln.veh.length && ln.veh[i].u < u) i++;
    ln.veh.splice(i, 0, v); this.veh.push(v); this.count[T.name] = (this.count[T.name] || 0) + 1;
    this.route(v, ln);
    return v;
  }
  /** Put a vehicle of the named type on lane ln at u, with extra state (a plan, stops) — for the rotary. */
  spawnAt(name, ln, u, v0 = 0, extra = null) {
    const T = TYPES.find(t => t.name === name); if (!T || (this.count[name] || 0) >= this.render.models[name].n) return null;
    return this.make(T, ln, u, v0, undefined, extra);
  }
  remove(v) {
    const a = v.el.veh, i = a.indexOf(v); if (i >= 0) a.splice(i, 1);
    if (v.prev) { const j = v.prev.tail.indexOf(v); if (j >= 0) v.prev.tail.splice(j, 1); }
    const k = this.veh.indexOf(v); if (k >= 0) { this.veh.splice(k, 1); this.count[v.name]--; }
    for (const h of this.hooks) if (h.removed) h.removed(v);
  }
  inMap(x, z) { return x > MAP.x0 + 5 && x < MAP.x1 - 5 && z > MAP.z0 + 5 && z < MAP.z1 - 5; }
  /** Top up the circle round (px, pz) to its share of traffic: the shortfall is dealt out over the lanes by their
   *  expected share (a lane's length × its class's density), never nearer the player than `quiet`. */
  populate(px, pz, quiet, frac = 1) {
    const cand = [], cum = []; let want = 0;
    for (const ln of lanesNear(px, pz, R_SIM)) {
      const q = this.pos(ln, ln.len / 2, this._q || (this._q = {}));
      if (Math.hypot(q.x - px, q.z - pz) > R_SIM || !this.inMap(q.x, q.z) || !ln.out.length) continue;
      if (ln.link.private) continue;                                                       // (the rotary fills those)
      want += ln.len * (DENSITY[ln.link.cls] ?? 0.003); cand.push(ln); cum.push(want);
    }
    let short = Math.min(MAX_VEH, Math.round(want * frac)) - this.veh.length;
    for (let tries = 0; short > 0 && tries < short * 4 + 8; tries++) {
      const x = this.rng() * want; let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; }
      const ln = cand[lo], u = 3 + this.rng() * Math.max(0, ln.len - 6), q = this.pos(ln, u, {});
      const dp = Math.hypot(q.x - px, q.z - pz);
      if (dp > R_SIM || dp < quiet) continue;
      if (this.spawn(ln, u)) short--;
    }
  }

  // ---------------------------------------------------------------- the step
  update(dt, t, P) {
    if (!this.G) return;
    if (this.enabled === false) { this.draw(t, 0); return; }                               // (a showroom / debug view)
    this.t = t;
    const px = P ? P.x : 0, pz = P ? P.z : 0;
    if (!this.center || Math.hypot(px - this.center[0], pz - this.center[1]) > 60) this.resettle(px, pz, t);   // a jump
    this.center = [px, pz];
    if (dt > 0) this.step(Math.min(dt, 0.1), t, px, pz);
    this.draw(t, dt);
  }
  resettle(px, pz, t) {
    for (const v of [...this.veh]) if (Math.hypot(v.x - px, v.z - pz) > R_SIM) this.remove(v);
    this.center = [px, pz];
    this.populate(px, pz, 0, 1);
    for (const h of this.hooks) if (h.resettle) h.resettle(px, pz, t);
    for (let i = 0; i < 80; i++) this.step(0.15, t - (80 - i) * 0.15, px, pz, true);          // let it settle
    for (const v of this.veh) this.place(v);
  }
  step(dt, t, px, pz, warm = false) {
    this.dt = dt;
    const P = this.ctx.player && this.ctx.player.position;
    // keep each element's list ordered by position
    const seen = new Set();
    for (const v of this.veh) { const a = v.el.veh; if (seen.has(a)) continue; seen.add(a); if (a.length > 1) a.sort((p, q) => p.u - q.u); }
    // accelerations
    for (const v of this.veh) {
      const el = v.el;
      let v0 = (el.link ? el.link.vmax : Math.min(el.vmax, el.to.link.vmax)) * v.vf;
      if (v.type.vcap) v0 = Math.min(v0, v.type.vcap * (0.95 + (v.id % 7) * 0.02));
      let a = v.a * (1 - Math.pow(v.v / Math.max(v0, 0.1), 4));
      // a slower connector ahead: arrive at its speed
      if (el.link && v.next) { const dc = el.len - v.u, vc = v.next.vmax * v.vf; if (vc < v.v && dc < 60) a = Math.min(a, (vc * vc - v.v * v.v) / (2 * Math.max(dc, 1)) * 1.2); }
      const [gap, vl] = this.leader(v);
      if (gap < Infinity) a = Math.min(a, this.idm(v, v0, gap, vl));
      const ds = this.stopAhead(v, t);
      if (ds < Infinity) a = Math.min(a, this.idm(v, v0, Math.max(0.05, ds), 0, 0.4));
      // people walking along a street without sidewalks: pass slowly, or follow
      const sp = this.streetPeds(v);
      if (sp) { if (sp.slow) { v0 = Math.min(v0, 3.2); a = Math.min(a, v.a * (1 - Math.pow(v.v / 3.2, 4))); } if (sp.best < Infinity) a = Math.min(a, this.idm(v, v0, Math.max(0.05, sp.best), 0, 0.5)); }
      // the player standing in the way
      if (P && !warm && Math.abs(P.x - v.x) < 30 && Math.abs(P.z - v.z) < 30) {
        const hx = Math.sin(v.yaw), hz = Math.cos(v.yaw), dx = P.x - v.x, dz = P.z - v.z, along = dx * hx + dz * hz - v.fo - v.wb / 2, side = Math.abs(-dx * hz + dz * hx);
        if (along > -0.5 && along < 25 && side < v.W / 2 + 0.6) a = Math.min(a, this.idm(v, v0, Math.max(0.05, along - 1.2), 0, 0.5));
      }
      v.acc = Math.max(-8, Math.min(v.a, a));
    }
    // motion and hand-over between elements
    for (const v of [...this.veh]) {
      v.v = Math.max(0, v.v + v.acc * dt);
      v.u += v.v * dt;
      if (v.v < 0.25) v.stopped = (v.stopped || 0) + dt; else v.stopped = 0;
      // the tail left behind clears once the rear is past the element's start
      if (v.prev && v.u - v.L > 0) { const j = v.prev.tail.indexOf(v); if (j >= 0) v.prev.tail.splice(j, 1); v.prev = null; }
      while (v.u > v.el.len) {
        const el = v.el;
        let nx = el.link ? v.next : el.to;
        if (!nx) { v.u = el.len; v.v = 0; break; }
        if (el.link && v.target) { v.u = el.len; v.v = 0; break; }                         // missed its lane: wait
        const over = v.u - el.len;
        el.veh.splice(el.veh.indexOf(v), 1);
        if (v.prev) { const j = v.prev.tail.indexOf(v); if (j >= 0) v.prev.tail.splice(j, 1); }
        el.tail.push(v); v.prev = el;
        v.el = nx; v.u = over; nx.veh.unshift(v);
        v.cleared = false; v.stopT = 0; v.lxPassed = null;
        if (nx.link) {
          if (v.plan && v.plan[0] === nx.link) v.plan.shift();
          if (v.station) {                                                                 // the station's own: in, and out onto the street
            if (nx.link.private) v.station.inside = true;
            else if (v.station.inside) { for (const h of this.hooks) if (h.left) h.left(v); v.station = null; }
          }
          this.route(v, nx); if (!v.next && !warm && Math.hypot(v.x - px, v.z - pz) > 60) { this.remove(v); break; }
        }
      }
      if (v.el.link && v.target) { v.waitLC = (v.waitLC || 0) + dt; this.tryLaneChange(v); if (v.target && v.waitLC > 9 && v.v < 0.5) { this.route(v, v.el); if (v.target) { v.next = v.el.out.find(c => !c.to.link.private || v.el.link.private) || null; v.target = null; } } }
      if (v.lcT > 0) v.lcT -= dt; else v.lcBlink = 0;
      v.lat *= Math.exp(-dt / 0.8); if (Math.abs(v.lat) < 0.01) v.lat = 0;
      v.spin += (v.v * dt) / v.rt;
      if (!warm) this.place(v);
      // leave: out of the circle, off the map, stuck for long far away
      const dp = Math.hypot(v.x - px, v.z - pz);
      if (dp > R_SIM + 60 || (!this.inMap(v.x, v.z) && dp > 80) || (v.stopped > 45 && dp > 120 && !v.station)) this.remove(v);
    }
    for (const h of this.hooks) if (h.step) h.step(dt, t, warm);
    // top up now and then (never in sight of the player)
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.6; this.populate(px, pz, warm ? 0 : R_QUIET, 1); }
  }
  /** World pose of v from its axles on the path. */
  place(v) {
    const fo = v.fo, f = this.pathPos(v, v.u - fo, this._f || (this._f = {})), r = this.pathPos(v, v.u - fo - v.wb, this._r || (this._r = {}));
    let dx = f.x - r.x, dz = f.z - r.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const lat = v.lat + (v.latK || 0);
    v.x = (f.x + r.x) / 2 - dz * lat; v.z = (f.z + r.z) / 2 + dx * lat;               // lat: to the right of travel (a lane change easing out; two-wheelers keep left)
    v.y = (f.y + r.y) / 2 + 0.005;
    const yaw = Math.atan2(dx, dz);
    if (v.type.moto && this.dt) { let dy = yaw - v.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; const want = Math.max(-0.5, Math.min(0.5, -Math.atan(v.v * (dy / this.dt) / 9.8))); v.roll += (want - v.roll) * 0.25; }
    v.yaw = yaw; v.pitch = Math.atan2(f.y - r.y, v.wb);
    v.steer = Math.max(-0.5, Math.min(0.5, Math.atan2(f.hx * dz - f.hz * dx, f.hx * dx + f.hz * dz) * 1.6));
  }
  draw(t, dt) {
    const R = this.render; R.begin();
    const blinkOn = (Math.floor(t * 3.2) & 1) === 1;
    for (const v of this.veh) {
      const brake = v.acc < -1.2 || (v.v < 0.3 && v.stopped > 0.3) ? 1 : 0;
      v.brake = dt > 0 ? v.brake + (brake - v.brake) * Math.min(1, dt * 12) : brake;
      const near = v.el.link && v.next && v.next.kind !== 'S' && v.el.len - v.u < 35, onTurn = !v.el.link && v.el.kind !== 'S';
      const st = v.stops && v.stops[0], pulling = st && st.lane === v.el && st.u - v.u < 22 && st.blink !== false;
      const side = v.lcBlink || (pulling ? 1 : (near || onTurn) ? v.blink : 0);
      R.add(v.name, v.x, v.y, v.z, v.yaw, v.pitch, v.color, v.brake, side === 1 && blinkOn ? 1 : 0, side === 2 && blinkOn ? 1 : 0, v.spin, v.steer, v.plate, v.roll || 0);
    }
    for (const v of this.parked) R.add(v.name, v.x, v.y, v.z, v.yaw, 0, v.color, 0, 0, 0, 0, 0, v.plate);
    R.end();
  }
  /** Drivers (and a passenger now and then) in the vehicles near the player, drawn by the people renderer. */
  drivers(R) {
    const P = this.ctx.player && this.ctx.player.position; if (!P) return;
    const looks = this._drvLooks || (this._drvLooks = []);
    for (const v of this.veh) {
      const D = this.dims[v.name];
      if (D.rider) {
        if (Math.abs(v.x - P.x) > 220 || Math.abs(v.z - P.z) > 220) continue;
        if (!v.drv) v.drv = this.riderLook(v);
        // the rider's feet point under the seat, rolled with the bike about its ground line, then turned with it
        const c = Math.cos(v.yaw), s = Math.sin(v.yaw), [rx, ry, rz] = D.rider, dy = ry + 0.04 - 0.9 * v.drv.scale, rl = v.roll || 0;
        const ox = rx * Math.cos(rl) - dy * Math.sin(rl), oy = rx * Math.sin(rl) + dy * Math.cos(rl);
        R.add(v.drv.kind, v.x + ox * c + rz * s, v.y + oy, v.z - ox * s + rz * c, v.yaw, 3, 0, 1, v.drv.scale, v.drv, rl);
        continue;
      }
      if (Math.abs(v.x - P.x) > 70 || Math.abs(v.z - P.z) > 70) continue;
      const d = D.driver; if (!d) continue;
      if (!v.drv) { v.drv = this.driverLook(v); }
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw), hip = 0.9 * v.drv.scale;
      const put = (lx, lz, L) => R.add(L.kind, v.x + lx * c + lz * s, v.y + d[1] - hip, v.z - lx * s + lz * c, v.yaw, 3, 0, 0, L.scale, L);
      put(d[0], d[2] - 0.08, v.drv);
      if (v.pas) put(-d[0], d[2] - 0.08, v.pas);
    }
  }
  riderLook(v) {
    const r = this.rng, L = seated(this.peopleLook(v.name === 'delivery' ? 'manCasual' : r() < 0.4 ? 'manCasual' : r() < 0.5 ? 'salaryman' : r() < 0.6 ? 'womanCasual' : 'studentBoy'));
    const HAIRDO = (1 << PART.tie) | (1 << PART.longHair) | (1 << PART.ponytail) | (1 << PART.bob) | (1 << PART.twinTails) | (1 << PART.headphones) | (1 << PART.shoulderBag);
    return { ...L, mask: (L.mask & ~HAIRDO) | (1 << PART.hat), cols: [...L.cols.slice(0, 5), [0xf4f4f0, 0x1e1f24, 0xa8232a, 0x2f64b5, 0xb9bdc2][Math.floor(r() * 5)], ...L.cols.slice(6)] };
  }
  driverLook(v) {
    const r = this.rng, role = v.name === 'taxi' || v.name === 'taxiSedan' || v.name === 'bus' || v.name === 'police' ? 'salaryman' : r() < 0.5 ? 'manCasual' : r() < 0.5 ? 'womanCasual' : r() < 0.5 ? 'salaryman' : 'grandpa';
    const L = seated(this.peopleLook(role));
    if (r() < 0.22 && v.name !== 'bus' && v.name !== 'boxTruck' && v.name !== 'keiTruck') v.pas = seated(this.peopleLook(r() < 0.5 ? 'womanCasual' : 'kid'));
    return L;
  }
  stats() { return { vehicles: this.veh.length, parked: this.parked.length }; }
  /** Debug: stop the traffic and clear the roads. */
  freeze() { for (const v of [...this.veh]) this.remove(v); this.enabled = false; }
}
