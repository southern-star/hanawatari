// The road network: every planned road (where it is at grade) and every local street is a "way"; ways meet at nodes
// (junctions). For each node we know its arms (a way leaving it), where each arm's plain ribbon starts again (the
// cut-back), the kerb returns round the corners, the junction's carriageway polygon, the corner sidewalks, the zebra
// crossings and the stop lines. Level crossings are recorded on the roads too (markings stop, the road rises to
// the rail top). The road mesher draws ribbons outside the cuts and the junction pieces inside; street furniture,
// viaduct piers and the raster ask the network where the carriageways are.
// Pure data (no three.js).
import { ROADS } from './roads.js';
import { LINES } from './rail.js';
import { heightAt } from './terrain.js';
import { groundAt } from './ground.js';
import { Alignment, clamp, smoothstep } from './geom.js';
import { computeCrossings } from './crossings.js';
import { STATION_DRIVES } from './station-layout.js';

export const SIDEWALK = { national: 4, arterial: 3.5, collector: 2.5, old: 0, street: 0, alley: 0, ramp: 0, expressway: 0 };
const RANK = { alley: 0, street: 1, old: 2, collector: 3, arterial: 4, national: 5 };
const KERB_R = { alley: 1.5, street: 3, old: 5, collector: 7, arterial: 9, national: 10 };   // by the smaller way
const CROSSWALK = 4, STOPGAP = 2;            // zebra width, gap to the stop line (m)
const RAIL_HW = { jr: 13, private: 6, metro: 5.5, tram: 3.8, agt: 4.5 };

// ------------------------------------------------------------------ ways
function roadWay(R) {
  const sw = SIDEWALK[R.cls] || 0, hw = R.w / 2;
  const w = { id: 'r:' + R.id, kind: 'road', cls: R.cls, R, align: R.align, length: R.align.length, hw, cw: hw - sw, sw, median: R.median || 0, lanes: R.lanes || 2,
    nodes: [], lx: [], trims: [], walkGaps: [] };
  w.baseY = (s) => R.profile.yAt(s);
  w.yAt = (s) => { let y = R.profile.yAt(s); for (const L of w.lx) { const e = Math.abs(s - L.s) - L.hw; if (e < 10) y += L.dy * (1 - smoothstep(0, 10, e)); } return y; };
  w.atGrade = (s) => { const q = R.align.at(s); return Math.abs(R.profile.yAt(s) - heightAt(q.x, q.z)) < 1.5; };
  return w;
}
function streetWay(st) {
  const A = new Alignment([st.a, st.b]), alley = st.kind === 'alley';
  const w = { id: 's:' + st.id, kind: alley ? 'alley' : 'street', cls: alley ? 'alley' : 'street', st, align: A, length: A.length, hw: st.w / 2, cw: st.w / 2, sw: 0, median: 0, lanes: alley ? 1 : 2,
    nodes: [], lx: [], trims: [], walkGaps: [] };
  w.yAt = (s) => { const q = A.at(s); return groundAt(q.x, q.z); };
  w.baseY = w.yAt;
  w.atGrade = () => true;
  return w;
}

// ------------------------------------------------------------------ junction geometry
/** Unit direction of an arm (away from the node): the chord to a point a few metres along, so curves read right. */
function armDir(way, s, dir) {
  const L = way.length, s1 = clamp(s + dir * Math.min(8, dir > 0 ? L - s : s), 0, L);
  const p = way.align.at(s), q = way.align.at(s1);
  let ux = q.x - p.x, uz = q.z - p.z, l = Math.hypot(ux, uz);
  if (l < 0.5) { ux = p.hx * dir; uz = p.hz * dir; l = 1; }
  return [ux / l, uz / l];
}

