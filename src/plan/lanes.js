// The lane graph for traffic, built from the road network (plan/network.js). Pure data.
//  • links: one direction of a way between two junctions (or a junction and the way's end), with its lanes. Traffic
//    keeps left: the lanes of travel toward +s lie at d < 0 (right of +s is +d). Lanes are numbered from the kerb
//    (k = 0, where left turns are made) to the centre (k = n − 1, where right turns are made).
//  • connectors: the path through a junction from the end of an incoming lane to the start of an outgoing one — left,
//    straight or right — a cubic curve sampled into a polyline.
//  • control at each approach: 'signal' (the junction's lights; group 0 = the major road, 1 = the others, as
//    city/signals.js), 'priority' (the major road through an unsignalled junction), 'yield', or 'stop' (止まれ: a
//    street meeting a road); the stop line's position on the lane; level crossings (always stop, go when clear).
//  • conflicts: pairs of connectors at a junction whose paths cross or merge into the same lane, where along each
//    they meet, and which one gives way.
import { network, phaseOf } from './network.js';
import { Alignment } from './geom.js';
import { groundAt } from './ground.js';
import { BUS_NET, TAXI_NET } from './station-layout.js';

const RANK = { alley: 0, street: 1, old: 2, collector: 3, arterial: 4, national: 5 };
/** Speed limits (m/s): 60 / 50 / 40 / 40 / 30 km/h. */
export const VMAX = { national: 16.7, arterial: 13.9, collector: 11.1, old: 11.1, street: 8.3, alley: 5.6 };
const RAIL_HW = { jr: 13, private: 6, metro: 5.5, tram: 3.8, agt: 4.5 };

/** Lane centre offsets from the way's centreline (distance, positive), kerb lane first. */
function laneOffsets(w) {
  if (w.st && w.st.arcade) return null;                                              // the arcade: pedestrians only
  if (w.st && w.st.station && w.st.station.laneD) return [w.st.station.laneD];        // a station drive: its own lanes
  if (w.kind !== 'road' || w.cls === 'street') {                                     // streets: one lane each way, keep left
    if (w.cw * 2 < 3.9) return null;                                                   // alleys: no cars
    return [Math.min(w.cw / 2, 2.2)];
  }
  const n = Math.max(1, Math.round(w.lanes / 2));
  const inner = w.R && w.R.id === 'honcho' ? 3.1 : (w.median ? w.median / 2 : 0) + 0.2;   // the tram's zone on 本町通り
  const outer = w.sw > 0 ? w.cw - 0.6 : w.cls === 'old' ? w.cw - 0.9 : w.cw - 0.5;
  const lw = (outer - inner) / n;
  return Array.from({ length: n }, (_, k) => outer - lw * (k + 0.5));
}

