// The walking network, from the road network (plan/network.js). Pure data.
//  • along every way: the middle of each sidewalk (roads with sidewalks), a strip at each edge (streets and old roads:
//    people keep to the side), one line down an alley or an arcade (歩行者専用, people spread across it);
//  • at junctions: round each corner; across each arm a zebra (signalled with the junction's lights) or, on streets,
//    just across the mouth; where a street meets a road the road's sidewalk runs across the street's mouth;
//  • extra walks the caller adds (the station's free passage, its gates and squares), joined to the nearest line.
// Edges are polylines [x, y, z] (y = the walking surface) with a half-width for spreading out, a kind, their crossing
// zone (where people and cars meet: u0..u1 along the edge, the signal for a zebra) and level crossings; they keep the
// people on them (filled by city/pedestrians.js).
import { network } from './network.js';
import { groundAt } from './ground.js';

const Y0 = 0.06, KERB = 0.15, RANK = { alley: 0, street: 1, old: 2, collector: 3, arterial: 4, national: 5 };
let WALKS = null;

/** Where a way's walking lines run: offset d from the centreline (null: one line down the middle) and half-width. */
function walkLine(w) {
  if (w.st && w.st.arcade) return { d: null, hw: Math.max(0.5, w.cw - 0.8), arcade: true };
  if (w.sw > 0) return { d: w.cw + w.sw / 2, hw: Math.max(0.4, w.sw / 2 - 0.35) };
  if (w.kind === 'alley' || w.cw < 1.7) return { d: null, hw: Math.max(0.25, w.cw - 0.5) };
  return { d: w.cw - 0.55, hw: 0.32 };
}
/** An arm's cut-back on the way's side sd (±1; 0: the whole arm). */
function cutSide(a, sd) {
  if (!sd) return a.cut;
  const plusN = (a.dir > 0) === (sd > 0);                                  // the way's +d side is the arm's +n side when dir > 0
  return Math.max(0.5, plusN ? a.cutL : a.cutR);
}

