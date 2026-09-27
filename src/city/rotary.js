// 花渡駅東口のバスターミナルとタクシープール — the rotary at work, on the private lanes of the lane graph (laid out in
// plan/station-layout.js, built by plan/lanes.js); city/traffic.js drives the vehicles, city/pedestrians.js the people:
//  • buses: one comes in every half a minute or so (sent from out of sight toward the drive), lets its passengers off
//    at the alighting bay (4番), pulls up at the boarding berth it was given (1–3番), takes on the queue waiting there,
//    keeps to its time and leaves by the drive, back into the traffic;
//  • taxis: they come in while the pool has room and queue along the stand; whoever heads the people's queue gets into
//    the taxi at the head of the line, which leaves;
//  • people: the queues at the berths and the stand are made up of people walking by (on the island, along the stand);
//    those getting off walk onto the island and away into the town.
import { BERTHS, TAXI_HEAD, TAXI_STAND, ISLE, ISLAND_WALK } from '../plan/station-layout.js';
import { groundAt } from '../plan/ground.js';
import { lanesNear } from '../plan/lanes.js';
import { prng } from '../plan/geom.js';
import { makeLook, pickRole } from './people/looks.js';

const NEAR = 430, NEAR_PEOPLE = 230, CX = -300, CZ = -120;  // the rotary runs while the player is this near its middle (its people nearer)
const TAXI_CAP = 7, TAXI_ROAD = 3, STAND_X = TAXI_STAND.x - 0.6, STAND_WALK = TAXI_STAND.x - 1.6;
const RIDERS = { salaryman: 1.4, officeLady: 1.4, studentBoy: 1.0, schoolgirl: 1.1, grandpa: 0.9, grandma: 1.2, womanCasual: 1.0, manCasual: 0.8, kid: 0.2 };

/** The u along link L nearest (x, z). */
function uOn(L, x, z) {
  let best = 0, bd = Infinity;
  for (let u = 0; u <= L.len; u += 0.25) { const q = L.way.align.at(u), d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = u; } }
  return best;
}
/** A point beside vehicle v: lx to its left, lz ahead of the middle of its axles. */
function beside(v, lx, lz, y) { const c = Math.cos(v.yaw), s = Math.sin(v.yaw); return [v.x + lx * c + lz * s, y, v.z - lx * s + lz * c]; }

export class Rotary {
  constructor(ctx, traffic, peds) {
    this.ctx = ctx; this.T = traffic; this.P = peds;
    const G = traffic.G; this.bus = G.private && G.private.bus; this.taxi = G.private && G.private.taxi;
    this.on = !!(this.bus && this.taxi && peds); if (!this.on) return;
    traffic.hooks.push(this);
    this.rng = prng(0x5b0a1c); this.warm = false; this.near = false; this.quiet = true; this.busT = 3; this.taxiT = 2; this.recT = 0;
    this.IY = groundAt(-300, -120) + 0.18;
    this.buses = new Set(); this.taxis = new Set();
    this.n = { buses: 0, taxis: 0, off: 0, on: 0, fares: 0, out: 0 };           // (counts, for tools/sim-test.mjs)
    const r = this.rng;
    this.berths = BERTHS.map(B => {
      const L = this.bus[B.bay], x0 = L.way.align.at(0).x, hz = B.side < 0 ? 1 : -1, kerb = B.side < 0 ? ISLE[0] : ISLE[2], inw = -B.side;
      const walkX = B.side < 0 ? ISLAND_WALK.w : ISLAND_WALK.e, qx = kerb + inw * 0.85;
      const o = { ...B, L, ln: L.lanes[0], u: uOn(L, x0, B.front), hz, kerb, inw, walkX, qx, face: hz > 0 ? 0 : Math.PI, bus: null, queue: [], want: 2 + Math.floor(r() * 5), fillT: r() * 3 };
      o.max = B.shelter ? Math.max(3, Math.floor((B.shelter[1] - B.shelter[0] - 2.5) / 0.8)) : 0;
      o.slot = (i) => [qx, this.IY, B.front - hz * (1.85 + 0.8 * i)];
      // the way into the shelter (its back is glass): round whichever end is nearer the place in the queue
      if (B.shelter) {
        const ends = [B.shelter[0] - 0.7, B.shelter[1] + 0.7];
        o.entry = (i) => { const z = o.slot(i)[2], zE = Math.abs(z - ends[0]) < Math.abs(z - ends[1]) ? ends[0] : ends[1]; return [[walkX, this.IY, zE], [qx, this.IY, zE]]; };
      }
      return o;
    });
    this.alightB = this.berths.find(B => !B.board);
    this.pool = { L: this.taxi.TQ, ln: this.taxi.TQ.lanes[0], u: uOn(this.taxi.TQ, TAXI_HEAD.x, TAXI_HEAD.z), stand: [], want: 1 + Math.floor(r() * 3), fillT: 0 };
    this.pool.slot = (i) => [STAND_X, groundAt(STAND_X, TAXI_HEAD.z) + 0.15, TAXI_HEAD.z + 3.6 + 0.85 * i];
  }

