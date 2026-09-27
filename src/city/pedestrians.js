// People on foot round the player, on the walking network (plan/walks.js):
//  • they walk the sidewalks keeping to the left, pass the slow ones, move over for people coming the other way and
//    step round the player; some stop a while (waiting for someone in front of the station, looking at a phone);
//  • at a zebra they wait at the kerb for the walk light and don't start on the blinking green; streets and the mouths
//    of side streets they cross when no car is coming; at a level crossing they wait for the barriers;
//  • who they are depends on the place (city/people/looks.js): office workers by the station, grandparents and
//    children in the back streets, shoppers in the arcade; more of them near the station, and they come out of (and go
//    into) its gates;
//  • cars give way to them: every crossing knows the lanes and junction paths that cross it (city/traffic.js asks);
//  • people spawn and leave at the edge of a circle round the player, never right in front of them.
import { buildWalks, walksNear } from '../plan/walks.js';
import { lanesNear } from '../plan/lanes.js';
import { prng } from '../plan/geom.js';
import { MAP } from '../plan/terrain.js';
import { PASSAGE } from '../plan/urban.js';
import { groundAt } from '../plan/ground.js';
import { PeopleRenderer } from './people/render.js';
import { makeLook, pickRole, companionRole, seated } from './people/looks.js';
import { YOKOCHO, YOKOCHO_BLOCKS, YOKOCHO_STALLS } from './yokocho.js';
import { MODE } from './people/body.js';
import { BikeRenderer, BIKE } from './people/bike.js';
import { pack } from './people/render.js';
import * as THREE from 'three';

const R_PED = 175, R_QUIET = 60, MAX_PEDS = 900, STRIDE = 1.38, BIKE_SHARE = 0.13;
const NO_BIKES = new Set(['passage', 'gate', 'deck', 'stairs', 'arcade', 'yokocho']);
const BIKE_COL = [['#e9e7e1', 5], ['#1f2024', 3], ['#b9bdc2', 3], ['#2f64b5', 2], ['#d9463b', 2], ['#3f8f5b', 1], ['#e8c3cf', 2], ['#f0a45a', 1], ['#8a6446', 1]];
/** People per metre of walk by kind / road class (a weekday late afternoon), before the station's pull. */
const DENS = { sidewalk: { national: 0.07, arterial: 0.065, collector: 0.045 }, edge: { old: 0.022, street: 0.011, alley: 0.009 }, arcade: 0.26, plaza: 0.045, passage: 0.3, deck: 0.07, yokocho: 0.16 };
const HUB = [-420, -150];
const hubPull = (x, z) => 1 + 2.6 * Math.exp(-Math.hypot(x - HUB[0], z - HUB[1]) / 230);

/** The station's walks, joined to the network: the free passage, its gates, the east square round the bus ring
 *  (with the zebras to the berth island), the deck and its stairs, the west promenade. */
function stationWalks() {
  const G0 = groundAt(-300, -120), FY = groundAt(-450, (PASSAGE.z0 + PASSAGE.z1) / 2) + 0.15, T = G0 + 6.2, IY = G0 + 0.18, zc = (PASSAGE.z0 + PASSAGE.z1) / 2;
  const g = (x, z, dy = 0.15) => [x, groundAt(x, z) + dy, z];
  return [
    { pts: [g(-340, -247), g(-340, -205), g(-340, zc), g(-340, -126), g(-340, -100), g(-340, -36), g(-340, 5)], kind: 'plaza', hw: 3.2 },            // the forecourt
    { pts: [[-342, FY, zc], [-395, FY, zc], [-453, FY, zc], [-500, FY, zc], [-556, FY, zc]], kind: 'passage', hw: 3.6, cls: 'passage' },                  // 自由通路
    { pts: [[-453, FY, zc], [-453, FY, -166]], kind: 'gate', hw: 2.5, cls: 'passage', sink: 'gate', open: ['end'] },                                        // 中央改札
    { pts: [[-395, FY, zc], [-395, FY, -162]], kind: 'gate', hw: 2, cls: 'passage', sink: 'gate', open: ['end'] },                                          // 東口改札
    { pts: [g(-340, -205), g(-300, -205), g(-258, -205)], kind: 'plaza', hw: 2.5 },                                                                    // north of the ring
    { pts: [g(-340, -100), g(-300, -100), g(-258, -100)], kind: 'plaza', hw: 2.5 },                                                                    // between the ring and the taxi pool
    { pts: [g(-340, -36), g(-300, -36), g(-258, -36)], kind: 'plaza', hw: 2.5 },                                                                       // south of the taxi pool
    { pts: [g(-340, -126), g(-322.5, -126)], kind: 'plaza', hw: 1.5 },
    { pts: [g(-322.5, -126), [-310.5, IY, -126]], kind: 'zebra', hw: 1.6, zone: 'free' },                                                               // to the island
    { pts: [[-310.5, IY, -126], [-299.5, IY, -126]], kind: 'plaza', hw: 1.2 },
    { pts: [[-299.5, IY, -181], [-299.5, IY, -175.8], [-299.5, IY, -153], [-299.5, IY, -130.2], [-299.5, IY, -126], [-299.5, IY, -119]], kind: 'plaza', hw: 1.6, cls: 'isle' },   // the berths
    { pts: [[-299.5, IY, -126], [-288.5, IY, -126]], kind: 'plaza', hw: 1.2 },
    { pts: [[-288.5, IY, -126], g(-276.5, -126)], kind: 'zebra', hw: 1.6, zone: 'free' },
    { pts: [g(-276.5, -126), g(-276.5, -140), g(-258, -140)], kind: 'plaza', hw: 1.8 },
    // the deck (2F) from the station building, the plaza over the island and its stairs, the east stairs to the street
    { pts: [[-347, T, -153], [-311.5, T, -153], [-299.5, T, -153]], kind: 'deck', hw: 3.5, cls: 'deck', sink: 'deck', open: ['start', 'end'] },
    { pts: [[-299.5, T, -153], [-287.5, T, -153], [-265.8, T, -153], [-265.8, T, -148.5]], kind: 'deck', hw: 3.5, cls: 'deck', open: ['start', 'end'] },
    { pts: [[-299.5, T, -153], [-299.5, T, -164.9], [-299.5, IY, -175.8]], kind: 'stairs', hw: 1, cls: 'deck', open: ['start'] },
    { pts: [[-299.5, T, -153], [-299.5, T, -141.1], [-299.5, IY, -130.2]], kind: 'stairs', hw: 1, cls: 'deck', open: ['start'] },
    { pts: [[-265.8, T, -148.5], [-265.8, G0 + 0.15, -137.1]], kind: 'stairs', hw: 1.4, cls: 'deck', open: ['start'] },
    // the west exit: the promenade between its lantern lines, down to 本町通り and up to the north road
    { pts: [[-556, FY, zc], g(-581.5, zc)], kind: 'plaza', hw: 2.5 },
    { pts: [g(-581.5, -200), g(-581.5, zc), g(-581.5, -60), g(-581.5, 4)], kind: 'plaza', hw: 3 },
  ];
}