let LANES = null;
/** Build (once) the lane graph. */
export function buildLanes() {
  if (LANES) return LANES;
  const N = network(); if (!N) return null;
  const links = [], lanes = [], connectors = [];
  const linksAt = new Map();                                                           // node id → { in: [], out: [] }
  const at = (id) => { let e = linksAt.get(id); if (!e) linksAt.set(id, (e = { in: [], out: [] })); return e; };
  // ---------------------------------------------------------------- links and lanes
  for (const w of N.ways) {
    const offs = laneOffsets(w); if (!offs) continue;
    const stops = w.nodes.filter(e => e.nd.arms.length >= 2 || e.nd.plain);          // every node on the way
    // pieces of the way between consecutive nodes (or the way's ends)
    const ss = [...new Set(stops.map(e => e.s))].sort((a, b) => a - b);
    const bounds = [0, ...ss.filter(s => s > 0.5 && s < w.length - 0.5), w.length];
    for (let i = 0; i + 1 < bounds.length; i++) {
      const a = bounds[i], b = bounds[i + 1]; if (b - a < 1.5) continue;
      const ndA = stops.find(e => Math.abs(e.s - a) < 0.6)?.nd || null, ndB = stops.find(e => Math.abs(e.s - b) < 0.6)?.nd || null;
      if (w.trims.some(([t0, t1]) => (a + b) / 2 > t0 && (a + b) / 2 < t1)) continue;  // a stub beyond a road's end junction
      if (!w.atGrade((a + b) / 2)) continue;
      // the cut-backs: the link's lanes run from one junction's box to the next
      // (a road running through a minor junction keeps its markings, but its lanes stop short of the street mouths so the
      // straight run through is a connector like any other — crossing and turning traffic can see it)
      const cutAt = (nd, dir) => {
        if (!nd || nd.plain) return 0;
        if (nd.minor === w) return Math.max(3, ...nd.arms.filter(r => r.way !== w).map(r => r.hw + 1.5));
        const arm = nd.arms.find(r => r.way === w && r.dir === dir); return arm ? arm.cut : 0;
      };
      const s0 = a + cutAt(ndA, 1), s1 = b - cutAt(ndB, -1); if (s1 - s0 < 1) continue;
      for (const dir of [1, -1]) {
        const from = dir > 0 ? ndA : ndB, to = dir > 0 ? ndB : ndA;
        const L = { id: links.length, way: w, dir, s0, s1, len: s1 - s0, from, to, cls: w.kind === 'road' ? w.cls : 'street', vmax: VMAX[w.kind === 'road' ? w.cls : 'street'],
          rank: RANK[w.kind === 'road' ? w.cls : 'street'], lanes: [], stopAt: null, control: 'free', group: -1, lx: [], private: w.st && w.st.station ? w.st.station.net : null };
        // a narrow street is slower (and so are the station's drives)
        if (L.cls === 'street' && (w.cw * 2 < 5.5 || L.private)) L.vmax = 6.9;
        offs.forEach((o, k) => { const ln = { id: lanes.length, link: L, k, d: -dir * o, len: L.len, out: [], in: [], veh: [], tail: [] }; L.lanes.push(ln); lanes.push(ln); });
        // level crossings on this stretch: where to stop before them (approach side), and the crossing's extent
        for (const x of w.lx) {
          if (x.tram) continue;
          if (x.s < s0 - 1 || x.s > s1 + 1) continue;
          const uS = dir > 0 ? x.s - x.hw - 2.2 - s0 : s1 - (x.s + x.hw + 2.2), uEnd = dir > 0 ? x.s + x.hw + 1 - s0 : s1 - (x.s - x.hw - 1);
          if (uS > 0) L.lx.push({ u: uS, uEnd, s: x.s, line: x.line });
        }
        links.push(L);
        if (from) at(from.id).out.push(L);
        if (to) at(to.id).in.push(L);
      }
    }
  }
  // lane position helpers
  for (const ln of lanes) {
    const L = ln.link;
    ln.sOf = (u) => (L.dir > 0 ? L.s0 + u : L.s1 - u);
  }
  // ---------------------------------------------------------------- junction control and stop lines
  for (const nd of N.nodes) {
    const e = linksAt.get(nd.id); if (!e || !e.in.length) continue;
    const signal = !nd.plain && nd.arms.some(a => a.crosswalk);
    let major = null;
    for (const a of nd.arms) if (!major || RANK[a.cls] > RANK[major.cls] || (a.cls === major.cls && a.cw > major.cw)) major = a;
    const majorWay = major ? major.way : null;
    const rankHere = Math.max(...nd.arms.map(a => RANK[a.cls] ?? 0));
    for (const L of e.in) {
      const arm = nd.arms.find(r => r.way === L.way && r.dir === -L.dir);
      if (signal) { L.control = 'signal'; L.group = phaseOf(L.way, majorWay); }
      else if (nd.plain) L.control = 'free';
      else if (nd.minor) L.control = L.way === nd.minor ? 'priority' : 'stop';
      else if (L.rank >= rankHere && nd.arms.filter(a => RANK[a.cls] === rankHere).length >= 2 && nd.arms.filter(a => RANK[a.cls] === rankHere && a.way === L.way).length === 2) L.control = 'priority';
      else if (L.cls === 'street' && rankHere > RANK.street) L.control = 'stop';
      else L.control = 'yield';
      // where to stop: at the stop line behind a zebra, else just short of the junction box
      const back = arm && arm.crosswalk ? arm.cut + 6.5 : arm ? Math.max(0.8, arm.markFrom - arm.cut) : 1;
      L.stopAt = Math.max(0.5, L.len - (arm && arm.crosswalk ? back - arm.cut : 1.0));
      L.node = nd;
    }
  }
  // ---------------------------------------------------------------- connectors
  const head = (ln, end) => {                                                          // point + heading at a lane's end (1) or start (0)
    const L = ln.link, u = end ? ln.len : 0, s = ln.sOf(u), q = L.way.align.at(s);
    return { x: q.x - q.hz * ln.d, z: q.z + q.hx * ln.d, hx: q.hx * L.dir, hz: q.hz * L.dir };
  };
  /** The path through a junction from the end of lane li to the start of lane lo: a cubic curve, its speed. */
  const connect = (nd, li, lo, kind) => {
    const p = head(li, 1), q = head(lo, 0);
    if (!kind) { const cross = p.hx * q.hz - p.hz * q.hx, dot = p.hx * q.hx + p.hz * q.hz, ang = Math.atan2(cross, dot); kind = Math.abs(ang) < 0.55 ? 'S' : ang > 0 ? 'R' : 'L'; }
    const dist = Math.hypot(q.x - p.x, q.z - p.z), k1 = kind === 'S' ? dist / 3 : kind === 'U' ? Math.max(3, dist) : dist * 0.42;
    const P = [[p.x, p.z], [p.x + p.hx * k1, p.z + p.hz * k1], [q.x - q.hx * k1, q.z - q.hz * k1], [q.x, q.z]];
    const n = dist < 0.3 ? 1 : Math.max(4, Math.min(20, Math.ceil(dist / 1.5)));
    const pts = [], cum = [0];
    for (let i = 0; i <= n; i++) {
      const t = i / n, m = 1 - t;
      pts.push([m * m * m * P[0][0] + 3 * m * m * t * P[1][0] + 3 * m * t * t * P[2][0] + t * t * t * P[3][0], m * m * m * P[0][1] + 3 * m * m * t * P[1][1] + 3 * m * t * t * P[2][1] + t * t * t * P[3][1]]);
      if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    // the tightest curvature → the speed through (≈ 2 m/s² lateral)
    let rmin = 1e9;
    for (let i = 1; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const a1 = Math.atan2(z1 - z0, x1 - x0), a2 = Math.atan2(z2 - z1, x2 - x1); let da = Math.abs(a2 - a1); if (da > Math.PI) da = 2 * Math.PI - da;
      const ds = (Math.hypot(x1 - x0, z1 - z0) + Math.hypot(x2 - x1, z2 - z1)) / 2; if (da > 1e-4) rmin = Math.min(rmin, ds / da);
    }
    const c = { id: connectors.length, node: nd, from: li, to: lo, kind, pts, cum, len: cum[cum.length - 1], vmax: Math.min(li.link.vmax, lo.link.vmax, Math.sqrt(2.2 * rmin) + 1.5), conflicts: [], veh: [], tail: [] };
    connectors.push(c); li.out.push(c); lo.in.push(c);
    return c;
  };
  for (const nd of N.nodes) {
    const e = linksAt.get(nd.id); if (!e || !e.in.length || !e.out.length) continue;
    for (const Lin of e.in) {
      const deadEnd = e.out.every(Lo => Lo.way === Lin.way && Lo.dir === -Lin.dir);        // nowhere else to go: turn round
      for (const Lout of e.out) {
        if (Lout.way === Lin.way && Lout.dir === -Lin.dir && !deadEnd) continue;         // no U-turns (but at a dead end)
        const a = head(Lin.lanes[0], 1), b = head(Lout.lanes[0], 0);
        const cross = a.hx * b.hz - a.hz * b.hx, dot = a.hx * b.hx + a.hz * b.hz, ang = Math.atan2(cross, dot);
        const kind = deadEnd ? 'U' : Math.abs(ang) < 0.55 ? 'S' : ang > 0 ? 'R' : 'L';  // cross > 0: turning right
        // a road with a median, where nothing controls the junction: left in and left out only (no crossing it, no right
        // turns across the median)
        const med = nd.minor && nd.minor.median >= 2 && !nd.arms.some(r => r.crosswalk);
        if (med && ((Lin.way !== nd.minor && kind !== 'L') || (Lin.way === nd.minor && kind === 'R'))) continue;
        const nIn = Lin.lanes.length, nOut = Lout.lanes.length, pairs = [];
        if (kind === 'L' || kind === 'U') pairs.push([kind === 'U' ? nIn - 1 : 0, kind === 'U' ? nOut - 1 : 0]);
        else if (kind === 'R') pairs.push([nIn - 1, nOut - 1]);
        else for (let k = 0; k < nIn; k++) pairs.push([k, Math.min(k, nOut - 1)]);
        for (const [ki, ko] of pairs) connect(nd, Lin.lanes[ki], Lout.lanes[ko], kind);
      }
    }
  }
  // ---------------------------------------------------------------- the station's private lanes (plan/station-layout.js)
  // Each net goes on from the end of its drive: links of one lane along the given points, joined at named nodes. Only
  // the station's own buses and taxis use them (and the drives): city/traffic.js routes nobody else in.
  const priv = {};
  for (const NET of [BUS_NET, TAXI_NET]) {
    const dw = N.ways.find(w => w.st && w.st.id === NET.drive); if (!dw) continue;
    const Ls = links.filter(L => L.way === dw), inL = Ls.find(L => L.to && L.to.plain), outL = Ls.find(L => L.from && L.from.plain);
    if (!inL || !outL) continue;
    // no turning round at the drive's end: the private lanes carry on from there
    for (const c of [...inL.lanes[0].out]) { inL.lanes[0].out.splice(inL.lanes[0].out.indexOf(c), 1); c.to.in.splice(c.to.in.indexOf(c), 1); connectors.splice(connectors.indexOf(c), 1); }
    const by = { in: inL, out: outL };
    for (const [name, [pts, control, kind]] of Object.entries(NET.links)) {
      const A = new Alignment(pts.map(p => ({ x: p[0], z: p[1], r: p[2] || 0 })), { name: NET.name + ':' + name });
      const way = { id: 'p:' + NET.name + ':' + name, kind: 'plaza', cls: 'station', align: A, length: A.length, yAt: (s) => { const q = A.at(s); return groundAt(q.x, q.z); }, nodes: [], lx: [] };
      const L = { id: links.length, way, dir: 1, s0: 0, s1: A.length, len: A.length, from: null, to: null, cls: 'station', vmax: NET.vmax, rank: 0, lanes: [], stopAt: Math.max(0.5, A.length - 1),
        control, group: -1, lx: [], private: NET.name, name, penalty: kind === 'bay' ? 80 : 0 };
      const ln = { id: lanes.length, link: L, k: 0, d: 0, len: L.len, out: [], in: [], veh: [], tail: [], sOf: (u) => u };
      L.lanes.push(ln); lanes.push(ln); links.push(L); by[name] = L;
    }
    const nodes = {};
    for (const [nn, a, b] of NET.joins) {
      const La = by[a], Lb = by[b], nd = nodes[nn] || (nodes[nn] = { id: 'p:' + NET.name + ':' + nn, name: nn, private: NET.name, arms: [] });
      if (a !== 'in') La.to = nd; La.node = nd; if (b !== 'out') Lb.from = nd;
      connect(nd, La.lanes[0], Lb.lanes[0]);
    }
    inL.control = NET.inControl; inL.stopAt = Math.max(0.5, inL.len - 1);
    priv[NET.name] = by;
  }
  // ---------------------------------------------------------------- conflicts (per junction)
  const byNode = new Map();
  for (const c of connectors) { let a = byNode.get(c.node.id); if (!a) byNode.set(c.node.id, (a = [])); a.push(c); }
  const segX = (p, p2, q, q2) => {                                                     // segment intersection → [t, u] or null
    const rx = p2[0] - p[0], rz = p2[1] - p[1], sx = q2[0] - q[0], sz = q2[1] - q[1], den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((q[0] - p[0]) * sz - (q[1] - p[1]) * sx) / den, u = ((q[0] - p[0]) * rz - (q[1] - p[1]) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
  };
  const priority = (c) => {                                                            // who goes first, higher = more
    const L = c.from.link;
    const base = L.control === 'priority' ? 3 : L.control === 'signal' ? 2 : L.control === 'yield' ? 1 : L.control === 'free' ? 3 : 0;
    return base * 4 + (c.kind === 'S' ? 2 : c.kind === 'L' ? 1 : 0);                   // then straight > left > right
  };
  for (const list of byNode.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.from.link === b.from.link) {                                               // from the same approach: only a merge matters
        if (a.to === b.to) { a.conflicts.push({ c: b, ua: a.len, ub: b.len, yields: false, merge: true }); b.conflicts.push({ c: a, ua: b.len, ub: a.len, yields: false, merge: true }); }
        continue;
      }
      let hit = null;
      if (a.to === b.to) hit = [a.len, b.len, true];
      else for (let p = 0; p + 1 < a.pts.length && !hit; p++) for (let q = 0; q + 1 < b.pts.length && !hit; q++) {
        const r = segX(a.pts[p], a.pts[p + 1], b.pts[q], b.pts[q + 1]);
        if (r) hit = [a.cum[p] + (a.cum[p + 1] - a.cum[p]) * r[0], b.cum[q] + (b.cum[q + 1] - b.cum[q]) * r[1], false];
      }
      if (!hit) continue;
      const pa = priority(a), pb = priority(b);
      a.conflicts.push({ c: b, ua: hit[0], ub: hit[1], yields: pa < pb || (pa === pb && a.id > b.id), merge: hit[2] });
      b.conflicts.push({ c: a, ua: hit[1], ub: hit[0], yields: pb < pa || (pa === pb && b.id > a.id), merge: hit[2] });
    }
  }
  // ---------------------------------------------------------------- spatial index of lanes (for spawning near a point)
  const CELL = 64, grid = new Map();
  for (const ln of lanes) {
    const L = ln.link, n = Math.max(1, Math.ceil(ln.len / 32));
    for (let i = 0; i <= n; i++) { const q = L.way.align.at(ln.sOf((ln.len * i) / n)), k = Math.floor(q.x / CELL) * 8192 + Math.floor(q.z / CELL); let a = grid.get(k); if (!a) grid.set(k, (a = new Set())); a.add(ln); }
  }
  LANES = { links, lanes, connectors, linksAt, grid, CELL, private: priv };
  // (from each link: the links its connectors lead to, for route finding)
  for (const L of links) {
    const m = new Map();
    for (const l of L.lanes) for (const c of l.out) { const o = m.get(c.to.link), u = c.kind === 'U'; if (!o || c.len < o[0] || (o[1] && !u)) m.set(c.to.link, [c.len, u]); }
    L.succ = [...m].map(([M, [cl, u]]) => [M, cl, u]);                                   // (u: only by turning round at a dead end)
  }
  return LANES;
}