/** Lay out one node: sort arms, compute corners, cut-backs, polygons. */
function layout(nd) {
  const A = nd.arms;
  for (const a of A) a.ang = Math.atan2(a.uz, a.ux);
  A.sort((p, q) => p.ang - q.ang);
  const n = A.length;
  for (const a of A) { a.cut = 0.5; a.cutL = 0; a.cutR = 0; }
  nd.corners = [];
  // sector between arm i and the next arm (counter-clockwise in x–z): arm i's +n side faces arm j's −n side
  for (let i = 0; i < n; i++) {
    const a = A[i], b = A[(i + 1) % n];
    let alpha = b.ang - a.ang; if (n === 1) alpha = 2 * Math.PI; else if (alpha <= 0) alpha += 2 * Math.PI;
    const cor = { a, b, alpha };
    nd.corners.push(cor);
    if (alpha > Math.PI * 0.95) { cor.straight = true; continue; }           // no corner on this side
    const sa = Math.sin(alpha), ca = Math.cos(alpha);
    const ta = (b.cw + a.cw * ca) / sa, tb = (a.cw + b.cw * ca) / sa;       // kerb lines meet at ta along a, tb along b
    const small = RANK[a.cls] < RANK[b.cls] ? a.cls : b.cls;
    let r = KERB_R[small] ?? 3;
    let T = r / Math.tan(alpha / 2);
    // keep the return inside what the arms can give
    const room = Math.min(a.room, b.room) - Math.max(ta, tb) - 0.5;
    if (T > room) { T = Math.max(0, room); r = T * Math.tan(alpha / 2); }
    cor.ta = ta; cor.tb = tb; cor.T = T; cor.r = r;
    a.cutL = Math.max(a.cutL, ta + T);                                         // a's +n side
    b.cutR = Math.max(b.cutR, tb + T);                                         // b's −n side
  }
  for (const a of A) a.cut = Math.max(0.5, a.cutL, a.cutR);
  // corner points (world) for the polygons. At a minor junction the through road keeps its ribbon: its side of each
  // corner ends where that corner's kerb return begins (the per-side cut), not at the arm's overall cut
  const P = (a, t, d) => [nd.x + a.ux * t - a.uz * d, nd.z + a.uz * t + a.ux * d];     // n = (−uz, ux)
  const cutOf = (a, side) => (nd.minor && a.way === nd.minor ? Math.max(0.5, side > 0 ? a.cutL : a.cutR) : a.cut);
  nd.fill = [];                                                                // carriageway outline, ccw
  nd.walks = [];                                                               // corner sidewalks
  for (let i = 0; i < n; i++) {
    const cor = nd.corners[i], a = cor.a, b = cor.b;
    // arm a's cut line, right kerb then left kerb
    nd.fill.push({ p: P(a, cutOf(a, -1), -a.cw), arm: a, t: cutOf(a, -1) }, { p: P(a, cutOf(a, 1), a.cw), arm: a, t: cutOf(a, 1) });
    if (cor.straight || n === 1) continue;
    // along a's left kerb back to the tangent point, round the return, out along b's right kerb to b's cut
    const ta = cor.ta + cor.T, tb = cor.tb + cor.T, ca = cutOf(a, 1), cb = cutOf(b, -1);
    if (ca > ta + 0.05) nd.fill.push({ p: P(a, ta, a.cw), arm: a, t: ta });
    const arc = [];
    if (cor.r > 0.2) {
      const C = P(a, ta, a.cw + cor.r);                                        // centre: r beyond a's kerb at the tangent point
      const Pa = P(a, ta, a.cw), Pb = P(b, tb, -b.cw);
      const a0 = Math.atan2(Pa[1] - C[1], Pa[0] - C[0]);
      let a1 = Math.atan2(Pb[1] - C[1], Pb[0] - C[0]), da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const k = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 12)));
      for (let j = 1; j < k; j++) { const t = j / k, ang = a0 + da * t; arc.push({ p: [C[0] + Math.cos(ang) * cor.r, C[1] + Math.sin(ang) * cor.r], mix: [a, ta, b, tb, t] }); }
    }
    nd.fill.push(...arc);
    if (cb > tb + 0.05) nd.fill.push({ p: P(b, tb, -b.cw), arm: b, t: tb });
    // corner sidewalk: between the kerb (return) and the building lines, from a's cut to b's cut
    if (a.sw > 0 || b.sw > 0) {
      const alpha = cor.alpha, sa = Math.sin(alpha), cs = Math.cos(alpha);
      const oa = (b.hw + a.hw * cs) / sa, ob = (a.hw + b.hw * cs) / sa;       // building lines meet here
      const O = P(a, oa, a.hw);
      const kerb = [{ p: P(a, ca, a.cw), arm: a, t: ca }];
      if (ca > ta + 0.05) kerb.push({ p: P(a, ta, a.cw), arm: a, t: ta });
      kerb.push(...arc);
      if (cb > tb + 0.05) kerb.push({ p: P(b, tb, -b.cw), arm: b, t: tb });
      kerb.push({ p: P(b, cb, -b.cw), arm: b, t: cb });
      const outer = [{ p: P(b, cb, -b.hw), arm: b, t: cb }];
      // the building-line corner (unless the corner is so sharp or open that it lies far out)
      if (oa > 0 && ob > 0 && oa < a.room + ca && ob < b.room + cb) outer.push({ p: O, arm: a, t: Math.min(oa, ca), mixO: [a, Math.min(oa, ca), b, Math.min(ob, cb)] });
      outer.push({ p: P(a, ca, a.hw), arm: a, t: ca });
      nd.walks.push({ kerb, outer });
    }
  }
  // crossings and stop lines: on road arms with sidewalks, where the junction meets another road with sidewalks
  // (zebras on every road arm where two planned roads meet and at least one has sidewalks to link)
  const roadsHere = new Set(A.filter(a => a.kind === 'road').map(a => a.way)).size, walks = A.some(a => a.kind === 'road' && a.sw > 0);
  for (const a of A) {
    a.crosswalk = (a.kind === 'road' || !!(a.way.st && a.way.st.station && a.way.st.station.crosswalk)) && roadsHere >= 2 && walks;
    a.markFrom = a.cut + (a.crosswalk ? CROSSWALK + STOPGAP + 0.6 : a.kind === 'road' ? 1.5 : 0.8);
  }
  return nd;
}

