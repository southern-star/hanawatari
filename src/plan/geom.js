// Plan geometry: alignments (straights joined by circular curves), vertical profiles, polygons and a
// spatial index for nearest-point queries. Pure JS (no three.js) so it also runs in node tools and workers.
// Conventions as in the rest of the project: metres, +X east, -Z north (a north-up map has +Z pointing down).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

/** Deterministic PRNG (mulberry32). r() in [0,1), r.range(a,b), r.int(a,b), r.pick(arr), r.chance(p). */
export function prng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

// ------------------------------------------------------------------ spatial index over segments
/** Buckets polyline segments into square cells for fast nearest-segment queries. */
class SegIndex {
  constructor(cell = 64) { this.cell = cell; this.map = new Map(); }
  _key(ix, iz) { return ix * 100003 + iz; }
  add(i, x0, z0, x1, z1) {
    const c = this.cell;
    const ax = Math.floor(Math.min(x0, x1) / c), bx = Math.floor(Math.max(x0, x1) / c);
    const az = Math.floor(Math.min(z0, z1) / c), bz = Math.floor(Math.max(z0, z1) / c);
    for (let ix = ax; ix <= bx; ix++) for (let iz = az; iz <= bz; iz++) {
      const k = this._key(ix, iz); let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(i);
    }
  }
  /** Calls fn(segIndex) for every segment in cells overlapping the square of half-size r around (x,z). */
  near(x, z, r, fn) {
    const c = this.cell;
    const ax = Math.floor((x - r) / c), bx = Math.floor((x + r) / c), az = Math.floor((z - r) / c), bz = Math.floor((z + r) / c);
    for (let ix = ax; ix <= bx; ix++) for (let iz = az; iz <= bz; iz++) { const a = this.map.get(this._key(ix, iz)); if (a) for (const i of a) fn(i); }
  }
}

// ------------------------------------------------------------------ alignment
/**
 * Horizontal alignment through control points [x, z, r?]: straight tangents joined at every interior point by
 * a circular curve of radius r (default 0 = sharp corner). Like a real railway / road centreline.
 * at(s) → { x, z, hx, hz (unit heading), k (signed curvature, + = turning right/clockwise on a north-up map) }.
 * nearest(x, z) → { s, d } where d is the signed offset (+ = right of the direction of travel).
 */
