// Tiny mesh builder for procedural city geometry: vertex-coloured triangles (one toon material per layer, so a
// whole chunk's roads or structures are one draw call). Colours are linear RGB arrays.
import * as THREE from 'three';

const _c = new THREE.Color();
const CACHE = new Map();
/** sRGB hex → linear [r,g,b] (cached). */
export function rgb(hex) { let v = CACHE.get(hex); if (!v) { _c.set(hex); v = [_c.r, _c.g, _c.b]; CACHE.set(hex, v); } return v; }
export function shade(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }

export class MB {
  constructor() { this.P = []; this.N = []; this.C = []; this.I = []; }
  get n() { return this.P.length / 3; }
  /** Quad a,b,c,d (counter-clockwise seen from the side the normal points to). Flat normal computed. */
  quad(a, b, c, d, col) {
    let n = normal(a, b, c); const base = this.n;
    if (!n[0] && !n[1] && !n[2]) n = normal(a, c, d);                     // a quad folded to a triangle
    for (const p of [a, b, c, d]) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col[0], col[1], col[2]); }
    this.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(a, b, c, col) {
    const n = normal(a, b, c), base = this.n;
    for (const p of [a, b, c]) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col[0], col[1], col[2]); }
    this.I.push(base, base + 1, base + 2);
  }
  /** Quad with given vertex normals (smooth surfaces). */
  quadN(a, b, c, d, na, nb, nc, nd, col) {
    const base = this.n;
    for (const [p, n] of [[a, na], [b, nb], [c, nc], [d, nd]]) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col[0], col[1], col[2]); }
    this.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Quad turned to face roughly `want` (a direction), whatever order the corners come in. */
  quadF(a, b, c, d, col, want) {
    let n = normal(a, b, c); if (!n[0] && !n[1] && !n[2]) n = normal(a, c, d);
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) this.quad(d, c, b, a, col); else this.quad(a, b, c, d, col);
  }
  /** Convex polygon (fan from its first point) facing roughly `want`. */
  poly(pts, col, want) {
    if (pts.length < 3) return;
    let n = [0, 0, 0];
    for (let i = 1; i + 1 < pts.length; i++) { const m = normal(pts[0], pts[i], pts[i + 1]); n = [n[0] + m[0], n[1] + m[1], n[2] + m[2]]; }
    const P = n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0 ? [...pts].reverse() : pts;
    for (let i = 1; i + 1 < P.length; i++) this.tri(P[0], P[i], P[i + 1], col);
  }
  /** A square tube from p to q, t thick (four sides; no ends). */
  tube(p, q, t, col) {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(d[0], d[1], d[2]) || 1, u = [d[0] / L, d[1] / L, d[2] / L];
    const s = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let a = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]]; const la = Math.hypot(a[0], a[1], a[2]) || 1; a = [a[0] / la, a[1] / la, a[2] / la];
    const b = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]], h = t / 2;
    const off = (o, i, j) => [o[0] + (a[0] * i + b[0] * j) * h, o[1] + (a[1] * i + b[1] * j) * h, o[2] + (a[2] * i + b[2] * j) * h];
    const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let k = 0; k < 4; k++) { const [i0, j0] = C[k], [i1, j1] = C[(k + 1) % 4]; this.quad(off(p, i0, j0), off(p, i1, j1), off(q, i1, j1), off(q, i0, j0), col); }
  }
  /** Axis-aligned box. faces: subset of 'NSEWTB'. */
  box(x0, x1, y0, y1, z0, z1, col, faces = 'NSEWT') {
    const top = shade(col, 1), side = col;
    if (faces.includes('T')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
    if (faces.includes('B')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], side);
    if (faces.includes('S')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side);
    if (faces.includes('N')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], side);
    if (faces.includes('E')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], side);
    if (faces.includes('W')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side);
  }
  /** Box of size (w along local x, h, d along local z) centred at (cx, y0..y0+h, cz), rotated rot about Y. */
  obox(cx, y0, cz, w, h, d, rot, col, faces = 'NSEWT') {
    const from = this.n; this.box(-w / 2, w / 2, y0, y0 + h, -d / 2, d / 2, col, faces);
    this.place(from, rot, cx, 0, cz);
  }
  /** Rotate about Y and translate vertices emitted since `from`. */
  place(from, rot, tx, ty, tz) {
    const c = Math.cos(rot), s = Math.sin(rot), P = this.P, N = this.N;
    for (let i = from; i < this.n; i++) {
      const x = P[i * 3], z = P[i * 3 + 2]; P[i * 3] = x * c + z * s + tx; P[i * 3 + 1] += ty; P[i * 3 + 2] = -x * s + z * c + tz;
      const nx = N[i * 3], nz = N[i * 3 + 2]; N[i * 3] = nx * c + nz * s; N[i * 3 + 2] = -nx * s + nz * c;
    }
  }
  /** A strip between two polylines L[i], R[i] (same length), coloured col. Top faces up when L is left of travel. */
  strip(L, R, col) {
    for (let i = 0; i + 1 < L.length; i++) this.quad(L[i], R[i], R[i + 1], L[i + 1], col);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(material, { shadow = true } = {}) {
    if (!this.I.length) return null;
    const m = new THREE.Mesh(this.geometry(), material);
    m.castShadow = shadow; m.receiveShadow = true; m.matrixAutoUpdate = false;
    return m;
  }
}

function normal(a, b, c) {
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
}
