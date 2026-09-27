// Building massing for 花渡市: every planned building (plan/urban.js) as facade-attributed geometry for the one
// shared facade material (facade.js draws the windows). Two levels of detail from the same footprint:
//   'far'  — walls + roof (always resident for the whole map, merged per super-chunk)
//   'near' — parapets, penthouses, water tanks, balconies, shop awnings… added on top in streamed chunks
// Buildings are emitted in a local frame (centre at the origin, frontage along x, front face toward +z) and then
// rotated / translated into place.
import * as THREE from 'three';
import { STYLE } from './facade.js';
import { prng } from '../plan/geom.js';

const _c = new THREE.Color();
const LIN = new Map();
export function lin(hex) { let v = LIN.get(hex); if (!v) { _c.set(hex); v = [_c.r, _c.g, _c.b]; LIN.set(hex, v); } return v; }

/** Growable facade vertex buffer (position, normal, uv, colour, aFac, aFac2, aGlass). */
export class FacadeBuf {
  constructor(cap = 4096) { this.n = 0; this.ni = 0; this._alloc(cap, cap * 2); }
  _alloc(vc, ic) {
    const grow = (a, n) => { const b = new a.constructor(n); if (a) b.set(a.subarray(0, Math.min(a.length, n))); return b; };
    this.cap = vc; this.icap = ic;
    this.P = grow(this.P || new Float32Array(0), vc * 3); this.N = grow(this.N || new Float32Array(0), vc * 3);
    this.U = grow(this.U || new Float32Array(0), vc * 2); this.C = grow(this.C || new Float32Array(0), vc * 3);
    this.F = grow(this.F || new Float32Array(0), vc * 4); this.F2 = grow(this.F2 || new Float32Array(0), vc * 4);
    this.G = grow(this.G || new Float32Array(0), vc * 3); this.I = grow(this.I || new Uint32Array(0), ic);
  }
  /** Polygon with 3 or 4 corners (counter-clockwise seen from outside), normal n, uv per corner, fac/fac2 vec4. */
  poly(ps, n, uv, col, fac, fac2, glass) {
    const k = ps.length;
    if (this.n + k > this.cap) this._alloc(Math.max(this.cap * 2, this.n + k + 16), this.icap);
    if (this.ni + (k - 2) * 3 > this.icap) this._alloc(this.cap, Math.max(this.icap * 2, this.ni + 12));
    const b = this.n;
    for (let j = 0; j < k; j++) {
      const i = b + j, p = ps[j];
      this.P[i * 3] = p[0]; this.P[i * 3 + 1] = p[1]; this.P[i * 3 + 2] = p[2];
      this.N[i * 3] = n[0]; this.N[i * 3 + 1] = n[1]; this.N[i * 3 + 2] = n[2];
      this.U[i * 2] = uv[j * 2]; this.U[i * 2 + 1] = uv[j * 2 + 1];
      this.C[i * 3] = col[0]; this.C[i * 3 + 1] = col[1]; this.C[i * 3 + 2] = col[2];
      this.F[i * 4] = fac[0]; this.F[i * 4 + 1] = fac[1]; this.F[i * 4 + 2] = fac[2]; this.F[i * 4 + 3] = fac[3];
      this.F2[i * 4] = fac2[0]; this.F2[i * 4 + 1] = fac2[1]; this.F2[i * 4 + 2] = fac2[2]; this.F2[i * 4 + 3] = fac2[3];
      this.G[i * 3] = glass[0]; this.G[i * 3 + 1] = glass[1]; this.G[i * 3 + 2] = glass[2];
    }
    for (let j = 1; j + 1 < k; j++) { const t = this.ni; this.I[t] = b; this.I[t + 1] = b + j; this.I[t + 2] = b + j + 1; this.ni += 3; }
    this.n += k;
  }
  quad(p0, p1, p2, p3, n, uv, col, fac, fac2, glass) { this.poly([p0, p1, p2, p3], n, uv, col, fac, fac2, glass); }
  /** Rotate (about Y) and translate the vertices emitted since `from`. */
  place(from, rot, tx, ty, tz) {
    const c = Math.cos(rot), s = Math.sin(rot), P = this.P, N = this.N;
    for (let i = from; i < this.n; i++) {
      const x = P[i * 3], z = P[i * 3 + 2];
      P[i * 3] = x * c + z * s + tx; P[i * 3 + 1] += ty; P[i * 3 + 2] = -x * s + z * c + tz;
      const nx = N[i * 3], nz = N[i * 3 + 2];
      N[i * 3] = nx * c + nz * s; N[i * 3 + 2] = -nx * s + nz * c;
    }
  }
  get tris() { return this.ni / 3; }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.U.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, n * 3), 3));
    g.setAttribute('aFac', new THREE.BufferAttribute(this.F.slice(0, n * 4), 4));
    g.setAttribute('aFac2', new THREE.BufferAttribute(this.F2.slice(0, n * 4), 4));
    g.setAttribute('aGlass', new THREE.BufferAttribute(this.G.slice(0, n * 3), 3));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? this.I.slice(0, this.ni) : Uint16Array.from(this.I.subarray(0, this.ni)), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ primitive faces (local, axis aligned)