export class Alignment {
  constructor(points, { name = '' } = {}) {
    const P = points.map(p => (Array.isArray(p) ? { x: p[0], z: p[1], r: p[2] || 0 } : { r: 0, ...p }));
    this.name = name; this.points = P; this.pieces = []; this.warnings = [];
    let cur = { x: P[0].x, z: P[0].z };
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (i === P.length - 1 || !b.r) { this._line(cur, b); cur = { x: b.x, z: b.z }; continue; }
      const c = P[i + 1];
      let ux = b.x - a.x, uz = b.z - a.z; const lu = Math.hypot(ux, uz); ux /= lu; uz /= lu;
      let vx = c.x - b.x, vz = c.z - b.z; const lv = Math.hypot(vx, vz); vx /= lv; vz /= lv;
      const cross = ux * vz - uz * vx, dot = clamp(ux * vx + uz * vz, -1, 1);
      const th = Math.acos(dot);
      if (th < 1e-4) { this._line(cur, b); cur = { x: b.x, z: b.z }; continue; }
      let R = b.r, T = R * Math.tan(th / 2);
      const room = Math.min(Math.hypot(b.x - cur.x, b.z - cur.z), lv / 2);
      if (T > room) { R = room / Math.tan(th / 2); T = room; this.warnings.push(`${name}: curve at (${b.x},${b.z}) radius ${b.r} → ${R.toFixed(0)} (no room)`); }
      const A = { x: b.x - ux * T, z: b.z - uz * T }, B = { x: b.x + vx * T, z: b.z + vz * T };
      this._line(cur, A);
      const sgn = cross > 0 ? 1 : -1;
      const cx = A.x + -uz * R * sgn, cz = A.z + ux * R * sgn;
      this.pieces.push({ type: 'arc', cx, cz, R, a0: Math.atan2(A.z - cz, A.x - cx), dir: sgn, ang: th, len: R * th, x0: A.x, z0: A.z });
      cur = B;
    }
    let s = 0; for (const p of this.pieces) { p.s0 = s; s += p.len; }
    this.length = s;
    this._samples = null; this._index = null;
  }
  _line(a, b) { const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 1e-6) return; this.pieces.push({ type: 'line', x0: a.x, z0: a.z, hx: (b.x - a.x) / len, hz: (b.z - a.z) / len, len }); }
  _piece(s) {
    const P = this.pieces; let lo = 0, hi = P.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P[m].s0 <= s) lo = m; else hi = m - 1; }
    return P[lo];
  }
  at(s, out = {}) {
    s = clamp(s, 0, this.length);
    const p = this._piece(s), t = s - p.s0;
    if (p.type === 'line') { out.x = p.x0 + p.hx * t; out.z = p.z0 + p.hz * t; out.hx = p.hx; out.hz = p.hz; out.k = 0; return out; }
    const a = p.a0 + p.dir * (t / p.R);
    out.x = p.cx + Math.cos(a) * p.R; out.z = p.cz + Math.sin(a) * p.R;
    out.hx = -Math.sin(a) * p.dir; out.hz = Math.cos(a) * p.dir; out.k = p.dir / p.R;
    return out;
  }
  /** Point at along-distance s and lateral offset d (+ = right). */
  offset(s, d) { const q = this.at(s); return [q.x - q.hz * d, q.z + q.hx * d]; }
  sample(step = 4) {
    const n = Math.max(1, Math.ceil(this.length / step)), out = [];
    for (let i = 0; i <= n; i++) { const s = (this.length * i) / n; out.push({ s, ...this.at(s) }); }
    return out;
  }
  get samples() { return this._samples || (this._samples = this.sample(4)); }
  get index() {
    if (this._index) return this._index;
    const S = this.samples, ix = new SegIndex(64);
    for (let i = 0; i < S.length - 1; i++) ix.add(i, S[i].x, S[i].z, S[i + 1].x, S[i + 1].z);
    return (this._index = ix);
  }
  /** Nearest point within maxD (null if none). d = signed lateral offset (+ right of travel). */
  nearest(x, z, maxD = 1e9) {
    const S = this.samples; let best = null, bd = maxD * maxD;
    const test = (i) => {
      const a = S[i], b = S[i + 1]; const ex = b.x - a.x, ez = b.z - a.z; const L2 = ex * ex + ez * ez || 1e-9;
      const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / L2, 0, 1);
      const px = a.x + ex * t, pz = a.z + ez * t, dd = (x - px) ** 2 + (z - pz) ** 2;
      if (dd < bd) { bd = dd; best = { i, t, px, pz }; }
    };
    if (maxD < 5000) this.index.near(x, z, maxD, test); else for (let i = 0; i < S.length - 1; i++) test(i);
    if (!best) return null;
    const a = S[best.i], b = S[best.i + 1];
    const s = a.s + (b.s - a.s) * best.t;
    const hx = b.x - a.x, hz = b.z - a.z, L = Math.hypot(hx, hz) || 1;
    const d = ((x - best.px) * (-hz / L) + (z - best.pz) * (hx / L));
    return { s, d, x: best.px, z: best.pz, dist: Math.sqrt(bd) };
  }
  /**
   * For an alignment that is monotonic along 'x' or 'z' (rivers, scarps, canals…): build a table coordinate → s so
   * that nearest() only has to search a window of the line around that s (≈ 10× faster for terrain queries).
   */
  axisIndex(axis, step = 2) {
    const S = this.sample(1), key = axis, n0 = S[0][key], n1 = S[S.length - 1][key], dir = n1 >= n0 ? 1 : -1;
    const a0 = Math.min(n0, n1), a1 = Math.max(n0, n1), n = Math.ceil((a1 - a0) / step) + 1;
    const tab = new Float32Array(n), pos = new Float32Array(n);   // s at that coordinate, and the other coordinate
    let j = dir > 0 ? 0 : S.length - 1;
    for (let i = 0; i < n; i++) {
      const a = a0 + i * step;
      if (dir > 0) { while (j < S.length - 2 && S[j + 1][key] < a) j++; }
      else { while (j > 1 && S[j - 1][key] < a) j--; }
      const p = S[j], q = dir > 0 ? S[Math.min(j + 1, S.length - 1)] : S[Math.max(j - 1, 0)];
      const t = q[key] !== p[key] ? clamp((a - p[key]) / (q[key] - p[key]), 0, 1) : 0;
      tab[i] = p.s + (q.s - p.s) * t;
      pos[i] = key === 'x' ? p.z + (q.z - p.z) * t : p.x + (q.x - p.x) * t;
    }
    this._axis = { key, a0, a1, step, tab, pos };
    return this;
  }
  /** Other coordinate of the line at a given axis coordinate (e.g. the scarp's x at some z); null outside. */
  crossAt(a) {
    const A = this._axis; if (!A || a < A.a0 || a > A.a1) return null;
    const f = (a - A.a0) / A.step, i = Math.min(A.tab.length - 2, Math.floor(f)), t = f - i;
    return A.pos[i] + (A.pos[i + 1] - A.pos[i]) * t;
  }
  /** nearest() restricted to a window of ±win metres of line around the axis-table guess (falls back to nearest). */
  nearestWin(x, z, maxD, win = 60) {
    const A = this._axis; if (!A) return this.nearest(x, z, maxD);
    const a = A.key === 'x' ? x : z; if (a < A.a0 - 1 || a > A.a1 + 1) return this.nearest(x, z, maxD);
    const i = clamp(Math.round((a - A.a0) / A.step), 0, A.tab.length - 1), sc = A.tab[i];
    const S = this.samples, ds = this.length / (S.length - 1);
    const i0 = Math.max(0, Math.floor((sc - win) / ds)), i1 = Math.min(S.length - 2, Math.ceil((sc + win) / ds));
    let best = -1, bt = 0, bd = maxD * maxD, bx = 0, bz = 0;
    for (let k = i0; k <= i1; k++) {
      const p = S[k], q = S[k + 1], ex = q.x - p.x, ez = q.z - p.z, L2 = ex * ex + ez * ez || 1e-9;
      const t = clamp(((x - p.x) * ex + (z - p.z) * ez) / L2, 0, 1), px = p.x + ex * t, pz = p.z + ez * t, dd = (x - px) ** 2 + (z - pz) ** 2;
      if (dd < bd) { bd = dd; best = k; bt = t; bx = px; bz = pz; }
    }
    if (best < 0) return null;
    const p = S[best], q = S[best + 1], hx = q.x - p.x, hz = q.z - p.z, L = Math.hypot(hx, hz) || 1;
    return { s: p.s + (q.s - p.s) * bt, d: (x - bx) * (-hz / L) + (z - bz) * (hx / L), x: bx, z: bz, dist: Math.sqrt(bd) };
  }
  /** Along-distance of the point nearest to [x, z]. */
  sOf(x, z) { const n = this.nearest(x, z); return n ? n.s : 0; }
  /** Smallest curve radius used (Infinity for a straight alignment). */
  get minRadius() { let m = Infinity; for (const p of this.pieces) if (p.type === 'arc') m = Math.min(m, p.R); return m; }
}

