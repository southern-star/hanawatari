// 花渡駅 西口広場 — the pedestrian square outside the west exit (no road reaches it; 本町通り and the tram stop
// 花渡駅西口 close its south end): a covered walkway along the station from the exit to the tram stop, a promenade
// between two rows of cherry trees (plan/trees.js) hung with festival lanterns (ぼんぼり), the ferryman's statue
// (渡し守の像 — the town is named after its old ferry), a clock post, a roofed bicycle park, a phone box, vending
// machines, planters, benches and lamps. Built once, together with the east square (station.js).
import * as THREE from 'three';
import { groundAt } from '../plan/ground.js';
import { MB, rgb } from './mb.js';

export const WEST = [-600, -205, -556, 8];
const PROM = [-588, -575];                                      // the promenade's two lantern lines (x)
const SKIP = [-170, -134];                                      // z: the square in front of the exit (and 汐見線 overhead)
const STEEL = rgb('#9aa3aa'), STEEL_D = rgb('#737c83'), ROOF = rgb('#eceeec'), ROOF_U = rgb('#c9ccca'), WOOD = rgb('#5a4032');
const BRONZE = rgb('#5d6a55'), BRONZE_D = rgb('#4a5645'), STONE = rgb('#b9b3a6'), STONE_D = rgb('#a39d91'), DARK = rgb('#2d2b33');
const GLASS = rgb('#b9d3e0'), GREEN = rgb('#3f8f5b'), BENCH = rgb('#8a6446');

class QBuf {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; }
  quad(a, b, c, d, uv) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], l = Math.hypot(nx, ny, nz) || 1;
    const k = this.P.length / 3, U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    [a, b, c, d].forEach((p, i) => { this.P.push(...p); this.N.push(nx / l, ny / l, nz / l); this.U.push(...U[i]); this.C.push(1, 1, 1); });
    this.I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  /** A board facing (fx, fz) centred at (cx, cz), w wide, y0..y1. */
  board(cx, cz, fx, fz, w, y0, y1, uv, off = 0) {
    const rx = fz, rz = -fx, x = cx + fx * off, z = cz + fz * off;
    this.quad([x - rx * w / 2, y0, z - rz * w / 2], [x + rx * w / 2, y0, z + rz * w / 2], [x + rx * w / 2, y1, z + rz * w / 2], [x - rx * w / 2, y1, z - rz * w / 2], uv);
  }
  mesh(mat) {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.I); g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

// ------------------------------------------------------------------ sign cells (the shared sign atlas)
function bonboriTex(ctx, A) {
  const f = ctx.tex.FONTS;
  return A.cell('bonbori', 96, 144, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#f3d9e2'); gr.addColorStop(0.5, '#fff7fa'); gr.addColorStop(1, '#f3d9e2');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2d2b33'; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12);
    g.fillStyle = '#e26e96'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * 11, 48 + Math.sin(a) * 11, 7, 11, a + Math.PI / 2, 0, 7); g.fill(); }
    g.fillStyle = '#c2436e'; g.textAlign = 'center'; g.textBaseline = 'middle'; ctx.tex.fitText(g, 'さくら', w / 2, 100, w - 16, 22, f.brush, 400);
  });
}
function plaque(ctx, A) {
  const f = ctx.tex.FONTS;
  return A.cell('ferryman-plaque', 256, 128, (g, w, h) => {
    g.fillStyle = '#3d4436'; g.fillRect(0, 0, w, h); g.strokeStyle = '#b8a77a'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#e8dcb4'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, '渡し守の像', w / 2, 44, w - 40, 34, f.serif, 700);
    ctx.tex.fitText(g, '花渡の名は この川の渡しに由来する', w / 2, 90, w - 30, 15, f.serif, 700);
  });
}
function clockFace(ctx, A) {                                    // (the same cell as the east square's clock tower)
  return A.cell('clock-face', 128, 128, (g, w, h) => {
    g.fillStyle = '#2d2b33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f7f6f2'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.44, 0, 7); g.fill();
    g.strokeStyle = '#2d2b33'; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.lineWidth = k % 3 ? 2 : 5; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.36, h / 2 + Math.sin(a) * h * 0.36); g.lineTo(w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * h * 0.42); g.stroke(); }
    const hand = (a, l, lw) => { g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.sin(a) * l, h / 2 - Math.cos(a) * l); g.stroke(); };
    hand((4 + 2 / 60) / 12 * Math.PI * 2, w * 0.22, 6); hand(2 / 60 * Math.PI * 2, w * 0.33, 4);
  });
}
function smallSign(ctx, A, key, jp, en, bg, fg) {
  const f = ctx.tex.FONTS;
  return A.cell('ws|' + key, 384, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, jp, w / 2, en ? 38 : h / 2, w - 30, 44, f.sans, 900);
    if (en) { g.globalAlpha = 0.85; ctx.tex.fitText(g, en, w / 2, 78, w - 40, 17, f.en, 700); g.globalAlpha = 1; }
  });
}

