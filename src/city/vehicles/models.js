// Vehicle models, built procedurally for instancing. Every model shares one local frame — x toward the car's LEFT
// side (the kerb side: the bus doors are at +x), y up, z forward, origin on the ground midway between the axles — and
// is made of four parts:
//  • paint — the body in white (the instance colour paints it): a smooth shell (curved sides, shoulders, rounded
//    corners, wheel arches cut in), the roof and the pillars;
//  • fixed — lenses, grille, bumpers, trim, wheel houses, liveries and the interior (dash, steering wheel on the
//    right, seats), which shows through the glass;
//  • glass — windscreen, side and rear windows (drawn with the see-through anime glass);
//  • lamps — brake lamps (kind 1), left / right indicators (2, 3) and always-lit parts (0: daytime running lights, a
//    taxi's roof sign, the bus's destination board), switched per instance by the traffic.
// Wheels (alloy, steel with a cap, truck) are shared instanced meshes and number plates come from the plate atlas
// (render.js); each model lists its wheels, its plates and where its driver sits.
import { MB, rgb, shade } from '../mb.js';

const TRIM = rgb('#1c1d22'), TRIM_G = rgb('#3a3c42'), CHROME = rgb('#c9ced3'), LENS = rgb('#dfe7ec'), LENS_IN = rgb('#8d9aa5');
const RED = rgb('#c3262b'), AMBER = rgb('#f29a2e'), WELL = rgb('#141418'), DRL = rgb('#eef3ff'), REV = rgb('#e9ecef');
const INT = rgb('#2a2c31'), DASH = rgb('#24262b'), SEAT = rgb('#3b3e46'), LACE = rgb('#f3f0e8'), GLASS = rgb('#8fa3b3');
const MIRROR = rgb('#7f97aa'), WHITE = [1, 1, 1];

/** MB with a lamp kind per vertex (for the lamp shader): set it with at(kind) before drawing. */
class LampMB extends MB {
  constructor() { super(); this.K = []; this.kind = 0; }
  quad(a, b, c, d, col) { super.quad(a, b, c, d, col); this.K.push(this.kind, this.kind, this.kind, this.kind); }
  tri(a, b, c, col) { super.tri(a, b, c, col); this.K.push(this.kind, this.kind, this.kind); }
  at(kind) { this.kind = kind; return this; }
}
const parts = () => ({ paint: new MB(), fixed: new MB(), glass: new MB(), lamps: new LampMB() });
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ the shell
/** The station at z, interpolated between key stations (front → rear); `cab` belongs to the span that follows. */
function stationAt(keys, z) {
  if (z >= keys[0].z) return { ...keys[0], z };
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i], b = keys[i + 1];
    if (z <= a.z && z > b.z) {
      const t = (a.z - z) / (a.z - b.z);
      return { z, top: lerp(a.top, b.top, t), hw: lerp(a.hw, b.hw, t), bot: lerp(a.bot, b.bot, t), sh: lerp(a.sh, b.sh, t), cr: lerp(a.cr, b.cr, t), rake: lerp(a.rake || 0, b.rake || 0, t), cab: !!a.cab };
    }
  }
  return { ...keys[keys.length - 1], z };
}
/** The side's profile heights from its lower edge y0 up: the lower lip, the widest line, the upper roll, the top. */
function sideYs(y0, top, bot) {
  const h = Math.max(0.02, top - y0);
  const ym = Math.min(top - 0.3 * h, Math.max(y0 + 0.4 * h, bot + (top - bot) * 0.52));
  return [y0, y0 + Math.min(0.045, 0.15 * h), ym, top - Math.min(0.065, 0.2 * h), top];
}
const sideXs = (s) => [s.hw - 0.035, s.hw - 0.004, s.hw, s.hw - 0.014, s.hw - s.sh];
/** A station's cross-section: 13 points from the left sill (+x) over the crowned top to the right sill. */
function ring(s) {
  const ys = sideYs(s.y0, s.top, s.bot), xs = sideXs(s), rk = s.rake || 0, Z = (y) => s.z - rk * Math.max(0, Math.min(1, (y - s.bot) / Math.max(0.05, s.top - s.bot)));
  const half = [...xs.map((x, i) => [x, ys[i]]), [(s.hw - s.sh) * 0.5, s.top + s.cr * 0.75]];
  return [...half.map(([x, y]) => [x, y, Z(y)]), [0, s.top + s.cr, Z(s.top)], ...half.slice().reverse().map(([x, y]) => [-x, y, Z(y)])];
}
/** x of the side surface at height y (no arch). */
function surfX(s, y) {
  const ys = sideYs(s.bot, s.top, s.bot), xs = sideXs(s);
  if (y <= ys[0]) return xs[0];
  for (let i = 0; i + 1 < 5; i++) if (y <= ys[i + 1]) return lerp(xs[i], xs[i + 1], (y - ys[i]) / Math.max(1e-6, ys[i + 1] - ys[i]));
  return xs[4];
}
/**
 * The lower body through key stations (front → rear) { z, top, hw, bot, sh: shoulder inset, cr: crown, cab: from here
 * to the next key the top lies inside the cabin (drawn as the interior) }, with wheel arches [{ z, r, y }] cut in,
 * a wheel house in each, flat end caps (the lights go on them) and smooth normals, so the toon bands run along the
 * shoulders as on a real car.
 */
function shell(P, keys, arches) {
  const zf = keys[0].z, zr = keys[keys.length - 1].z, zs = keys.map(k => k.z);
  for (const a of arches) { for (let i = 0; i <= 10; i++) zs.push(a.z + a.r * Math.cos(Math.PI * i / 10)); zs.push(a.z + a.r + 0.012, a.z - a.r - 0.012); }
  const st = [];
  for (const z of zs.filter(z => z <= zf && z >= zr).sort((a, b) => b - a)) {
    if (st.length && st[st.length - 1].z - z < 0.004) continue;
    const s = stationAt(keys, z); s.y0 = s.bot;
    for (const a of arches) { const dz = Math.abs(z - a.z); if (dz <= a.r + 0.001) s.y0 = Math.max(s.y0, a.y + Math.sqrt(Math.max(0, a.r * a.r - dz * dz))); }
    st.push(s);
  }
  const R = st.map(ring), n = st.length, m = R[0].length;
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const N = R.map((row, i) => row.map((p, j) => {
    const t1 = sub(row[Math.min(m - 1, j + 1)], row[Math.max(0, j - 1)]);
    const low = j <= 1 || j >= m - 2;                                  // one-sided across the step at an arch's end
    let i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    if (low && Math.abs(R[i1][j][1] - p[1]) > 0.04) i1 = i;
    if (low && Math.abs(R[i0][j][1] - p[1]) > 0.04) i0 = i;
    const t2 = i0 === i1 ? [0, 0, -1] : sub(R[i1][j], R[i0][j]);
    const c = [t2[1] * t1[2] - t2[2] * t1[1], t2[2] * t1[0] - t2[0] * t1[2], t2[0] * t1[1] - t2[1] * t1[0]], l = Math.hypot(c[0], c[1], c[2]) || 1;
    return [c[0] / l, c[1] / l, c[2] / l];
  }));
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j + 1 < m; j++) {
    const inside = st[i].cab && j >= 4 && j < 8, mb = inside ? P.fixed : P.paint;
    mb.quadN(R[i][j], R[i + 1][j], R[i + 1][j + 1], R[i][j + 1], N[i][j], N[i + 1][j], N[i + 1][j + 1], N[i][j + 1], inside ? INT : WHITE);
  }
  P.paint.poly(R[0], WHITE, [0, 0, 1]); P.paint.poly(R[n - 1], WHITE, [0, 0, -1]);
  // wheel houses: a liner round each arch and an inner wall, so nothing shows through the opening but the dark
  for (const a of arches) {
    const s = stationAt(keys, a.z), arc = [];
    for (let k = 0; k <= 10; k++) { const ph = Math.PI * k / 10; arc.push([a.y + a.r * Math.sin(ph), a.z + a.r * Math.cos(ph)]); }
    for (const sx of [-1, 1]) {
      const xo = sx * (s.hw - 0.03), xi = sx * (s.hw - 0.34);
      for (let k = 0; k < 10; k++) {
        const [y0, z0] = arc[k], [y1, z1] = arc[k + 1];
        P.fixed.quadF([xo, y0, z0], [xo, y1, z1], [xi, y1, z1], [xi, y0, z0], WELL, [0, a.y - (y0 + y1) / 2, a.z - (z0 + z1) / 2]);
      }
      P.fixed.poly([[xi, s.bot, a.z + a.r], ...arc.map(([y, z]) => [xi, y, z]), [xi, s.bot, a.z - a.r]], WELL, [sx, 0, 0]);
    }
  }
  return st;
}

// ------------------------------------------------------------------ decals
/** A quad on the front (sgn +1, faces +z) or rear (−1) end at zf (a number, or z of height y on a raked end): x0..x1,
 *  y0..y1, dz proud of it; kind → a lamp. */
function face(mb, zf, sgn, x0, x1, y0, y1, col, kind, dz = 0.006) {
  const Z = typeof zf === 'function' ? (y) => zf(y) + sgn * dz : () => zf + sgn * dz;
  if (kind !== undefined) mb.at(kind);
  mb.quadF([x0, y0, Z(y0)], [x1, y0, Z(y0)], [x1, y1, Z(y1)], [x0, y1, Z(y1)], col, [0, 0, sgn]);
}
/** A polygon [[x, y]…] on an end. */
function facePoly(mb, zf, sgn, pts, col, kind, dz = 0.006) {
  const Z = typeof zf === 'function' ? (y) => zf(y) + sgn * dz : () => zf + sgn * dz;
  if (kind !== undefined) mb.at(kind);
  mb.poly(pts.map(([x, y]) => [x, y, Z(y)]), col, [0, 0, sgn]);
}
/**
 * A decal on the side surface (sx ±1), z0..z1, heights y0..y1, following the body's curve `off` proud of it; its
 * lower edge steps up round the wheel arches (keys.arches), so a livery or a stripe never covers a wheel.
 */