/** 花渡横丁: a walk down the middle of each block's lane, joined to the streets at both ends. */
function yokochoWalks() {
  return YOKOCHO_BLOCKS.map(b => ({ pts: b.pts, kind: 'yokocho', hw: YOKOCHO.lane - 0.45, cls: 'yokocho', reach: 10 }));
}

/** Point and heading at u along a walk edge. */
function edgeAt(e, u, o) {
  const c = e.cum, P = e.pts, uu = Math.max(0, Math.min(e.len, u));
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= uu) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], t = (uu - c[lo]) / ((c[hi] - c[lo]) || 1);
  o.x = a[0] + (b[0] - a[0]) * t; o.y = a[1] + (b[1] - a[1]) * t; o.z = a[2] + (b[2] - a[2]) * t;
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1; o.tx = dx / l; o.tz = dz / l;
  return o;
}
/** Where two segments (p0p1, q0q1) cross: [t, s] along each (0..1), or null. */
function segX(p0, p1, q0, q1) {
  const rx = p1[0] - p0[0], rz = p1[1] - p0[1], sx = q1[0] - q0[0], sz = q1[1] - q0[1], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = q0[0] - p0[0], qz = q0[1] - p0[1], t = (qx * sz - qz * sx) / den, s = (qx * rz - qz * rx) / den;
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? [t, s] : null;
}