/** Build the west square; kit = the shop-front kit (its sign atlas). Returns a Group. */
export function buildWestExit(ctx, kit) {
  const mb = new MB(), sb = new QBuf(), lb = new QBuf(), phys = ctx.physics, A = kit.A;
  const gy = (x, z) => groundAt(x, z) + 0.15;                   // on the paving
  const G0 = gy(-578, -100);
  const inSkip = (z) => z > SKIP[0] && z < SKIP[1];
  // ---------------------------------------------------------------- the covered walkway: exit → 本町通り
  { const x0 = -561.5, x1 = -556, z0 = -200, z1 = 12, y = G0 + 4.05;
    mb.box(x0, x1, y, y + 0.22, z0, z1, ROOF, 'NSEWT'); mb.box(x0, x1, y - 0.01, y, z0, z1, ROOF_U, 'B');
    mb.box(x0 - 0.05, x0 + 0.1, y - 0.3, y + 0.22, z0, z1, STEEL_D, 'NSEWT');                           // gutter
    for (let z = z0 + 2; z <= z1 - 1; z += 8) {
      if (z > -161 && z < -143) continue;                                                             // the exit itself
      mb.box(x0 + 0.2, x0 + 0.45, G0 - 0.15, y, z - 0.12, z + 0.12, STEEL, 'NSEW'); phys.addCylinder(x0 + 0.32, z, 0.2, G0 - 1, y);
    }
    // the station's name board stands on the roof's edge over the exit (station.js); its legs and back here
    for (const z of [-156, -148]) mb.box(x0 + 0.02, x0 + 0.14, y + 0.22, y + 0.95, z - 0.06, z + 0.06, STEEL_D, 'NSEWT');
    mb.box(x0 + 0.08, x0 + 0.14, y + 0.62, y + 1.95, -156.5, -147.5, rgb('#e9e7e1'), 'ENSWT');
    sb.board(x0 + 2.75, z1 + 0.01, 0, 1, 4.6, y - 0.72, y - 0.08, smallSign(ctx, A, 'walk-s', '花渡駅 西口', 'HANAWATARI STATION  West Exit', '#f7f6f2', '#1f2a44'));
    sb.board(x0 + 2.75, z0 - 0.01, 0, -1, 4.6, y - 0.72, y - 0.08, smallSign(ctx, A, 'walk-n', '← 路面電車 花渡駅西口', 'Tram stop  ·  本町通り', '#1f2a44', '#ffffff')); }
  // ---------------------------------------------------------------- the promenade: festival lanterns on ropes
  const lantern = lb, bt = bonboriTex(ctx, A);
  for (const x of PROM) {
    let prev = null;
    for (let z = WEST[1] + 16; z < WEST[3] - 4; z += 6) {
      if (inSkip(z)) { prev = null; continue; }
      const g = gy(x, z), top = g + 2.95;
      mb.box(x - 0.05, x + 0.05, g - 0.15, top, z - 0.05, z + 0.05, WOOD, 'NSEWT'); phys.addCylinder(x, z, 0.08, g - 1, top);
      const y0 = g + 2.05, y1 = y0 + 0.5, h = 0.16;                                                    // the lantern under the pole's arm
      mb.box(x - 0.02, x + 0.02, y1, top - 0.1, z - 0.02, z + 0.02, DARK, 'NSEW');
      lantern.quad([x - h, y0, z + h], [x + h, y0, z + h], [x + h, y1, z + h], [x - h, y1, z + h], bt); lantern.quad([x + h, y0, z - h], [x - h, y0, z - h], [x - h, y1, z - h], [x + h, y1, z - h], bt);
      lantern.quad([x - h, y0, z - h], [x - h, y0, z + h], [x - h, y1, z + h], [x - h, y1, z - h], bt); lantern.quad([x + h, y0, z + h], [x + h, y0, z - h], [x + h, y1, z - h], [x + h, y1, z + h], bt);
      mb.box(x - h - 0.02, x + h + 0.02, y1, y1 + 0.06, z - h - 0.02, z + h + 0.02, DARK, 'NSEWTB');
      if (prev) {                                                                                     // the rope, red and white
        const n = 6;
        for (let k = 0; k < n; k++) {
          const u0 = k / n, u1 = (k + 1) / n, sag = (u) => 0.35 * 4 * u * (1 - u);
          const za = prev.z + (z - prev.z) * u0, zb = prev.z + (z - prev.z) * u1, ya = prev.top - 0.12 + (top - prev.top) * u0 - sag(u0), yb = prev.top - 0.12 + (top - prev.top) * u1 - sag(u1);
          const c = k % 2 ? rgb('#f4f1ea') : rgb('#d9463b');
          mb.quad([x, ya - 0.03, za], [x, yb - 0.03, zb], [x, yb + 0.03, zb], [x, ya + 0.03, za], c); mb.quad([x, yb - 0.03, zb], [x, ya - 0.03, za], [x, ya + 0.03, za], [x, yb + 0.03, zb], c);
        }
      }
      prev = { z, top };
    }
  }
  // ---------------------------------------------------------------- 渡し守の像: on a stone drum north of the exit, facing it
  { const cx = -581.5, cz = -182, g = gy(cx, cz), R = 1.3, H = 1.1, n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, p0 = [cx + Math.cos(a0) * R, cz + Math.sin(a0) * R], p1 = [cx + Math.cos(a1) * R, cz + Math.sin(a1) * R];
      mb.quad([p1[0], g - 0.1, p1[1]], [p0[0], g - 0.1, p0[1]], [p0[0], g + H, p0[1]], [p1[0], g + H, p1[1]], i % 2 ? STONE : STONE_D);
      mb.tri([cx, g + H, cz], [p1[0], g + H, p1[1]], [p0[0], g + H, p0[1]], STONE);
      const q0 = [cx + Math.cos(a0) * (R + 0.6), cz + Math.sin(a0) * (R + 0.6)], q1 = [cx + Math.cos(a1) * (R + 0.6), cz + Math.sin(a1) * (R + 0.6)];   // a flower ring
      mb.quad([q1[0], g + 0.35, q1[1]], [q0[0], g + 0.35, q0[1]], [p0[0], g + 0.35, p0[1]], [p1[0], g + 0.35, p1[1]], rgb(i % 3 === 0 ? '#e26e96' : i % 3 === 1 ? '#f2c230' : '#b07cd8'));
      mb.quad([q1[0], g - 0.1, q1[1]], [q0[0], g - 0.1, q0[1]], [q0[0], g + 0.35, q0[1]], [q1[0], g + 0.35, q1[1]], STONE_D);
    }
    phys.addCylinder(cx, cz, R + 0.6, g - 1, g + H + 2.2);
    sb.board(cx, cz, 1, 0, 1.3, g + 0.35, g + 0.35 + 0.65, plaque(ctx, A), R + 0.02);
    // the figure (local: facing +z, then turned to face the exit in the east), bronze
    const from = mb.n, y = g + H;
    for (const sx of [-0.13, 0.13]) mb.box(sx - 0.09, sx + 0.09, y, y + 0.82, -0.1, 0.12, BRONZE_D, 'NSEWT');       // legs
    mb.box(-0.3, 0.3, y + 0.78, y + 1.58, -0.18, 0.18, BRONZE, 'NSEWT');                                           // body, the happi coat
    mb.box(-0.31, 0.31, y + 0.9, y + 1.0, -0.19, 0.19, BRONZE_D, 'NSEWT');                                          // sash
    mb.box(-0.13, 0.13, y + 1.58, y + 1.9, -0.13, 0.13, BRONZE, 'NSEWT');                                           // head
    for (let i = 0; i < 8; i++) { const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2; mb.tri([0, y + 2.08, 0], [Math.cos(a1) * 0.46, y + 1.86, Math.sin(a1) * 0.46], [Math.cos(a0) * 0.46, y + 1.86, Math.sin(a0) * 0.46], BRONZE); mb.tri([0, y + 1.84, 0], [Math.cos(a0) * 0.46, y + 1.86, Math.sin(a0) * 0.46], [Math.cos(a1) * 0.46, y + 1.86, Math.sin(a1) * 0.46], BRONZE_D); }   // sedge hat (笠)
    mb.box(-0.42, -0.28, y + 1.1, y + 1.5, -0.05, 0.3, BRONZE, 'NSEWT'); mb.box(0.28, 0.42, y + 1.05, y + 1.45, 0.0, 0.34, BRONZE, 'NSEWT');   // arms reaching forward
    { const p0 = [0.05, y + 0.05, 0.75], p1 = [-0.05, y + 3.6, -0.2], t = 0.035;                                  // the punt pole (竿), leaning
      mb.quad([p0[0] - t, p0[1], p0[2]], [p0[0] + t, p0[1], p0[2]], [p1[0] + t, p1[1], p1[2]], [p1[0] - t, p1[1], p1[2]], BRONZE_D);
      mb.quad([p0[0] + t, p0[1], p0[2]], [p0[0] - t, p0[1], p0[2]], [p1[0] - t, p1[1], p1[2]], [p1[0] + t, p1[1], p1[2]], BRONZE_D); }
    mb.place(from, Math.PI / 2, cx, 0, cz); }
  // ---------------------------------------------------------------- clock post by the exit
  { const cx = -568, cz = -128, g = gy(cx, cz), uv = clockFace(ctx, A);
    mb.box(cx - 0.1, cx + 0.1, g - 0.15, g + 3.9, cz - 0.1, cz + 0.1, STEEL_D, 'NSEW');
    mb.box(cx - 0.18, cx + 0.18, g + 3.9, g + 4.9, cz - 0.55, cz + 0.55, DARK, 'NSEWT');
    sb.board(cx, cz, 1, 0, 0.95, g + 3.95, g + 4.85, uv, 0.19); sb.board(cx, cz, -1, 0, 0.95, g + 3.95, g + 4.85, uv, 0.19);
    phys.addCylinder(cx, cz, 0.15, g - 1, g + 4.9); }
  // ---------------------------------------------------------------- the bicycle park along the north edge, under a roof
  { const x0 = -598, x1 = -566, z0 = -204.5, z1 = -199.5, g = gy(-582, -202), y = g + 2.4;
    mb.box(x0, x1, y, y + 0.18, z0, z1, ROOF, 'NSEWT'); mb.box(x0, x1, y - 0.01, y, z0, z1, ROOF_U, 'B');
    for (let x = x0 + 0.4; x <= x1; x += 4) mb.box(x - 0.06, x + 0.06, g - 0.15, y, z0 + 0.2, z0 + 0.32, STEEL, 'NSEW');
    const cols = ['#d9463b', '#2f64b5', '#3f8f5b', '#e8e6df', '#3a3346', '#e8a33c', '#ef9fbe'];
    for (let x = x0 + 0.7; x < x1 - 0.5; x += 0.72) { const k = Math.floor(Math.abs(Math.sin(x * 9.1)) * cols.length), c = rgb(cols[k]); mb.box(x - 0.03, x + 0.03, g + 0.3, g + 0.9, z0 + 0.6, z0 + 2.3, c, 'NSEWT'); mb.box(x - 0.2, x + 0.2, g + 0.88, g + 0.92, z0 + 0.7, z0 + 0.8, DARK, 'NSEWT'); }
    mb.box(x0, x1, g, g + 0.3, z1 - 0.3, z1 - 0.2, STEEL_D, 'NSEWT');                                   // the rack's rail
    sb.board((x0 + x1) / 2, z1 + 0.01, 0, 1, 3.8, y - 0.62, y - 0.02, smallSign(ctx, A, 'bike', '駐輪場', 'Bicycle Parking', '#2f64b5', '#ffffff'));
    phys.addBox((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, g - 1, g + 1.0); }
  // ---------------------------------------------------------------- the phone box and the vending machines by the south end
  { const cx = -597, cz = -10, g = gy(cx, cz), w = 0.5, h = 2.25;
    for (const [sx, sz] of [[-w, -w], [w, -w], [-w, w], [w, w]]) mb.box(cx + sx - 0.04, cx + sx + 0.04, g, g + h, cz + sz - 0.04, cz + sz + 0.04, GREEN, 'NSEW');
    mb.box(cx - w - 0.06, cx + w + 0.06, g + h, g + h + 0.12, cz - w - 0.06, cz + w + 0.06, GREEN, 'NSEWTB');
    for (const [a, b] of [[[cx - w, cz + w], [cx + w, cz + w]], [[cx + w, cz + w], [cx + w, cz - w]], [[cx + w, cz - w], [cx - w, cz - w]], [[cx - w, cz - w], [cx - w, cz + w]]]) {
      mb.quad([a[0], g + 0.1, a[1]], [b[0], g + 0.1, b[1]], [b[0], g + h - 0.35, b[1]], [a[0], g + h - 0.35, a[1]], GLASS);
      mb.quad([b[0], g + 0.1, b[1]], [a[0], g + 0.1, a[1]], [a[0], g + h - 0.35, a[1]], [b[0], g + h - 0.35, b[1]], GLASS);
    }
    mb.box(cx - 0.2, cx + 0.2, g + 1.0, g + 1.45, cz - w + 0.02, cz - w + 0.22, rgb('#4e9a62'), 'NSEWT');           // the phone
    const uv = smallSign(ctx, A, 'phone', '公衆電話', '', '#f4f1ea', '#3f8f5b');
    for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sb.board(cx, cz, fx, fz, 0.96, g + h - 0.33, g + h - 0.03, uv, w + 0.005);
    phys.addBox(cx, cz, 1.1, 1.1, 0, g - 1, g + h); }
  for (let k = 0; k < 3; k++) { const x = -597.4, z = -3.5 + k * 1.1, g = gy(x, z);
    mb.box(x - 0.4, x + 0.4, g, g + 1.85, z - 0.5, z + 0.5, rgb(['#d9463b', '#2f64b5', '#f2efe6'][k]), 'NSEWT'); mb.box(x + 0.4, x + 0.42, g + 0.9, g + 1.7, z - 0.4, z + 0.4, rgb('#e8f0f4'), 'E'); phys.addBox(x, z, 0.8, 1.0, 0, g - 1, g + 1.85); }
  // ---------------------------------------------------------------- planters round the exit square, benches, lamps
  const planter = (x0, z0, x1, z1) => { const g = gy((x0 + x1) / 2, (z0 + z1) / 2); mb.box(x0, x1, g - 0.1, g + 0.45, z0, z1, STONE, 'NSEWT');
    for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.5) for (let z = z0 + 0.35; z < z1 - 0.2; z += 0.5) { const k = Math.floor(Math.abs(Math.sin(x * 3.1 + z * 7.7)) * 4); mb.box(x - 0.14, x + 0.14, g + 0.45, g + 0.62, z - 0.14, z + 0.14, rgb(['#e26e96', '#f2c230', '#b07cd8', '#5f8f55'][k]), 'NSEWT'); }
    phys.addBox((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, g - 1, g + 0.45); };
  planter(-596, -168, -589, -166.6); planter(-596, -137.4, -589, -136); planter(-576, -168, -569, -166.6); planter(-576, -137.4, -569, -136);
  const bench = (x, z, rot) => { const g = gy(x, z); mb.obox(x, g + 0.4, z, 1.8, 0.08, 0.5, rot, BENCH, 'NSEWT'); mb.obox(x, g - 0.1, z, 1.5, 0.5, 0.4, rot, STEEL_D, 'NSEW'); phys.addBox(x, z, 1.8, 0.5, rot, g - 1, g + 0.45); };
  for (let z = -120; z < 0; z += 24) { bench(-592, z + 6, Math.PI / 2); bench(-571, z + 6, Math.PI / 2); }
  for (const z of [-196, -186]) bench(-571, z, Math.PI / 2);
  const lamp = (x, z) => { const g = gy(x, z); mb.box(x - 0.09, x + 0.09, g - 0.15, g + 6.2, z - 0.09, z + 0.09, STEEL_D, 'NSEW'); mb.box(x - 0.45, x + 0.45, g + 6.1, g + 6.3, z - 0.2, z + 0.2, rgb('#e9ebe6'), 'NSEWTB'); phys.addCylinder(x, z, 0.12, g - 1, g + 6.2); };
  for (const [x, z] of [[-596, -175], [-596, -127], [-566, -175], [-566, -104], [-596, -60], [-566, -40], [-596, 4]]) lamp(x, z);
  // ---------------------------------------------------------------- meshes
  const g = new THREE.Group(); g.name = 'west-exit';
  const m = mb.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05, name: 'west-exit' })); if (m) g.add(m);
  const s = sb.mesh(kit.sign); if (s) { s.castShadow = false; g.add(s); }
  const l = lb.mesh(ctx.mat.emissive('#ffffff', 1.0, { map: A.tex })); if (l) { ctx.noOutline(l); g.add(l); }
  return g;
}
