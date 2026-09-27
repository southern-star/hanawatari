// People: low-poly anime figures, posed in the vertex shader so hundreds of them draw as a handful of instanced
// meshes. Each vertex carries its bone (pelvis, torso, head, the arms' and legs' two segments, a skirt), a colour
// slot (skin, hair, top, bottom, shoes, accent, forearm, legs/hat — or a fixed colour) and an optional part (a bag, a
// tie, a hairstyle, glasses, a face mask, a phone, a parasol…) an instance switches on or off. Per instance: the pose
// (walk / stand / cycle / ride / sit, its phase and amplitude or variant), eight packed colours, the parts mask and a
// height scale. What a person holds sets their right arm (a phone to the face, a parasol up, a mug and now and then a
// sip). The same pose code runs in the colour pass, the outline pre-pass and the shadow pass. Two levels of detail:
// the near one has the faces (anime eyes, brows), buttons and the small things.
import * as THREE from 'three';

/** Body kinds: an adult in trousers, one in a skirt, a child (big head, shorts), an elder (stooping, slower). */
export const KINDS = ['trousers', 'skirt', 'child', 'elder'];
/** Colour slots: eight per instance, then fixed colours (white, beer, black, silver) and the eyes (from the hair). */
export const SLOT = { skin: 0, hair: 1, top: 2, bottom: 3, shoes: 4, accent: 5, forearm: 6, legs: 7, white: 8, amber: 9, black: 10, silver: 11, eye: 12 };
/** Optional parts (bits of the mask). A part is drawn when its bit is set; the hair cap and fringe when `bald` isn't. */
export const PART = { briefcase: 0, backpack: 1, shoulderBag: 2, tie: 3, hat: 4, collar: 5, longHair: 6, ponytail: 7, bob: 8, ecoBag: 9,
  glasses: 10, faceMask: 11, phone: 12, parasol: 13, mug: 14, buttons: 15, suit: 16, socks: 17, twinTails: 18, bald: 19, sideHair: 20, headphones: 21, pleats: 22 };
/** Pose modes. Stand variants (amplitude): 0 idle, 1 a phone, 2 hands together, 3 (mug in hand) drinking, 4 chatting. */
export const MODE = { walk: 0, stand: 1, cycle: 2, ride: 3, sit: 4 };
/** Rest-pose joints (y up, facing +z), shared by the geometry and the shader. */
export const J = { hip: [0.085, 0.9], knee: [0.09, 0.49], shoulder: [0.19, 1.36], elbow: [0.215, 1.09], waist: 0.97, neck: 1.4 };
const HAND = [0.22, 0.81];                                               // the hand's middle (x, y) in the rest pose
/** Right-arm holds (upper arm + elbow angles): parasol, mug (at rest), phone. The props are modelled along the
 *  direction that these holds turn upright. */
export const HOLD = { parasol: [0.35, 1.25], mug: [0.35, 1.25], phone: [0.42, 1.95] };