/** The signal group of an approach along `way` at a junction whose major road is `majorWay`: 0 = the major road (and a
 *  station drive facing it across the junction), 1 = the others (as city/signals.js runs them). */
export const phaseOf = (way, majorWay) => (way === majorWay || (way.st && way.st.station && way.st.station.phaseMajor) ? 0 : 1);

// ------------------------------------------------------------------ build
let NET = null;
/** Build (once) from the cleaned-up streets. */
export function buildNetwork(streets) {
  if (NET) return NET;
  const ways = [], byRoad = new Map();
  for (const R of ROADS) { if (R.cls === 'expressway' || R.cls === 'ramp') continue; const w = roadWay(R); ways.push(w); byRoad.set(R.id, w); }
  for (const st of streets) ways.push(streetWay(st));
  // the station square's drives (plan/station-layout.js): streets off 宿場町通り into the square, joining its junctions
  for (const D of STATION_DRIVES) {
    const R = byRoad.get(D.road); if (!R) continue;
    let s = 0, bd = Infinity;
    const at = (t) => { const q = R.align.at(t), d = Math.hypot(q.x - D.at[0], q.z - D.at[1]); if (d < bd) { bd = d; s = t; } };
    for (let t = 0; t <= R.length; t += 2) at(t);
    for (let h = 1; h > 0.01; h /= 2) { const s0 = s; at(s0 - h); at(s0 + h); }
    const q = R.align.at(s);
    ways.push(streetWay({ id: D.id, a: [q.x, q.z], b: D.to, w: D.w, kind: 'street', district: null, station: D, ra: { road: D.road, s }, rb: null }));
  }
  const nodes = [];
  const addNode = (x, z) => { const nd = { id: nodes.length, x, z, arms: [], ways: new Map() }; nodes.push(nd); return nd; };
  const attach = (nd, way, s) => { if (!nd.ways.has(way)) { nd.ways.set(way, s); way.nodes.push({ nd, s }); } };
  // road–road junctions (at grade)
  for (const c of computeCrossings()) {
    if (c.type !== 'intersection') continue;
    const wa = byRoad.get(c.a), wb = byRoad.get(c.b); if (!wa || !wb) continue;
    if (!wa.atGrade(c.sa) || !wb.atGrade(c.sb)) continue;
    const nd = addNode(c.x, c.z); attach(nd, wa, c.sa); attach(nd, wb, c.sb); nd.roadroad = true;
  }
  // streets ending on roads; street–street nodes
  const SN = new Map(), key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
  const findSN = (x, z) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const nd = SN.get((Math.round(x * 2) + i) + ',' + (Math.round(z * 2) + j)); if (nd && Math.hypot(nd.x - x, nd.z - z) < 0.6) return nd; } return null; };
  const roadNodes = new Map();         // road id → [{ s, nd }]
  for (const w of ways) {
    if (w.kind === 'road') continue;
    const st = w.st;
    for (const [end, P, att] of [[0, st.a, st.ra], [w.length, st.b, st.rb]]) {
      if (att) {
        const rw = byRoad.get(att.road); if (!rw) continue;
        let list = roadNodes.get(att.road); if (!list) roadNodes.set(att.road, (list = []));
        let hit = list.find(e => Math.abs(e.s - att.s) < 2.5);
        if (!hit) {
          // a road–road junction right there? join it
          const rr = rw.nodes.find(e => e.nd.roadroad && Math.abs(e.s - att.s) < 3);
          if (rr) hit = { s: rr.s, nd: rr.nd };
          else { const q = rw.align.at(att.s); const nd = addNode(q.x, q.z); attach(nd, rw, att.s); hit = { s: att.s, nd }; }
          list.push(hit);
        }
        attach(hit.nd, w, end);
      } else {
        let nd = findSN(P[0], P[1]);
        if (!nd) { nd = addNode(P[0], P[1]); SN.set(key(P[0], P[1]), nd); }
        attach(nd, w, end);
      }
    }
  }
  // level crossings: the road rises to the rail top over the corridor, markings stop, stop lines before it
  for (const c of computeCrossings()) {
    if (c.type !== 'level-crossing' && c.type !== 'street-running') continue;
    const rw = byRoad.get(c.a) || byRoad.get(c.b), L = LINES.find(l => l.id === c.a || l.id === c.b); if (!rw || !L) continue;
    const s = byRoad.get(c.a) ? c.sa : c.sb, sr = L.id === c.a ? c.sa : c.sb;
    const q = rw.align.at(s), lq = L.align.at(sr), sin = Math.abs(q.hx * lq.hz - q.hz * lq.hx) || 1;
    const hw = (RAIL_HW[L.kind] || 5) / sin;
    rw.lx.push({ s, hw, dy: L.kind === 'tram' ? 0 : Math.max(0, L.profile.yAt(sr) - rw.baseY(s) - 0.04), line: L.id, tram: L.kind === 'tram' });
  }
  // per node: arms. room = how far the arm may reach before meeting the next junction along its way (half-way)
  for (const w of ways) w.nodes.sort((p, q) => p.s - q.s);
  const roomOf = (w, s, dir) => {
    let next = null;
    for (const e of w.nodes) if (dir > 0 ? e.s > s + 0.5 : e.s < s - 0.5) { if (!next || (dir > 0 ? e.s < next : e.s > next)) next = e.s; }
    const end = dir > 0 ? w.length - s : s;
    return next === null ? end : Math.abs(next - s) / 2;
  };
  for (const nd of nodes) {
    for (const [w, s] of nd.ways) {
      for (const dir of [1, -1]) {
        const len = dir > 0 ? w.length - s : s;
        if (len < 1) continue;
        const [ux, uz] = armDir(w, s, dir);
        nd.arms.push({ way: w, s, dir, ux, uz, cw: w.cw, hw: w.hw, sw: w.sw, kind: w.kind, cls: w.cls, len, room: Math.min(roomOf(w, s, dir), 60) });
      }
    }
    // a road that crosses another just before its own end: drop the stub beyond the junction
    for (const a of [...nd.arms]) if (a.kind === 'road' && a.len < 30 && nd.arms.filter(b => b.way === a.way).length === 2) {
      nd.arms.splice(nd.arms.indexOf(a), 1);
      a.way.trims.push(a.dir > 0 ? [a.s, a.way.length] : [0, a.s]);
    }
    // a dead end, or a plain continuation (two arms in line, same cross-section), is no junction
    if (nd.arms.length < 2) { nd.plain = true; continue; }
    if (nd.arms.length === 2) {
      const [p, q] = nd.arms;
      if (p.ux * q.ux + p.uz * q.uz < -0.985 && Math.abs(p.cw - q.cw) < 0.01 && p.sw === q.sw) { nd.plain = true; continue; }
    }
    // a minor junction: a road passing through with only streets / alleys joining it. The road runs on unbroken
    // (lanes, median, markings); only its sidewalk opens for each street mouth
    { const count = new Map(); for (const a of nd.arms) count.set(a.way, (count.get(a.way) || 0) + 1);
      for (const [w, k] of count) if (k === 2 && w.kind === 'road' && RANK[w.cls] >= 2 && nd.arms.every(a => a.way === w || a.kind !== 'road')) nd.minor = w; }
    layout(nd);
    nd.fills = [{ verts: nd.fill, c: [nd.x, nd.z] }];
    if (nd.minor) {
      const W = nd.minor, s = nd.ways.get(W), q = W.align.at(s), rx = -q.hz, rz = q.hx;
      const fwd = nd.arms.find(a => a.way === W && a.dir > 0), back = nd.arms.find(a => a.way === W && a.dir < 0);
      nd.fills = [];
      for (const [side, cf, cb] of [[1, fwd ? fwd.cutL : 0, back ? back.cutR : 0], [-1, fwd ? fwd.cutR : 0, back ? back.cutL : 0]]) {
        if (cf < 0.6 && cb < 0.6) continue;
        W.walkGaps.push([s - cb, s + cf, side]);
        const f = (p) => side * ((p[0] - nd.x) * rx + (p[1] - nd.z) * rz) - (W.cw - 0.02);
        const verts = clipHalf(nd.fill, f);
        if (verts) { let cx = 0, cz = 0; for (const v of verts) { cx += v.p[0]; cz += v.p[1]; } nd.fills.push({ verts, c: [cx / verts.length, cz / verts.length] }); }
      }
    }
    nd.y = 0; for (const a of nd.arms) nd.y += a.way.yAt(a.s); nd.y /= nd.arms.length || 1;
    // the major road sets the junction height
    let major = null; for (const a of nd.arms) if (!major || RANK[a.cls] > RANK[major.cls]) major = a;
    if (major) nd.y = major.way.yAt(major.s);
  }
  // cut intervals along each way (no plain ribbon / no markings there)
  for (const w of ways) {
    w.cuts = []; w.marks = [];
    for (const { nd, s } of w.nodes) {
      if (nd.plain) continue;
      if (nd.minor === w) continue;                                           // the road runs straight through
      let c0 = 0, c1 = 0, m0 = 0, m1 = 0;
      for (const a of nd.arms) if (a.way === w) { if (a.dir > 0) { c1 = a.cut; m1 = a.markFrom; } else { c0 = a.cut; m0 = a.markFrom; } }
      if (!c0 && !c1) continue;
      w.cuts.push([s - c0, s + c1, nd]); w.marks.push([s - m0, s + m1]);
    }
    for (const [a, b] of w.trims) { w.cuts.push([a, b, null]); w.marks.push([a, b]); }
    for (const L of w.lx) if (!L.tram) w.marks.push([L.s - L.hw - 3, L.s + L.hw + 3]);
    w.cuts.sort((p, q) => p[0] - q[0]);
    w.inCut = (s) => w.cuts.some(c => s > c[0] && s < c[1]);
    w.inWalkGap = (s, side) => w.walkGaps.some(g => g[2] === side && s > g[0] && s < g[1]);
    /** Is s within m metres of any junction on this way (its cut, or a side street's mouth)? */
    w.nearJunction = (s, m) => w.cuts.some(c => s > c[0] - m && s < c[1] + m) || w.walkGaps.some(g => s > g[0] - m && s < g[1] + m);
    w.inMarkGap = (s) => w.marks.some(c => s > c[0] && s < c[1]);
  }
  // spatial hash of carriageways (ribbon samples) and junction polygons, for "is this spot on a road?" queries
  const CELL = 24, H = new Map();
  const put = (x0, z0, x1, z1, item) => { for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = i * 8192 + j; let a = H.get(k); if (!a) H.set(k, (a = [])); a.push(item); } };
  for (const w of ways) {
    const n = w.kind === 'road' ? Math.max(1, Math.ceil(w.length / 8)) : 1;          // streets are straight: one piece
    for (let i = 0; i < n; i++) {
      const s0 = (w.length * i) / n, s1 = (w.length * (i + 1)) / n;
      if (!w.atGrade((s0 + s1) / 2) || w.trims.some(([a, b]) => (s0 + s1) / 2 > a && (s0 + s1) / 2 < b)) continue;
      const p = w.align.at(s0), q = w.align.at(s1), r = w.hw + 1;
      put(Math.min(p.x, q.x) - r, Math.min(p.z, q.z) - r, Math.max(p.x, q.x) + r, Math.max(p.z, q.z) + r, { w, ax: p.x, az: p.z, bx: q.x, bz: q.z, s0, s1 });
    }
  }
  for (const nd of nodes) {
    if (nd.plain || !nd.fills) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const f of nd.fills) for (const v of f.verts) { x0 = Math.min(x0, v.p[0]); z0 = Math.min(z0, v.p[1]); x1 = Math.max(x1, v.p[0]); z1 = Math.max(z1, v.p[1]); }
    for (const wk of nd.walks) for (const v of [...wk.kerb, ...wk.outer]) { x0 = Math.min(x0, v.p[0]); z0 = Math.min(z0, v.p[1]); x1 = Math.max(x1, v.p[0]); z1 = Math.max(z1, v.p[1]); }
    nd.bbox = [x0, z0, x1, z1];
    put(x0, z0, x1, z1, { nd });
  }
  NET = { ways, nodes, byRoad, hash: H, CELL };
  return NET;
}