const NRM = { S: [0, 0, 1], N: [0, 0, -1], E: [1, 0, 0], W: [-1, 0, 0], T: [0, 1, 0], B: [0, -1, 0] };
const BAY = { [STYLE.punched]: 3.3, [STYLE.ribbon]: 3.4, [STYLE.curtain]: 1.6, [STYLE.grid]: 3.6, [STYLE.balcony]: 3.4, [STYLE.small]: 3.0, [STYLE.louver]: 3.2, [STYLE.slit]: 2.2, [STYLE.blank]: 3.0 };
const DEF_GLASS = [0.3, 0.4, 0.5];

/** Wall of an axis-aligned box. side 'S' (+z), 'N', 'E' (+x), 'W'. v measured from baseY. */
export function wallFace(buf, side, x0, x1, y0, y1, z0, z1, baseY, o) {
  let p0, p1, p2, p3, w;
  if (side === 'S') { p0 = [x0, y0, z1]; p1 = [x1, y0, z1]; p2 = [x1, y1, z1]; p3 = [x0, y1, z1]; w = x1 - x0; }
  else if (side === 'N') { p0 = [x1, y0, z0]; p1 = [x0, y0, z0]; p2 = [x0, y1, z0]; p3 = [x1, y1, z0]; w = x1 - x0; }
  else if (side === 'E') { p0 = [x1, y0, z1]; p1 = [x1, y0, z0]; p2 = [x1, y1, z0]; p3 = [x1, y1, z1]; w = z1 - z0; }
  else { p0 = [x0, y0, z0]; p1 = [x0, y0, z1]; p2 = [x0, y1, z1]; p3 = [x0, y1, z0]; w = z1 - z0; }
  if (w <= 0.01 || y1 - y0 <= 0.01) return;
  const nb = Math.max(1, Math.round(w / (o.bay || BAY[o.style] || 3.2)));
  const v0 = y0 - baseY, v1 = y1 - baseY;
  buf.quad(p0, p1, p2, p3, NRM[side], [0, v0, w, v0, w, v1, 0, v1], o.wall, [o.style, o.fh || 3.2, w / nb, o.seed ?? 0.5], [o.g1 ?? 0, w, o.flags || 0, o.variant ?? 0], o.glass || DEF_GLASS);
}
export function topFace(buf, x0, x1, z0, z1, y, o) {
  buf.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], NRM.T, [x0, -z1, x1, -z1, x1, -z0, x0, -z0], o.wall, [o.style ?? STYLE.roof, 3, 3, o.seed ?? 0.5], [0, 0, o.flags || 0, o.variant || 0], o.glass || DEF_GLASS);
}
export function box(buf, x0, x1, y0, y1, z0, z1, o, faces = 'NSEWT') {
  for (const s of 'NSEW') if (faces.includes(s)) wallFace(buf, s, x0, x1, y0, y1, z0, z1, o.baseY ?? y0, o);
  if (faces.includes('T')) topFace(buf, x0, x1, z0, z1, y1, { ...o, style: o.topStyle ?? o.style });
}
function plainFace(buf, ps, col) {
  const a = ps[0], b = ps[1], c = ps[2];
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
  const uv = ps.length === 3 ? [0, 0, 1, 0, 1, 1] : [0, 0, 1, 0, 1, 1, 0, 1];
  buf.poly(ps, n, uv, col, [STYLE.plain, 3, 3, 0.3], [0, 1, 0, 0], DEF_GLASS);
}