function onSide(mb, sx, keys, z0, z1, y0, y1, col, off = 0.005, kind) {
  const za = Math.max(z0, z1), zb = Math.min(z0, z1), A = keys.arches || [];
  const zs = [za, zb, ...keys.map(k => k.z)];
  for (const a of A) { for (let i = 0; i <= 10; i++) zs.push(a.z + a.r * Math.cos(Math.PI * i / 10)); zs.push(a.z + a.r + 0.012, a.z - a.r - 0.012); }
  const zc = [...new Set(zs.filter(z => z <= za && z >= zb))].sort((p, q) => q - p);
  const lo = (z) => { let y = y0; for (const a of A) { const dz = Math.abs(z - a.z); if (dz <= a.r + 0.001) y = Math.max(y, a.y + Math.sqrt(Math.max(0, a.r * a.r - dz * dz)) + 0.012); } return Math.min(y, y1); };
  if (kind !== undefined) mb.at(kind);
  const bands = y1 - y0 > 0.12 ? 4 : 1;
  for (let i = 0; i + 1 < zc.length; i++) {
    if (zc[i] - zc[i + 1] < 0.002) continue;
    const sa = stationAt(keys, zc[i]), sb = stationAt(keys, zc[i + 1]), la = lo(zc[i]), lb = lo(zc[i + 1]);
    if (la >= y1 - 0.004 && lb >= y1 - 0.004) continue;
    for (let k = 0; k < bands; k++) {
      const t0 = k / bands, t1 = (k + 1) / bands, a0 = lerp(la, y1, t0), a1 = lerp(la, y1, t1), b0 = lerp(lb, y1, t0), b1 = lerp(lb, y1, t1);
      mb.quadF([sx * (surfX(sa, a0) + off), a0, sa.z], [sx * (surfX(sb, b0) + off), b0, sb.z], [sx * (surfX(sb, b1) + off), b1, sb.z], [sx * (surfX(sa, a1) + off), a1, sa.z], col, [sx, 0, 0]);
    }
  }
}
/** A band round an arch's edge on the side (SUV cladding). */
function archTrim(mb, keys, a, w, col) {
  for (const sx of [-1, 1]) for (let k = 0; k < 10; k++) {
    const p0 = Math.PI * k / 10, p1 = Math.PI * (k + 1) / 10, Q = (ph, r) => { const y = a.y + r * Math.sin(ph), z = a.z + r * Math.cos(ph), s = stationAt(keys, z); return [sx * (surfX(s, y) + 0.006), y, z]; };
    mb.quadF(Q(p0, a.r), Q(p1, a.r), Q(p1, a.r + w), Q(p0, a.r + w), col, [sx, 0, 0]);
  }
}

// ------------------------------------------------------------------ greenhouse and interior
/**
 * The greenhouse on the belt yb: glass from the windscreen base zws0 (half width hwb) back to the rear glass base
 * zrw0; the roof yr (half width hwr, crown cr) from zws1 to zrw1. Pillars in paint (a: the A-pillar's share of the
 * side, b: B / C pillars at these shares — black unless bPaint, c: the rear pillar), a black edge round the screens,
 * solid: the side is a panel from this share on (vans), rearGlass false: a painted back panel, chrome: a sill line.
 */
function greenhouse(P, g) {
  const { yb, yr, zws0, zws1, zrw1, zrw0, hwb, hwr } = g, cr = g.cr ?? 0.035, crb = g.crb ?? 0.02, solid = g.solid ?? 1;
  const S = (sx, s, t, o = 0) => { const zb = zws0 + (zrw0 - zws0) * s, zt = zws1 + (zrw1 - zws1) * s; return [(hwb + (hwr - hwb) * t + o) * sx, yb + (yr - yb) * t, zb + (zt - zb) * t]; };
  const scr = (sx, u, t, z0, z1, dz) => [sx * lerp(hwb, hwr, t) * u, lerp(yb + crb * (1 - u), yr + cr * (1 - u), t), lerp(z0, z1, t) + dz];
  for (const sx of [-1, 1]) {
    // screens (two halves meeting at the crowned middle), roof, side glass
    P.glass.quadF(scr(sx, 1, 0, zws0, zws1, 0), scr(sx, 0, 0, zws0, zws1, 0), scr(sx, 0, 1, zws0, zws1, 0), scr(sx, 1, 1, zws0, zws1, 0), GLASS, [0, 0.4, 1]);
    const back = g.rearGlass === false ? P.paint : P.glass;
    back.quadF(scr(sx, 1, 0, zrw0, zrw1, 0), scr(sx, 0, 0, zrw0, zrw1, 0), scr(sx, 0, 1, zrw0, zrw1, 0), scr(sx, 1, 1, zrw0, zrw1, 0), g.rearGlass === false ? WHITE : GLASS, [0, 0.4, -1]);
    P.paint.quadF([sx * hwr, yr, zws1], [sx * hwr, yr, zrw1], [0, yr + cr, zrw1], [0, yr + cr, zws1], WHITE, [0, 1, 0]);
    const side = (mb, s0, s1, col) => mb.quadF(S(sx, s0, 0), S(sx, s1, 0), S(sx, s1, 1), S(sx, s0, 1), col, [sx, 0, 0]);
    side(P.glass, 0, Math.min(1, solid), GLASS);
    if (solid < 1) side(P.paint, solid, 1, WHITE);
    // pillars, the roof rail, the window rubber
    const band = (mb, s0, s1, t0, t1, col, o = 0.008) => mb.quadF(S(sx, s0, t0, o), S(sx, s1, t0, o), S(sx, s1, t1, o), S(sx, s0, t1, o), col, [sx, 0, 0]);
    band(P.paint, 0, g.a ?? 0.06, 0, 1, WHITE);
    band(P.paint, 0, 1, 0.93, 1, WHITE);
    band(P.fixed, 0, 1, 0, 0.035, TRIM);
    if (g.chrome) band(P.fixed, 0.02, 0.98, 0.035, 0.06, CHROME, 0.01);
    for (const b of g.b || []) band(g.bPaint ? P.paint : P.fixed, b - 0.022, b + 0.022, 0, 1, g.bPaint ? WHITE : TRIM);
    if (g.c) band(P.paint, 1 - g.c, 1, 0, 1, WHITE);
    // the screens' black edges (sides and header)
    for (const [z0, z1, dz, want] of [[zws0, zws1, 0.004, [0, 0.4, 1]], ...(g.rearGlass === false ? [] : [[zrw0, zrw1, -0.004, [0, 0.4, -1]]])]) {
      P.fixed.quadF(scr(sx, 1, 0, z0, z1, dz), scr(sx, 0.93, 0, z0, z1, dz), scr(sx, 0.93, 0.94, z0, z1, dz), scr(sx, 1, 0.94, z0, z1, dz), TRIM, want);
      P.fixed.quadF(scr(sx, 1, 0.9, z0, z1, dz), scr(sx, 0, 0.9, z0, z1, dz), scr(sx, 0, 1, z0, z1, dz), scr(sx, 1, 1, z0, z1, dz), TRIM, want);
    }
  }
  // wipers
  const wp = (u, t) => scr(u < 0 ? -1 : 1, Math.abs(u), t, zws0, zws1, 0.01);
  P.fixed.quadF(wp(-0.86, 0.035), wp(-0.08, 0.035), wp(-0.08, 0.06), wp(-0.86, 0.06), TRIM, [0, 0.4, 1]);
  P.fixed.quadF(wp(0.1, 0.035), wp(0.86, 0.035), wp(0.86, 0.06), wp(0.1, 0.06), TRIM, [0, 0.4, 1]);
}
/** A steering wheel of radius r centred at (x, y, z), its face turned to the driver (back and up). */
function steeringWheel(mb, x, y, z, r) {
  const t = 0.44, fy = Math.sin(t), fz = -Math.cos(t), vy = Math.cos(t), vz = Math.sin(t);
  const Q = (rr, a) => [x + Math.cos(a) * rr, y + Math.sin(a) * rr * vy, z + Math.sin(a) * rr * vz];
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
    for (const s of [1, -1]) mb.quadF(Q(r, a0), Q(r, a1), Q(r - 0.035, a1), Q(r - 0.035, a0), TRIM, [0, fy * s, fz * s]);
  }
  mb.poly([0, 1, 2, 3, 4, 5].map(i => Q(0.055, (i / 6) * Math.PI * 2)), TRIM_G, [0, fy, fz]);
  for (const a of [0, Math.PI, -Math.PI / 2]) mb.quadF(Q(0.05, a - 0.18), Q(r - 0.03, a - 0.1), Q(r - 0.03, a + 0.1), Q(0.05, a + 0.18), TRIM, [0, fy, fz]);
}
/**
 * The cabin inside: the dash under the screen, the steering wheel on the right (−x, right-hand drive), `rows` rows of
 * seats behind it (the first two seats, the others benches), headrests (lace covers on a taxi's).
 * Returns where the driver sits (the hip point).
 */
function interior(P, g, o = {}) {
  const { yb, yr, zws0, zws1, zrw0, hwb } = g, h = yr - yb, xs = Math.min(0.4, hwb * 0.48);
  const zAt = (y) => zws0 + (zws1 - zws0) * (y - yb) / (yr - yb);
  const dTop = yb + Math.min(0.12, h * 0.2), dz1 = zAt(dTop) - 0.05, dz0 = dz1 - 0.34;
  P.fixed.box(-hwb + 0.05, hwb - 0.05, yb - 0.3, dTop, dz0, dz1, DASH, 'NSEWT');
  steeringWheel(P.fixed, -xs, dTop + 0.05, dz0 - 0.1, 0.17);
  const z1 = Math.max(dz0 - 0.58, zrw0 + 0.16), rows = [...Array(o.rows ?? 2)].map((_, i) => z1 - i * 0.85), seat = o.seat ?? SEAT, head = o.lace ? LACE : seat;
  const hrTop = Math.min(yr - 0.1, yb + 0.52);
  rows.forEach((z, i) => {
    if (z < zrw0 + 0.15) return;
    const top = hrTop - 0.24;
    if (i === 0) for (const x of [-xs, xs]) { P.fixed.box(x - 0.23, x + 0.23, yb - 0.35, top, z - 0.13, z, seat, 'NSEWT'); if (o.lace) P.fixed.box(x - 0.235, x + 0.235, top - 0.16, top + 0.005, z - 0.135, z + 0.005, LACE, 'NSEWT'); }
    else P.fixed.box(-hwb + 0.08, hwb - 0.08, yb - 0.35, top - 0.03, z - 0.13, z, seat, 'NSEWT');
    for (const x of i === 0 ? [-xs, xs] : [-xs, xs, ...(hwb > 0.7 ? [0] : [])]) P.fixed.box(x - 0.12, x + 0.12, hrTop - 0.19, hrTop, z - 0.1, z - 0.01, head, 'NSEWT');
  });
  return [-xs, yb - 0.3, rows[0] + 0.12];
}