// ------------------------------------------------------------------ geometry
const on = (bit) => bit + 1, off = (bit) => 100 + bit;
class PB {
  constructor() { this.P = []; this.N = []; this.C = []; this.B = []; this.S = []; this.T = []; this.I = []; }
  get n() { return this.P.length / 3; }
  v(p, nrm, bone, slot, part, shade) { this.P.push(p[0], p[1], p[2]); this.N.push(nrm[0], nrm[1], nrm[2]); this.C.push(shade, shade, shade); this.B.push(bone); this.S.push(slot); this.T.push(part); return this.n - 1; }
  /** A smooth loft through rings { c: [x, y, z], rx, rz } (bottom → top), seg sides, capped; arc [a0, a1] (radians
   *  from +z toward +x) makes an open band instead; shades (per side) for pleats. */
  loft(rings, seg, bone, slot, part = 0, shade = 1, caps = [true, true], arc = null, shades = null) {
    const full = !arc, a0 = arc ? arc[0] : 0, a1 = arc ? arc[1] : Math.PI * 2, m = full ? seg : seg + 1;
    const R = rings.map(r => [...Array(m)].map((_, i) => { const a = a0 + (a1 - a0) * (i / seg); return [r.c[0] + Math.sin(a) * r.rx, r.c[1], r.c[2] + Math.cos(a) * r.rz]; }));
    const n = R.length, idx = [];
    for (let i = 0; i < n; i++) {
      idx.push([]);
      for (let j = 0; j < m; j++) {
        const p = R[i][j], jn = full ? (j + 1) % m : Math.min(m - 1, j + 1), jp = full ? (j + m - 1) % m : Math.max(0, j - 1);
        const t1 = sub(R[i][jn], R[i][jp]), t2 = sub(R[Math.min(n - 1, i + 1)][j], R[Math.max(0, i - 1)][j]);
        let nr = norm(cross(t1, t2)); const out = [p[0] - rings[i].c[0], 0, p[2] - rings[i].c[2]];
        if (dot(nr, out) < 0) nr = [-nr[0], -nr[1], -nr[2]];
        idx[i].push(this.v(p, nr, bone, slot, part, shades ? shades[j % shades.length] * shade : shade));
      }
    }
    for (let i = 0; i + 1 < n; i++) for (let j = 0; j < (full ? m : m - 1); j++) {
      const a = idx[i][j], b = idx[i][(j + 1) % m], c = idx[i + 1][(j + 1) % m], d = idx[i + 1][j];
      this.I.push(a, b, c, a, c, d);
      if (!full) this.I.push(a, c, b, a, d, c);                          // open bands: both faces
    }
    if (!full) return;
    const cap = (ring, r, down) => {
      const c = this.v(r.c, [0, down ? -1 : 1, 0], bone, slot, part, shade), e = ring.map(p => this.v(p, [0, down ? -1 : 1, 0], bone, slot, part, shade));
      for (let j = 0; j < seg; j++) { const a = e[j], b = e[(j + 1) % seg]; if (down) this.I.push(c, b, a); else this.I.push(c, a, b); }
    };
    if (caps[0]) cap(R[0], rings[0], true);
    if (caps[1]) cap(R[n - 1], rings[n - 1], false);
  }
  box(x0, x1, y0, y1, z0, z1, bone, slot, part = 0, shade = 1) {
    const F = [[[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]]];
    for (const [a, b, c, d, nr] of F) { const i = [a, b, c, d].map(p => this.v(p, nr, bone, slot, part, shade)); this.I.push(i[0], i[1], i[2], i[0], i[2], i[3]); }
  }
  /** A flat convex polygon (a decal: eyes, a tie, buttons) facing nrm (fan from its first point). */
  poly(pts, nrm, bone, slot, part = 0, shade = 1) {
    const i = pts.map(p => this.v(p, nrm, bone, slot, part, shade)), flip = dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), nrm) < 0;
    for (let k = 1; k + 1 < pts.length; k++) { if (flip) this.I.push(i[0], i[k + 1], i[k]); else this.I.push(i[0], i[k], i[k + 1]); }
  }
  /** A triangle seen from both sides (hair strands). */
  tri2(a, b, c, bone, slot, part = 0, shade = 1) {
    const nr = norm(cross(sub(b, a), sub(c, a))), i = [a, b, c].map(p => this.v(p, nr, bone, slot, part, shade));
    this.I.push(i[0], i[1], i[2], i[0], i[2], i[1]);
  }
  /** Rotate everything emitted since `from` about the x axis through (y, z) by angle a (props built for a hold). */
  rotX(from, y0, z0, a) {
    const c = Math.cos(a), s = Math.sin(a);
    for (let i = from; i < this.n; i++) {
      const y = this.P[i * 3 + 1] - y0, z = this.P[i * 3 + 2] - z0; this.P[i * 3 + 1] = y0 + y * c - z * s; this.P[i * 3 + 2] = z0 + y * s + z * c;
      const ny = this.N[i * 3 + 1], nz = this.N[i * 3 + 2]; this.N[i * 3 + 1] = ny * c - nz * s; this.N[i * 3 + 2] = ny * s + nz * c;
    }
  }
  scaleFrom(from, o, k) { for (let i = from; i < this.n; i++) for (let a = 0; a < 3; a++) this.P[i * 3 + a] = o[a] + (this.P[i * 3 + a] - o[a]) * k; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('bone', new THREE.Float32BufferAttribute(this.B, 1));
    g.setAttribute('slot', new THREE.Float32BufferAttribute(this.S, 1));
    g.setAttribute('part', new THREE.Float32BufferAttribute(this.T, 1));
    g.setIndex(this.I);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6);
    return g;
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const ring = (x, y, z, rx, rz = rx) => ({ c: [x, y, z], rx, rz });
const ellipse = (cx, cy, rx, ry, k, z) => [...Array(k)].map((_, i) => { const a = (i / k) * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)]; });

/** Bones. */
const B = { pelvis: 0, torso: 1, head: 2, armL: 3, foreL: 4, armR: 5, foreR: 6, thighL: 7, shinL: 8, thighR: 9, shinR: 10, skirt: 11 };