// ------------------------------------------------------------------ roofs (local frame, footprint [-hw,hw]×[-hd,hd])
/** Gable roof with the ridge along x (平入り: slopes face the street); gable triangles close the side walls. */
function gableRoof(buf, hw, hd, y, h, col, wall, over = 0.45) {
  const x0 = -hw - over, x1 = hw + over, z0 = -hd - over, z1 = hd + over, Y = y + h;
  plainFace(buf, [[x0, y, z1], [x1, y, z1], [x1, Y, 0], [x0, Y, 0]], col);           // front slope
  plainFace(buf, [[x1, y, z0], [x0, y, z0], [x0, Y, 0], [x1, Y, 0]], col);           // back slope
  const dark = [col[0] * 0.75, col[1] * 0.75, col[2] * 0.8];
  plainFace(buf, [[x0, y - 0.02, z0], [x1, y - 0.02, z0], [x1, y - 0.02, z1], [x0, y - 0.02, z1]], dark);   // eave soffit
  plainFace(buf, [[hw, y, hd], [hw, y, -hd], [hw, Y - h * over / (hd + over), 0]], wall);    // gable ends
  plainFace(buf, [[-hw, y, -hd], [-hw, y, hd], [-hw, Y - h * over / (hd + over), 0]], wall);
}
/** Hip roof, ridge along the longer axis, eaves all round. */
function hipRoof(buf, hw, hd, y, h, col, over = 0.5) {
  const x0 = -hw - over, x1 = hw + over, z0 = -hd - over, z1 = hd + over, W = x1 - x0, D = z1 - z0, Y = y + h;
  if (W >= D) {
    const r0 = [-(W - D) / 2, Y, 0], r1 = [(W - D) / 2, Y, 0];
    plainFace(buf, [[x0, y, z1], [x1, y, z1], r1, r0], col); plainFace(buf, [[x1, y, z0], [x0, y, z0], r0, r1], col);
    plainFace(buf, [[x1, y, z1], [x1, y, z0], r1], col); plainFace(buf, [[x0, y, z0], [x0, y, z1], r0], col);
  } else {
    const r0 = [0, Y, -(D - W) / 2], r1 = [0, Y, (D - W) / 2];
    plainFace(buf, [[x1, y, z1], [x1, y, z0], r0, r1], col); plainFace(buf, [[x0, y, z0], [x0, y, z1], r1, r0], col);
    plainFace(buf, [[x0, y, z1], [x1, y, z1], r1], col); plainFace(buf, [[x1, y, z0], [x0, y, z0], r0], col);
  }
  plainFace(buf, [[x0, y - 0.02, z0], [x1, y - 0.02, z0], [x1, y - 0.02, z1], [x0, y - 0.02, z1]], [col[0] * 0.75, col[1] * 0.75, col[2] * 0.8]);
}
/** Saw-tooth factory roof: teeth along x, glazed steep faces toward -z (north light). */
function sawRoof(buf, hw, hd, y, col, wall) {
  const n = Math.max(2, Math.round((2 * hd) / 7)), step = (2 * hd) / n, h = Math.min(2.6, step * 0.42);
  const glass = [0.2, 0.26, 0.32];
  for (let i = 0; i < n; i++) {
    const z0 = -hd + i * step, z1 = z0 + step;
    plainFace(buf, [[-hw, y, z1], [hw, y, z1], [hw, y + h, z0], [-hw, y + h, z0]], col);   // sloped roof
    plainFace(buf, [[hw, y, z0], [-hw, y, z0], [-hw, y + h, z0], [hw, y + h, z0]], glass); // glazed face
    plainFace(buf, [[hw, y, z1], [hw, y, z0], [hw, y + h, z0]], wall);                      // side triangles
    plainFace(buf, [[-hw, y, z0], [-hw, y, z1], [-hw, y + h, z0]], wall);
  }
}

// ------------------------------------------------------------------ buildings
function facadeOpts(b, r) {
  return { style: b.style, fh: b.fh, g1: b.g1, wall: lin(b.wall), glass: lin(b.glass), seed: (b.seed % 997) / 997, variant: r() };
}

/** Far LOD: walls + roof for plan building b. */
export function emitFar(buf, b) {
  const r = prng(b.seed), from = buf.n, hw = b.w / 2, hd = b.d / 2, base = -0.6, top = b.h;
  const o = facadeOpts(b, r);
  for (const side of ['N', 'S', 'E', 'W']) {
    const front = side === 'S';
    const so = { ...o, flags: front && b.shop ? 1 : 0, seed: (o.seed + side.charCodeAt(0) * 0.071) % 1 };
    if (!front && (b.kind === 'house' || b.kind === 'machiya' || b.kind === 'shop' || b.kind === 'zakkyo')) so.style = side === 'N' ? STYLE.small : (b.seed + side.charCodeAt(0)) % 2 ? STYLE.small : STYLE.blank;
    if (b.kind === 'kura') so.style = STYLE.slit;
    wallFace(buf, side, -hw, hw, base, top, -hd, hd, 0, so);
  }
  const rc = lin(b.roofCol);
  if (b.roof === 'gable') gableRoof(buf, hw, hd, top, Math.min(hd * 0.55, 2.6), rc, o.wall);
  else if (b.roof === 'hip') hipRoof(buf, hw, hd, top, Math.min(Math.min(hw, hd) * 0.55, 2.4), rc);
  else if (b.roof === 'saw') sawRoof(buf, hw, hd, top, rc, o.wall);
  else topFace(buf, -hw, hw, -hd, hd, top, { style: STYLE.roof, wall: rc, seed: o.seed });
  buf.place(from, b.rot, b.x, b.y, b.z);
}