// ------------------------------------------------------------------ small parts
function doorMirrors(P, hw, y, z, big = false) {
  const w = big ? 0.12 : 0.13, h = big ? 0.28 : 0.095, d = big ? 0.08 : 0.075;
  for (const sx of [-1, 1]) {
    P.fixed.box(sx > 0 ? hw - 0.06 : -hw - 0.03, sx > 0 ? hw + 0.03 : -hw + 0.06, y + 0.01, y + 0.04, z - 0.06, z - 0.01, TRIM, 'NSEWT');   // the arm
    const x0 = sx > 0 ? hw + 0.02 : -hw - 0.02 - w, x1 = sx > 0 ? hw + 0.02 + w : -hw - 0.02;
    P.paint.box(x0, x1, y, y + h, z - d, z, WHITE, 'NSEWTB');
    const xa = x0 + 0.01, xb = x1 - 0.01;
    P.fixed.quadF([xa, y + 0.015, z - d - 0.004], [xb, y + 0.015, z - d - 0.004], [xb, y + h - 0.015, z - d - 0.004], [xa, y + h - 0.015, z - d - 0.004], MIRROR, [0, 0, -1]);
  }
}
/** Fender mirrors (a Crown Comfort taxi's): on stalks on the front wings. */
function fenderMirrors(P, x, y, z) {
  for (const sx of [-1, 1]) {
    P.fixed.box(sx * x - 0.012, sx * x + 0.012, y, y + 0.14, z - 0.012, z + 0.012, TRIM, 'NSEW');
    P.fixed.box(sx * x - 0.05, sx * x + 0.05, y + 0.12, y + 0.2, z - 0.035, z + 0.035, TRIM, 'NSEWTB');
    P.fixed.quadF([sx * x - 0.04, y + 0.13, z - 0.037], [sx * x + 0.04, y + 0.13, z - 0.037], [sx * x + 0.04, y + 0.19, z - 0.037], [sx * x - 0.04, y + 0.19, z - 0.037], MIRROR, [0, 0, -1]);
  }
}
/** Door shut lines and handles on both sides: cuts at z, from y0 to y1, handles at hy behind each cut but the last. */
function doors(P, keys, zs, y0, y1, hy) {
  for (const sx of [-1, 1]) zs.forEach((z, i) => {
    onSide(P.fixed, sx, keys, z + 0.007, z - 0.007, y0, y1, TRIM, 0.004);
    if (hy && i < zs.length - 1) onSide(P.fixed, sx, keys, z - 0.12, z - 0.3, hy, hy + 0.035, TRIM_G, 0.012);
  });
}
/** A sliding door's rail (the kerb side) and its rear shut line. */
function slidingDoor(P, keys, z0, z1, y0, yb) {
  onSide(P.fixed, 1, keys, z1 + 0.007, z1 - 0.007, y0, yb - 0.01, TRIM, 0.004);
  onSide(P.fixed, 1, keys, z0, z1 - 0.25, yb + 0.02, yb + 0.045, TRIM_G, 0.01);
}

/** Headlights, grille, bumper on the front end; fhw = the flat end's half width, yl = the lamps' top. */
function nose(P, zf, fhw, yl, o) {
  const lw = o.lampW ?? 0.34, lh = o.lampH ?? 0.12, bot = o.bot ?? 0.2, style = o.lights ?? 'slim';
  const circle = (c, r, k) => [...Array(k)].map((_, i) => [c[0] + Math.cos(i / k * Math.PI * 2) * r, c[1] + Math.sin(i / k * Math.PI * 2) * r]);
  for (const sx of [-1, 1]) {
    const xo = sx * (fhw - 0.04), xi = sx * (fhw - 0.04 - lw);
    if (style === 'round') {                                              // two round lamps (a retro kei, the JPN taxi)
      const c = [(xo + xi) / 2, yl - lh / 2], r = Math.min(lh, lw) * 0.55;
      facePoly(P.fixed, zf, 1, circle(c, r + 0.018, 12), CHROME, undefined, 0.004);
      facePoly(P.fixed, zf, 1, circle(c, r, 12), LENS);
      facePoly(P.fixed, zf, 1, circle(c, r * 0.45, 8), LENS_IN, undefined, 0.009);
    } else {
      // the lens (its inner end lower on a slim lamp), a projector, a daytime running light along the bottom
      const inner = style === 'slim' ? lh * 0.62 : lh, e = 0.014;
      facePoly(P.fixed, zf, 1, [[xi - sx * e, yl - inner - e], [xo + sx * e * 0.5, yl - lh - e], [xo + sx * e * 0.5, yl + e], [xi - sx * e, yl + e]], TRIM, undefined, 0.004);
      facePoly(P.fixed, zf, 1, [[xi, yl - inner], [xo, yl - lh], [xo, yl], [xi, yl]], LENS);
      facePoly(P.fixed, zf, 1, circle([xo - sx * lw * 0.3, yl - lh * 0.5], lh * 0.3, 8), LENS_IN, undefined, 0.009);
      if (o.drl) facePoly(P.lamps, zf, 1, [[xi, yl - inner], [xo, yl - lh], [xo, yl - lh + 0.02], [xi, yl - inner + 0.02]], DRL, 0, 0.01);
    }
    face(P.lamps, zf, 1, Math.min(xo, xi), Math.max(xo, xi), yl - lh - 0.055, yl - lh - 0.012, AMBER, sx > 0 ? 2 : 3);
    face(P.fixed, zf, 1, sx * (fhw - 0.14) - 0.05, sx * (fhw - 0.14) + 0.05, bot + 0.1, bot + 0.16, LENS_IN);     // fog lamps
  }
  const gw = Math.max(0.28, fhw - 0.04 - lw - 0.05), gc = o.grille ?? TRIM_G;
  facePoly(P.fixed, zf, 1, [[-gw * 0.86, yl - lh - 0.03], [gw * 0.86, yl - lh - 0.03], [gw, yl - 0.01], [-gw, yl - 0.01]], gc);
  for (let k = 1; k <= 2; k++) { const y = yl - 0.01 - (lh + 0.02) * k / 3; face(P.fixed, zf, 1, -gw * 0.9, gw * 0.9, y - 0.006, y + 0.006, gc === CHROME ? TRIM_G : shade(gc, 1.35), undefined, 0.008); }
  face(P.fixed, zf, 1, -0.055, 0.055, yl - lh / 2 - 0.03, yl - lh / 2 + 0.03, CHROME, undefined, 0.01);
  face(P.fixed, zf, 1, -(fhw - 0.22), fhw - 0.22, bot + 0.08, bot + 0.19, TRIM_G);                                  // lower intake
  face(P.fixed, zf, 1, -(fhw - 0.02), fhw - 0.02, bot + 0.04, bot + 0.08, TRIM);                                     // lip
  face(P.fixed, zf, 1, -0.185, 0.185, bot + 0.185, bot + 0.375, TRIM, undefined, 0.007);                               // plate holder
}
/** Tail lamps (wrapping round the corners), reversing lamps, the bumper and reflectors on the rear end. */
function tail(P, keys, zr, fhw, yt, o) {
  const tw = o.tailW ?? 0.3, bot = o.bot ?? 0.2;
  for (const sx of [-1, 1]) {
    const xo = sx * (fhw - 0.03), xi = sx * (fhw - 0.03 - tw);
    facePoly(P.fixed, zr, -1, [[xi + sx * 0.014, yt - 0.114], [xo - sx * 0.007, yt - 0.164], [xo - sx * 0.007, yt + 0.014], [xi + sx * 0.014, yt + 0.014]], TRIM, undefined, 0.004);
    facePoly(P.lamps, zr, -1, [[xi, yt - 0.1], [xo, yt - 0.15], [xo, yt], [xi, yt]], RED, 1);
    face(P.lamps, zr, -1, Math.min(xo, xi) + 0.03, Math.max(xo, xi) - 0.03, yt - 0.06, yt - 0.04, rgb('#ff8a80'), 1, 0.009);   // the lens' inner line
    face(P.lamps, zr, -1, Math.min(xo, xi), Math.max(xo, xi), yt - 0.22, yt - 0.165, AMBER, sx > 0 ? 2 : 3);
    face(P.fixed, zr, -1, Math.min(xi, xi - sx * 0.1), Math.max(xi, xi - sx * 0.1), yt - 0.1, yt - 0.03, REV);
    if (o.wrap !== false) onSide(P.lamps, sx, keys, zr + 0.001, zr + (o.rc ?? 0.16) + 0.1, yt - 0.15, yt, RED, 0.004, 1);
    face(P.fixed, zr, -1, sx * (fhw - 0.2) - 0.05, sx * (fhw - 0.2) + 0.05, bot + 0.14, bot + 0.18, RED);            // reflectors
  }
  face(P.fixed, zr, -1, -(fhw - 0.02), fhw - 0.02, bot + 0.04, bot + 0.13, TRIM_G);
  face(P.fixed, zr, -1, -0.185, 0.185, yt - 0.42, yt - 0.23, TRIM, undefined, 0.007);                                // plate holder
}
/** The high-mounted stop lamp over a hatch's rear glass. */
const hmsl = (P, y, z) => face(P.lamps, z, -1, -0.22, 0.22, y - 0.035, y, RED, 1, 0.012);