export function buildWalks(extras = []) {
  if (WALKS) return WALKS;
  const N = network(); if (!N) return null;
  const nodes = [], edges = [], NG = new Map(), CELL = 32, EG = new Map();
  const nkey = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
  const nodeAt = (p) => {
    const [x, y, z] = p;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = NG.get((Math.round(x * 2) + i) + ',' + (Math.round(z * 2) + j));
      if (list) for (const n of list) if (Math.hypot(n.x - x, n.z - z) < 0.35 && Math.abs(n.y - y) < 1.2) return n;
    }
    const n = { id: nodes.length, x, y, z, edges: [] }; nodes.push(n);
    const k = nkey(x, z); let l = NG.get(k); if (!l) NG.set(k, (l = [])); l.push(n);
    return n;
  };
  const addEdge = (pts, o) => {
    const P = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]) > 0.05);
    if (P.length < 2) return null;
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]));
    const len = cum[cum.length - 1]; if (len < 0.3) return null;
    const a = nodeAt(P[0]), b = nodeAt(P[P.length - 1]); if (a === b) return null;
    const e = { id: edges.length, a, b, pts: P, cum, len, hw: o.hw ?? 0.35, kind: o.kind, cls: o.cls ?? 'street', way: o.way ?? null, side: o.side ?? 0, zone: o.zone ?? null, lx: o.lx ?? [], sink: o.sink ?? null, arcade: !!o.arcade, peds: [] };
    edges.push(e); a.edges.push(e); b.edges.push(e);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const p of P) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[2]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[2]); }
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = i * 8192 + j; let l = EG.get(k); if (!l) EG.set(k, (l = [])); l.push(e); }
    return e;
  };
  /** The walking surface at s, offset d, on way w (raised sidewalk, road surface, or the ground). */
  const wayPt = (w, s, d, raised) => {
    const q = w.align.at(Math.max(0, Math.min(w.length, s))), x = q.x - q.hz * d, z = q.z + q.hx * d;
    const y = w.kind === 'road' ? w.yAt(Math.max(0, Math.min(w.length, s))) + Y0 + (raised ? KERB : 0) : groundAt(x, z) + Y0;
    return [x, y, z];
  };
  const lineOf = new Map();                                                      // way → its walk line spec
  for (const w of N.ways) lineOf.set(w, walkLine(w));
  const mouthsAt = new Map();                                                    // node id → mouth edges (minor junctions)

  // ---------------------------------------------------------------- along the ways
  for (const w of N.ways) {
    const L = lineOf.get(w), sides = L.d === null ? [0] : [1, -1];
    for (const sd of sides) {
      const d = L.d === null ? 0 : sd * L.d, raised = w.sw > 0;
      const blocks = [];                                                         // stretches the line doesn't run along
      for (const { nd, s } of w.nodes) {
        if (nd.plain || nd.minor === w) continue;
        let c0 = 0, c1 = 0;
        for (const a of nd.arms) if (a.way === w) { if (a.dir > 0) c1 = cutSide(a, sd); else c0 = cutSide(a, sd); }
        if (c0 || c1) blocks.push([s - c0, s + c1]);
      }
      for (const [t0, t1] of w.trims) blocks.push([t0, t1]);
      const gaps = sd ? w.walkGaps.filter(g => g[2] === sd) : [];
      // cut points: block ends and mouth ends; pieces between (not inside a block or a mouth)
      const cuts = [0, w.length];
      for (const [b0, b1] of blocks) cuts.push(b0, b1);
      for (const [g0, g1] of gaps) cuts.push(g0, g1);
      const cs = [...new Set(cuts.map(c => Math.max(0, Math.min(w.length, c))))].sort((p, q) => p - q);
      for (let i = 0; i + 1 < cs.length; i++) {
        const s0 = cs[i], s1 = cs[i + 1], sm = (s0 + s1) / 2; if (s1 - s0 < 0.3) continue;
        if (blocks.some(([b0, b1]) => sm > b0 && sm < b1)) continue;
        const gap = gaps.find(([g0, g1]) => sm > g0 && sm < g1);
        if (gap) {                                                               // the sidewalk across a street's mouth
          const nd = w.nodes.find(e => e.nd.minor === w && e.s > s0 - 1 && e.s < s1 + 1)?.nd;
          const pts = [wayPt(w, s0, d, raised), wayPt(w, Math.min(s1, s0 + 0.6), d, false), wayPt(w, Math.max(s0, s1 - 0.6), d, false), wayPt(w, s1, d, raised)];
          const e = addEdge(pts, { kind: 'mouth', hw: Math.min(L.hw, 1.2), cls: w.cls, way: w, zone: { kind: 'mouth', u0: 0.1, u1: null, nd } });
          if (e) { e.zone.u1 = e.len - 0.1; if (nd) { let l = mouthsAt.get(nd.id); if (!l) mouthsAt.set(nd.id, (l = [])); l.push(e); } }
          continue;
        }
        const n = Math.max(1, Math.ceil((s1 - s0) / (w.kind === 'road' ? 5 : 12)));
        const pts = []; for (let k = 0; k <= n; k++) pts.push(wayPt(w, s0 + (s1 - s0) * k / n, d, raised));
        // level crossings on this piece (the barriers: wait while they are down)
        const lx = [];
        for (const x of w.lx) if (!x.tram && x.s + x.hw + 1 > s0 && x.s - x.hw - 1 < s1) lx.push({ u0: Math.max(0, x.s - x.hw - 1.5 - s0), u1: Math.min(s1 - s0, x.s + x.hw + 1.5 - s0), s: x.s, line: x.line });
        addEdge(pts, { kind: L.arcade ? 'arcade' : raised ? 'sidewalk' : 'edge', hw: L.hw, cls: L.arcade ? 'arcade' : w.cls, way: w, side: sd, lx, arcade: L.arcade });   // side +1: the +d side (its +lateral points out)
      }
    }
  }

  // ---------------------------------------------------------------- junctions
  /** The end of arm a's line on its side sa (the arm's ±n; 0 = the middle line), in the way's frame. */
  const armEnd = (a, sa) => {
    const L = lineOf.get(a.way), sd = L.d === null ? 0 : (a.dir > 0 ? sa : -sa), d = L.d === null ? 0 : sd * L.d;
    return wayPt(a.way, a.s + a.dir * cutSide(a, sd), d, a.way.sw > 0);
  };
  const armSides = (a) => (lineOf.get(a.way).d === null ? [0] : [1, -1]);
  const junctionY = (p) => p[1];
  for (const nd of N.nodes) {
    if (nd.plain) {
      // a dead end: join the two sides so people can turn back across
      if (nd.arms.length === 1) { const a = nd.arms[0]; if (armSides(a).length === 2) addEdge([armEnd(a, 1), armEnd(a, -1)], { kind: 'corner', hw: 0.4, cls: a.cls }); }
      continue;
    }
    if (nd.minor) {
      // streets into a road: each of their lines joins the nearer end of the road sidewalk's mouth
      const M = mouthsAt.get(nd.id) || [];
      for (const a of nd.arms) {
        if (a.way === nd.minor) continue;
        for (const sa of armSides(a)) {
          const E = armEnd(a, sa); let best = null, bd = 25;
          for (const m of M) for (const n of [m.a, m.b]) { const dd = Math.hypot(n.x - E[0], n.z - E[2]); if (dd < bd) { bd = dd; best = n; } }
          if (best) addEdge([E, [best.x, best.y, best.z]], { kind: 'corner', hw: 0.4, cls: a.cls });
        }
      }
      continue;
    }
    // the major road (its lights are group 0, as in city/signals.js)
    const major = nd.arms.reduce((m, a) => (!m || RANK[a.cls] > RANK[m.cls] || (a.cls === m.cls && a.cw > m.cw) ? a : m), null).way;
    // corners: arm a's +n line to the next arm b's −n line, through where the two lines would meet
    for (const cor of nd.corners) {
      const a = cor.a, b = cor.b; if (a === b) continue;
      const A = armEnd(a, armSides(a).length === 2 ? 1 : 0), Bp = armEnd(b, armSides(b).length === 2 ? -1 : 0);
      const pts = [A];
      if (!cor.straight && cor.alpha < 2.6) {
        // round the corner: along the sidewalks, or — on streets — just outside the carriageway, clear of turning cars
        const viaD = (r) => (r.way.sw > 0 ? lineOf.get(r.way).d ?? 0 : r.cw + 0.25);
        const dA = viaD(a), dB = viaD(b), sa = Math.sin(cor.alpha), ca = Math.cos(cor.alpha);
        const t = (dB + dA * ca) / Math.max(0.2, sa);
        if (t > 0 && t < 25) {
          const x = nd.x + a.ux * t - a.uz * dA, z = nd.z + a.uz * t + a.ux * dA;
          if (Math.hypot(x - A[0], z - A[2]) < 25 && Math.hypot(x - Bp[0], z - Bp[2]) < 25) pts.push([x, (A[1] + Bp[1]) / 2, z]);
        }
      }
      pts.push(Bp);
      addEdge(pts, { kind: 'corner', hw: Math.min(lineOf.get(a.way).hw, lineOf.get(b.way).hw, 1.2), cls: RANK[a.cls] > RANK[b.cls] ? a.cls : b.cls });
    }
    // across each arm: a zebra where there is one, else across a street's mouth
    for (const a of nd.arms) {
      if (armSides(a).length < 2) continue;
      const P = armEnd(a, 1), M = armEnd(a, -1);
      if (a.crosswalk) {
        const tz = a.cut + 2.5, s = a.s + a.dir * tz, w = a.way, sd = a.dir > 0 ? 1 : -1;
        const Kp = wayPt(w, s, sd * (a.cw + 0.3), true), Zp = wayPt(w, s, sd * (a.cw - 0.3), false), Zm = wayPt(w, s, -sd * (a.cw - 0.3), false), Km = wayPt(w, s, -sd * (a.cw + 0.3), true);
        const e = addEdge([P, Kp, Zp, Zm, Km, M], { kind: 'zebra', hw: 1.5, cls: a.cls, way: w, zone: { kind: 'zebra', nd, group: a.way === major ? 0 : 1 } });
        if (e) { e.zone.u0 = e.cum[1]; e.zone.u1 = e.cum[4]; }
      } else if (a.kind !== 'road' || a.sw === 0) {
        // across a street's mouth: out to the building line on each side first (wait there, clear of the cars)
        const sd = a.dir > 0 ? 1 : -1, sP = a.s + a.dir * cutSide(a, sd), sM = a.s + a.dir * cutSide(a, -sd);
        const Qp = wayPt(a.way, sP, sd * (a.cw + 0.3), false), Qm = wayPt(a.way, sM, -sd * (a.cw + 0.3), false);
        const e = addEdge([P, Qp, Qm, M], { kind: 'cross', hw: 0.8, cls: a.cls, way: a.way, zone: { kind: 'cross', nd } });
        if (e) { e.zone.u0 = e.cum[1] + 0.3; e.zone.u1 = e.cum[2] - 0.3; }
      }
    }
  }

  // ---------------------------------------------------------------- extra walks (joined to the network)
  const nearestOn = (x, z, maxD, y = null) => {
    let best = null, bd = maxD;
    for (let i = Math.floor((x - maxD) / CELL); i <= Math.floor((x + maxD) / CELL); i++) for (let j = Math.floor((z - maxD) / CELL); j <= Math.floor((z + maxD) / CELL); j++) {
      for (const e of EG.get(i * 8192 + j) || []) {
        if (e.zone) continue;
        for (let k = 0; k + 1 < e.pts.length; k++) {
          const p = e.pts[k], q = e.pts[k + 1], ex = q[0] - p[0], ez = q[2] - p[2], l2 = ex * ex + ez * ez || 1e-9;
          const t = Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[2]) * ez) / l2)), px = p[0] + ex * t, pz = p[2] + ez * t, dd = Math.hypot(x - px, z - pz), py = p[1] + (q[1] - p[1]) * t;
          if (y !== null && Math.abs(py - y) > 1.5) continue;
          if (dd < bd) { bd = dd; best = { e, u: e.cum[k] + Math.sqrt(l2) * t, p: [px, py, pz] }; }
        }
      }
    }
    return best;
  };
  const splitAt = (e, u) => {                                                    // cut edge e at u: two edges meeting at a new node
    if (u < 0.5) return e.a; if (u > e.len - 0.5) return e.b;
    let k = 0; while (k + 1 < e.cum.length - 1 && e.cum[k + 1] < u) k++;
    const p = e.pts[k], q = e.pts[k + 1], t = (u - e.cum[k]) / (e.cum[k + 1] - e.cum[k] || 1), m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    const A = [...e.pts.slice(0, k + 1), m], B = [m, ...e.pts.slice(k + 1)];
    // retire e, add the halves (lx intervals split with them)
    for (const n of [e.a, e.b]) n.edges.splice(n.edges.indexOf(e), 1);
    e.dead = true;
    const o = { kind: e.kind, hw: e.hw, cls: e.cls, way: e.way, side: e.side, arcade: e.arcade };
    addEdge(A, { ...o, lx: e.lx.filter(x => x.u0 < u).map(x => ({ ...x, u1: Math.min(x.u1, u) })) });
    addEdge(B, { ...o, lx: e.lx.filter(x => x.u1 > u).map(x => ({ ...x, u0: Math.max(0, x.u0 - u), u1: x.u1 - u })) });
    return nodeAt(m);
  };
  for (const X of extras) {
    const pts = X.pts.map(p => (p.length === 3 ? p : [p[0], groundAt(p[0], p[1]) + Y0 + (X.lift ?? 0), p[1]]));
    // join each end (unless it is left open) to the nearest line at about its height: split that line there
    for (const end of [0, pts.length - 1]) {
      if (X.open && X.open.includes(end === 0 ? 'start' : 'end')) continue;
      const p = pts[end], near = nearestOn(p[0], p[2], X.reach ?? 14, p[1]);
      if (!near) continue;
      const n = splitAt(near.e, near.u), np = [n.x, n.y, n.z];
      if (Math.hypot(n.x - p[0], n.z - p[2]) > 0.35) { if (end === 0) pts.unshift(np); else pts.push(np); }
      else pts[end] = np;
    }
    addEdge(pts, { kind: X.kind ?? 'plaza', hw: X.hw ?? 1.5, cls: X.cls ?? 'plaza', sink: X.sink ?? null });
  }
  const live = edges.filter(e => !e.dead);
  WALKS = { nodes, edges: live, grid: EG, CELL, nearestOn };
  return WALKS;
}
/** Edges near (x, z) within r (from the grid; may repeat). */
export function walksNear(x, z, r) {
  const W = WALKS; if (!W) return [];
  const out = new Set(), C = W.CELL;
  for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++) for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) for (const e of W.grid.get(i * 8192 + j) || []) if (!e.dead) out.add(e);
  return [...out];
}
export const walks = () => WALKS;