/** Keep the part of a polygon where f(p) ≥ 0 (Sutherland–Hodgman); new vertices carry their height. */
function clipHalf(verts, f) {
  const out = [];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length], fa = f(a.p), fb = f(b.p);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t], y: vertexY(a) + (vertexY(b) - vertexY(a)) * t }); }
  }
  return out.length >= 3 ? out : null;
}

/** Height of a junction-outline vertex: on its arm's centreline at that distance, or blended along a kerb return. */
export function vertexY(v) {
  if (v.y !== undefined) return v.y;
  const m = v.mix || v.mixO;
  if (m) { const [a, ta, b, tb, t = 0.5] = m; const ya = a.way.yAt(a.s + a.dir * ta), yb = b.way.yAt(b.s + b.dir * tb); return ya + (yb - ya) * t; }
  return v.arm.way.yAt(v.arm.s + v.arm.dir * v.t);
}

const pip = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i].p, [xj, zj] = poly[j].p; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };

/**
 * What is at (x, z) at street level: { what: 'junction' | 'carriageway' | 'sidewalk', way?, s?, d?, nd? } or null.
 * margin widens the carriageway test (keep furniture that far off the kerb).
 */
export function roadSpaceAt(x, z, margin = 0) {
  const N = NET; if (!N) return null;
  let best = null;
  for (const it of N.hash.get(Math.floor(x / N.CELL) * 8192 + Math.floor(z / N.CELL)) || []) {
    if (it.nd) {
      const nd = it.nd, [x0, z0, x1, z1] = nd.bbox;
      if (x < x0 - margin || x > x1 + margin || z < z0 - margin || z > z1 + margin) continue;
      for (const f of nd.fills) {
        if (pip(x, z, f.verts)) return { what: 'junction', nd };
        if (margin > 0) for (const v of f.verts) if (Math.hypot(v.p[0] - x, v.p[1] - z) < margin) return { what: 'junction', nd };
      }
      continue;
    }
    const w = it.w, ex = it.bx - it.ax, ez = it.bz - it.az, L2 = ex * ex + ez * ez || 1e-9;
    const tr = ((x - it.ax) * ex + (z - it.az) * ez) / L2, L = Math.sqrt(L2);
    if (tr < -0.02 / L || tr > 1 + 0.02 / L) continue;              // beyond this piece: its neighbour (or nothing) decides
    const t = clamp(tr, 0, 1), px = it.ax + ex * t, pz = it.az + ez * t;
    const d = ((x - px) * (-ez / L) + (z - pz) * (ex / L));
    const s = it.s0 + (it.s1 - it.s0) * t;
    const ad = Math.abs(d);
    if (ad < w.cw + margin) { const hit = { what: 'carriageway', way: w, s, d }; if (!best || best.what !== 'carriageway') best = hit; }
    else if (ad < w.hw && w.sw > 0 && !best) best = { what: 'sidewalk', way: w, s, d };
  }
  return best;
}
export const network = () => NET;