// roof extras
const andon = (color, text) => ({ P, yr, zws1, zrw1 }) => {                    // a taxi's roof sign (行灯)
  const z = zws1 + (zrw1 - zws1) * 0.25, y = yr + 0.03;
  P.fixed.box(-0.24, 0.24, y - 0.03, y + 0.05, z - 0.14, z + 0.14, TRIM, 'NSEWT');
  const hw = 0.22, h = 0.17;
  P.lamps.at(0).quadF([-hw, y + 0.05, z + 0.12], [hw, y + 0.05, z + 0.12], [hw, y + 0.05 + h, z + 0.04], [-hw, y + 0.05 + h, z + 0.04], color, [0, 0.3, 1]);
  P.lamps.quadF([hw, y + 0.05, z - 0.12], [-hw, y + 0.05, z - 0.12], [-hw, y + 0.05 + h, z - 0.04], [hw, y + 0.05 + h, z - 0.04], color, [0, 0.3, -1]);
  P.fixed.quadF([-hw, y + 0.05 + h, z + 0.04], [hw, y + 0.05 + h, z + 0.04], [hw, y + 0.05 + h, z - 0.04], [-hw, y + 0.05 + h, z - 0.04], TRIM, [0, 1, 0]);
  for (const sx of [-1, 1]) P.fixed.quadF([sx * hw, y + 0.05, z + 0.12], [sx * hw, y + 0.05, z - 0.12], [sx * hw, y + 0.05 + h, z - 0.04], [sx * hw, y + 0.05 + h, z + 0.04], text, [sx, 0, 0]);
};
const lightbar = ({ P, yr, zws1, zrw1 }) => {                                  // a patrol car's roof lights
  const z = zws1 + (zrw1 - zws1) * 0.3, y = yr + 0.03;
  P.fixed.box(-0.6, 0.6, y - 0.03, y + 0.06, z - 0.16, z + 0.16, TRIM, 'NSEWTB');
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? 0.05 : -0.58, x1 = sx > 0 ? 0.58 : -0.05;
    P.lamps.at(1).quadF([x0, y + 0.06, z + 0.15], [x1, y + 0.06, z + 0.15], [x1, y + 0.17, z + 0.12], [x0, y + 0.17, z + 0.12], rgb('#e23a3a'), [0, 0.3, 1]);
    P.lamps.quadF([x1, y + 0.06, z - 0.15], [x0, y + 0.06, z - 0.15], [x0, y + 0.17, z - 0.12], [x1, y + 0.17, z - 0.12], rgb('#e23a3a'), [0, 0.3, -1]);
    P.fixed.quadF([x0, y + 0.17, z + 0.12], [x1, y + 0.17, z + 0.12], [x1, y + 0.17, z - 0.12], [x0, y + 0.17, z - 0.12], rgb('#b52a2a'), [0, 1, 0]);
  }
};
const antenna = ({ P, yr, zrw1 }) => P.fixed.box(-0.01, 0.01, yr, yr + 0.2, zrw1 + 0.06, zrw1 + 0.08, TRIM, 'NSEW');
const sharkFin = ({ P, yr, zrw1 }) => P.fixed.box(-0.03, 0.03, yr + 0.03, yr + 0.08, zrw1 + 0.08, zrw1 + 0.22, TRIM, 'NSEWT');
const roofRails = ({ P, yr, zws1, zrw1, hwr }) => { for (const sx of [-1, 1]) P.fixed.box(sx * (hwr - 0.1) - 0.02, sx * (hwr - 0.1) + 0.02, yr + 0.01, yr + 0.06, zrw1 + 0.1, zws1 - 0.15, TRIM_G, 'NSEWT'); };

/** Move every part so the origin sits midway between the axles. */
function shiftZ(P, dz) { for (const mb of Object.values(P)) for (let i = 2; i < mb.P.length; i += 3) mb.P[i] += dz; }

// ------------------------------------------------------------------ passenger cars
/** The key stations of a car: rounded nose (plan corners rc, a rounded leading edge), hood, cabin, boot, tail. */
function carKeys(o, zf, zr, hw) {
  const rc = o.rc ?? 0.16, bot = o.bot ?? 0.2, sh = o.sh ?? 0.07, cr = o.cr ?? 0.02, K = [];
  const push = (s) => { if (!K.length || s.z < K[K.length - 1].z - 0.02) K.push({ hw, bot, sh, cr, ...s }); else if (s.cab) K[K.length - 1].cab = true; };
  const rake = o.rake ?? 0.1;
  for (const th of [0, 0.3, 0.6, 1]) { const a = th * Math.PI / 2; push({ z: zf - rc * (1 - Math.cos(a)), top: o.yn - 0.05 * Math.cos(a), hw: hw - rc + rc * Math.sin(a), bot: bot + 0.07 * Math.cos(a), rake }); }
  const zn = zf - rc;
  if (zn - o.zh > 0.1) push({ z: (zn + o.zh) / 2, top: o.yn + (o.yh - o.yn) * 0.8 });
  push({ z: o.zh, top: o.yh });
  push({ z: (o.zh + o.zws0) / 2, top: (o.yh + o.yb) / 2 + 0.01 });
  push({ z: o.zws0, top: o.yb, cab: true });
  push({ z: o.zrw0, top: o.yd ?? o.yb, cab: false });
  if (o.zd !== undefined) push({ z: o.zd, top: o.yd });
  for (const th of [1, 0.6, 0.3, 0]) { const a = th * Math.PI / 2; push({ z: zr + rc * (1 - Math.cos(a)), top: o.yt - 0.05 * Math.cos(a), hw: hw - rc + rc * Math.sin(a), bot: bot + 0.07 * Math.cos(a) }); }
  return K;
}
/**
 * A passenger car from a few numbers (m; z forward from the middle of the car): length L, width W, wheel radius rt,
 * wheelbase wb (axleShift moves both axles back or forth), sill bot; the nose top yn, the hood's leading edge
 * (zh, yh), the belt yb, the windscreen from zws0 (belt) to zws1 (roof yr), the rear glass from zrw1 down to zrw0, a
 * boot (yd at zd) or not, the tail top yt; plan corner radius rc, shoulder inset sh, tumblehome tb; pillars pa / pb /
 * pc (bPaint: body-coloured B-pillars); lights (lampW, lampH, lights style, drl, tailW), plate kind, grille colour,
 * seat rows, wheel kind, extras.
 */
function car(o) {
  const P = parts(), { L, W } = o, zf = L / 2, zr = -L / 2, hw = W / 2, rc = o.rc ?? 0.16, bot = o.bot ?? 0.2, sh = o.sh ?? 0.07;
  const shift = o.axleShift ?? 0, za = o.wb / 2 + shift, zb = -o.wb / 2 + shift, rt = o.rt, ar = rt + 0.07;
  const keys = carKeys(o, zf, zr, hw);
  const arches = keys.arches = [{ z: za, r: ar, y: rt }, { z: zb, r: ar, y: rt }];
  shell(P, keys, arches);
  const g = { yb: o.yb, yr: o.yr, zws0: o.zws0, zws1: o.zws1, zrw1: o.zrw1, zrw0: o.zrw0, hwb: hw - sh, hwr: hw - (o.tb ?? 0.14),
    a: o.pa, b: o.pb, bPaint: o.bPaint, c: o.pc, crb: o.cr ?? 0.02, rearGlass: o.rearGlass, chrome: o.chrome };
  greenhouse(P, g);
  const driver = interior(P, g, { rows: o.rows, lace: o.lace, seat: o.seat });
  // the sides: sills, doors, handles, mirrors, repeaters
  for (const sx of [-1, 1]) {
    onSide(P.fixed, sx, keys, za - ar - 0.03, zb + ar + 0.03, bot + 0.004, bot + 0.075, TRIM_G, 0.004);
    onSide(P.lamps, sx, keys, za - 0.15, za - 0.3, o.yb - 0.13, o.yb - 0.09, AMBER, 0.006, sx > 0 ? 2 : 3);
  }
  doors(P, keys, o.doors ?? [za - ar - 0.03, (za + zb) / 2 + 0.12, zb + ar + 0.08], bot + 0.12, o.yb - 0.015, o.yb - 0.13);
  doorMirrors(P, hw, o.yb + 0.02, o.zws0 - 0.03);
  // ends
  const fhw = hw - rc, rake = o.rake ?? 0.1, nb = bot + 0.07, nt = o.yn - 0.05;
  const zNose = (y) => zf - rake * Math.max(0, Math.min(1, (y - nb) / (nt - nb)));
  nose(P, zNose, fhw, o.yn - 0.1, o);
  tail(P, keys, zr, fhw, o.yt - 0.1, o);
  if (o.zd === undefined && o.rearGlass !== false) hmsl(P, o.yr - 0.02, o.zrw1 - 0.02);
  if (o.cladding) for (const a of arches) archTrim(P.fixed, keys, a, 0.06, TRIM_G);
  if (o.extras) for (const x of [].concat(o.extras)) x({ P, keys, zf, zr, hw, bot, hwr: g.hwr, yr: o.yr, zws1: o.zws1, zrw1: o.zrw1, zws0: o.zws0, yb: o.yb, za, zb });
  shiftZ(P, -shift);
  const tw = o.tyreW ?? 0.19, wx = hw - tw / 2 - 0.035;
  return { ...P, L, W, H: o.yr + 0.04, rt, tw, wb: o.wb, fo: zf - za, wheel: o.wheel ?? 'alloy',
    wheels: [[wx, za - shift], [-wx, za - shift], [wx, zb - shift], [-wx, zb - shift]],
    plates: [[bot + 0.28, zNose(bot + 0.28) + 0.013 - shift, 1, Math.atan2(rake, nt - nb)], [o.yt - 0.1 - 0.325, zr - 0.013 - shift, -1]],
    driver: [driver[0], driver[1], driver[2] - shift] };
}