  // ---------------------------------------------------------------- the traffic's hooks (city/traffic.js)
  step(dt, t, warm) {
    this.warm = warm;
    const P = this.ctx.player && this.ctx.player.position; if (!P) return;
    this.near = Math.hypot(P.x - CX, P.z - CZ) < NEAR;
    if (!this.near) return;
    this.busT -= dt; this.taxiT -= dt; this.recT -= dt;
    if (this.recT <= 0) { this.recT = 1.5; this.hail(); }
    if (this.busT <= 0) { this.busT = 10 + this.rng() * 16; this.sendBus(P); }
    if (this.taxiT <= 0) { this.taxiT = 8 + this.rng() * 14; this.sendTaxi(P); }
    for (const B of this.berths) if (B.bus && !B.bus.station) B.bus = null;              // it lost its way: let the berth go
  }
  resettle(px, pz) { if (Math.hypot(px - CX, pz - CZ) < NEAR) { this.near = true; this.fill(); } }
  removed(v) { this.forget(v); }
  left(v) { this.n.out++; this.forget(v); }
  forget(v) { this.buses.delete(v); this.taxis.delete(v); for (const B of this.berths) if (B.bus === v) B.bus = null; }

  // ---------------------------------------------------------------- sending vehicles in
  /** Buses and empty taxis already driving about near the station head for it while there's room. */
  /** Room for another taxi: the pool not full, not too many on their way. */
  taxiRoom() { let road = 0; for (const v of this.taxis) if (!v.station || !v.station.inside) road++; return this.taxis.size < TAXI_CAP && road < TAXI_ROAD; }
  hail() {
    let free = this.berths.filter(B => B.board && !B.bus), taxi = this.taxiRoom();
    if (!free.length && !taxi) return;
    const Db = free.length ? this.T.distTo(this.bus.B4, true) : null, Dt = taxi ? this.T.distTo(this.taxi.TQ, false) : null;
    for (const v of this.T.veh) {
      if (v.station || v.plan || !v.el.link || v.el.link.private) continue;
      if (v.name === 'bus' && free.length) {
        const d = Db[v.el.link.id] - v.u; if (!(d > 60 && d < 300) || v.el.len - v.u < 25) continue;
        const B = free[Math.floor(this.rng() * free.length)]; free = free.filter(b => b !== B);
        Object.assign(v, { station: { kind: 'bus', berth: B }, plan: [this.bus.B4, B.L, this.bus.out], stops: [this.alightStop(), this.boardStop(B)] });
        B.bus = v; this.buses.add(v); this.n.buses++; this.T.route(v, v.el);
      } else if ((v.name === 'taxi' || v.name === 'taxiSedan') && taxi && !v.pas && v.el.link.cls !== 'street') {
        const d = Dt[v.el.link.id] - v.u; if (!(d > 50 && d < 220) || v.el.len - v.u < 25 || this.rng() < 0.4) continue;
        Object.assign(v, { station: { kind: 'taxi' }, plan: [this.taxi.TQ, this.taxi.out], stops: [this.headStop()] });
        this.taxis.add(v); this.n.taxis++; taxi = this.taxiRoom(); this.T.route(v, v.el);
      }
      if (!free.length && !taxi) return;
    }
  }
  /** A place to start from, out of sight: on a lane `lo`–`hi` m by road from `goal`, at least 130 m from the player. */
  startAt(goal, bus, lo, hi, P, L) {
    const D = this.T.distTo(goal, bus), cand = [];
    for (const ln of lanesNear(CX, CZ, hi + 40)) { const K = ln.link; if (K.private || K.cls === 'street') continue; const d = D[K.id]; if (d > lo && d < hi && ln.len > L + 4) cand.push(ln); }
    for (let tries = 0; tries < 14 && cand.length; tries++) {
      const ln = cand[Math.floor(this.rng() * cand.length)], u = L + 1 + this.rng() * (ln.len - L - 2), q = this.T.pos(ln, u, {});
      if (Math.hypot(q.x - P.x, q.z - P.z) < 130) continue;
      if (ln.veh.some(w => Math.abs(w.u - u) < L + 9)) continue;
      return [ln, u];
    }
    return null;
  }
  sendBus(P) {
    const free = this.berths.filter(B => B.board && !B.bus); if (!free.length) return;
    const B = free[Math.floor(this.rng() * free.length)], at = this.startAt(this.bus.B4, true, 80, 240, P, 10.5); if (!at) return;
    const v = this.T.spawnAt('bus', at[0], at[1], at[0].link.vmax * 0.6, { station: { kind: 'bus', berth: B }, plan: [this.bus.B4, B.L, this.bus.out], stops: [this.alightStop(), this.boardStop(B)] });
    if (v) { B.bus = v; this.buses.add(v); this.n.buses++; }
  }
  sendTaxi(P) {
    if (!this.taxiRoom()) return;
    const at = this.startAt(this.taxi.TQ, false, 50, 170, P, 4.7); if (!at) return;
    const v = this.T.spawnAt(this.rng() < 0.6 ? 'taxi' : 'taxiSedan', at[0], at[1], at[0].link.vmax * 0.6, { station: { kind: 'taxi' }, plan: [this.taxi.TQ, this.taxi.out], stops: [this.headStop()] });
    if (v) { this.taxis.add(v); this.n.taxis++; }
  }
  alightStop() {
    const B = this.alightB;
    return { lane: B.ln, u: B.u, dwell: 2.5, kind: 'alight', berth: B, n: 3 + Math.floor(this.rng() * 11), next: 0.6, doneT: 0,
      ready: (v, st) => this.warm || this.quiet ? st.t > 6 : (st.n <= 0 && st.t > st.doneT + 1.2) || st.t > 40 };
  }
  boardStop(B) {
    return { lane: B.ln, u: B.u, dwell: 28 + this.rng() * 45, kind: 'board', berth: B, next: 1.2,
      ready: (v, st) => this.warm || this.quiet || (!B.queue.some(a => !a.path) && !B.boarding) || st.t > 110,     // (no waiting for those still coming)
      depart: (v) => { if (B.bus === v) B.bus = null; B.want = 1 + Math.floor(this.rng() * 7); } };
  }
  headStop() {
    return { lane: this.pool.ln, u: this.pool.u, dwell: 2, kind: 'taxi', blink: false, gotIn: 0,
      ready: (v, st) => (this.warm || this.quiet ? st.t > (st.warmT || (st.warmT = 6 + this.rng() * 30)) : st.gotIn > 0 && st.t > st.gotIn + 1.4) };
  }
  /** On arrival near the station: buses at some berths, taxis in the queue, people waiting. */
  fill() {
    const r = this.rng;
    for (const B of this.berths) {
      if (!B.board || B.bus || r() > 0.75) continue;
      const st = this.boardStop(B); st.dwell = 8 + r() * 55;
      const v = this.T.spawnAt('bus', B.ln, Math.max(0.5, B.u - 0.4), 0, { station: { kind: 'bus', berth: B }, plan: [this.bus.out], stops: [st] });
      if (v) { B.bus = v; this.buses.add(v); }
    }
    const n = 3 + Math.floor(r() * 4) - this.taxis.size;
    for (let i = 0; i < n; i++) {
      const u = this.pool.u - 0.4 - i * 6.8; if (u < 6) break;
      if (this.pool.ln.veh.some(w => Math.abs(w.u - u) < 5.5)) continue;
      const v = this.T.spawnAt(r() < 0.6 ? 'taxi' : 'taxiSedan', this.pool.ln, u, 0, { station: { kind: 'taxi' }, plan: [this.taxi.out], stops: [this.headStop()] });
      if (v) this.taxis.add(v);
    }
    if (this.P.actors.length) return;
    for (const B of this.berths) if (B.board) for (let i = 0, k = Math.floor(r() * Math.min(B.max, 7)); i < k; i++) this.wait(B.queue, B.slot(i), B.face);
    for (let i = 0, k = Math.floor(r() * 3); i < k; i++) this.wait(this.pool.stand, this.pool.slot(i), Math.PI);
  }
  /** Someone new standing in a queue at p. */
  wait(queue, p, face) {
    const r = this.rng, L = makeLook(pickRole(r, RIDERS), r), a = this.P.actor(L, p[0], p[1], p[2], face + (r() - 0.5) * 0.3, r() < 0.45 ? 1 : r() < 0.3 ? 2 : 0);
    queue.push(a); return a;
  }

