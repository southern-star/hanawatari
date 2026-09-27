// Local street clean-up. The district grids give raw street segments that know nothing of the planned roads or of
// the neighbouring district's grid; here they become one connected network:
//  • a street that crosses a planned road is split there — both halves end on the road's centreline (a crossroads);
//  • a street end inside a road, or just short of one, is trimmed / extended to the road's centreline (a T);
//  • a street that runs along a road is dropped, and so is one meeting a road or another street at a shallow angle;
//  • streets of two grids that cross are split at the crossing; ends that nearly meet another street are joined;
//  • junctions crowded along a road are thinned out (opposite side streets are lined up into crossroads);
//  • short dead-end stubs are removed.
// Every street end is then a node shared with other streets, a point on a road centreline, or a real dead end.
// Pure data (no three.js). Input segments: { a:[x,z], b:[x,z], w, kind, district }.
import { ROADS } from './roads.js';
import { heightAt } from './terrain.js';
import { K } from './raster.js';
import { computeCrossings } from './crossings.js';

const AT_GRADE = 1.5;          // a road is "at grade" (streets can join it) where its surface is this close to the ground
const SNAP = 1.0;              // street ends closer than this are one node
const CELL = 32;
const PASSABLE = new Set([K.free, K.under, K.street, K.road]);

const hyp = Math.hypot;
function segInter(ax, az, bx, bz, cx, cz, dx, dz) {           // proper intersection of AB and CD → [t on AB, u on CD]
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax, qz = cz - az, t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}
function segDist(x, z, ax, az, bx, bz) {                        // distance from a point to segment AB → { d, t }
  const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
  return { d: hyp(x - ax - ex * t, z - az - ez * t), t };
}

// ------------------------------------------------------------------ at-grade road centrelines (2 m pieces), hashed
let ROADIX = null;
export function roadIndex() {
  if (ROADIX) return ROADIX;
  const segs = [], hash = new Map();
  for (const R of ROADS) {
    const A = R.align, n = Math.ceil(A.length / 2);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const s = (A.length * i) / n, q = A.at(s), y = R.profile.yAt(s), g = heightAt(q.x, q.z);
      const cur = { s, x: q.x, z: q.z, grade: Math.abs(y - g) < AT_GRADE };
      if (prev && prev.grade && cur.grade) {
        const sg = { R, hw: R.w / 2, ax: prev.x, az: prev.z, bx: cur.x, bz: cur.z, s0: prev.s, s1: cur.s };
        segs.push(sg);
        const r = sg.hw + 16;
        for (let i0 = Math.floor((Math.min(sg.ax, sg.bx) - r) / CELL), i1 = Math.floor((Math.max(sg.ax, sg.bx) + r) / CELL), ix = i0; ix <= i1; ix++)
          for (let j0 = Math.floor((Math.min(sg.az, sg.bz) - r) / CELL), j1 = Math.floor((Math.max(sg.az, sg.bz) + r) / CELL), jz = j0; jz <= j1; jz++) {
            const k = ix * 8192 + jz; let a = hash.get(k); if (!a) hash.set(k, (a = [])); a.push(sg);
          }
      }
      prev = cur;
    }
  }
  return (ROADIX = { segs, hash });
}
const roadsNear = (x, z) => roadIndex().hash.get(Math.floor(x / CELL) * 8192 + Math.floor(z / CELL)) || [];