// ------------------------------------------------------------------ the catalogue
const JPN_TAXI_SIGN = [rgb('#fff4d6'), rgb('#2f64b5')], COMFORT_SIGN = [rgb('#fff1c9'), rgb('#d9463b')];
export const MODELS = {
  keiWagon: () => car({ rake: 0.05, L: 3.39, W: 1.47, rt: 0.28, wb: 2.52, axleShift: -0.06, yn: 0.76, zh: 1.42, yh: 0.93, yb: 1.0, zws0: 0.98, zws1: 0.36, yr: 1.76, zrw1: -1.6, zrw0: -1.67, yt: 1.0,
    rc: 0.14, sh: 0.05, tb: 0.08, pa: 0.05, pb: [0.4], pc: 0.04, plate: 'kei', lampW: 0.3, lampH: 0.15, lights: 'box', tailW: 0.14, doors: [0.92, 0.05],
    wheel: 'cap', extras: (x) => slidingDoor(x.P, x.keys, 0.02, -1.08, x.bot + 0.12, x.yb) }),
  keiHatch: () => car({ rake: 0.06, L: 3.39, W: 1.47, rt: 0.28, wb: 2.46, axleShift: -0.07, yn: 0.7, zh: 1.32, yh: 0.8, yb: 0.9, zws0: 0.78, zws1: 0.02, yr: 1.5, zrw1: -1.2, zrw0: -1.6, yt: 0.9,
    rc: 0.2, sh: 0.07, tb: 0.1, pa: 0.05, pb: [0.46], pc: 0.12, plate: 'kei', lampW: 0.28, lampH: 0.15, lights: 'round', tailW: 0.18, wheel: 'cap' }),
  compact: () => car({ rake: 0.1, L: 3.99, W: 1.695, rt: 0.31, wb: 2.53, axleShift: -0.12, yn: 0.66, zh: 1.55, yh: 0.8, yb: 0.92, zws0: 0.92, zws1: 0.0, yr: 1.52, zrw1: -1.25, zrw0: -1.82, yt: 0.92,
    rc: 0.22, tb: 0.12, pa: 0.05, pb: [0.45], pc: 0.14, lampW: 0.38, drl: true, tailW: 0.24, extras: sharkFin }),
  sedan: () => car({ rake: 0.08, L: 4.88, W: 1.8, rt: 0.33, wb: 2.87, axleShift: 0.05, yn: 0.64, zh: 2.0, yh: 0.76, yb: 0.87, zws0: 1.0, zws1: 0.02, yr: 1.44, zrw1: -0.95, zrw0: -1.55, yd: 0.9, zd: -2.2, yt: 0.88,
    rc: 0.2, tb: 0.16, pa: 0.05, pb: [0.5], pc: 0.18, lampW: 0.42, lampH: 0.11, drl: true, tailW: 0.4, chrome: true, grille: CHROME, extras: sharkFin }),
  minivan: () => car({ rake: 0.1, L: 4.69, W: 1.695, rt: 0.31, wb: 2.86, axleShift: -0.04, yn: 0.76, zh: 1.9, yh: 0.96, yb: 1.0, zws0: 1.42, zws1: 0.72, yr: 1.84, zrw1: -2.22, zrw0: -2.3, yt: 1.0,
    rc: 0.18, sh: 0.05, tb: 0.09, pa: 0.04, pb: [0.28, 0.66], pc: 0.05, lampW: 0.36, lampH: 0.16, drl: true, tailW: 0.14, doors: [1.2, 0.35], grille: CHROME,
    rows: 3, extras: (x) => slidingDoor(x.P, x.keys, 0.3, -1.0, x.bot + 0.12, x.yb) }),
  suv: () => car({ rake: 0.08, L: 4.6, W: 1.855, rt: 0.37, wb: 2.69, axleShift: 0.02, bot: 0.26, yn: 0.82, zh: 1.8, yh: 0.97, yb: 1.07, zws0: 0.88, zws1: 0.0, yr: 1.68, zrw1: -1.5, zrw0: -2.1, yt: 1.07,
    rc: 0.2, sh: 0.08, tb: 0.13, pa: 0.05, pb: [0.45], pc: 0.16, lampW: 0.44, lampH: 0.1, drl: true, tailW: 0.32, cladding: true, extras: [roofRails, sharkFin] }),
  taxi: () => car({ rake: 0.08, L: 4.4, W: 1.695, rt: 0.31, wb: 2.75, axleShift: -0.05, yn: 0.76, zh: 1.72, yh: 0.96, yb: 1.0, zws0: 1.02, zws1: 0.42, yr: 1.74, zrw1: -1.82, zrw0: -2.12, yt: 1.0,
    rc: 0.2, sh: 0.06, tb: 0.1, pa: 0.05, pb: [0.42], pc: 0.08, plate: 'green', lampW: 0.28, lampH: 0.16, lights: 'round', tailW: 0.14, wheel: 'cap',
    extras: [andon(...JPN_TAXI_SIGN), (x) => slidingDoor(x.P, x.keys, 0.12, -0.95, x.bot + 0.12, x.yb)] }),
  taxiSedan: () => car({ rake: 0.04, L: 4.695, W: 1.695, rt: 0.32, wb: 2.68, axleShift: 0.09, rc: 0.1, sh: 0.05, yn: 0.72, zh: 1.95, yh: 0.82, yb: 0.9, zws0: 0.86, zws1: 0.16, yr: 1.5, zrw1: -0.88, zrw0: -1.38, yd: 0.9, zd: -2.1, yt: 0.88,
    tb: 0.12, pa: 0.06, pb: [0.5], bPaint: true, pc: 0.2, plate: 'green', lampW: 0.36, lampH: 0.15, lights: 'box', tailW: 0.3, grille: CHROME, chrome: true, lace: true, seat: rgb('#4a4f63'), wheel: 'cap',
    extras: [andon(...COMFORT_SIGN), (x) => fenderMirrors(x.P, x.hw - 0.12, 0.82, x.zf - 0.62)] }),
  police: () => car({ rake: 0.08, L: 4.88, W: 1.8, rt: 0.33, wb: 2.87, axleShift: 0.05, yn: 0.64, zh: 2.0, yh: 0.76, yb: 0.87, zws0: 1.0, zws1: 0.02, yr: 1.44, zrw1: -0.95, zrw0: -1.55, yd: 0.9, zd: -2.2, yt: 0.88,
    rc: 0.2, tb: 0.16, pa: 0.05, pb: [0.5], pc: 0.18, lampW: 0.42, lampH: 0.11, tailW: 0.4,     extras: [(x) => {                                                          // white over black (the paint is white)
      const { P, keys, zf, zr, hw, bot } = x, BLK = rgb('#1b1c20');
      for (const sx of [-1, 1]) onSide(P.fixed, sx, keys, zf - 0.02, zr + 0.02, bot + 0.08, 0.62, BLK, 0.003);
      face(P.fixed, zf, 1, -(hw - 0.22), hw - 0.22, bot + 0.19, 0.5, BLK, undefined, 0.004); face(P.fixed, zr, -1, -(hw - 0.22), hw - 0.22, bot + 0.13, 0.5, BLK, undefined, 0.004);
    }, lightbar, antenna] }),
};