/** One body kind's geometry at a level of detail (0 near, 1 far). */
export function bodyGeometry(kind, lod = 0) {
  const g = new PB(), S = SLOT, child = kind === 'child', skirt = kind === 'skirt', near = lod === 0;
  const sg = (n) => (near ? n : Math.max(6, Math.round(n * 0.6)));        // loft sides
  // ---- legs: shoes, socks, shins, thighs (a child's knees and shins bare)
  for (const sx of [1, -1]) {
    const x = sx * 0.09, thigh = sx > 0 ? B.thighL : B.thighR, shin = sx > 0 ? B.shinL : B.shinR;
    g.box(x - 0.048, x + 0.048, 0.016, 0.075, -0.06, 0.17, shin, S.shoes, 0, 1);
    g.box(x - 0.05, x + 0.05, 0, 0.018, -0.062, 0.172, shin, S.shoes, 0, 0.55);                              // sole
    g.loft([ring(x, 0.07, 0.01, 0.047), ring(x, 0.2, 0, 0.05), ring(x, 0.35, 0, 0.055), ring(x, 0.49, 0, 0.06)], sg(8), shin, child ? S.skin : skirt ? S.legs : S.bottom, 0, 1, [true, false]);
    if (near) g.loft([ring(x, 0.07, 0.01, 0.051), ring(x, 0.17, 0.004, 0.053)], 8, shin, S.white, on(PART.socks), 1.05, [false, false]);
    if (child) {
      g.loft([ring(x, 0.49, 0, 0.061), ring(x, 0.6, 0, 0.068)], sg(8), thigh, S.skin, 0, 1, [false, false]);
      g.loft([ring(x, 0.6, 0, 0.076), ring(x, 0.75, 0, 0.083), ring(x * 0.97, 0.91, 0, 0.088)], sg(8), thigh, S.bottom, 0, 1, [true, false]);
    } else g.loft([ring(x, 0.49, 0, 0.062), ring(x, 0.63, 0, 0.071), ring(x, 0.78, 0, 0.079), ring(x * 0.97, 0.91, 0, 0.086)], sg(8), thigh, skirt ? S.skin : S.bottom, 0, 1, [false, false]);
  }
  // ---- pelvis, skirt (plain or pleated), torso, the suit's details, neck
  g.loft([ring(0, 0.83, 0, 0.16, 0.1), ring(0, 0.92, 0, 0.162, 0.105), ring(0, 0.99, 0, 0.148, 0.097)], sg(10), B.pelvis, S.bottom, 0, 1, [true, false]);
  if (skirt) {
    const sk = [ring(0, 0.5, 0.01, 0.225, 0.19), ring(0, 0.62, 0.005, 0.205, 0.165), ring(0, 0.8, 0, 0.175, 0.125), ring(0, 0.99, 0, 0.152, 0.1)];
    g.loft(sk, sg(12), B.skirt, S.bottom, near ? off(PART.pleats) : 0, 1, [false, false]);
    if (near) g.loft(sk.map(r => ({ ...r, rx: r.rx + 0.004, rz: r.rz + 0.004 })), 16, B.skirt, S.bottom, on(PART.pleats), 1, [false, false], null, [1, 0.8]);
  }
  const TR = [ring(0, 0.97, 0, 0.145, 0.095), ring(0, 1.1, 0, 0.155, 0.1), ring(0, 1.25, 0.005, 0.17, 0.106), ring(0, 1.34, 0, 0.176, 0.097), ring(0, 1.4, 0, 0.13, 0.07), ring(0, 1.425, 0, 0.06, 0.05)];
  g.loft(TR, sg(10), B.torso, S.top, 0, 1);
  // the jacket's skirt over the hips (suits, blazers)
  g.loft([ring(0, 0.86, 0, 0.168, 0.112), ring(0, 0.99, 0, 0.158, 0.104)], sg(10), B.torso, S.top, on(PART.suit), 0.95, [false, false]);
  const tz = (x, y) => {                                                                       // the chest's front at (x, y)
    let i = 0; while (i + 2 < TR.length && TR[i + 1].c[1] < y) i++;
    const a = TR[i], b = TR[i + 1], t = Math.max(0, Math.min(1, (y - a.c[1]) / (b.c[1] - a.c[1])));
    const rx = a.rx + (b.rx - a.rx) * t, rz = a.rz + (b.rz - a.rz) * t, cz = a.c[2] + (b.c[2] - a.c[2]) * t;
    return cz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
  };
  if (near) {
    const T = (x, y, o) => [x, y, tz(x, y) + o];
    g.poly([T(0, 1.18, 0.004), T(0.055, 1.37, 0.004), T(-0.055, 1.37, 0.004)], [0, 0, 1], B.torso, S.white, on(PART.suit), 1.1);   // the shirt's V
    for (const sx of [1, -1]) g.poly([T(0, 1.16, 0.006), T(sx * 0.062, 1.372, 0.006), T(sx * 0.1, 1.345, 0.006), T(sx * 0.022, 1.16, 0.006)], [0, 0, 1], B.torso, S.top, on(PART.suit), 0.78);   // lapels
    for (let k = 0; k < 5; k++) { const y = 1.13 + k * 0.055; g.poly(ellipse(0, y, 0.009, 0.009, 6, (x, yy) => tz(x, yy) + 0.006), [0, 0, 1], B.torso, S.amber, on(PART.buttons), 1.3); }   // 学ラン's gold buttons
  }
  g.box(-0.018, 0.018, 1.03, 1.35, 0.104, 0.12, B.torso, S.accent, on(PART.tie));
  g.loft([ring(0, 1.39, 0.005, 0.045), ring(0, 1.46, 0.005, 0.042)], sg(8), B.head, S.skin, 0, 1, [false, false]);
  // ---- head and face (a child's head bigger: everything scaled about the neck at the end)
  const h0 = g.n;
  g.loft([ring(0, 1.425, 0.02, 0.05, 0.055), ring(0, 1.45, 0.012, 0.085, 0.09), ring(0, 1.5, 0.005, 0.097, 0.104), ring(0, 1.57, 0, 0.1, 0.108), ring(0, 1.62, -0.004, 0.088, 0.098), ring(0, 1.652, -0.006, 0.058, 0.07), ring(0, 1.667, -0.006, 0.02, 0.025)], sg(12), B.head, S.skin, 0, 1);
  // the face's front: z of the head's surface at (x, y), plus an offset
  const fz = (x, y, o = 0) => { const t = Math.max(0, Math.min(1, (y - 1.5) / 0.07)); const rx = 0.097 + 0.003 * t, rz = 0.104 + 0.004 * t, cz = 0.005 * (1 - t); return cz + rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) + o; };
  if (near) {
    for (const sx of [1, -1]) {                                                      // anime eyes: white, iris, pupil, glint, the upper lid, a brow
      const cx = sx * 0.036, cy = 1.512, L = (x, y, o = 0.0046) => [x, y, fz(x, y, o)];
      g.poly(ellipse(cx, cy, 0.022, 0.029, 12, (x, y) => fz(x, y, 0.003)), [0, 0, 1], B.head, S.white, 0, 1.15);
      g.poly(ellipse(cx - sx * 0.002, cy - 0.004, 0.016, 0.023, 12, (x, y) => fz(x, y, 0.0036)), [0, 0, 1], B.head, S.eye, 0, 1);
      g.poly(ellipse(cx - sx * 0.002, cy - 0.006, 0.0075, 0.012, 8, (x, y) => fz(x, y, 0.0042)), [0, 0, 1], B.head, S.black, 0, 1);
      g.poly(ellipse(cx - sx * 0.008, cy + 0.008, 0.0055, 0.0055, 6, (x, y) => fz(x, y, 0.005)), [0, 0, 1], B.head, S.white, 0, 1.5);
      // the upper lid: a soft arc, highest over the iris, the same way round on both eyes
      const lid = [[-0.024, 0.018], [-0.008, 0.028], [0.01, 0.028], [0.025, 0.017]].map(([dx, dy]) => [cx + sx * dx, cy + dy]);
      for (let k = 0; k < 3; k++) g.poly([L(lid[k][0], lid[k][1]), L(lid[k + 1][0], lid[k + 1][1]), L(lid[k + 1][0], lid[k + 1][1] + 0.0075), L(lid[k][0], lid[k][1] + 0.0075)], [0, 0, 1], B.head, S.black, 0, 1);
      g.poly([L(cx - sx * 0.018, cy + 0.042, 0.004), L(cx + sx * 0.017, cy + 0.045, 0.004), L(cx + sx * 0.017, cy + 0.05, 0.004), L(cx - sx * 0.018, cy + 0.047, 0.004)], [0, 0, 1], B.head, S.hair, 0, 0.8);
    }
    g.poly([[-0.013, 1.469, fz(-0.013, 1.469, 0.002)], [0.013, 1.469, fz(0.013, 1.469, 0.002)], [0.008, 1.463, fz(0.008, 1.463, 0.002)], [-0.008, 1.463, fz(-0.008, 1.463, 0.002)]], [0, 0, 1], B.head, S.skin, 0, 0.55);   // mouth
    g.poly([[-0.004, 1.49, fz(0, 1.49, 0.003)], [0.004, 1.49, fz(0, 1.49, 0.003)], [0, 1.5, fz(0, 1.5, 0.003)]], [0, 0, 1], B.head, S.skin, 0, 0.85);                 // a hint of a nose
  } else for (const sx of [1, -1]) g.poly(ellipse(sx * 0.034, 1.514, 0.012, 0.02, 6, (x, y) => fz(x, y, 0.004)), [0, 0, 1], B.head, S.eye, 0, 0.8);
  // hair: the cap and the fringe (unless bald), the nape; sideburn locks; the other styles as parts
  g.loft([ring(0, 1.548, -0.01, 0.107, 0.116), ring(0, 1.59, -0.006, 0.109, 0.117), ring(0, 1.632, -0.008, 0.097, 0.107), ring(0, 1.666, -0.01, 0.064, 0.076), ring(0, 1.683, -0.01, 0.02, 0.026)], sg(12), B.head, S.hair, off(PART.bald), 1, [true, true]);
  const fr = (x, y, o) => [x, y, fz(x, Math.max(1.5, y), o)];
  const strands = near ? [[-0.09, -0.05, 1.556], [-0.055, -0.015, 1.547], [-0.02, 0.02, 1.552], [0.015, 0.055, 1.546], [0.05, 0.09, 1.556]] : [[-0.09, 0, 1.55], [0, 0.09, 1.55]];
  for (const [xa, xb, ty] of strands) g.tri2(fr(xa, 1.6, 0.012), fr(xb, 1.6, 0.012), fr((xa + xb) / 2 + 0.006, ty, 0.01), B.head, S.hair, off(PART.bald));   // the fringe
  for (const sx of [1, -1]) g.tri2([sx * 0.109, 1.585, 0.022], [sx * 0.112, 1.585, -0.02], [sx * 0.105, 1.475, 0.012], B.head, S.hair, off(PART.bald));                 // sideburn locks
  g.box(-0.1, 0.1, 1.44, 1.56, -0.118, -0.03, B.head, S.hair);                                                                                            // the nape
  g.loft([ring(0, 1.47, -0.005, 0.104, 0.113), ring(0, 1.535, -0.008, 0.108, 0.117)], sg(12), B.head, S.hair, on(PART.sideHair), 1, [false, false], [Math.PI * 0.42, Math.PI * 1.58]);   // round the back of a bald head
  g.loft([ring(0, 1.43, -0.01, 0.114, 0.12), ring(0, 1.5, -0.01, 0.114, 0.122), ring(0, 1.56, -0.008, 0.112, 0.12)], sg(12), B.head, S.hair, on(PART.bob), 1, [false, false], [Math.PI * 0.3, Math.PI * 1.7]);   // bob
  g.loft([ring(0, 1.22, -0.075, 0.115, 0.035), ring(0, 1.36, -0.085, 0.12, 0.045), ring(0, 1.5, -0.075, 0.11, 0.05)], sg(10), B.head, S.hair, on(PART.longHair), 1);
  g.loft([ring(0, 1.36, -0.155, 0.018), ring(0, 1.47, -0.14, 0.032), ring(0, 1.57, -0.115, 0.03)], sg(8), B.head, S.hair, on(PART.ponytail), 1);
  for (const sx of [1, -1]) g.loft([ring(sx * 0.14, 1.3, -0.04, 0.016), ring(sx * 0.13, 1.44, -0.035, 0.03), ring(sx * 0.105, 1.57, -0.02, 0.028)], sg(8), B.head, S.hair, on(PART.twinTails), 1);
  // a hat: a cap with a brim (the child's in its own slot); headphones; glasses; a face mask
  const hatSlot = child ? S.legs : S.accent;
  g.loft([ring(0, 1.585, -0.005, 0.114, 0.122), ring(0, 1.64, -0.008, 0.106, 0.114), ring(0, 1.685, -0.01, 0.07, 0.08), ring(0, 1.7, -0.01, 0.02, 0.025)], sg(12), B.head, hatSlot, on(PART.hat), 1);
  g.box(-0.085, 0.085, 1.585, 1.598, 0.08, 0.2, B.head, hatSlot, on(PART.hat), 0.9);
  if (near) {
    const band = [...Array(9)].map((_, k) => { const a = Math.PI * (k / 8); return [Math.cos(a) * 0.118, 1.52 + Math.sin(a) * 0.175, -0.005]; });
    for (let k = 0; k < 8; k++) g.box(Math.min(band[k][0], band[k + 1][0]) - 0.008, Math.max(band[k][0], band[k + 1][0]) + 0.008, Math.min(band[k][1], band[k + 1][1]) - 0.008, Math.max(band[k][1], band[k + 1][1]) + 0.008, -0.022, 0.012, B.head, S.black, on(PART.headphones), 0.9);
    for (const sx of [1, -1]) g.box(sx * 0.105 - 0.025, sx * 0.105 + 0.025, 1.475, 1.555, -0.035, 0.025, B.head, S.accent, on(PART.headphones), 1);
    for (const sx of [1, -1]) {                                                      // glasses: a frame round each eye, the bridge
      const cx = sx * 0.034, cy = 1.516, G = (x, y) => [x, y, fz(x, y, 0.011)], w = 0.026, h = 0.019, t = 0.0035;
      for (const [x0, y0, x1, y1] of [[cx - w, cy + h - t, cx + w, cy + h], [cx - w, cy - h, cx + w, cy - h + t], [cx - w, cy - h, cx - w + t, cy + h], [cx + w - t, cy - h, cx + w, cy + h]])
        g.poly([G(x0, y0), G(x1, y0), G(x1, y1), G(x0, y1)], [0, 0, 1], B.head, S.black, on(PART.glasses), 1);
    }
    g.poly([[-0.009, 1.529, fz(0, 1.53, 0.011)], [0.009, 1.529, fz(0, 1.53, 0.011)], [0.009, 1.533, fz(0, 1.53, 0.011)], [-0.009, 1.533, fz(0, 1.53, 0.011)]], [0, 0, 1], B.head, S.black, on(PART.glasses), 1);
    g.loft([ring(0, 1.438, 0.013, 0.078, 0.092), ring(0, 1.47, 0.01, 0.092, 0.1), ring(0, 1.502, 0.006, 0.098, 0.106)], 12, B.head, S.white, on(PART.faceMask), 1.05, [false, false], [-Math.PI * 0.42, Math.PI * 0.42]);
  }
  g.scaleFrom(h0, [0, 1.43, 0], child ? 1.3 : 1.12);                                                   // anime proportions
  // ---- arms and hands
  for (const sx of [1, -1]) {
    const arm = sx > 0 ? B.armL : B.armR, fore = sx > 0 ? B.foreL : B.foreR;
    g.loft([ring(sx * 0.215, 1.09, 0, 0.041), ring(sx * 0.212, 1.2, 0, 0.045), ring(sx * 0.205, 1.3, 0, 0.049), ring(sx * 0.19, 1.39, 0, 0.052)], sg(8), arm, S.top, 0, 1, [false, true]);
    g.loft([ring(sx * 0.22, 0.86, 0.005, 0.03), ring(sx * 0.218, 0.97, 0.003, 0.035), ring(sx * 0.215, 1.1, 0, 0.041)], sg(8), fore, S.forearm, 0, 1, [true, false]);
    g.box(sx * 0.22 - 0.022, sx * 0.22 + 0.022, 0.76, 0.865, -0.025, 0.035, fore, S.skin);
  }
  // ---- things carried
  g.box(-0.26, -0.18, 0.5, 0.78, -0.17, 0.16, B.foreR, S.accent, on(PART.briefcase), 0.9);                  // briefcase (right hand)
  g.box(-0.235, -0.205, 0.78, 0.84, -0.03, 0.03, B.foreR, S.accent, on(PART.briefcase), 0.6);
  g.box(-0.15, 0.15, 0.98, 1.37, -0.235, -0.1, B.torso, S.accent, on(PART.backpack));                     // backpack / randoseru
  g.box(-0.13, 0.13, 1.25, 1.39, -0.25, -0.12, B.torso, S.accent, on(PART.backpack), 0.85);
  g.box(0.16, 0.245, 0.78, 1.0, -0.1, 0.12, B.pelvis, S.accent, on(PART.shoulderBag));                    // shoulder bag (left hip) and its strap
  g.box(0.13, 0.16, 0.99, 1.36, -0.02, 0.02, B.torso, S.accent, on(PART.shoulderBag), 0.8);
  g.box(-0.14, 0.14, 1.26, 1.41, -0.112, -0.09, B.torso, S.white, on(PART.collar));                        // sailor collar: the square at the back,
  for (const sx of [1, -1]) {                                                                                // the V down the front (white edged in the top's colour)
    const T = (x, y, o) => [x, y, tz(x, y) + o];
    const A0 = [sx * 0.1, 1.39], A1 = [sx * 0.13, 1.37], B0 = [0, 1.225], B1 = [sx * 0.02, 1.22];   // (in steps, so it lies on the chest)
    for (let k = 0; k < 5; k++) {
      const l = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t], t0 = k / 5, t1 = (k + 1) / 5;
      const a = l(A0, B0, t0), b = l(A1, B1, t0), c = l(A1, B1, t1), d = l(A0, B0, t1);
      g.poly([T(a[0], a[1], 0.007), T(b[0], b[1], 0.007), T(c[0], c[1], 0.007), T(d[0], d[1], 0.007)], [0, 0, 1], B.torso, S.white, on(PART.collar), 1.05);
    }
  }
  { const T = (x, y, o) => [x, y, tz(x, y) + o];                                                             // and the scarf's knot and tails
    g.poly([T(-0.035, 1.255, 0.011), T(0.035, 1.255, 0.011), T(0.02, 1.215, 0.011), T(-0.02, 1.215, 0.011)], [0, 0, 1], B.torso, S.accent, on(PART.collar), 1);
    g.poly([T(-0.02, 1.215, 0.011), T(0.02, 1.215, 0.011), T(0.03, 1.13, 0.009), T(-0.03, 1.13, 0.009)], [0, 0, 1], B.torso, S.accent, on(PART.collar), 0.9); }
  g.box(0.16, 0.3, 0.48, 0.78, -0.1, 0.12, B.foreL, S.accent, on(PART.ecoBag));                            // eco bag (left hand)
  // held in the right hand, each modelled along the direction its hold turns upright
  const [hx, hy] = [-HAND[0], HAND[1]];
  g.box(hx - 0.034, hx + 0.034, 0.7, 0.845, 0.03, 0.042, B.foreR, S.black, on(PART.phone), 1);                    // a phone in the palm, its screen
  g.poly([[hx - 0.028, 0.708, 0.0425], [hx + 0.028, 0.708, 0.0425], [hx + 0.028, 0.835, 0.0425], [hx - 0.028, 0.835, 0.0425]], [0, 0, 1], B.foreR, S.white, on(PART.phone), 1.35);   // (turned to the face when held up)
  { const up = HOLD.parasol[0] + HOLD.parasol[1], f = g.n;                                           // a parasol (日傘): stick and canopy
    g.box(hx - 0.008, hx + 0.008, hy - 0.008, hy + 0.008, -0.05, 0.86, B.foreR, S.silver, on(PART.parasol), 1);
    const n = near ? 10 : 8, R = 0.46, top = [hx, hy, 0.9], rim = [...Array(n)].map((_, k) => { const a = (k / n) * Math.PI * 2; return [hx + Math.cos(a) * R, hy + Math.sin(a) * R, 0.76]; });
    for (let k = 0; k < n; k++) g.tri2(top, rim[k], rim[(k + 1) % n], B.foreR, S.accent, on(PART.parasol), k & 1 ? 0.9 : 1);
    g.rotX(f, hy, 0, up - Math.PI / 2); }
  { const up = HOLD.mug[0] + HOLD.mug[1], f = g.n;                                                   // a beer mug (for the 横丁)
    g.box(hx - 0.036, hx + 0.036, hy - 0.036, hy + 0.036, 0.0, 0.12, B.foreR, S.amber, on(PART.mug), 1.1);
    g.box(hx - 0.038, hx + 0.038, hy - 0.038, hy + 0.038, 0.12, 0.15, B.foreR, S.white, on(PART.mug), 1.2);
    g.box(hx + 0.036, hx + 0.056, hy - 0.01, hy + 0.01, 0.02, 0.1, B.foreR, S.silver, on(PART.mug), 1);
    g.rotX(f, hy, 0, up - Math.PI / 2); }
  return g.geometry();
}