/** Nearest at-grade road centreline within (half width + extra) of (x, z) → { R, s, x, z, dist } or null. */
export function nearRoad(x, z, extra = 0) {
  let best = null;
  for (const sg of roadsNear(x, z)) {
    const { d, t } = segDist(x, z, sg.ax, sg.az, sg.bx, sg.bz);
    if (d > sg.hw + extra) continue;
    if (!best || d - sg.hw < best.dist - best.R.w / 2) best = { R: sg.R, s: sg.s0 + (sg.s1 - sg.s0) * t, x: sg.ax + (sg.bx - sg.ax) * t, z: sg.az + (sg.bz - sg.az) * t, dist: d };
  }
  return best;
}
/** Crossings of segment AB with at-grade road centrelines → [{ t, R, s, x, z }] sorted by t. */
function roadHits(ax, az, bx, bz) {
  const out = [], seen = new Set();
  const n = Math.max(1, Math.ceil(hyp(bx - ax, bz - az) / (CELL / 2)));
  for (let k = 0; k <= n; k++) {
    const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
    for (const sg of roadsNear(x, z)) {
      if (seen.has(sg)) continue; seen.add(sg);
      const h = segInter(ax, az, bx, bz, sg.ax, sg.az, sg.bx, sg.bz); if (!h) continue;
      const s = sg.s0 + (sg.s1 - sg.s0) * h[1];
      if (out.some(o => o.R === sg.R && Math.abs(o.s - s) < 1.5)) continue;
      out.push({ t: h[0], R: sg.R, s, x: ax + (bx - ax) * h[0], z: az + (bz - az) * h[0] });
    }
  }
  return out.sort((p, q) => p.t - q.t);
}
/** Road heading at along-distance s. */
const roadDir = (R, s) => { const q = R.align.at(s); return [q.hx, q.hz]; };