// ------------------------------------------------------------------ vans, trucks, the bus
/** One-box and cab-over vehicles: the shell and greenhouse from build(), wheels at the listed axles. */
function box(o) {
  const P = parts(), { L, W } = o, zf = L / 2, zr = -L / 2, hw = W / 2, bot = o.bot ?? 0.25, rt = o.rt;
  const shift = (o.wheels[0] + o.wheels[o.wheels.length - 1]) / 2;
  const out = o.build({ P, zf, zr, hw, bot, rt, ar: rt + 0.08 }) || {};
  shiftZ(P, -shift);
  const tw = o.tyreW ?? 0.2, wx = hw - tw / 2 - 0.04;
  return { ...P, L, W, H: o.H, rt, tw, wb: o.wheels[0] - o.wheels[o.wheels.length - 1], fo: zf - o.wheels[0], wheel: o.wheel ?? 'cap',
    wheels: o.wheels.flatMap(z => [[wx, z - shift], [-wx, z - shift]]),
    plates: (out.plates || []).map(([y, z, s]) => [y, z - shift, s]), driver: out.driver ? [out.driver[0], out.driver[1], out.driver[2] - shift] : null };
}
/** Key stations of a flat-fronted body: rounded vertical corners rc, the top rising from yn (front face) to yb. */
function boxKeys(zf, zr, hw, bot, rc, yn, yb, zb, sh = 0.05, cabTo = null) {
  const K = [];
  for (const th of [0, 0.5, 1]) { const a = th * Math.PI / 2; K.push({ z: zf - rc * (1 - Math.cos(a)), top: yn + (yb - yn) * 0.35 * th, hw: hw - rc + rc * Math.sin(a), bot: bot + 0.05 * Math.cos(a), sh, cr: 0.02 }); }
  if (zb < K[K.length - 1].z - 0.005) K.push({ z: zb, top: yb, hw, bot, sh, cr: 0.02, cab: true }); else Object.assign(K[K.length - 1], { top: yb, cab: true });
  if (cabTo !== null) K.push({ z: cabTo, top: yb, hw, bot, sh, cr: 0.02 });
  else for (const th of [1, 0.5, 0]) { const a = th * Math.PI / 2; K.push({ z: zr + rc * (1 - Math.cos(a)), top: yb, hw: hw - rc + rc * Math.sin(a), bot: bot + 0.05 * Math.cos(a), sh, cr: 0.02, cab: th > 0 }); }
  return K;
}
function tailsAndPlate(P, zr, hw, y, bot) {
  for (const sx of [-1, 1]) {
    const xo = sx * (hw - 0.06), xi = sx * (hw - 0.3);
    face(P.lamps, zr, -1, Math.min(xo, xi), Math.max(xo, xi), y - 0.14, y, RED, 1);
    face(P.lamps, zr, -1, Math.min(xo, xi), Math.max(xo, xi), y - 0.22, y - 0.15, AMBER, sx > 0 ? 2 : 3);
    face(P.fixed, zr, -1, Math.min(xo, xi), Math.max(xo, xi), y - 0.29, y - 0.23, REV);
  }
  face(P.fixed, zr, -1, -0.185, 0.185, y - 0.44, y - 0.25, TRIM, undefined, 0.007);
  face(P.fixed, zr, -1, -(hw - 0.02), hw - 0.02, bot, bot + 0.12, TRIM_G);
  return [y - 0.345, zr - 0.013, -1];
}
function headsAndPlate(P, zf, hw, y, bot, grille = TRIM_G) {
  for (const sx of [-1, 1]) {
    const xo = sx * (hw - 0.08), xi = sx * (hw - 0.4);
    face(P.fixed, zf, 1, Math.min(xo, xi), Math.max(xo, xi), y - 0.15, y, LENS);
    facePoly(P.fixed, zf, 1, [...Array(8)].map((_, k) => [xo - sx * 0.1 + Math.cos(k / 8 * Math.PI * 2) * 0.045, y - 0.075 + Math.sin(k / 8 * Math.PI * 2) * 0.045]), LENS_IN, undefined, 0.009);
    face(P.lamps, zf, 1, Math.min(xo, xi), Math.max(xo, xi), y - 0.22, y - 0.16, AMBER, sx > 0 ? 2 : 3);
  }
  face(P.fixed, zf, 1, -(hw - 0.42), hw - 0.42, y - 0.15, y, grille);
  face(P.fixed, zf, 1, -0.05, 0.05, y - 0.105, y - 0.045, CHROME, undefined, 0.01);
  face(P.fixed, zf, 1, -0.185, 0.185, bot + 0.1, bot + 0.29, TRIM, undefined, 0.007);
  face(P.fixed, zf, 1, -(hw - 0.02), hw - 0.02, bot, bot + 0.1, TRIM_G);
  return [bot + 0.195, zf + 0.013, 1];
}
Object.assign(MODELS, {
  van: () => box({ L: 4.695, W: 1.695, H: 1.98, rt: 0.33, wheels: [1.35, -1.25], build: ({ P, zf, zr, hw, bot, rt, ar }) => {   // one-box delivery van
    const yb = 1.02, yr = 1.96, zws0 = zf - 0.36;
    const keys = boxKeys(zf, zr, hw, bot, 0.06, 0.9, yb, zws0);
    shell(P, keys, keys.arches = [{ z: 1.35, r: ar, y: rt }, { z: -1.25, r: ar, y: rt }]);
    const g = { yb, yr, zws0, zws1: zf - 0.9, zrw1: zr + 0.06, zrw0: zr + 0.02, hwb: hw - 0.05, hwr: hw - 0.08, a: 0.04, b: [0.2], c: 0.04, solid: 0.222 };
    greenhouse(P, g);
    const driver = interior(P, g, { rows: 1 });
    P.fixed.box(-hw + 0.1, hw - 0.1, yb - 0.3, yr - 0.08, zf - 1.62, zf - 1.58, INT, 'NS');                            // bulkhead
    slidingDoor(P, keys, 0.95, -0.2, bot + 0.12, yb); doors(P, keys, [1.62, 0.95], bot + 0.12, yb - 0.02, yb - 0.14);
    for (const sx of [-1, 1]) onSide(P.fixed, sx, keys, 1.35 - ar - 0.03, -1.25 + ar + 0.03, bot + 0.004, bot + 0.075, TRIM_G, 0.004);
    doorMirrors(P, hw, 1.1, zf - 0.4, true);
    const pf = headsAndPlate(P, zf, hw - 0.1, 0.86, bot + 0.05);
    face(P.fixed, zf, 1, -0.3, 0.3, 0.62, 0.74, TRIM_G);
    const pr = tailsAndPlate(P, zr, hw - 0.08, 1.0, bot + 0.05);
    face(P.fixed, zr, -1, -0.008, 0.008, 0.45, yb - 0.02, TRIM, undefined, 0.007);                                     // the back door's edge
    return { plates: [pf, pr], driver };
  } }),
  keiTruck: () => box({ L: 3.395, W: 1.475, H: 1.77, rt: 0.26, bot: 0.3, wheels: [1.1, -0.85], build: ({ P, zf, zr, hw, bot, rt, ar }) => {   // 軽トラ
    const cabR = zf - 1.25, yb = 1.0, yr = 1.76;
    const keys = boxKeys(zf, zr, hw, bot, 0.08, 0.92, yb, zf - 0.1, 0.04, cabR);
    shell(P, keys, keys.arches = [{ z: 1.1, r: ar, y: rt }]);
    const g = { yb, yr, zws0: zf - 0.1, zws1: zf - 0.42, zrw1: cabR + 0.02, zrw0: cabR, hwb: hw - 0.04, hwr: hw - 0.08, a: 0.05, c: 0.12 };
    greenhouse(P, g);
    const driver = interior(P, g, { rows: 1 });
    // the bed: floor, side and tail gates (silver), the guard frame behind the cab
    const bz0 = cabR - 0.05, fy = 0.7, gy = 0.98, GATE = rgb('#d7dadd');
    P.fixed.box(-hw, hw, 0.54, fy, zr, bz0, TRIM_G, 'NSEWT'); P.fixed.box(-hw + 0.04, hw - 0.04, fy, fy + 0.01, zr + 0.04, bz0, rgb('#b8bcc0'), 'T');
    for (const sx of [-1, 1]) P.fixed.box(sx > 0 ? hw - 0.04 : -hw, sx > 0 ? hw : -hw + 0.04, fy, gy, zr, bz0, GATE, 'NSEWT');
    P.fixed.box(-hw, hw, fy, gy, zr, zr + 0.04, GATE, 'NSEWT');
    for (const sx of [-1, 1]) for (const z of [zr + 0.9, zr + 1.6]) P.fixed.box(sx * hw - 0.012, sx * hw + 0.012, fy + 0.02, gy - 0.02, z - 0.02, z + 0.02, rgb('#b9bdc1'), 'NSEW');   // gate hinges
    for (const x of [-hw + 0.02, hw - 0.02]) P.fixed.box(x - 0.03, x + 0.03, gy, 1.5, bz0 - 0.06, bz0, TRIM_G, 'NSEWT');
    P.fixed.box(-hw, hw, 1.44, 1.5, bz0 - 0.06, bz0, TRIM_G, 'NSEWT');
    for (let x = -hw + 0.2; x < hw - 0.1; x += 0.22) P.fixed.box(x - 0.012, x + 0.012, gy, 1.44, bz0 - 0.04, bz0 - 0.02, TRIM_G, 'NSEW');
    // the rear wheels sit under the bed in open wells
    for (const sx of [-1, 1]) P.fixed.box(sx > 0 ? hw - 0.36 : -hw + 0.34, sx > 0 ? hw - 0.34 : -hw + 0.36, rt, 0.54, -0.85 - ar, -0.85 + ar, WELL, sx > 0 ? 'E' : 'W');
    doors(P, keys, [zf - 0.2, cabR + 0.04], bot + 0.12, yb - 0.02, yb - 0.14);
    doorMirrors(P, hw, 1.05, zf - 0.14);
    const pf = headsAndPlate(P, zf, hw - 0.08, 0.84, bot + 0.04);
    const pr = tailsAndPlate(P, zr, hw, 0.66, 0.36);
    return { plates: [pf, pr], driver };
  } }),
  boxTruck: () => box({ L: 6.0, W: 1.9, H: 3.0, rt: 0.36, tyreW: 0.26, bot: 0.35, wheels: [2.2, -1.2], wheel: 'truck', build: ({ P, zf, zr, hw, bot, rt, ar }) => {   // 2 t box truck
    const cabR = zf - 1.65, yb = 1.18, yr = 2.2;
    const keys = boxKeys(zf, zr, hw, bot, 0.1, 1.1, yb, zf - 0.1, 0.04, cabR);
    shell(P, keys, keys.arches = [{ z: 2.2, r: ar, y: rt }]);
    const g = { yb, yr, zws0: zf - 0.1, zws1: zf - 0.32, zrw1: cabR + 0.02, zrw0: cabR, hwb: hw - 0.04, hwr: hw - 0.1, a: 0.05, c: 0.14, rearGlass: false };
    greenhouse(P, g);
    const driver = interior(P, g, { rows: 1 });
    // the cargo box (aluminium) with the carrier's stripe, the chassis under it
    const BOX = rgb('#e9ebec'), bz0 = cabR - 0.1, bh = 0.95, bt = 3.0, bw = hw + 0.05;
    P.fixed.box(-bw, bw, bh, bt, zr, bz0, BOX, 'NSEWT');
    for (const sx of [-1, 1]) {
      const q = (z0, z1, y0, y1, col) => P.fixed.quadF([sx * (bw + 0.004), y0, z0], [sx * (bw + 0.004), y0, z1], [sx * (bw + 0.004), y1, z1], [sx * (bw + 0.004), y1, z0], col, [sx, 0, 0]);
      q(bz0 - 0.2, zr + 0.2, 2.35, 2.62, rgb('#2f64b5')); q(bz0 - 0.2, zr + 0.2, 2.25, 2.3, rgb('#f2c230'));
      for (let z = bz0 - 0.5; z > zr + 0.3; z -= 0.9) q(z, z - 0.015, bh + 0.05, bt - 0.05, rgb('#d3d6d8'));        // panel seams
    }
    face(P.fixed, zr, -1, -bw + 0.05, -0.02, bh + 0.1, bt - 0.1, rgb('#dfe2e4')); face(P.fixed, zr, -1, 0.02, bw - 0.05, bh + 0.1, bt - 0.1, rgb('#dfe2e4'));
    for (const x of [-0.5, 0.5]) face(P.fixed, zr, -1, x - 0.02, x + 0.02, bh + 0.3, bt - 0.3, TRIM_G, undefined, 0.012);   // door handles
    P.fixed.box(-0.5, 0.5, 0.45, bh, zr + 0.2, bz0, TRIM, 'NSEW');
    for (const sx of [-1, 1]) {
      P.fixed.box(sx > 0 ? bw - 0.36 : -bw + 0.34, sx > 0 ? bw - 0.34 : -bw + 0.36, rt, bh, -1.2 - ar, -1.2 + ar, WELL, sx > 0 ? 'E' : 'W');
      P.fixed.box(sx > 0 ? hw - 0.05 : -hw - 0.02, sx > 0 ? hw + 0.02 : -hw + 0.05, bot + 0.05, 0.62, -1.2 - ar - 0.25, -1.2 - ar - 0.2, TRIM, 'NSEWT');   // mud flap
      P.fixed.box(sx > 0 ? hw - 0.2 : -hw + 0.05, sx > 0 ? hw - 0.05 : -hw + 0.2, 0.5, 0.85, 0.4, 1.1, rgb('#9aa0a6'), 'NSEWT');   // tank / tool box
    }
    doors(P, keys, [zf - 0.25, cabR + 0.05], bot + 0.12, yb - 0.02, yb - 0.16);
    doorMirrors(P, hw, 1.3, zf - 0.15, true);
    const pf = headsAndPlate(P, zf, hw - 0.08, 0.9, bot);
    face(P.fixed, zf, 1, -0.45, 0.45, 0.72, 0.84, TRIM_G);
    const pr = tailsAndPlate(P, zr, hw, 0.75, 0.45);
    return { plates: [pf, pr], driver };
  } }),
  bus: () => box({ L: 10.5, W: 2.49, H: 3.1, rt: 0.48, tyreW: 0.3, bot: 0.3, wheels: [2.9, -2.4], wheel: 'truck', build: ({ P, zf, zr, hw, bot, rt, ar }) => {        // 路線バス
    const yw = 1.28, yr = 3.0;
    const keys = boxKeys(zf, zr, hw, bot, 0.05, yw, yw, zf - 0.07, 0.03);
    shell(P, keys, keys.arches = [{ z: 2.9, r: ar + 0.04, y: rt }, { z: -2.4, r: ar + 0.04, y: rt }]);
    const g = { yb: yw, yr, zws0: zf - 0.02, zws1: zf - 0.12, zrw1: zr + 0.08, zrw0: zr + 0.03, hwb: hw - 0.03, hwr: hw - 0.06, a: 0.012, b: [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84], bPaint: true, c: 0.02, crb: 0.02, cr: 0.03 };
    greenhouse(P, g);
    // the big windscreen reaches down to the bumper; destination board over it; livery bands
    face(P.fixed, zf, 1, -(hw - 0.2), hw - 0.2, 0.62, yw + 0.01, rgb('#3a4654'), undefined, 0.004);                  // (the body behind: drawn dark)
    face(P.fixed, zf, 1, -(hw - 0.2) + 0.25, -(hw - 0.2) + 0.33, 0.7, yw - 0.05, rgb('#6f8292'), undefined, 0.006);
    face(P.fixed, zf, 1, -(hw - 0.25), hw - 0.25, yr - 0.42, yr - 0.1, TRIM, undefined, 0.02);
    face(P.lamps, zf, 1, -(hw - 0.35), hw - 0.35, yr - 0.38, yr - 0.14, rgb('#ffa53a'), 0, 0.024);
    for (const sx of [-1, 1]) {
      onSide(P.fixed, sx, keys, zf - 0.14, zr + 0.14, yw - 0.26, yw - 0.12, rgb('#0c8599'), 0.004);
      onSide(P.fixed, sx, keys, 2.9 - ar - 0.12, -2.4 + ar + 0.12, bot + 0.06, bot + 0.2, rgb('#0c8599'), 0.004);
    }
    // doors on the kerb side (+x): front and middle, glazed to the floor
    for (const [z0, z1] of [[zf - 0.35, zf - 1.35], [0.55, -0.6]]) {
      P.glass.quadF([hw + 0.008, bot + 0.1, z0], [hw + 0.008, bot + 0.1, z1], [hw + 0.008, yr - 0.35, z1], [hw + 0.008, yr - 0.35, z0], GLASS, [1, 0, 0]);
      onSide(P.fixed, 1, keys, z0 + 0.03, z0, bot + 0.1, yw, TRIM, 0.01); onSide(P.fixed, 1, keys, z1, z1 - 0.03, bot + 0.1, yw, TRIM, 0.01);
      onSide(P.fixed, 1, keys, (z0 + z1) / 2 + 0.012, (z0 + z1) / 2 - 0.012, bot + 0.1, yw, TRIM, 0.012);
      P.fixed.box(hw - 0.5, hw - 0.46, 0.4, yr - 0.05, (z0 + z1) / 2 - 0.02, (z0 + z1) / 2 + 0.02, rgb('#f0a23a'), 'NSEW');   // grab pole
    }
    P.lamps.at(0).quadF([hw + 0.012, yr - 0.34, zf - 1.5], [hw + 0.012, yr - 0.34, zf - 2.6], [hw + 0.012, yr - 0.14, zf - 2.6], [hw + 0.012, yr - 0.14, zf - 1.5], rgb('#ffa53a'), [1, 0, 0]);   // side destination
    // inside: the driver's seat, rows of blue seats (none by the doors), straps along the aisle
    P.fixed.box(-hw + 0.1, hw - 0.1, bot + 0.3, bot + 0.34, zr + 0.2, zf - 0.2, rgb('#5b5f66'), 'T');               // floor
    P.fixed.box(-hw + 0.08, hw - 0.9, yw - 0.1, yw + 0.1, zf - 0.6, zf - 0.1, DASH, 'NSEWT');
    steeringWheel(P.fixed, -hw + 0.6, yw + 0.15, zf - 0.75, 0.24);
    P.fixed.box(-hw + 0.35, -hw + 0.85, bot + 0.3, yw + 0.45, zf - 1.35, zf - 1.22, SEAT, 'NSEWT');
    const BLUE = rgb('#3e5c8f');
    for (let z = zf - 2.3; z > zr + 0.6; z -= 0.82) {
      if (z < 0.75 && z > -0.8) continue;
      for (const [x0, x1] of [[-hw + 0.1, -0.35], [0.35, hw - 0.1]]) {
        if (x0 > 0 && z > zf - 2.6) continue;
        P.fixed.box(x0, x1, bot + 0.3, yw + 0.35, z - 0.12, z, BLUE, 'NSEWT');
        P.fixed.box(x0, x1, bot + 0.3, bot + 0.75, z, z + 0.45, BLUE, 'T');
      }
    }
    for (let z = zf - 1.8; z > zr + 0.8; z -= 0.45) for (const x of [-0.3, 0.3]) { P.fixed.box(x - 0.012, x + 0.012, yr - 0.45, yr - 0.1, z - 0.012, z + 0.012, rgb('#dcdcd6'), 'NSEW'); P.fixed.box(x - 0.05, x + 0.05, yr - 0.53, yr - 0.45, z - 0.012, z + 0.012, rgb('#f2f2ec'), 'NSEW'); }
    P.fixed.box(-hw + 0.1, hw - 0.1, yr - 0.1, yr - 0.08, zr + 0.2, zf - 0.2, rgb('#e6e6e0'), 'B');               // ceiling
    P.fixed.box(-0.8, 0.8, yr + 0.03, yr + 0.31, -1.2, 1.2, rgb('#dcdfe2'), 'NSEWT');                                  // roof air-con
    for (const sx of [-1, 1]) { const x = sx * (hw + 0.15); P.fixed.box(x - 0.04, x + 0.04, 1.5, yr - 0.2, zf + 0.15, zf + 0.22, TRIM, 'NSEW'); P.fixed.box(x - 0.1, x + 0.1, 1.7, 2.1, zf + 0.22, zf + 0.3, TRIM, 'NSEWTB'); }   // mirrors on stalks
    const pf = headsAndPlate(P, zf, hw - 0.1, 0.55, bot);
    const pr = tailsAndPlate(P, zr, hw - 0.1, 1.0, bot);
    face(P.fixed, zr, -1, -(hw - 0.4), hw - 0.4, 1.5, 2.3, rgb('#cfd3d6'));                                               // engine grille panel
    for (let y = 1.6; y < 2.25; y += 0.1) face(P.fixed, zr, -1, -(hw - 0.45), hw - 0.45, y, y + 0.03, rgb('#a9aeb3'), undefined, 0.009);
    return { plates: [pf, pr], driver: [-hw + 0.6, bot + 0.55, zf - 1.1] };
  } }),
});