// ------------------------------------------------------------------ the pose (GLSL, shared by all passes)
export const POSE_GLSL = /* glsl */`
attribute float bone; attribute float slot; attribute float part;
attribute vec4 aAnim;   // phase, amplitude / variant, mode, scale
attribute vec4 aCol0;   // skin, hair, top, bottom (packed 0xRRGGBB)
attribute vec4 aCol1;   // shoes, accent, forearm, legs
attribute float aMask;  // optional parts
uniform float uTime; uniform float uLean; uniform float uStride;
mat3 rX(float a){ float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
float bitOn(float b){ return mod(floor(aMask / exp2(b) + 0.001), 2.0); }
vec3 unpackRGB(float c){ float r = floor(c / 65536.); float g = floor((c - r * 65536.) / 256.); float b = c - r * 65536. - g * 256.; return pow(vec3(r, g, b) / 255., vec3(2.2)); }
vec3 slotRGB(){
  int s = int(slot + 0.5);
  if (s == 8) return vec3(0.84, 0.85, 0.86); if (s == 9) return vec3(0.78, 0.44, 0.07); if (s == 10) return vec3(0.025, 0.024, 0.03); if (s == 11) return vec3(0.55, 0.57, 0.6);
  if (s == 12) return unpackRGB(aCol0.y) * 0.55 + vec3(0.02, 0.012, 0.006);
  float c = s == 0 ? aCol0.x : s == 1 ? aCol0.y : s == 2 ? aCol0.z : s == 3 ? aCol0.w : s == 4 ? aCol1.x : s == 5 ? aCol1.y : s == 6 ? aCol1.z : aCol1.w;
  return unpackRGB(c);
}
void personPose(inout vec3 p, inout vec3 n){
  // optional parts: shown when their bit is set; parts from 100 up are hidden when theirs is
  if (part > 99.5) { if (bitOn(part - 100.) > 0.5) { p = vec3(0.); return; } }
  else if (part > 0.5 && bitOn(part - 1.) < 0.5) { p = vec3(0.); return; }
  float ph = aAnim.x, amp = aAnim.y, mode = aAnim.z;
  float fL = 0., fR = 0., kL = 0.04, kR = 0.04, aL = 0., aR = 0., eL = 0.15, eR = 0.15, lean = 0., tw = 0., nod = 0.02, look = 0., bob = 0., sway = 0., abd = 0.05;
  if (mode < 0.5) {                                   // walk: phase = the stride cycle, amp = how big the stride
    float s = sin(ph), c = cos(ph), A = amp * uStride;
    fL = A * 0.42 * s; fR = -fL;
    kL = A * (0.1 + 0.95 * pow(max(0., c), 1.5)); kR = A * (0.1 + 0.95 * pow(max(0., -c), 1.5));
    aL = -fL * 0.85; aR = -fR * 0.85; eL = 0.2 + 0.4 * max(0., aL); eR = 0.2 + 0.4 * max(0., aR);
    lean = 0.05 * A; tw = 0.09 * A * s; bob = 0.024 * A * (abs(c) - 0.5); sway = 0.012 * A * s;
    look = 0.25 * sin(uTime * 0.21 + aAnim.w * 57.0) * sin(uTime * 0.13 + aAnim.w * 31.0);
  } else if (mode < 1.5) {                            // stand: breathing, a weight shift, looking about; variants
    float b = sin(uTime * 0.7 + ph * 3.1);
    aL = 0.04 * b; aR = -0.04 * b; lean = 0.012 * b; sway = 0.014 * sin(uTime * 0.33 + ph);
    look = 0.45 * sin(uTime * 0.17 + ph * 2.3) * sin(uTime * 0.11 + ph);
    if (amp > 0.5 && amp < 1.5) { aR = 0.42; eR = 1.95; nod = 0.34; abd = 0.12; look *= 0.2; }
    else if (amp > 1.5 && amp < 2.5) { aL = 0.25; aR = 0.25; eL = 0.95; eR = 0.95; abd = 0.02; }
    else if (amp > 3.5) { float g = sin(uTime * 1.7 + ph * 5.0); aL = 0.45 + 0.25 * g; eL = 1.1 + 0.35 * sin(uTime * 2.3 + ph); look = 0.35 * sin(uTime * 0.4 + ph); }   // chatting, a hand going
  } else if (mode < 2.5) {                            // cycle: phase = the cranks
    float s = sin(ph);
    fL = 1.0 + 0.32 * s; fR = 1.0 - 0.32 * s; kL = 1.25 + 0.5 * s; kR = 1.25 - 0.5 * s;
    aL = 0.95; aR = 0.95; eL = 0.45; eR = 0.45; lean = 0.32; nod = -0.22; abd = 0.12;
  } else if (mode < 3.5) {                            // ride a motorcycle (amp 1) or drive (amp 0)
    fL = 1.45 - 0.2 * amp; fR = fL; kL = 1.4 - 0.25 * amp; kR = kL; aL = 0.95; aR = 0.95; eL = 0.55; eR = 0.55; lean = 0.22 * amp + 0.04; nod = -0.12 * amp; abd = 0.2 * amp;
  } else {                                            // sit on a bench / a stool
    fL = 1.5; fR = 1.5; kL = 1.5; kR = 1.5; aL = 0.3; aR = 0.3; eL = 0.95; eR = 0.95; lean = 0.06; nod = 0.12; look = 0.4 * sin(uTime * 0.19 + ph);
  }
  // what's in the right hand sets the arm (walking or standing)
  if (mode < 1.5) {
    if (bitOn(${PART.parasol}.) > 0.5) { aR = ${HOLD.parasol[0]}; eR = ${HOLD.parasol[1]}; abd = 0.1; }
    else if (bitOn(${PART.mug}.) > 0.5) {
      float c = fract(uTime * 0.13 + ph * 0.37), d = smoothstep(0.0, 0.12, c) - smoothstep(0.22, 0.34, c);   // a sip every ~8 s
      aR = ${HOLD.mug[0]} + 0.25 * d; eR = ${HOLD.mug[1]} + 0.85 * d; nod = 0.03 - 0.3 * d; abd = 0.12; look *= 1. - d;
    } else if (bitOn(${PART.phone}.) > 0.5) { aR = ${HOLD.phone[0]}; eR = ${HOLD.phone[1]}; nod = 0.32; abd = 0.12; look *= 0.15; }
  }
  lean += uLean;
  const vec3 WAIST = vec3(0., ${J.waist.toFixed(3)}, 0.), NECK = vec3(0., ${J.neck.toFixed(3)}, 0.);
  const vec3 HL = vec3(${J.hip[0].toFixed(3)}, ${J.hip[1].toFixed(3)}, 0.), HR = vec3(-${J.hip[0].toFixed(3)}, ${J.hip[1].toFixed(3)}, 0.);
  const vec3 KL = vec3(${J.knee[0].toFixed(3)}, ${J.knee[1].toFixed(3)}, 0.), KR = vec3(-${J.knee[0].toFixed(3)}, ${J.knee[1].toFixed(3)}, 0.);
  const vec3 SL = vec3(${J.shoulder[0].toFixed(3)}, ${J.shoulder[1].toFixed(3)}, 0.), SR = vec3(-${J.shoulder[0].toFixed(3)}, ${J.shoulder[1].toFixed(3)}, 0.);
  const vec3 EL = vec3(${J.elbow[0].toFixed(3)}, ${J.elbow[1].toFixed(3)}, 0.), ER = vec3(-${J.elbow[0].toFixed(3)}, ${J.elbow[1].toFixed(3)}, 0.);
  int b = int(bone + 0.5);
  mat3 Rt = rY(tw) * rX(lean), R = mat3(1.);
  vec3 q = p;
  if (b == 1) { q = Rt * (p - WAIST) + WAIST; R = Rt; }
  else if (b == 2) { mat3 Rn = rY(look) * rX(nod); q = Rt * (Rn * (p - NECK) + NECK - WAIST) + WAIST; R = Rt * Rn; }
  else if (b >= 3 && b <= 6) {
    bool left = b <= 4; vec3 S0 = left ? SL : SR, E0 = left ? EL : ER;
    mat3 Rs = rZ(left ? abd : -abd) * rX(-(left ? aL : aR));
    if (b == 3 || b == 5) { q = Rs * (p - S0) + S0; R = Rs; }
    else { mat3 Re = rX(-(left ? eL : eR)); q = Rs * (Re * (p - E0) + E0 - S0) + S0; R = Rs * Re; }
    q = Rt * (q - WAIST) + WAIST; R = Rt * R;
  }
  else if (b >= 7 && b <= 10) {
    bool left = b <= 8; vec3 H0 = left ? HL : HR, K0 = left ? KL : KR;
    mat3 Rh = rX(-(left ? fL : fR));
    if (b == 7 || b == 9) { q = Rh * (p - H0) + H0; R = Rh; }
    else { mat3 Rk = rX(left ? kL : kR); q = Rh * (Rk * (p - K0) + K0 - H0) + H0; R = Rh * Rk; }
  }
  else if (b == 11) {                                 // the skirt follows the thigh on its side, more towards the hem
    bool left = p.x > 0.; vec3 H0 = left ? HL : HR; float w = clamp((0.95 - p.y) / 0.45, 0., 1.) * 0.75;
    mat3 Rh = rX(-(left ? fL : fR) * w * (mode > 1.5 ? 0.9 : 1.0)); q = Rh * (p - H0) + H0; R = Rh;
  }
  q += vec3(sway, bob, 0.);
  p = q * aAnim.w; n = R * n;
}`;