// ------------------------------------------------------------------ the clean-up
export function cleanStreets(raw, raster) {
  const passable = (ax, az, bx, bz) => {
    const L = hyp(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 1.5));
    for (let k = 1; k < n; k++) if (!PASSABLE.has(raster.kindAt(ax + (bx - ax) * k / n, az + (bz - az) * k / n))) return false;
    return true;
  };
  // pieces: { a, b, w, kind, district, ra, rb } — ra / rb: { R, s } when that end sits on a road centreline
  let P = [];
  // ---- 1. planned roads: drop streets along a road, split at crossings
  for (const sg of raw) {
    const [ax, az] = sg.a, [bx, bz] = sg.b, L = hyp(bx - ax, bz - az); if (L < 1) continue;
    const hits = roadHits(ax, az, bx, bz);
    let along = 0, n = 0;
    const ux = (bx - ax) / L, uz = (bz - az) / L, off = sg.w / 2 + 1.5;
    for (let t = 1; t < L; t += 2) {
      const x = ax + ux * t, z = az + uz * t; n++;
      // quick test on the raster first: a road cell at the street's edges (or on it)?
      const k0 = raster.kindAt(x, z), k1 = raster.kindAt(x - uz * off, z + ux * off), k2 = raster.kindAt(x + uz * off, z - ux * off);
      if (k0 !== K.road && k1 !== K.road && k2 !== K.road) continue;
      const nr = nearRoad(x, z, sg.w / 2 + 1.5); if (!nr) continue;
      if (hits.some(h => h.R === nr.R && hyp(h.x - x, h.z - z) < nr.R.w / 2 + 4)) continue;   // the crossing itself
      along++;
    }
    if (n && along >= 3 && along / n > 0.3) continue;
    const cuts = [{ t: 0 }, ...hits, { t: 1 }];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const c0 = cuts[k], c1 = cuts[k + 1];
      const a = c0.R ? [c0.x, c0.z] : [ax, az], b = c1.R ? [c1.x, c1.z] : [bx, bz];
      const len = hyp(b[0] - a[0], b[1] - a[1]), need = (c0.R ? c0.R.w / 2 + 4 : 0) + (c1.R ? c1.R.w / 2 + 4 : 0);
      if (len < Math.max(need, 3)) continue;
      const pc = { a, b, w: sg.w, kind: sg.kind, district: sg.district, ra: c0.R ? { R: c0.R, s: c0.s } : null, rb: c1.R ? { R: c1.R, s: c1.s } : null };
      pc.orig = pc; P.push(pc);
    }
  }
  // ---- 2. free ends inside a road, or stopping just short of one: to the road's centreline
  const toRoad = (pc, end) => {
    const E = end === 'a' ? pc.a : pc.b, O = end === 'a' ? pc.b : pc.a;
    const L = hyp(E[0] - O[0], E[1] - O[1]), hx = (E[0] - O[0]) / L, hz = (E[1] - O[1]) / L;
    const inside = raster.kindAt(E[0], E[1]) === K.road || raster.kindAt(E[0] + hx, E[1] + hz) === K.road ? nearRoad(E[0], E[1], 0.5) : null;
    let hit = null;
    if (inside) {       // the street line's crossing with the road, a little either way
      const hs = roadHits(E[0] - hx * (inside.R.w / 2 + 6), E[1] - hz * (inside.R.w / 2 + 6), E[0] + hx * (inside.R.w / 2 + 6), E[1] + hz * (inside.R.w / 2 + 6));
      hit = hs.find(h => h.R === inside.R) || null;
      if (!hit) return false;
    } else {            // look ahead up to 14 m for a road (skipped at once if the raster shows none there)
      let any = false;
      for (let t = 1; t <= 14 && !any; t += 1) if (raster.kindAt(E[0] + hx * t, E[1] + hz * t) === K.road) any = true;
      if (!any) return true;
      for (let t = 1; t <= 14 && !hit; t += 1) {
        const nr = nearRoad(E[0] + hx * t, E[1] + hz * t, 0); if (!nr) continue;
        const reach = t + nr.R.w / 2 + 4, hs = roadHits(E[0], E[1], E[0] + hx * reach, E[1] + hz * reach);
        hit = hs[0] || null;
        if (hit && !passable(E[0], E[1], hit.x, hit.z)) hit = null;
        if (!hit) break;
      }
      if (!hit) return true;                                        // stays a free end
    }
    const len = hyp(hit.x - O[0], hit.z - O[1]); if (len < hit.R.w / 2 + 4) return false;
    if (end === 'a') { pc.a = [hit.x, hit.z]; pc.ra = { R: hit.R, s: hit.s }; } else { pc.b = [hit.x, hit.z]; pc.rb = { R: hit.R, s: hit.s }; }
    return true;
  };
  P = P.filter(pc => (pc.ra || toRoad(pc, 'a')) && (pc.rb || toRoad(pc, 'b')));
  // ---- 3. street to street: shared nodes, crossings split, T-snaps, dead ends joined
  let nodes = [];
  const NH = new Map();
  const nodeKey = (x, z) => Math.floor(x / 4) * 65536 + Math.floor(z / 4);
  const findNode = (x, z, tol) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const nd of NH.get((Math.floor(x / 4) + i) * 65536 + Math.floor(z / 4) + j) || []) if (!nd.dead && hyp(nd.x - x, nd.z - z) < tol) return nd;
    return null;
  };
  const addNode = (x, z, road = null) => { const nd = { id: nodes.length, x, z, road, ends: [] }; nodes.push(nd); const k = nodeKey(x, z); let a = NH.get(k); if (!a) NH.set(k, (a = [])); a.push(nd); return nd; };
  const nodeAt = (x, z, road) => {
    const nd = findNode(x, z, road ? 2 : SNAP);
    if (nd && (!road || !nd.road || nd.road.R === road.R)) { if (road && !nd.road) nd.road = road; return nd; }
    return addNode(x, z, road);
  };
  const link = (pc) => {
    pc.na = nodeAt(pc.a[0], pc.a[1], pc.ra); pc.nb = nodeAt(pc.b[0], pc.b[1], pc.rb);
    if (pc.na === pc.nb) { pc.dead = true; return; }
    pc.na.ends.push(pc); pc.nb.ends.push(pc);
  };
  for (const pc of P) link(pc);
  // snap piece ends to their node (clusters share one point; road nodes stay on the road)
  const settle = () => { for (const pc of P) if (!pc.dead) { pc.a = [pc.na.x, pc.na.z]; pc.b = [pc.nb.x, pc.nb.z]; } };
  settle();
  // piece hash
  const pieceHash = () => {
    const H = new Map();
    for (const pc of P) {
      if (pc.dead) continue;
      for (let i = Math.floor(Math.min(pc.a[0], pc.b[0]) / CELL), i1 = Math.floor(Math.max(pc.a[0], pc.b[0]) / CELL); i <= i1; i++)
        for (let j = Math.floor(Math.min(pc.a[1], pc.b[1]) / CELL), j1 = Math.floor(Math.max(pc.a[1], pc.b[1]) / CELL); j <= j1; j++) {
          const k = i * 8192 + j; let a = H.get(k); if (!a) H.set(k, (a = [])); a.push(pc);
        }
    }
    return H;
  };
  const unlink = (pc) => { pc.dead = true; for (const nd of [pc.na, pc.nb]) if (nd) nd.ends = nd.ends.filter(e => e !== pc); };
  const split = (pc, nd) => {            // split piece pc at node nd (lying on it)
    if (pc.na === nd || pc.nb === nd) return;
    unlink(pc);
    for (const [p0, n0, r0] of [[pc.a, pc.na, pc.ra], [pc.b, pc.nb, pc.rb]]) {
      const q = { ...pc, dead: false, a: p0, b: [nd.x, nd.z], ra: r0, rb: null, na: n0, nb: nd };
      if (hyp(q.b[0] - q.a[0], q.b[1] - q.a[1]) < 0.5) continue;
      P.push(q); n0.ends.push(q); nd.ends.push(q);
    }
  };
  // crossings between pieces (two grids meeting, a street over another district's street)
  { const H = pieceHash(), pts = new Map();
    for (const list of H.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const p = list[i], q = list[j]; if (p.dead || q.dead || p.na === q.na || p.na === q.nb || p.nb === q.na || p.nb === q.nb) continue;
      const h = segInter(p.a[0], p.a[1], p.b[0], p.b[1], q.a[0], q.a[1], q.b[0], q.b[1]); if (!h) continue;
      const Lp = hyp(p.b[0] - p.a[0], p.b[1] - p.a[1]), Lq = hyp(q.b[0] - q.a[0], q.b[1] - q.a[1]);
      if (h[0] * Lp < 0.5 || (1 - h[0]) * Lp < 0.5 || h[1] * Lq < 0.5 || (1 - h[1]) * Lq < 0.5) continue;   // at an end: T-snap below
      const x = p.a[0] + (p.b[0] - p.a[0]) * h[0], z = p.a[1] + (p.b[1] - p.a[1]) * h[0], key = Math.round(x * 4) + ',' + Math.round(z * 4);
      if (!pts.has(key)) pts.set(key, { x, z, ps: new Set() });
      pts.get(key).ps.add(p); pts.get(key).ps.add(q);
    }
    const kids = new Map();          // orig piece → its live parts (a piece may be split at several crossings)
    for (const pc of P) if (!pc.dead) { let a = kids.get(pc.orig); if (!a) kids.set(pc.orig, (a = [])); a.push(pc); }
    for (const c of pts.values()) {
      const nd = nodeAt(c.x, c.z, null);
      for (const pc of c.ps) {        // the piece may have been split already: find the live part through (x, z)
        const list = kids.get(pc.orig) || [];
        const live = list.find(q => !q.dead && segDist(c.x, c.z, q.a[0], q.a[1], q.b[0], q.b[1]).d < 0.05);
        if (!live) continue;
        const before = P.length; split(live, nd);
        for (let i = before; i < P.length; i++) list.push(P[i]);
      }
    }
    settle();
  }
  // T-snaps and dead-end joins: a free end on / just short of another street
  const deadEnds = () => nodes.filter(nd => !nd.dead && !nd.road && nd.ends.length === 1);
  for (let pass = 0; pass < 2; pass++) {
    const H = pieceHash();
    for (const nd of deadEnds()) {
      const pc = nd.ends[0]; if (!pc) continue;
      const O = pc.na === nd ? pc.b : pc.a, L = hyp(nd.x - O[0], nd.z - O[1]), hx = (nd.x - O[0]) / L, hz = (nd.z - O[1]) / L;
      const reach = pass === 0 ? SNAP * 1.5 : 12;
      let best = null;
      const tx = nd.x + hx * reach, tz = nd.z + hz * reach;
      for (const cellX of [Math.floor(nd.x / CELL), Math.floor(tx / CELL)]) for (const cellZ of [Math.floor(nd.z / CELL), Math.floor(tz / CELL)])
        for (const q of H.get(cellX * 8192 + cellZ) || []) {
          if (q.dead || q === pc || q.na === nd || q.nb === nd) continue;
          let t = null, at = null;
          if (pass === 0) { const sd = segDist(nd.x, nd.z, q.a[0], q.a[1], q.b[0], q.b[1]); if (sd.d < SNAP * 1.5) { t = sd.d; at = sd.t; } }
          else { const h = segInter(nd.x, nd.z, tx, tz, q.a[0], q.a[1], q.b[0], q.b[1]); if (h) { t = h[0] * reach; at = h[1]; } }
          if (t === null || (best && best.t <= t)) continue;
          // not at a shallow angle
          const qx = q.b[0] - q.a[0], qz = q.b[1] - q.a[1], ql = hyp(qx, qz), cos = Math.abs(hx * qx + hz * qz) / ql;
          if (cos > 0.82) continue;
          best = { t, q, at };
        }
      if (!best) continue;
      const q = best.q, x = q.a[0] + (q.b[0] - q.a[0]) * best.at, z = q.a[1] + (q.b[1] - q.a[1]) * best.at;
      if (pass === 1 && !passable(nd.x, nd.z, x, z)) continue;
      // target: an existing end of q if close, else a new node splitting q
      const Lq = hyp(q.b[0] - q.a[0], q.b[1] - q.a[1]);
      let tn = best.at * Lq < 2 ? q.na : (1 - best.at) * Lq < 2 ? q.nb : null;
      if (!tn) { tn = nodeAt(x, z, null); split(q, tn); }
      if (tn === nd || tn.road) continue;
      // move the dead end onto the target node
      nd.ends = nd.ends.filter(e => e !== pc); nd.dead = true;
      if (pc.na === nd) { pc.na = tn; pc.a = [tn.x, tn.z]; } else { pc.nb = tn; pc.b = [tn.x, tn.z]; }
      tn.ends.push(pc);
    }
    settle();
  }
  // ---- 4. shallow angles at nodes (streets with streets, streets with the road they join)
  for (const pc of P) {
    if (pc.dead) continue;
    for (const [nd, E, O] of [[pc.na, pc.a, pc.b], [pc.nb, pc.b, pc.a]]) {
      const L = hyp(O[0] - E[0], O[1] - E[1]); if (L < 1e-6) { unlink(pc); break; }
      const ux = (O[0] - E[0]) / L, uz = (O[1] - E[1]) / L;
      if (nd.road) { const [rx, rz] = roadDir(nd.road.R, nd.road.s); if (Math.abs(ux * rx + uz * rz) > 0.8) { unlink(pc); break; } }
      for (const q of nd.ends) {
        if (q === pc || q.dead) continue;
        const Q = q.na === nd ? q.b : q.a, Lq = hyp(Q[0] - nd.x, Q[1] - nd.z); if (Lq < 1e-6) continue;
        if ((ux * (Q[0] - nd.x) + uz * (Q[1] - nd.z)) / Lq > 0.87) { unlink(L < Lq ? pc : q); }
      }
      if (pc.dead) break;
    }
  }
  // ---- 5. crowded junctions along a road: line up opposite side streets, drop ones too close to another junction
  { const byRoad = new Map();
    for (const nd of nodes) if (!nd.dead && nd.road && nd.ends.some(e => !e.dead)) { let a = byRoad.get(nd.road.R); if (!a) byRoad.set(nd.road.R, (a = [])); a.push(nd); }
    // road–road junctions on each road (at grade)
    const X = ROADS.map(() => []), RI = new Map(ROADS.map((R, i) => [R.id, i]));
    for (const c of computeCrossings()) {
      if (c.type !== 'intersection' || !RI.has(c.a) || !RI.has(c.b)) continue;
      X[RI.get(c.a)].push({ s: c.sa, hw: ROADS[RI.get(c.b)].w / 2 }); X[RI.get(c.b)].push({ s: c.sb, hw: ROADS[RI.get(c.a)].w / 2 });
    }
    for (const [R, list] of byRoad) {
      const gap = { national: 26, arterial: 22, collector: 16, old: 12, street: 10 }[R.cls] ?? 14;
      list.sort((p, q) => p.road.s - q.road.s);
      // opposite streets within 6 m of each other: one crossroads
      for (let i = 0; i + 1 < list.length; i++) {
        const p = list[i], q = list[i + 1]; if (p.dead || q.dead || q.road.s - p.road.s > 6) continue;
        const s = (p.road.s + q.road.s) / 2, at = R.align.at(s);
        p.x = at.x; p.z = at.z; p.road.s = s;
        for (const e of q.ends) { if (e.na === q) e.na = p; if (e.nb === q) e.nb = p; p.ends.push(e); }
        q.ends = []; q.dead = true;
      }
      settle();
      const live = list.filter(nd => !nd.dead);
      const rr = X[ROADS.indexOf(R)];
      let last = -1e9;
      for (const nd of live) {
        const nearRR = rr.some(v => Math.abs(v.s - nd.road.s) < v.hw + gap * 0.8);
        if (nearRR || nd.road.s - last < gap) { for (const e of [...nd.ends]) unlink(e); nd.dead = true; continue; }
        last = nd.road.s;
      }
    }
  }
  // ---- 6. merge street nodes joined by a very short piece; remove short dead-end stubs and orphans
  for (const pc of P) {
    if (pc.dead || pc.na.road || pc.nb.road) continue;
    if (hyp(pc.b[0] - pc.a[0], pc.b[1] - pc.a[1]) >= 5) continue;
    const keep = pc.na, gone = pc.nb; unlink(pc);
    keep.x = (keep.x + gone.x) / 2; keep.z = (keep.z + gone.z) / 2;
    for (const e of gone.ends) { if (e.na === gone) e.na = keep; if (e.nb === gone) e.nb = keep; keep.ends.push(e); }
    gone.ends = []; gone.dead = true;
  }
  settle();
  for (let it = 0; it < 6; it++) {
    let changed = false;
    for (const pc of P) {
      if (pc.dead) continue;
      const L = hyp(pc.b[0] - pc.a[0], pc.b[1] - pc.a[1]);
      const da = !pc.na.road && pc.na.ends.length === 1, db = !pc.nb.road && pc.nb.ends.length === 1;
      if ((da && db && L < 40) || ((da || db) && L < (pc.kind === 'alley' ? 10 : 16)) || L < 3) { unlink(pc); changed = true; }
    }
    if (!changed) break;
  }
  // ---- output
  const out = [];
  for (const pc of P) {
    if (pc.dead) continue;
    if (!passable(pc.a[0], pc.a[1], pc.b[0], pc.b[1])) continue;
    out.push({ id: out.length, a: pc.a, b: pc.b, w: pc.w, kind: pc.kind, district: pc.district,
      ra: pc.na.road ? { road: pc.na.road.R.id, s: pc.na.road.s } : null, rb: pc.nb.road ? { road: pc.nb.road.R.id, s: pc.nb.road.s } : null });
  }
  return out;
}