// ------------------------------------------------------------------ motorcycles
/**
 * Two-wheelers (origin between the axles, on the ground): a 50 cc scooter (原付), a Super Cub with its front basket,
 * a delivery cub with a box on the carrier, a 250 cc naked bike. The headlight is always on (常時点灯). Wheels at
 * x = 0; the rider (drawn by the people renderer) sits at `rider`.
 */
function moto(o) {
  const P = parts(), f = o.wb / 2, r = -o.wb / 2, SIL = rgb('#b9bfc5'), DK = rgb('#2b2d33'), CRM = rgb('#ece6d6');
  const W = WHITE, face1 = (mb, z, sgn, x0, x1, y0, y1, col, kind) => face(mb, z, sgn, x0, x1, y0, y1, col, kind, 0.004);
  o.build({ P, f, r, SIL, DK, CRM, W, face1 });
  return { ...P, L: o.L, W: o.W, H: o.H, rt: o.rt, tw: o.tw ?? 0.1, wb: o.wb, fo: o.L / 2 - o.wb / 2 + (o.fo ?? 0), wheel: 'alloy',
    wheels: [[0, f], [0, r]], plates: [[o.plateY ?? 0.55, r - o.rt - 0.02, -1, 0.35, 0.55]], driver: null, rider: o.rider, moto: true };
}
Object.assign(MODELS, {
  scooter: () => moto({ L: 1.66, W: 0.66, H: 1.1, wb: 1.16, rt: 0.24, rider: [0, 0.8, -0.3], plateY: 0.5, build: ({ P, f, r, SIL, DK, W, face1 }) => {   // 原付スクーター
    for (const sx of [-1, 1]) P.fixed.tube([sx * 0.05, 0.8, f - 0.08], [sx * 0.05, 0.24, f], 0.04, DK);
    P.paint.box(-0.07, 0.07, 0.46, 0.52, f - 0.16, f + 0.2, W, 'NSEWT');                                            // front mudguard
    P.paint.box(-0.2, 0.2, 0.38, 0.92, f - 0.2, f - 0.05, W, 'NSEWT');                                              // apron / legshield
    P.paint.box(-0.28, 0.28, 0.9, 1.02, f - 0.22, f - 0.02, W, 'NSEWT');                                           // handlebar cover
    face1(P.lamps, f - 0.02, 1, -0.1, 0.1, 0.93, 0.99, rgb('#fff6dc'), 0);                                         // headlight, always on
    for (const sx of [-1, 1]) { face1(P.lamps, f - 0.02, 1, sx * 0.14 - 0.035, sx * 0.14 + 0.035, 0.93, 0.98, AMBER, sx > 0 ? 2 : 3); P.fixed.box(sx * 0.3, sx * 0.3 + sx * 0.07, 0.95, 0.99, f - 0.18, f - 0.12, DK, 'NSEWTB'); P.fixed.tube([sx * 0.2, 1.0, f - 0.15], [sx * 0.26, 1.24, f - 0.2], 0.012, DK); P.fixed.box(sx * 0.26 - 0.05, sx * 0.26 + 0.05, 1.22, 1.29, f - 0.22, f - 0.19, DK, 'NSEWTB'); }
    P.fixed.box(-0.17, 0.17, 0.3, 0.36, f - 0.62, f - 0.2, DK, 'NSEWT');                                           // floorboard
    P.paint.box(-0.19, 0.19, 0.34, 0.72, r - 0.15, f - 0.62, W, 'NSEWT');                                         // rear body
    P.fixed.box(-0.16, 0.16, 0.72, 0.8, r - 0.05, f - 0.66, rgb('#1c1c20'), 'NSEWT');                                // seat
    P.fixed.box(-0.14, 0.14, 0.8, 0.82, r - 0.26, r - 0.02, SIL, 'NSEWT');                                        // rear rack
    P.fixed.box(-0.1, 0.1, 0.18, 0.36, r - 0.05, f - 0.66, rgb('#4a4d53'), 'NSEWT');                                 // engine and swing arm
    P.fixed.tube([-0.12, 0.26, f - 0.66], [-0.15, 0.32, r - 0.12], 0.07, SIL);                                    // exhaust
    face1(P.lamps, r - 0.15, -1, -0.08, 0.08, 0.6, 0.68, RED, 1);
    for (const sx of [-1, 1]) face1(P.lamps, r - 0.15, -1, sx * 0.15 - 0.03, sx * 0.15 + 0.03, 0.6, 0.66, AMBER, sx > 0 ? 2 : 3);
  } }),
  cub: () => moto({ L: 1.86, W: 0.72, H: 1.1, wb: 1.2, rt: 0.29, rider: [0, 0.8, -0.24], build: ({ P, f, r, SIL, DK, CRM, W, face1 }) => {   // スーパーカブ
    for (const sx of [-1, 1]) P.fixed.tube([sx * 0.06, 0.85, f - 0.1], [sx * 0.06, 0.29, f], 0.045, DK);
    P.paint.box(-0.08, 0.08, 0.55, 0.6, f - 0.2, f + 0.22, W, 'NSEWT');                                             // front mudguard
    P.fixed.box(-0.22, 0.22, 0.32, 0.8, f - 0.3, f - 0.16, CRM, 'NSEWT');                                           // the legshield (cream)
    P.paint.tube([0, 0.86, f - 0.18], [0, 0.45, f - 0.5], 0.14, W);                                                  // backbone
    P.paint.box(-0.12, 0.12, 0.88, 1.0, f - 0.26, f - 0.06, W, 'NSEWT');                                            // handlebar cover
    face1(P.lamps, f - 0.06, 1, -0.07, 0.07, 0.9, 0.98, rgb('#fff6dc'), 0);
    for (const sx of [-1, 1]) { face1(P.lamps, f - 0.06, 1, sx * 0.1 - 0.025, sx * 0.1 + 0.025, 0.91, 0.96, AMBER, sx > 0 ? 2 : 3); P.fixed.tube([sx * 0.1, 0.96, f - 0.2], [sx * 0.34, 0.97, f - 0.26], 0.025, SIL); P.fixed.box(sx * 0.34 - 0.03, sx * 0.34 + 0.07 * sx + 0.03, 0.95, 0.99, f - 0.29, f - 0.23, DK, 'NSEWTB'); P.fixed.tube([sx * 0.2, 0.98, f - 0.22], [sx * 0.24, 1.2, f - 0.26], 0.012, DK); P.fixed.box(sx * 0.24 - 0.04, sx * 0.24 + 0.04, 1.18, 1.25, f - 0.28, f - 0.25, DK, 'NSEWTB'); }
    const B = rgb('#9ea4aa');                                                                                        // the front basket (wire)
    for (const [x0, x1, y0, y1, z0, z1, fc] of [[-0.18, 0.18, 0.6, 0.86, f + 0.02, f + 0.3, 'NSEWB']]) P.fixed.box(x0, x1, y0, y1, z0, z1, B, fc);
    P.fixed.box(-0.14, 0.14, 0.24, 0.44, f - 0.62, f - 0.3, SIL, 'NSEWT');                                         // engine
    P.paint.box(-0.17, 0.17, 0.44, 0.72, r - 0.02, f - 0.6, W, 'NSEWT');                                           // side covers
    P.fixed.box(-0.15, 0.15, 0.72, 0.8, r + 0.12, f - 0.62, rgb('#1c1c20'), 'NSEWT');                                // seat
    P.fixed.box(-0.18, 0.18, 0.76, 0.78, r - 0.3, r + 0.14, SIL, 'NSEWT');                                        // the big carrier
    P.paint.box(-0.08, 0.08, 0.58, 0.63, r - 0.3, r + 0.3, W, 'NSEWT');                                              // rear mudguard
    P.fixed.tube([-0.12, 0.28, f - 0.45], [-0.14, 0.34, r - 0.1], 0.06, SIL);
    face1(P.lamps, r - 0.3, -1, -0.07, 0.07, 0.62, 0.7, RED, 1);
    for (const sx of [-1, 1]) face1(P.lamps, r - 0.3, -1, sx * 0.14 - 0.025, sx * 0.14 + 0.025, 0.62, 0.68, AMBER, sx > 0 ? 2 : 3);
  } }),
  delivery: () => moto({ L: 1.9, W: 0.72, H: 1.4, wb: 1.2, rt: 0.29, rider: [0, 0.8, -0.2], plateY: 0.52, build: ({ P, f, r, SIL, DK, CRM, face1 }) => {   // 配達: a cub with a box
    const BODY = rgb('#c8322e');
    for (const sx of [-1, 1]) P.fixed.tube([sx * 0.06, 0.85, f - 0.1], [sx * 0.06, 0.29, f], 0.045, DK);
    P.fixed.box(-0.08, 0.08, 0.55, 0.6, f - 0.2, f + 0.22, BODY, 'NSEWT');
    P.fixed.box(-0.22, 0.22, 0.32, 0.8, f - 0.3, f - 0.16, CRM, 'NSEWT');
    P.fixed.tube([0, 0.86, f - 0.18], [0, 0.45, f - 0.5], 0.14, BODY);
    P.fixed.box(-0.12, 0.12, 0.88, 1.0, f - 0.26, f - 0.06, BODY, 'NSEWT');
    face1(P.lamps, f - 0.06, 1, -0.07, 0.07, 0.9, 0.98, rgb('#fff6dc'), 0);
    for (const sx of [-1, 1]) { P.fixed.tube([sx * 0.1, 0.96, f - 0.2], [sx * 0.34, 0.97, f - 0.26], 0.025, SIL); P.fixed.tube([sx * 0.2, 0.98, f - 0.22], [sx * 0.24, 1.2, f - 0.26], 0.012, DK); P.fixed.box(sx * 0.24 - 0.04, sx * 0.24 + 0.04, 1.18, 1.25, f - 0.28, f - 0.25, DK, 'NSEWTB'); }
    P.fixed.box(-0.14, 0.14, 0.24, 0.44, f - 0.62, f - 0.3, SIL, 'NSEWT');
    P.fixed.box(-0.17, 0.17, 0.44, 0.72, r - 0.02, f - 0.6, BODY, 'NSEWT');
    P.fixed.box(-0.15, 0.15, 0.72, 0.8, r + 0.18, f - 0.62, rgb('#1c1c20'), 'NSEWT');
    P.fixed.box(-0.18, 0.18, 0.76, 0.8, r - 0.3, r + 0.18, SIL, 'NSEWT');
    P.paint.box(-0.26, 0.26, 0.8, 1.32, r - 0.36, r + 0.2, WHITE, 'NSEWTB');                                         // the delivery box (colour per instance)
    for (const sx of [-1, 1]) P.fixed.quadF([sx * 0.265, 1.0, r - 0.3], [sx * 0.265, 1.0, r + 0.14], [sx * 0.265, 1.12, r + 0.14], [sx * 0.265, 1.12, r - 0.3], rgb('#f4f1ea'), [sx, 0, 0]);   // a band for the shop's name
    P.fixed.tube([-0.12, 0.28, f - 0.45], [-0.14, 0.34, r - 0.1], 0.06, SIL);
    face1(P.lamps, r - 0.36, -1, -0.07, 0.07, 0.62, 0.7, RED, 1);
  } }),
  bike250: () => moto({ L: 2.05, W: 0.78, H: 1.12, wb: 1.38, rt: 0.3, rider: [0, 0.84, -0.18], plateY: 0.62, build: ({ P, f, r, SIL, DK, W, face1 }) => {   // 250 cc naked
    for (const sx of [-1, 1]) P.fixed.tube([sx * 0.08, 0.96, f - 0.16], [sx * 0.08, 0.3, f], 0.05, SIL);
    P.paint.box(-0.08, 0.08, 0.56, 0.6, f - 0.18, f + 0.2, W, 'NSEWT');
    P.paint.box(-0.16, 0.16, 0.74, 0.9, f - 0.62, f - 0.22, W, 'NSEWT');                                            // tank
    P.paint.box(-0.12, 0.12, 0.9, 0.95, f - 0.58, f - 0.26, W, 'NSEWT');
    P.fixed.box(-0.14, 0.14, 0.8, 0.88, r + 0.2, f - 0.62, rgb('#1c1c20'), 'NSEWT');                                 // seat
    P.paint.box(-0.1, 0.1, 0.82, 0.92, r - 0.12, r + 0.22, W, 'NSEWT');                                              // tail cowl
    P.fixed.box(-0.17, 0.17, 0.3, 0.66, f - 0.72, f - 0.24, rgb('#3a3d44'), 'NSEWT');                                // engine
    for (let y = 0.4; y < 0.64; y += 0.06) P.fixed.box(-0.19, 0.19, y, y + 0.02, f - 0.46, f - 0.26, rgb('#4d5158'), 'NSEWT');   // cylinder fins
    P.fixed.tube([0, 0.96, f - 0.18], [0, 0.55, r + 0.35], 0.06, DK);                                               // frame
    P.fixed.tube([-0.12, 0.34, f - 0.3], [-0.16, 0.42, r - 0.05], 0.08, SIL);                                        // exhaust
    for (const sx of [-1, 1]) { P.fixed.tube([0, 1.0, f - 0.2], [sx * 0.36, 1.02, f - 0.28], 0.028, DK); P.fixed.tube([sx * 0.18, 1.02, f - 0.22], [sx * 0.26, 1.22, f - 0.28], 0.012, DK); P.fixed.box(sx * 0.26 - 0.045, sx * 0.26 + 0.045, 1.2, 1.27, f - 0.3, f - 0.27, DK, 'NSEWTB'); }
    const c = [0, 0.86], pts = [...Array(10)].map((_, k) => [c[0] + Math.cos(k / 10 * Math.PI * 2) * 0.085, c[1] + Math.sin(k / 10 * Math.PI * 2) * 0.085]);
    P.fixed.box(-0.1, 0.1, 0.76, 0.96, f - 0.2, f - 0.08, CHROME, 'NSEWT');
    facePoly(P.lamps, f - 0.08, 1, pts, rgb('#fff6dc'), 0, 0.004);                                                   // round headlight, always on
    for (const sx of [-1, 1]) face1(P.lamps, f - 0.08, 1, sx * 0.17 - 0.03, sx * 0.17 + 0.03, 0.84, 0.89, AMBER, sx > 0 ? 2 : 3);
    face1(P.lamps, r - 0.12, -1, -0.07, 0.07, 0.83, 0.9, RED, 1);
    for (const sx of [-1, 1]) face1(P.lamps, r - 0.12, -1, sx * 0.14 - 0.025, sx * 0.14 + 0.025, 0.83, 0.88, AMBER, sx > 0 ? 2 : 3);
  } }),
});