export class Pedestrians {
  constructor(ctx, { signals, traffic, crossings } = {}) {
    this.ctx = ctx; this.signals = signals; this.traffic = traffic; this.crossings = crossings;
    this.W = buildWalks([...stationWalks(), ...yokochoWalks()]);
    for (const e of this.W.edges) if (e.zone === null && e.kind === 'zebra') e.zone = { kind: 'free', u0: 0.3, u1: e.len - 0.3 };
    for (const e of this.W.edges) if (e.zone && e.zone.kind === 'free' && e.zone.u0 === undefined) { e.zone.u0 = 0.3; e.zone.u1 = e.len - 0.3; }
    this.render = new PeopleRenderer(ctx, { trousers: [260, 760], skirt: [170, 460], child: [70, 170], elder: [90, 230] });
    this.bikes = new BikeRenderer(ctx, 220);
    this.root = new THREE.Group(); this.root.name = 'pedestrians'; this.root.add(this.render.root, this.bikes.root);
    this.rng = prng(0x9e0917); this.statics = []; this.peds = []; this.nextId = 1; this.center = null; this.spawnT = 0; this.zonesAt = null;
    this.sinks = this.W.edges.filter(e => e.sink);
    // the level crossings' barriers, by position
    if (crossings) for (const e of this.W.edges) for (const x of e.lx) {
      const q = edgeAt(e, (x.u0 + x.u1) / 2, {}); let best = null, bd = 30;
      for (const it of crossings.items) { const d = Math.hypot(it.c.x - q.x, it.c.z - q.z); if (d < bd) { bd = d; best = it; } }
      x.item = best;
    }
    this._o = {};
    this.fixed = []; this.placeRegulars();
  }
  /** The 横丁's regulars: at the counters of its bars a few people standing with a mug (a sip now and then), talking,
   *  on a phone; someone sitting on the beer crates. They stay put; people walking down the lane pass them. */
  placeRegulars() {
    const r = prng(0x5a4e);
    const yk = this.W.edges.filter(e => e.kind === 'yokocho');
    const nearestEdge = (x, z) => { let best = null, bd = 3; for (const e of yk) for (let k = 0; k + 1 < e.pts.length; k++) { const p = e.pts[k], q = e.pts[k + 1], ex = q[0] - p[0], ez = q[2] - p[2], l2 = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[2]) * ez) / l2)), px = p[0] + ex * t, pz = p[2] + ez * t, d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; const l = Math.sqrt(l2); best = { e, u: e.cum[k] + l * t, lat: ((x - px) * (-ez / l) + (z - pz) * (ex / l)) }; } } return best; };
    const add = (L, x, y, z, yaw, mode, amp) => {
      const at = nearestEdge(x, z);
      const p = { id: this.nextId++, L, e: at ? at.e : null, u: at ? at.u : 0, dir: 1, v: 0, pace: 0, lat: at ? at.lat : 0, latT: 0, latBase: 0, phase: r() * 6.28, state: 'stand', t: 0, x, y, z, yaw, amp, mode, fixed: true, pose: [mode, amp] };
      if (at) at.e.peds.push(p);
      this.fixed.push(p);
    };
    for (const st of YOKOCHO_STALLS) {
      const bar = st.kind === 'izakaya' || st.kind === 'bar', n = bar ? (r() < 0.25 ? 0 : 1 + Math.floor(r() * 2.6)) : r() < 0.3 ? 1 : 0;
      const face = Math.atan2(-st.fx, -st.fz);                                       // toward the counter
      for (let i = 0; i < n; i++) {
        const u = (r() - 0.5) * Math.max(0.2, st.len - 1.2), out = 0.42 + r() * 0.12;
        const x = st.x + st.ux * u + st.fx * out, z = st.z + st.uz * u + st.fz * out;
        const role = r() < 0.55 ? 'drinker' : r() < 0.5 ? 'grandpa' : r() < 0.6 ? 'manCasual' : 'womanCasual', L = makeLook(role, r);
        let amp = 0;
        if (bar && r() < 0.7) { L.mask |= 1 << 14; amp = 3; } else if (r() < 0.5) amp = 4; else if (r() < 0.5) amp = 1;
        if (amp === 3) L.mask &= ~((1 << 0) | (1 << 12) | (1 << 13) | (1 << 9));
        add(L, x, st.y + 0.04, z, face + (amp === 4 ? (r() - 0.5) * 2.2 : (r() - 0.5) * 0.5), MODE.stand, amp);
      }
      if (st.crate && r() < 0.55) {                                                  // on the beer crates
        const L = makeLook(r() < 0.6 ? 'drinker' : 'grandpa', r); L.mask |= 1 << 14; L.mask &= ~((1 << 0) | (1 << 12) | (1 << 13) | (1 << 9));
        const [cx, cy, cz] = st.crate;
        add(L, cx + st.fx * 0.08, cy + 0.06 - 0.9 * L.scale, cz + st.fz * 0.08, Math.atan2(st.fx, st.fz) + (r() - 0.5) * 0.8, MODE.sit, 0);
      }
    }
  }
  /** A look for a role (drivers, riders). */
  look(role) { return makeLook(role, this.rng); }
  /** Someone standing about (or sitting): role, place, facing, pose. */
  addStatic(role, x, z, yaw, mode = 1, phase = 0, amp = 0, y = null) {
    const L = makeLook(role, this.rng);
    this.statics.push({ L, x, y: y ?? groundAt(x, z), z, yaw, mode, phase, amp });
    return this.statics[this.statics.length - 1];
  }

  // ---------------------------------------------------------------- crossings ↔ traffic
  /** The lanes and junction paths crossing each zone near (px, pz) (once per zone): zone.els = [{ el, uEl, uZ }], and
   *  on each element el.pedX = [{ e (the walk edge), uEl, uZ }] — where a car on el meets the crossing. */
  linkZones(px, pz, r) {
    const T = this.traffic; if (!T || !T.G) return;
    const lanePts = this._lanePts || (this._lanePts = new Map());
    const polyOf = (el) => {
      if (!el.link) { if (!el._p2) el._p2 = el.pts.map(p => [p[0], p[1]]); return { pts: el._p2, cum: el.cum }; }
      let v = lanePts.get(el); if (v) return v;
      const n = Math.max(1, Math.ceil(el.len / 2.5)), pts = [], cum = [], o = {};
      for (let i = 0; i <= n; i++) { const u = el.len * i / n; T.pos(el, u, o); pts.push([o.x, o.z]); cum.push(u); }
      lanePts.set(el, (v = { pts, cum })); return v;
    };
    const conns = this._connsAt || (this._connsAt = (() => { const m = new Map(); for (const c of T.G.connectors) { let l = m.get(c.node.id); if (!l) m.set(c.node.id, (l = [])); l.push(c); } return m; })());
    for (const e of walksNear(px, pz, r)) {
      const Z = e.zone; if (!Z || Z.els) continue;
      Z.els = [];
      const zp = [];                                                          // the crossing part of the edge
      for (let i = 0; i < e.pts.length; i++) zp.push([e.pts[i][0], e.pts[i][2], e.cum[i]]);
      let cx = 0, cz = 0; for (const p of zp) { cx += p[0]; cz += p[1]; } cx /= zp.length; cz /= zp.length;
      const cands = [...lanesNear(cx, cz, 30)];
      if (Z.nd) for (const c of conns.get(Z.nd.id) || []) cands.push(c);
      for (const el of cands) {
        const P = polyOf(el);
        for (let i = 0; i + 1 < P.pts.length; i++) for (let k = 0; k + 1 < zp.length; k++) {
          const hit = segX(P.pts[i], P.pts[i + 1], [zp[k][0], zp[k][1]], [zp[k + 1][0], zp[k + 1][1]]); if (!hit) continue;
          const uEl = P.cum[i] + (P.cum[i + 1] - P.cum[i]) * hit[0], uZ = zp[k][2] + (zp[k + 1][2] - zp[k][2]) * hit[1];
          if (uZ < Z.u0 - 0.2 || uZ > Z.u1 + 0.2) continue;
          const x = { e, el, uEl, uZ }; Z.els.push(x);
          (el.pedX || (el.pedX = [])).push(x);
        }
      }
    }
  }
  /** Is someone on (or stepping onto) crossing edge e near uZ? (a car on a path crossing there must wait) */
  occupied(e, uZ) {
    for (const p of e.peds) {
      if (p.state !== 'cross') continue;
      const du = uZ - p.u, toward = du * p.dir > 0;
      if (Math.abs(du) < 2.1 || (toward && Math.abs(du) < 2.1 + p.v * 1.6)) return true;
    }
    return false;
  }
  /** Is a car on (or about to be on) a path crossing zone edge e? (someone waiting at an unsignalled crossing) */
  carsComing(e) {
    const Z = e.zone; if (!Z || !Z.els) return false;
    for (const x of Z.els) {
      const el = x.el;
      const test = (w, dist) => (dist < -w.L - 0.5 ? false : dist < 2.5 || (w.v > 0.4 && dist / w.v < 3.8));
      for (const w of el.veh) if (test(w, x.uEl - w.u)) return true;
      for (const w of el.tail) if (x.uEl < 3) return true;
      if (el.link) { for (const c of el.in) for (const w of c.veh) if (test(w, c.len - w.u + x.uEl)) return true; }
      else for (const w of el.from.veh) if (w.next === el && test(w, el.from.len - w.u + x.uEl)) return true;
    }
    return false;
  }

  /** A car on this street within a few seconds of p? */
  carNear(p, e) {
    if (((p.id + (this._tick | 0)) & 3) !== 0) return p._car;                      // (checked every 4th step)
    p._car = false;
    for (const ln of lanesNear(p.x, p.z, 14)) {
      if (ln.link.way !== e.way) continue;
      for (const v of ln.veh) { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < 5 || (d < 14 && v.v > 1)) { p._car = true; return true; } }
    }
    return false;
  }
  /** The walk edges along way w where people share the road with cars (streets without sidewalks). */
  edgesOfWay(w) {
    if (!this._byWay) { this._byWay = new Map(); for (const e of this.W.edges) if (e.kind === 'edge' && e.way) { let l = this._byWay.get(e.way); if (!l) this._byWay.set(e.way, (l = [])); l.push(e); } }
    return this._byWay.get(w);
  }
  // ---------------------------------------------------------------- spawn / leave
  densOf(e) {
    const k = e.kind, d = DENS[k];
    if (d === undefined) return 0;
    return typeof d === 'number' ? d : d[e.cls] ?? 0.01;
  }
  rolesAt(x, z, e) {
    const near = Math.hypot(x - HUB[0], z - HUB[1]) < 380;
    if (e.arcade) return { womanCasual: 1.6, grandma: 1.6, officeLady: 0.8, salaryman: 0.6, kid: 1.2 };
    if (e.kind === 'yokocho') return { salaryman: 1.8, manCasual: 1.4, grandpa: 1.6, officeLady: 0.7, womanCasual: 0.8, kid: 0.1, schoolgirl: 0.2, studentBoy: 0.2, grandma: 0.5 };
    if (e.kind === 'passage' || e.kind === 'gate' || e.kind === 'deck' || e.kind === 'plaza') return { salaryman: 1.7, officeLady: 1.5, studentBoy: 1.3, schoolgirl: 1.3, grandpa: 0.5, grandma: 0.6, kid: 0.3 };
    if (near) return { salaryman: 1.3, officeLady: 1.2 };
    if (e.kind === 'edge') return { salaryman: 0.5, officeLady: 0.5, grandpa: 1.8, grandma: 2.0, kid: 1.8, womanCasual: 1.2 };
    return {};
  }
  spawn(e, u, dir) {
    if (this.peds.length >= MAX_PEDS) return null;
    const q = edgeAt(e, u, this._o), r = this.rng;
    const bike = !NO_BIKES.has(e.kind) && r() < BIKE_SHARE;
    const L = makeLook(pickRole(r, bike ? { salaryman: 0.4, officeLady: 0.6, grandpa: 0.8, kid: 0.4 } : this.rolesAt(q.x, q.z, e)), r);
    const keep = this.keepOf(e);
    const p = { id: this.nextId++, L, e, u, dir, v: L.pace * (0.6 + r() * 0.3), pace: L.pace * (0.92 + r() * 0.16), lat: -keep * (0.3 + r() * 0.7), latT: 0, latBase: -keep * (0.25 + r() * 0.75),
      phase: r() * 6.28, state: 'walk', t: 0, x: q.x, y: q.y, z: q.z, yaw: Math.atan2(q.tx * dir, q.tz * dir), amp: 1, mode: MODE.walk, phoneP: r() < 0.3 ? 1 : 0, wait: null, cross: false };
    if (bike) { p.L = seated(L); p.bike = { col: pack(this.pickCol()), wheel: r() * 6, crank: r() * 6, steer: 0 }; p.pace = 3.4 + r() * 1.8; p.v = p.pace * 0.8; p.latBase = this.bikeLat(p, e); }
    p.latT = p.latBase;
    e.peds.push(p); this.peds.push(p);
    // walking together: friends from school, colleagues, a mother and her child
    if (!bike && !e.zone && this.companions !== false && e.hw > 0.3 && r() < (/student|school|kid/.test(L.role) ? 0.38 : 0.16)) {
      const g = { route: new Map(), pace: p.pace }; p.group = g;
      const n = r() < 0.7 ? 1 : 2, gap = Math.min(0.62, e.hw * 0.8);
      for (let k = 1; k <= n && this.peds.length < MAX_PEDS; k++) {
        const L2 = makeLook(companionRole(L.role, r), r), q = { ...p, id: this.nextId++, L: L2, u: Math.max(0, Math.min(e.len, u - dir * (0.2 + r() * 0.4))), lat: p.lat + (k === 1 ? gap : -gap), phase: r() * 6.28, group: g, phoneP: 0, wait: null };
        q.latBase = q.latT = Math.max(-e.hw, Math.min(e.hw, q.lat)); g.pace = Math.min(g.pace, L2.pace);
        e.peds.push(q); this.peds.push(q);
      }
      for (const m of e.peds) if (m.group === g) m.pace = g.pace * (0.98 + r() * 0.04);
    }
    return p;
  }
  remove(p) {
    const a = p.e.peds, i = a.indexOf(p); if (i >= 0) a.splice(i, 1);
    const k = this.peds.indexOf(p); if (k >= 0) this.peds.splice(k, 1);
  }
  inMap(x, z) { return x > MAP.x0 + 5 && x < MAP.x1 - 5 && z > MAP.z0 + 5 && z < MAP.z1 - 5; }
  populate(px, pz, quiet, frac = 1) {
    const cand = [], cum = []; let want = 0;
    for (const e of walksNear(px, pz, R_PED)) {
      const d = this.densOf(e); if (!d) continue;
      const m = e.pts[Math.floor(e.pts.length / 2)], dist = Math.hypot(m[0] - px, m[2] - pz);
      if (dist > R_PED + 10 || !this.inMap(m[0], m[2])) continue;
      want += e.len * d * hubPull(m[0], m[2]); cand.push(e); cum.push(want);
    }
    let short = Math.min(MAX_PEDS, Math.round(want * frac)) - this.peds.length;
    for (let tries = 0; short > 0 && tries < short * 4 + 10; tries++) {
      const x = this.rng() * want; let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < x) lo = m + 1; else hi = m; }
      const e = cand[lo], u = this.rng() * e.len, q = edgeAt(e, u, this._o), dp = Math.hypot(q.x - px, q.z - pz);
      if (dp > R_PED || dp < quiet) continue;
      if (this.spawn(e, u, this.rng() < 0.5 ? 1 : -1)) short--;
    }
    // people coming out of the station (the gates, the deck), in sight or not
    if (quiet > 0) for (const e of this.sinks) {
      const end = e.b, d = Math.hypot(end.x - px, end.z - pz);
      if (d < R_PED && this.rng() < 0.35 && this.peds.length < MAX_PEDS) this.spawn(e, e.len - 0.2, -1);
    }
  }

  pickCol() { let tot = 0; for (const [, w] of BIKE_COL) tot += w; let x = this.rng() * tot; for (const [c, w] of BIKE_COL) { x -= w; if (x <= 0) return c; } return BIKE_COL[0][0]; }
  /** Where a bicycle rides across edge e (travel frame): on a sidewalk the carriageway side, else keeping left. */
  bikeLat(p, e) {
    if (e.kind === 'sidewalk' && e.side) return Math.max(-e.hw, Math.min(e.hw, -e.side * e.hw * 0.65 * p.dir));
    return -Math.min(e.hw * 0.7, 0.9);
  }
  /** How far to the left people keep on edge e (on a wide square they spread across it, still leaning left). */
  keepOf(e) { return e.hw > 1.2 ? e.hw * 0.9 : Math.min(e.hw * 0.6, 0.7); }
  // ---------------------------------------------------------------- walking
  /** The next edge from node n, coming along e (straight on preferred; crossings now and then; not back). */
  nextEdge(p, n) {
    if (p.group) { const was = p.group.route.get(n); if (was && n.edges.includes(was) && was !== p.e) return was; }
    const pick = this.nextEdge0(p, n);
    if (p.group && pick) { p.group.route.set(n, pick); if (p.group.route.size > 12) p.group.route.delete(p.group.route.keys().next().value); }
    return pick;
  }
  nextEdge0(p, n) {
    const opts = []; let tot = 0;
    const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw);
    for (const e of n.edges) {
      if (e === p.e && n.edges.length > 1) continue;
      if (p.bike && (NO_BIKES.has(e.kind) || e.sink)) continue;
      const from = e.a === n, o = edgeAt(e, from ? 0.4 : e.len - 0.4, this._o), dx = (from ? o.x - n.x : o.x - n.x), dz = (from ? o.z - n.z : o.z - n.z), l = Math.hypot(dx, dz) || 1;
      let w = 0.35 + 2.4 * Math.max(0, (dx * hx + dz * hz) / l);
      if (e.zone) w *= e.zone.kind === 'zebra' ? 0.55 : 0.4;
      if (e.sink) w *= 0.8;
      if (e.kind === 'edge' && p.e.kind === 'sidewalk') w *= 0.5;
      opts.push([e, w]); tot += w;
    }
    if (!opts.length) return null;
    let x = this.rng() * tot; for (const [e, w] of opts) { x -= w; if (x <= 0) return e; }
    return opts[0][0];
  }
  step(dt, t, px, pz, warm = false) {
    const P = this.ctx.player && this.ctx.player.position, S = this.signals;
    this.standing = 0; for (const p of this.peds) if (p.state === 'stand') this.standing++;
    // each edge's people in order along it (neighbours are then found in a window); the groups' middles
    const seen = new Set(), gsum = new Map();
    for (const p of this.peds) {
      const a = p.e.peds; if (!seen.has(a)) { seen.add(a); if (a.length > 1) a.sort((x, y) => x.u - y.u); for (let i = 0; i < a.length; i++) a[i]._i = i; }
      if (p.group) { const g = gsum.get(p.group) || { u: 0, n: 0, e: p.e }; if (g.e === p.e) { g.u += p.u; g.n++; } gsum.set(p.group, g); }
    }
    for (const p of this.peds) {
      const e = p.e, Z = e.zone, hw = e.hw;
      if (p.group && p.state === 'walk') {                                              // keep up with (or wait for) the others
        const g = gsum.get(p.group);
        if (g && g.e === e && g.n > 1) { const a = ((g.u - p.u) / (g.n - 1) - p.u) * p.dir; if (a > 0.5) p.pace = p.group.pace * 1.08; else if (a < -0.5) p.pace = p.group.pace * 0.9; else p.pace = p.group.pace; }
      }
      let vt = p.pace;
      // standing about (waiting for someone, a phone)
      if (p.state === 'stand') { p.t -= dt; vt = 0; if (p.t <= 0) p.state = 'walk'; }
      // crossings: the zone ahead (in the direction of travel)
      if (Z && p.state !== 'stand') {
        const entry = p.dir > 0 ? Z.u0 : Z.u1, ahead = (entry - p.u) * p.dir, inside = p.u > Z.u0 - 0.05 && p.u < Z.u1 + 0.05;
        if (p.state === 'cross') { if (!inside && ahead < 0) p.state = 'walk'; }
        else if (inside && ahead < 0) p.state = 'cross';                        // (spawned on it)
        else if (ahead > -0.2 && ahead < 1.0 + p.v * 0.6) {
          let go;
          if (Z.kind === 'zebra') {
            const st = S ? S.pedState(Z.nd.id, Z.group, t) : 'go';
            go = st === 'go' || (st === 'flash' && ahead < 0.3 && p.v > 0.8 && this.rng() < 0.3);
          } else go = warm || !this.carsComing(e);
          if (go) { p.state = 'cross'; p.wait = null; }
          else { p.state = 'wait'; if (!p.wait) p.wait = { lat: (this.rng() - 0.5) * Math.min(2.6, hw * 1.6) }; vt = 0; p.latT = p.wait.lat; }
        }
      }
      if (p.state === 'wait' && (!Z || (Z.kind === 'zebra' ? S && S.pedState(Z.nd.id, Z.group, t) === 'go' : !this.carsComing(e)))) { p.state = 'cross'; p.wait = null; }
      if (p.state === 'wait') { vt = 0; const entry = p.dir > 0 ? Z.u0 : Z.u1, ahead = (entry - p.u) * p.dir; if (ahead < 0.35) p.v = Math.min(p.v, Math.max(0, ahead) * 2); }
      // level crossings: wait while the barriers are down
      for (const x of e.lx) {
        const entry = p.dir > 0 ? x.u0 : x.u1, ahead = (entry - p.u) * p.dir;
        if (ahead > 0 && ahead < 1.5 + p.v && x.item && (x.item.active || x.item.down > 0.05)) { vt = 0; if (ahead < 0.4) p.v = 0; }
      }
      // others on this edge: follow or pass the slower, keep left of those coming
      if (p.state !== 'wait') {
        let latT = p.latBase;
        const latE = p.lat * p.dir;
        const list = e.peds, i0 = list[p._i] === p ? p._i : list.indexOf(p), reach = 6 + p.v;
        for (let k = i0 + p.dir, n = 0; k >= 0 && k < list.length; k += p.dir) {                  // ahead of p, in order
          const q = list[k]; if (Math.abs(q.u - p.u) > reach) break; if (++n > 24) break;
          if (q === p || (p.group && q.group === p.group)) continue;
          const along = (q.u - p.u) * p.dir; if (along < -0.4) continue;
          const qLat = q.lat * q.dir * p.dir, gap = qLat - p.lat, look = 2.4 + p.v * 0.7;
          if (q.dir === p.dir) {
            if (along > 0 && along < look && Math.abs(gap) < (p.bike || q.bike ? 0.7 : 0.55)) {
              if (p.pace > q.v + 0.12 && hw > 0.45) latT = Math.abs(qLat + 0.62) < hw ? qLat + 0.62 : qLat - 0.62;       // pass on the right
              else vt = Math.min(vt, q.v * 0.98, Math.max(0, along - (p.bike ? 1.8 : 0.7)) * 1.5);
            }
          } else if (along > 0 && along < 6 && Math.abs(gap) < 0.7) latT = Math.min(latT, qLat - 0.7);
        }
        p.latT = Math.max(-hw, Math.min(hw, latT));
      }
      // on a street without sidewalks: to the very edge when a car comes along
      if (e.kind === 'edge' && e.way && !warm && this.carNear(p, e)) p.latT = e.side * e.hw * p.dir;
      // the player
      if (P && !warm && Math.abs(P.x - p.x) < 4 && Math.abs(P.z - p.z) < 4) {
        const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw), dx = P.x - p.x, dz = P.z - p.z, along = dx * hx + dz * hz, side = -dx * hz + dz * hx;   // side > 0: the player on p's right
        if (along > -0.3 && along < 2.6 && Math.abs(side) < 0.75) {
          p.latT = Math.max(-hw, Math.min(hw, p.lat + (side > 0 ? -0.9 : 0.9)));
          if (along < 1.1 && Math.abs(side) < 0.45) vt = 0; else vt = Math.min(vt, 0.7);
        }
      }
      // a pause now and then (by the station: people waiting for someone)
      if (p.state === 'walk' && !Z && this.standing < this.peds.length * 0.08 && this.rng() < dt * (e.kind === 'plaza' ? 0.006 : 0.0015)) { p.state = 'stand'; p.t = 6 + this.rng() * 24; }
      // motion
      const acc = vt > p.v ? 1.2 : 3.5;
      p.v += Math.max(-acc * dt, Math.min(acc * dt, vt - p.v));
      if (p.v < 0) p.v = 0;
      p.u += p.v * dt * p.dir;
      const dl = p.latT - p.lat, lr = 0.7 * dt; p.lat += Math.max(-lr, Math.min(lr, dl));
      p.phase += (p.v * dt) / (STRIDE * p.L.scale) * Math.PI * 2;
      if (p.bike) { p.bike.wheel += p.v * dt / BIKE.rt; if (p.v > 0.8 && vt >= p.v - 0.3) p.bike.crank += p.v * dt / BIKE.rt / 2.1; }
      // the end of the edge: on to the next
      if (p.u > e.len || p.u < 0) {
        const n = p.u > e.len ? e.b : e.a, over = p.u > e.len ? p.u - e.len : -p.u;
        if (e.sink && n.edges.length === 1) { this.remove(p); continue; }         // into the station
        const ne = this.nextEdge(p, n);
        if (!ne || ne === e) { p.dir = -p.dir; p.u = p.u > e.len ? e.len : 0; p.lat = -p.lat; p.latT = -p.latT; }
        else {
          e.peds.splice(e.peds.indexOf(p), 1); ne.peds.push(p);
          p.e = ne; p.dir = ne.a === n ? 1 : -1; p.u = p.dir > 0 ? over : ne.len - over;
          const keep = this.keepOf(ne); p.latBase = p.bike ? this.bikeLat(p, ne) : p.group ? Math.max(-ne.hw, Math.min(ne.hw, p.lat)) : -keep * (0.25 + this.rng() * 0.75); p.latT = p.latBase;
          p.lat = Math.max(-ne.hw, Math.min(ne.hw, p.lat)); p.state = p.state === 'stand' ? 'stand' : 'walk'; p.wait = null;
        }
      }
      if (!warm) this.place(p, dt);
      const dp = Math.hypot(p.x - px, p.z - pz);
      if (dp > R_PED + 30 || (!this.inMap(p.x, p.z) && dp > 60)) this.remove(p);
    }
    this._tick = (this._tick | 0) + 1;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.5; this.populate(px, pz, warm ? 0 : R_QUIET); }
  }
  place(p, dt) {
    const q = edgeAt(p.e, p.u, this._o), hx = q.tx * p.dir, hz = q.tz * p.dir;
    p.x = q.x - hz * p.lat; p.z = q.z + hx * p.lat; p.y = q.y;
    const yaw = Math.atan2(hx + (p.latT - p.lat) * -hz * 0.4, hz + (p.latT - p.lat) * hx * 0.4);
    let d = yaw - p.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    p.yaw += d * (dt > 0 ? Math.min(1, dt * 7) : 1);
    if (p.bike && dt > 0) p.bike.steer += (Math.max(-0.45, Math.min(0.45, d * 1.8)) - p.bike.steer) * Math.min(1, dt * 6);
  }
  update(dt, t, P) {
    if (this.enabled === false) { this.draw(t); return; }
    const px = P ? P.x : 0, pz = P ? P.z : 0;
    if (!this.zonesAt || Math.hypot(px - this.zonesAt[0], pz - this.zonesAt[1]) > 90) { this.linkZones(px, pz, R_PED + 140); this.zonesAt = [px, pz]; }
    if (!this.center || Math.hypot(px - this.center[0], pz - this.center[1]) > 60) this.resettle(px, pz, t);
    this.center = [px, pz];
    if (dt > 0) this.step(Math.min(dt, 0.1), t, px, pz);
    this.draw(t);
  }
  resettle(px, pz, t) {
    for (const p of [...this.peds]) if (Math.hypot(p.x - px, p.z - pz) > R_PED) this.remove(p);
    this.populate(px, pz, 0, 1);
    for (let i = 0; i < 30; i++) this.step(0.2, t - (30 - i) * 0.2, px, pz, true);
    for (const p of this.peds) this.place(p, 0);
  }
  draw(t) {
    const R = this.render; R.begin(this.ctx.camera && this.ctx.camera.position);
    for (const s of this.statics) R.add(s.L.kind, s.x, s.y, s.z, s.yaw, s.mode, s.phase, s.amp, s.L.scale, s.L);
    const C = this.ctx.camera && this.ctx.camera.position;
    for (const p of this.fixed) if (!C || Math.abs(p.x - C.x) + Math.abs(p.z - C.z) < R_PED * 1.2) R.add(p.L.kind, p.x, p.y, p.z, p.yaw, p.pose[0], p.phase, p.pose[1], p.L.scale, p.L);
    const B = this.bikes; B.begin();
    for (const p of this.peds) {
      if (p.bike) {
        const k = p.bike, s = Math.sin(p.yaw), c = Math.cos(p.yaw);
        B.add(p.x, p.y, p.z, p.yaw, k.wheel, k.crank, k.steer, k.col);
        if (p.v > 0.4) { const dy = BIKE.saddle[0] + 0.03 - 0.9 * p.L.scale, dz = BIKE.saddle[1] - 0.02; R.add(p.L.kind, p.x + s * dz, p.y + dy, p.z + c * dz, p.yaw, MODE.cycle, k.crank, 0, p.L.scale, p.L); }
        else R.add(p.L.kind, p.x + s * -0.12 + c * 0.05, p.y, p.z + c * -0.12 - s * 0.05, p.yaw, MODE.stand, p.id, 0, p.L.scale, p.L);
        continue;
      }
      const moving = p.v > 0.12;
      const mode = moving ? MODE.walk : MODE.stand, amp = moving ? Math.min(1.1, 0.35 + p.v / p.pace * 0.75) : (p.state === 'wait' || p.state === 'stand') ? p.phoneP : 0;
      R.add(p.L.kind, p.x, p.y, p.z, p.yaw, mode, moving ? p.phase : p.id * 0.37, amp, p.L.scale, p.L);
    }
    if (this.traffic && this.traffic.drivers) this.traffic.drivers(R);
    R.end(); B.end();
  }
  stats() { const s = { peds: this.peds.length, waiting: 0, crossing: 0, standing: 0 }; for (const p of this.peds) { if (p.state === 'wait') s.waiting++; else if (p.state === 'cross') s.crossing++; else if (p.state === 'stand') s.standing++; } return s; }
  /** Debug: clear the streets. */
  freeze() { for (const p of [...this.peds]) this.remove(p); this.enabled = false; }
}