/** Near LOD extras: parapets, rooftop penthouse / tank, balconies, shop awnings. */
export function emitNear(buf, b) {
  const r = prng(b.seed ^ 0x5bd1), from = buf.n, hw = b.w / 2, hd = b.d / 2, top = b.h;
  const wall = lin(b.wall), pc = [wall[0] * 0.95, wall[1] * 0.95, wall[2] * 0.95];
  if (b.roof === 'flat') {
    const ph = b.floors >= 4 ? 1.1 : 0.7, t = 0.25, po = { style: STYLE.plain, wall: pc, seed: 0.3, baseY: top };
    box(buf, -hw, hw, top, top + ph, -hd, -hd + t, po); box(buf, -hw, hw, top, top + ph, hd - t, hd, po);
    box(buf, -hw, -hw + t, top, top + ph, -hd + t, hd - t, po, 'EWT'); box(buf, hw - t, hw, top, top + ph, -hd + t, hd - t, po, 'EWT');
    if (b.floors >= 4 && hw > 3 && hd > 3) {
      const pw = Math.min(hw * r.range(0.5, 0.8), 6), pd = Math.min(hd * r.range(0.5, 0.8), 5), phh = r.range(2.6, 3.6);
      const px = r.range(-hw + 1 + pw / 2, hw - 1 - pw / 2), pz = r.range(-hd + 1 + pd / 2, hd - 1 - pd / 2);
      box(buf, px - pw / 2, px + pw / 2, top, top + phh, pz - pd / 2, pz + pd / 2, { style: STYLE.blank, wall: pc, fh: 3, seed: 0.4, baseY: top, topStyle: STYLE.roof });
      if (r.chance(0.55)) {   // water tank on legs
        const tx = px + (px > 0 ? -pw / 2 - 2.2 : pw / 2 + 0.6), tz = pz, tw = 1.8, legs = 1.4;
        if (Math.abs(tx) + tw < hw) box(buf, tx, tx + tw, top + legs, top + legs + 1.6, tz - 0.9, tz + 0.9, { style: STYLE.plain, wall: lin(r.pick(['#dfe4e6', '#c9d6de', '#e8e6de'])), seed: 0.2, baseY: top });
      }
    }
  }
  // balconies on the front face (mansions, apartments, 団地)
  if (b.kind === 'mansion' || b.kind === 'apartment' || b.kind === 'danchi' || b.kind === 'danchi-tower') {
    const depth = b.kind.startsWith('danchi') ? 1.2 : 1.3, glassRail = (b.seed % 5) < 2;
    const railCol = glassRail ? [0.62, 0.68, 0.74] : [wall[0] * 1.02, wall[1] * 1.02, wall[2] * 1.02];
    const slabCol = [Math.min(1, wall[0] * 1.08 + 0.02), Math.min(1, wall[1] * 1.08 + 0.02), Math.min(1, wall[2] * 1.08 + 0.02)];
    const unit = b.kind.startsWith('danchi') ? 5.4 : 6.6, a0 = -hw + 0.3, a1 = hw - 0.3, nU = Math.max(1, Math.round((a1 - a0) / unit));
    for (let f = 1; f < b.floors; f++) {
      const yf = b.g1 + (f - 1) * b.fh;
      box(buf, a0, a1, yf - 0.15, yf, hd, hd + depth, { style: STYLE.plain, wall: slabCol, seed: 0.3, baseY: yf - 0.15 }, 'SEWT');
      box(buf, a0, a1, yf, yf + 1.1, hd + depth - 0.1, hd + depth, { style: glassRail ? STYLE.glassRail : STYLE.railing, wall: railCol, seed: 0.3, baseY: yf }, 'SNT');
      for (let k = 1; k < nU; k++) { const x = a0 + (a1 - a0) * k / nU; box(buf, x - 0.03, x + 0.03, yf, yf + 2.2, hd, hd + depth - 0.1, { style: STYLE.plain, wall: slabCol, seed: 0.3, baseY: yf }, 'EWST'); }
    }
  }
  // (shop fronts — signs, awnings, glass — come from shopfronts.js)
  if (buf.n > from) buf.place(from, b.rot, b.x, b.y, b.z);
}