/** Body colours: Japanese traffic is mostly white, silver and black; kei cars add pastels. [colour, weight] */
export const PAINT = {
  car: [['#f4f4f0', 22], ['#ecebe4', 10], ['#b9bdc2', 14], ['#1e1f24', 14], ['#5a5d63', 8], ['#2b3a55', 5], ['#a8232a', 4], ['#3f6fa5', 3], ['#c9b08a', 2], ['#6b4a3a', 2], ['#3d5a45', 2]],
  kei: [['#f4f4f0', 18], ['#ecebe4', 8], ['#b9bdc2', 8], ['#1e1f24', 8], ['#e8c3cf', 6], ['#b8d8e8', 6], ['#e8dcb0', 6], ['#9ccfb0', 4], ['#d9463b', 4], ['#f0a45a', 3], ['#3a4a66', 4], ['#7a5a48', 3]],
  taxi: [['#1f2a44', 1]],
  taxiSedan: [['#f2c230', 4], ['#3f8f5b', 3], ['#e9853b', 2], ['#1e1f24', 3], ['#f4f4f0', 2]],
  work: [['#f4f4f0', 8], ['#d9dcde', 3], ['#2f64b5', 1]],
  bus: [['#f1ecdf', 1]],
  police: [['#f7f7f4', 1]],
  moto: [['#f4f4f0', 4], ['#1e1f24', 4], ['#b9bdc2', 3], ['#a8232a', 3], ['#2f64b5', 2], ['#e8c3cf', 2], ['#9ccfb0', 1], ['#f2c230', 1]],
  cub: [['#a8232a', 3], ['#3d5a45', 2], ['#2f64b5', 2], ['#e9e1c9', 2], ['#1e1f24', 1]],
  delivery: [['#c8322e', 3], ['#f4f4f0', 2], ['#2f8a4a', 1], ['#f2a33a', 1]],
};
/** Number plate kind by model (the rest are private white plates). */
export const PLATE_KIND = { keiWagon: 'kei', keiHatch: 'kei', keiTruck: 'kei', taxi: 'green', taxiSedan: 'green', bus: 'green', boxTruck: 'green' };