  // ---------------------------------------------------------------- people (each frame)
  update(dt) {
    if (!this.on) return;
    const P = this.ctx.player && this.ctx.player.position;
    if (!this.near || !P || Math.hypot(P.x - CX, P.z - CZ) > NEAR_PEOPLE) { this.clear(); this.quiet = true; return; }
    if (dt <= 0) return;
    this.quiet = false;
    const bd = this.T.dims.bus, front = bd.fo + bd.wb / 2;
    for (const v of this.buses) {
      const st = v.stops && v.stops[0]; if (!st || !st.at) continue;
      st.next -= dt;
      if (st.kind === 'alight' && st.n > 0 && st.next <= 0) {                               // getting off (mostly by the middle door)
        st.next = 0.7 + this.rng() * 0.7; st.n--; this.n.off++; if (st.n <= 0) st.doneT = st.t;
        const B = st.berth, d = beside(v, bd.W / 2 + 0.15, this.rng() < 0.2 ? front - 0.85 : front - 5.28, this.IY + 0.2), r = this.rng;
        const a = this.P.actor(makeLook(pickRole(r, RIDERS), r), d[0], d[1], d[2], B.inw > 0 ? Math.PI / 2 : -Math.PI / 2);
        const z1 = d[2] + (r() - 0.5) * 1.6, dir = r() < 0.7 ? 1 : -1;
        this.P.walk(a, [[B.kerb + B.inw * 1.2, this.IY, z1], [B.walkX + (r() - 0.5) * 1.2, this.IY, z1 + dir * 1.5]], null, (a) => this.P.release(a, dir));
      } else if (st.kind === 'board' && st.next <= 0) {
        const B = st.berth, a = B.queue.find(a => !a.path || (a.joining && a.path.length <= 1)); if (!a) continue;
        st.next = 0.9 + this.rng() * 0.9;                                                     // getting on by the front door, in turn
        B.queue.splice(B.queue.indexOf(a), 1); a.joining = false;
        const d = beside(v, bd.W / 2 + 0.3, front - 0.85, this.IY);
        B.boarding = (B.boarding || 0) + 1;
        this.P.walk(a, [d], null, (a) => { this.P.drop(a); B.boarding--; this.n.on++; });
        this.shuffle(B.queue, B.slot, B.face);
      }
    }
    // the taxi at the head of the line: the first in the people's queue gets in at the back
    for (const v of this.taxis) {
      const st = v.stops && v.stops[0]; if (!st || st.kind !== 'taxi' || !st.at || st.gotIn || st.walking || st.t < 1.2) continue;
      const q = this.pool.stand; if (!q.length || q[0].path) continue;
      const a = q.shift(), D = this.T.dims[v.name], d = beside(v, D.W / 2 + 0.35, -0.45, a.y);
      st.walking = true;
      this.P.walk(a, [d], null, (a) => { this.P.drop(a); st.gotIn = st.t; st.walking = false; this.n.fares++; });
      this.shuffle(q, this.pool.slot, Math.PI);
    }
    // the queues fill up with people passing by
    for (const B of this.berths) {
      if (!B.board || (B.fillT -= dt) > 0) continue;
      B.fillT = 1.2 + this.rng() * 3.5;
      if (B.queue.length >= Math.min(B.want, B.max)) continue;
      const a = this.P.recruit(B.walkX, B.slot(B.queue.length)[2], 18, (e) => e.cls === 'isle' && Math.abs(e.pts[0][0] - B.walkX) < 0.1 && Math.abs(e.pts[e.pts.length - 1][0] - B.walkX) < 0.1);
      if (!a) continue;
      a.y = this.IY; a.amp = this.rng() < 0.45 ? 1 : this.rng() < 0.3 ? 2 : 0;
      B.queue.push(a);
      a.joining = true;
      this.P.walk(a, [[B.walkX, this.IY, a.z], ...B.entry(B.queue.length - 1), B.slot(B.queue.length - 1)], B.face, (a) => { a.joining = false; });
    }
    const S = this.pool;
    if ((S.fillT -= dt) <= 0) {
      S.fillT = 3 + this.rng() * 7; if (this.rng() < 0.15) S.want = this.rng() < 0.2 ? 0 : 1 + Math.floor(this.rng() * 3);
      if (S.stand.length < S.want) {
        // someone on the stand's walk, or on the square's walks either side of the pool, comes over to the stand
        const tail = S.slot(S.stand.length), onWalk = (e, x, z) => e.kind === 'plaza' && (x !== null ? e.pts.every(p => Math.abs(p[0] - x) < 0.1) : e.pts.every(p => Math.abs(p[2] - z) < 0.1));
        const a = this.P.recruit(STAND_WALK, tail[2], 30, (e) => onWalk(e, STAND_WALK, null) || onWalk(e, null, -100) || onWalk(e, null, -36));
        if (a) { a.amp = this.rng() < 0.5 ? 1 : 0; S.stand.push(a); this.P.walk(a, [[STAND_WALK, a.y, Math.abs(a.x - STAND_WALK) < 1 ? a.z : Math.round(a.z)], [STAND_WALK, a.y, tail[2]], tail], Math.PI); }
      }
    }
  }
  /** Everyone in a queue moves up to their place (those still on their way in keep their way, to the new place). */
  shuffle(queue, slot, face) {
    queue.forEach((a, i) => {
      const p = slot(i);
      if (a.joining && a.path && a.path.length) { a.path[a.path.length - 1] = p; return; }
      if (Math.hypot(a.x - p[0], a.z - p[2]) > 0.05) this.P.walk(a, [p], face);
    });
  }
  /** Far away: nobody waits. */
  clear() {
    for (const B of this.berths) { for (const a of B.queue) this.P.drop(a); B.queue.length = 0; B.boarding = 0; }
    for (const a of this.pool.stand) this.P.drop(a); this.pool.stand.length = 0;
  }
  stats() { return { ...this.n, busesNow: this.buses.size, taxisNow: this.taxis.size, berths: this.berths.map(B => (B.bus ? 1 : 0) + ':' + B.queue.length).join(' '), stand: this.pool.stand.length }; }
}