/** The three materials of a body kind: colour (toon), outline pre-pass (normal + depth), shadow depth. */
export function bodyMaterials(ctx, kind) {
  const uni = { uTime: ctx.shared.uTime, uLean: { value: kind === 'elder' ? 0.2 : 0 }, uStride: { value: kind === 'elder' ? 0.72 : kind === 'child' ? 1.1 : 1 } };
  const inject = (sh) => { Object.assign(sh.uniforms, uni); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + POSE_GLSL); };
  const toon = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ctx.mat.gradientMap });
  toon.onBeforeCompile = (sh) => {
    inject(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vec3 posedP = position; personPose(posedP, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = posedP;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb *= slotRGB();');
  };
  toon.customProgramCacheKey = () => 'people-' + kind;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => { inject(sh); sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  { vec3 nn = vec3(0., 1., 0.); personPose(transformed, nn); }'); };
  depth.customProgramCacheKey = () => 'people-depth-' + kind;
  const nd = new THREE.ShaderMaterial({
    uniforms: { ...uni, uFar: ctx.pipeline ? ctx.pipeline.ndMat.uniforms.uFar : { value: 2000 } },
    vertexShader: /* glsl */`
      #include <common>
      ${POSE_GLSL}
      varying vec3 vN; varying float vD;
      void main(){
        vec3 p = position, n = normal;
        personPose(p, n);
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * n); vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uFar; varying vec3 vN; varying float vD;
      void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n*0.5+0.5, vD/uFar); }`,
    side: THREE.DoubleSide,
  });
  return { toon, depth, nd };
}