/** Route finding: the driving distance from the start of every link to the start of `goal` (Infinity: can't get there),
 *  by Dijkstra over the links backwards. allow(L): may a route use link L (the goal itself always may); cost(L, cl): what
 *  driving along L and on through a connector cl long costs (default: the distance, and a bay's detour). */
export function linkDist(goal, allow = () => true, cost = (L, cl, u) => L.len + cl + (L.penalty || 0) + (u ? 60 : 0)) {
  const G = LANES, n = G.links.length, D = new Float64Array(n).fill(Infinity);
  if (!G.pred) { G.pred = G.links.map(() => []); for (const L of G.links) for (const [M, cl, u] of L.succ) G.pred[M.id].push([L, cl, u]); }
  const heap = [[0, goal.id]]; D[goal.id] = 0;
  const push = (d, i) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  while (heap.length) {
    const [d, i] = pop(); if (d > D[i]) continue;
    for (const [L, cl, u] of G.pred[i]) {
      if (L !== goal && !allow(L)) continue;
      const nd = d + cost(L, cl, u); if (nd < D[L.id]) { D[L.id] = nd; push(nd, L.id); }
    }
  }
  return D;
}

/** Lanes near (x, z) within r (coarse: by grid cell). */
export function lanesNear(x, z, r) {
  const G = LANES; if (!G) return [];
  const out = new Set();
  for (let i = Math.floor((x - r) / G.CELL); i <= Math.floor((x + r) / G.CELL); i++) for (let j = Math.floor((z - r) / G.CELL); j <= Math.floor((z + r) / G.CELL); j++) for (const ln of G.grid.get(i * 8192 + j) || []) out.add(ln);
  return [...out];
}