// ------------------------------------------------------------------ vertical profile
/**
 * Vertical profile along an alignment: control points { s | p:[x,z], y } where y is
 *   a number — absolute height (e.g. rail top),
 *   'g'      — follow the ground (groundAt(x,z) + off) up to the next control point,
 *   'r'      — a fixed height taken from the ground at that point (a ramp anchor: 'g' → 'r' → number ramps).
 * Linear between control points; a 'g' next to a number ramps from the ground height at the 'g' point.
 */
export class Profile {
  constructor(align, pts, { groundAt, off = 0 } = {}) {
    this.align = align; this.groundAt = groundAt; this.off = off;
    this.pts = pts.map(p => ({ s: p.s ?? align.sOf(p.p[0], p.p[1]), y: p.y })).sort((a, b) => a.s - b.s);
    for (const p of this.pts) if (p.y === 'r') p.y = this._g(p.s);
    if (!this.pts.length) this.pts = [{ s: 0, y: 'g' }];
  }
  _g(s) { const q = this.align.at(s); return this.groundAt(q.x, q.z) + this.off; }
  yAt(s) {
    const P = this.pts;
    if (s <= P[0].s) return P[0].y === 'g' ? this._g(s) : P[0].y;
    if (s >= P[P.length - 1].s) { const l = P[P.length - 1]; return l.y === 'g' ? this._g(s) : l.y; }
    let i = 0; while (i < P.length - 2 && P[i + 1].s < s) i++;
    const a = P[i], b = P[i + 1];
    if (a.y === 'g' && b.y === 'g') return this._g(s);
    const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    const ya = a.y === 'g' ? this._g(a.s) : a.y, yb = b.y === 'g' ? this._g(b.s) : b.y;
    return lerp(ya, yb, t);
  }
  /** Steepest gradient (per mille) sampled every `step` metres (ground-following stretches included). */
  maxGrade(step = 10) {
    let m = 0, at = 0;
    for (let s = 0; s + step <= this.align.length; s += step) {
      const g = Math.abs(this.yAt(s + step) - this.yAt(s)) / step * 1000;
      if (g > m) { m = g; at = s; }
    }
    return { permille: m, s: at };
  }
}

// ------------------------------------------------------------------ polygons
export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function polygonArea(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; return Math.abs(a) / 2; }
export function polygonCentroid(poly) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; a += f; cx += (poly[j][0] + poly[i][0]) * f; cz += (poly[j][1] + poly[i][1]) * f; }
  a *= 0.5; return [cx / (6 * a), cz / (6 * a)];
}

/** Intersections of two sampled alignments: [{ sa, sb, x, z }]. */
export function crossings(A, B) {
  const SA = A.samples, SB = B.samples, out = [];
  for (let i = 0; i < SA.length - 1; i++) {
    const a = SA[i], b = SA[i + 1];
    const seen = new Set();
    B.index.near((a.x + b.x) / 2, (a.z + b.z) / 2, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 8, (j) => {
      if (seen.has(j)) return; seen.add(j);
      const c = SB[j], d = SB[j + 1];
      const r = segIntersect(a.x, a.z, b.x, b.z, c.x, c.z, d.x, d.z);
      if (r) out.push({ sa: a.s + (b.s - a.s) * r.t, sb: c.s + (d.s - c.s) * r.u, x: r.x, z: r.z });
    });
  }
  // merge duplicates found on shared sample boundaries
  return out.filter((p, i) => !out.slice(0, i).some(q => Math.hypot(q.x - p.x, q.z - p.z) < 2));
}
function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + rx * t, z: az + rz * t };
}
