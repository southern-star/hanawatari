// 花渡駅 東西自由通路 — the free passage through the station at ground level, from the west exit (x −556) to the east
// atrium (x −348; the atrium itself is station.js's), under the 汐見線 viaduct: a tiled floor with the tactile guide
// strip, a lit ceiling, shops along both walls (glass fronts with interiors, backlit fascias), posters, coin lockers and
// a street piano, the 中央改札 under 東和本線 (automatic gates with their flaps shut, the staffed window, departure
// boards, the paid concourse with its stairs and escalator up to the platforms), the 東口改札 for 汐見線, ticket
// machines under the fare chart, hanging direction signs, and glass entrances at both ends. Built once.
import * as THREE from 'three';
import { PASSAGE } from '../plan/urban.js';
import { groundAt } from '../plan/ground.js';
import { MB, rgb, shade } from './mb.js';
import { createAtlas, fasciaSign, billboard } from './signs/atlas.js';
import { ADS } from './signs/names.js';

const Z0 = PASSAGE.z0, Z1 = PASSAGE.z1, X0 = PASSAGE.x0, XE = -348;     // the walls run X0 … XE; the atrium is beyond
const ZC = (Z0 + Z1) / 2;
const TRX0 = -468.2, TRX1 = -435.0, SOFFIT = 5.0;                         // 東和本線's station deck overhead (underside y)
const CG = PASSAGE.central, EG = PASSAGE.east;

const FLOOR = rgb('#e2dfd8'), FLOOR2 = rgb('#d6d2ca'), TACT = rgb('#e8c547'), WALLP = rgb('#efece6'), SKIRT = rgb('#8d8a84');
const CEIL = rgb('#e4e3de'), PIL = rgb('#cfcbc2'), FASC = rgb('#3a3d44'), STEEL = rgb('#a2aab0'), DARK = rgb('#2d2b33');
const GATE = rgb('#e3e6e8'), GATE_T = rgb('#3d4a58'), FLAP = rgb('#e8742c'), MACH = rgb('#ece8dc'), LOCK = rgb('#8fa6b8');
const GLASS = rgb('#a9c4d6'), OUTER = rgb('#d4d0c6'), STAIR = rgb('#c9c5bc'), STAIR2 = rgb('#bdb9b0'), BELT = rgb('#44474e');

/** Textured quads (position, normal, uv, white vertex colour). */
class QBuf {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; }
  quad(a, b, c, d, uv) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], l = Math.hypot(nx, ny, nz) || 1;
    const k = this.P.length / 3, U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    [a, b, c, d].forEach((p, i) => { this.P.push(...p); this.N.push(nx / l, ny / l, nz / l); this.U.push(...U[i]); this.C.push(1, 1, 1); });
    this.I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  mesh(mat) {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.I); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; return m;
  }
}

// ------------------------------------------------------------------ sign cells (a small atlas of its own)
const LINE_BADGE = { TR: '#2f9e44', SM: '#1c7ed6', M: '#ae3ec9', T: '#e64980', L: '#0c8599' };
function badge(ctx, g, x, y, r, t) {
  g.fillStyle = LINE_BADGE[t]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; ctx.tex.fitText(g, t, x, y + 1, r * 1.6, r * 1.05, ctx.tex.FONTS.en, 900);
}
/** Hanging direction sign: black, white text, an arrow; lines = [[arrow, jp, en, badges?], …] side by side. */
function hangSign(ctx, A, key, parts) {
  const f = ctx.tex.FONTS;
  return A.cell('hang|' + key, 768, 128, (g, w, h) => {
    g.fillStyle = '#26282d'; g.fillRect(0, 0, w, h);
    const n = parts.length, cw = w / n;
    parts.forEach(([arrow, jp, en, badges = []], i) => {
      const x0 = i * cw;
      if (i) { g.fillStyle = '#4a4d55'; g.fillRect(x0 - 1, 14, 2, h - 28); }
      g.fillStyle = arrow === '↑' || arrow === '←' || arrow === '→' ? '#f2c230' : '#ffffff';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      ctx.tex.fitText(g, arrow, x0 + 40, h / 2, 60, 64, f.sans, 900);
      g.fillStyle = '#ffffff'; g.textAlign = 'left';
      ctx.tex.fitText(g, jp, x0 + 80, h * 0.4, cw - 100 - badges.length * 44, 44, f.sans, 900);
      g.fillStyle = '#c8ccd4'; ctx.tex.fitText(g, en, x0 + 82, h * 0.78, cw - 100, 20, f.en, 700);
      badges.forEach((t, k) => badge(ctx, g, x0 + cw - 30 - k * 42, h * 0.4, 17, t));
    });
  });
}
/** 発車標: a black LED board — title bar in the line colour, then rows [kind, time, dest, track]. */
function departures(ctx, A, key, title, color, rows) {
  const f = ctx.tex.FONTS, KC = { 普通: '#6ee07a', 快速: '#ffa94d', 特急: '#ff6b6b', 各停: '#6ee07a', 急行: '#ffa94d' };
  return A.cell('dep|' + key, 768, 256, (g, w, h) => {
    g.fillStyle = '#0d0e10'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 0, w, 52);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, title, 18, 27, w * 0.6, 32, f.sans, 900);
    g.textAlign = 'right'; ctx.tex.fitText(g, '時刻  行先  のりば', w - 16, 27, w * 0.36, 20, f.sans, 700);
    rows.forEach(([kind, time, dest, track], i) => {
      const y = 52 + 34 + i * 66;
      g.textAlign = 'left'; g.fillStyle = KC[kind] || '#ffffff'; ctx.tex.fitText(g, kind, 18, y, 110, 38, f.sans, 900);
      g.fillStyle = '#f5f5f0'; ctx.tex.fitText(g, time, 150, y, 150, 40, f.en, 700);
      g.fillStyle = '#ffb454'; ctx.tex.fitText(g, dest, 320, y, 290, 40, f.sans, 900);
      g.textAlign = 'right'; g.fillStyle = '#f5f5f0'; ctx.tex.fitText(g, track, w - 18, y, 120, 40, f.sans, 900);
    });
    g.globalAlpha = 0.18; g.fillStyle = '#000000'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1); g.globalAlpha = 1;   // LED rows
  });
}
/** 運賃表: the fare chart over the ticket machines — the lines out of 花渡 with fares at every station. */
function fareChart(ctx, A) {
  const f = ctx.tex.FONTS;
  return A.cell('fare-chart', 1024, 448, (g, w, h) => {
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f3a68'; g.fillRect(0, 0, w, 44);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle'; ctx.tex.fitText(g, 'きっぷうりば  運賃表  Fares from Hanawatari', 16, 23, w - 30, 26, f.sans, 900);
    const cx = 470, cy = 240;
    const lines = [
      ['TR', [[-1, 0], ['北花渡', 150], ['川向', 190], ['見晴口', 230]], [[1, 0], ['南花渡', 150], ['湊町', 190], ['花渡港', 260]]],
      ['SM', [[0, -1], ['本町三丁目', 150], ['汐見二丁目', 180], ['汐見', 220]], [[0, 1], ['花渡西', 150], ['鈴音', 180]]],
      ['L', [[0.6, -1.0], ['北花渡団地', 200], ['北岸公園', 240]]],
      ['M', [[-0.9, 0.8], ['澪川', 180], ['見晴台', 210], ['寺町', 250]]],
    ];
    const at = (dx, dy, k) => [cx + dx * 110 * k, cy + dy * 58 * k];
    for (const [t, ...arms] of lines) for (const [[dx, dy], ...sts] of arms) {                       // the lines first …
      const [ex, ey] = at(dx, dy, sts.length);
      g.strokeStyle = LINE_BADGE[t]; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
    }
    for (const [t, ...arms] of lines) for (const [[dx, dy], ...sts] of arms) sts.forEach(([name, fare], k) => {   // … then stations and labels
      const [x, y] = at(dx, dy, k + 1);
      g.fillStyle = '#ffffff'; g.strokeStyle = LINE_BADGE[t]; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.stroke();
      if (dy === 0) {                                                                              // along the line: name over, fare under
        g.fillStyle = '#26282d'; g.textAlign = 'center'; ctx.tex.fitText(g, name, x, y - 22, 104, 17, f.sans, 700);
        g.fillStyle = '#d9463b'; ctx.tex.fitText(g, String(fare), x, y + 22, 60, 19, f.en, 900);
      } else {                                                                                     // across it: both to the side
        const sx = dx < 0 ? -1 : 1; g.textAlign = sx > 0 ? 'left' : 'right';
        g.fillStyle = '#26282d'; ctx.tex.fitText(g, name, x + sx * 15, y - 7, 100, 16, f.sans, 700);
        g.fillStyle = '#d9463b'; ctx.tex.fitText(g, String(fare), x + sx * 15, y + 12, 50, 16, f.en, 900);
      }
    });
    g.fillStyle = '#d9463b'; g.beginPath(); g.arc(cx, cy, 16, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; ctx.tex.fitText(g, '花渡', cx, cy + 1, 28, 14, f.sans, 900);
    g.fillStyle = '#55606f'; g.textAlign = 'left'; ctx.tex.fitText(g, 'おとな運賃（円）  こどもは半額  IC カードもご利用いただけます', 16, h - 18, w - 30, 16, f.sans, 700);
  });
}
function lockerFace(ctx, A) {
  const f = ctx.tex.FONTS;
  return A.cell('lockers', 512, 256, (g, w, h) => {
    g.fillStyle = '#8fa6b8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#26282d'; g.fillRect(0, 0, w, 26); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, 'コインロッカー  COIN LOCKERS  IC', w / 2, 14, w - 20, 16, f.sans, 900);
    const cols = 8, rows = [44, 44, 56, 76], cw = (w - 12) / cols; let y = 30;
    rows.forEach((rh, r) => {
      for (let c = 0; c < cols; c++) {
        const x = 6 + c * cw;
        g.fillStyle = (r + c) % 5 === 0 ? '#a6bccb' : '#9db3c3'; g.fillRect(x + 2, y + 2, cw - 4, rh - 4);
        g.fillStyle = '#e8ecef'; g.fillRect(x + cw - 16, y + rh / 2 - 6, 8, 12);
        g.fillStyle = '#3d4a58'; ctx.tex.fitText(g, String(r * cols + c + 1), x + 14, y + 12, 22, 11, f.en, 700);
      }
      y += rh;
    });
  });
}
function pianoSign(ctx, A) {
  const f = ctx.tex.FONTS;
  return A.cell('piano-sign', 256, 128, (g, w, h) => {
    g.fillStyle = '#fbf3e6'; g.fillRect(0, 0, w, h); g.fillStyle = '#c2436e'; g.fillRect(0, 0, w, 10);
    g.fillStyle = '#2d2b33'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, 'ストリートピアノ', w / 2, 44, w - 24, 30, f.round, 900);
    g.fillStyle = '#8a6446'; ctx.tex.fitText(g, 'どなたでもご自由に ♪ 9:00–21:00', w / 2, 88, w - 24, 16, f.sans, 700);
  });
}
function gateSign(ctx, A, key, jp, en, badges) {
  const f = ctx.tex.FONTS;
  return A.cell('gate|' + key, 512, 128, (g, w, h) => {
    g.fillStyle = '#26282d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, jp, 22, 50, w - 60 - badges.length * 46, 52, f.sans, 900);
    g.fillStyle = '#c8ccd4'; ctx.tex.fitText(g, en, 24, 100, w - 40, 22, f.en, 700);
    badges.forEach((t, k) => badge(ctx, g, w - 32 - k * 46, 50, 19, t));
  });
}
function platformSign(ctx, A, key, num, jp, en, t) {
  const f = ctx.tex.FONTS;
  return A.cell('plat|' + key, 512, 96, (g, w, h) => {
    g.fillStyle = '#26282d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(12, 12, 120, h - 24); g.fillStyle = '#26282d'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, num, 72, h / 2 + 2, 104, 44, f.en, 900);
    badge(ctx, g, 168, h / 2, 20, t);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; ctx.tex.fitText(g, jp, 200, h * 0.4, w - 214, 30, f.sans, 900);
    g.fillStyle = '#c8ccd4'; ctx.tex.fitText(g, en, 201, h * 0.78, w - 214, 15, f.en, 700);
  });
}

/** Build the free passage; kit = the shop-front kit (interiors + their material). Returns a Group. */
export function buildConcourse(ctx, kit) {
  const A = createAtlas(ctx, { W: 4096, H: 2048, key: 'station-concourse' });
  const mb = new MB(), lb = new MB(), sb = new QBuf(), ib = new QBuf(), phys = ctx.physics;
  const G = groundAt(-450, ZC), FY = G + 0.15, CY = FY + 4.2;
  // ---- wall frame helpers: side 'N' is the wall at Z0 facing +z (south), 'S' the wall at Z1 facing −z
  const zW = (side, off) => (side === 'N' ? Z0 + 0.03 + off : Z1 - 0.03 - off);   // 3 cm in front of the station buildings' faces
  const wq = (buf, side, xa, xb, ya, yb, colOrUv, off = 0) => {
    const z = zW(side, off);
    const q = side === 'N' ? [[xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z]] : [[xb, ya, z], [xa, ya, z], [xa, yb, z], [xb, yb, z]];
    buf.quad(q[0], q[1], q[2], q[3], colOrUv);
  };
  const wbox = (side, xa, xb, ya, yb, depth, col) => {                     // a box standing out of the wall by depth
    const z = zW(side, 0);
    if (side === 'N') mb.box(xa, xb, ya, yb, z, z + depth, col, 'SEWT'); else mb.box(xa, xb, ya, yb, z - depth, z, col, 'NEWT');
  };
  // a wall collider: 0.3 m behind the wall face and `depth` in front of it (machines, lockers)
  const wallCol = (side, xa, xb, depth = 0, y1 = CY) => phys.addBox((xa + xb) / 2, side === 'N' ? Z0 + (depth - 0.3) / 2 : Z1 + (0.3 - depth) / 2, xb - xa, 0.3 + depth, 0, G - 1, y1);
  // ---------------------------------------------------------------- floor, guide strip, ceiling and its lights
  const tiles = (x0, x1, z0, z1) => {
    for (let x = x0; x < x1 - 0.01; x += 1.2) for (let z = z0; z < z1 - 0.01; z += 1.2) {
      const xa = x, xb = Math.min(x + 1.2, x1), za = z, zb = Math.min(z + 1.2, z1), k = Math.round((x - X0) / 1.2) + Math.round((z - Z0) / 1.2);
      mb.quad([xa, FY, zb], [xb, FY, zb], [xb, FY, za], [xa, FY, za], k & 1 ? FLOOR : FLOOR2);
    }
  };
  tiles(X0, -342, Z0, Z1); tiles(-348, -342, -165, Z0); tiles(-348, -342, Z1, -141);
  tiles(CG.x0, CG.x1, CG.zb, Z0); tiles(EG.x0, EG.x1, EG.zb, Z0);
  const strip = (x0, x1, z0, z1) => mb.quad([x0, FY + 0.006, z1], [x1, FY + 0.006, z1], [x1, FY + 0.006, z0], [x0, FY + 0.006, z0], TACT);
  strip(X0, -342, -150.35, -150.05);
  for (const g of [CG, EG]) { const x = (g.x0 + g.x1) / 2; strip(x - 0.15, x + 0.15, g.zg + 1.0, -150.35); }
  const ceiling = (x0, x1, z0, z1) => mb.quad([x0, CY, z0], [x1, CY, z0], [x1, CY, z1], [x0, CY, z1], CEIL);
  ceiling(X0, XE, Z0, Z1); ceiling(CG.x0, CG.x1, CG.zb, Z0); ceiling(EG.x0, EG.x1, EG.zb, Z0);
  const light = (x0, x1, z0, z1) => lb.quad([x0, CY - 0.012, z0], [x1, CY - 0.012, z0], [x1, CY - 0.012, z1], [x0, CY - 0.012, z1], rgb('#ffffff'));
  for (let x = X0 + 2; x < XE - 1; x += 3) light(x - 0.15, x + 0.15, Z0 + 0.9, Z1 - 0.9);
  for (const g of [CG, EG]) for (let x = g.x0 + 2; x < g.x1 - 1; x += 3) light(x - 0.15, x + 0.15, g.zb + 0.8, Z0 - 0.4);
  // ---------------------------------------------------------------- units along the walls
  const PANEL_TOP = FY + 3.65;
  const panel = (side, xa, xb, posters = 0, seed = 0) => {
    wq(mb, side, xa, xb, FY, CY, WALLP); wbox(side, xa, xb, FY, FY + 0.12, 0.02, SKIRT);
    for (let k = 0; k < posters; k++) {
      const w = 2.2, gap = (xb - xa - posters * w) / (posters + 1), x = xa + gap + k * (w + gap), uv = billboard(ctx, A, ADS[(seed + k) % ADS.length]);
      wbox(side, x - 0.06, x + w + 0.06, FY + 1.25, FY + 2.13, 0.04, STEEL);
      wq(sb, side, x, x + w, FY + 1.31, FY + 2.07, uv, 0.045);
    }
  };
  const shop = (side, xa, xb, name, sub, style, inter) => {
    wq(ib, side, xa + 0.35, xb - 0.35, FY + 0.12, FY + 2.75, kit.INT.uv[inter], 0.02);
    wq(mb, side, xa + 0.35, xb - 0.35, FY, FY + 0.12, DARK, 0.03);
    wbox(side, xa, xa + 0.35, FY, PANEL_TOP, 0.12, PIL); wbox(side, xb - 0.35, xb, FY, PANEL_TOP, 0.12, PIL);
    wbox(side, xa + 0.35, xb - 0.35, FY + 2.75, FY + 2.85, 0.06, STEEL);                                   // transom
    wbox(side, xa, xb, FY + 2.85, PANEL_TOP, 0.2, FASC);                                                   // fascia band
    const sw = Math.min(xb - xa - 0.6, 0.72 * 6), cx = (xa + xb) / 2;
    wq(sb, side, cx - sw / 2, cx + sw / 2, FY + 2.89, FY + 3.61, fasciaSign(ctx, A, name, sub, style), 0.205);
    wq(mb, side, xa, xb, PANEL_TOP, CY, WALLP);
  };
  const lockers = (side, xa, xb) => {
    wq(mb, side, xa, xb, FY, CY, WALLP);
    wbox(side, xa, xb, FY, FY + 1.95, 0.6, LOCK);
    wq(sb, side, xa + 0.05, xb - 0.05, FY + 0.02, FY + 1.93, lockerFace(ctx, A), 0.601);
    wallCol(side, xa, xb, 0.6, FY + 1.95);
  };
  const piano = (side, xa, xb) => {                                        // an upright piano, its bench and a sign
    panel(side, xa, xb);
    const cx = (xa + xb) / 2, d = side === 'N' ? 1 : -1, zb = zW(side, 0), Z = (a, b) => [Math.min(zb + d * a, zb + d * b), Math.max(zb + d * a, zb + d * b)];
    const INK = rgb('#1d1c21');
    mb.box(cx - 0.75, cx + 0.75, FY, FY + 1.25, ...Z(0, 0.6), INK, 'NSEWT');
    mb.box(cx - 0.72, cx + 0.72, FY + 0.72, FY + 0.76, ...Z(0.6, 0.88), rgb('#f4f1ea'), 'NSEWT');           // keys
    mb.box(cx - 0.72, cx + 0.72, FY + 0.64, FY + 0.72, ...Z(0.6, 0.9), INK, 'NSEWT');
    mb.box(cx - 0.72, cx + 0.72, FY + 0.2, FY + 0.64, ...Z(0.55, 0.62), INK, 'NSEWT');
    mb.box(cx - 0.4, cx + 0.4, FY + 0.44, FY + 0.5, ...Z(1.2, 1.55), INK, 'NSEWT');                          // bench
    for (const sx of [-0.35, 0.35]) mb.box(cx + sx - 0.03, cx + sx + 0.03, FY, FY + 0.44, ...Z(1.25, 1.5), INK, 'NSEW');
    wq(sb, side, cx - 0.55, cx + 0.55, FY + 1.5, FY + 2.05, pianoSign(ctx, A), 0.03);
    phys.addBox(cx, zb + d * 0.8, 1.6, 1.6, 0, G - 1, FY + 1.25);
  };
  const machines = (side, xa, xb) => {
    wq(mb, side, xa, xb, FY, CY, WALLP);
    const n = Math.floor((xb - xa) / 1.2), w = (xb - xa) / n;
    for (let k = 0; k < n; k++) {
      const x0 = xa + k * w + 0.08, x1 = xa + (k + 1) * w - 0.08;
      const zb0 = zW(side, 0); if (side === 'N') mb.box(x0, x1, FY, FY + 1.8, zb0, zb0 + 0.6, MACH, 'EWT'); else mb.box(x0, x1, FY, FY + 1.8, zb0 - 0.6, zb0, MACH, 'EWT');
      wq(mb, side, x0, x1, FY, FY + 1.8, MACH, 0.6);
      // the touch screen, a cash slot panel, the lit route label
      wq(lb, side, x0 + 0.12, x1 - 0.12, FY + 0.98, FY + 1.42, rgb('#6fb3e0'), 0.607);
      wq(mb, side, x0 + 0.07, x1 - 0.07, FY + 0.93, FY + 1.47, rgb('#3a3d44'), 0.603);
      wq(mb, side, x0 + 0.15, x1 - 0.15, FY + 0.4, FY + 0.85, rgb('#b9b4a6'), 0.605);
      wq(lb, side, x0 + 0.1, x1 - 0.1, FY + 1.55, FY + 1.72, rgb('#f7f3e3'), 0.605);
    }
    { const h = Math.min((xb - xa - 0.4) * 448 / 1024, CY - 0.12 - (FY + 1.98)), w2 = h * 1024 / 448 / 2, cx = (xa + xb) / 2;   // as big as fits under the ceiling
      wq(mb, side, cx - w2 - 0.08, cx + w2 + 0.08, FY + 1.9, FY + 1.98 + h + 0.08, STEEL, 0.02);
      wq(sb, side, cx - w2, cx + w2, FY + 1.98, FY + 1.98 + h, fareChart(ctx, A), 0.03); }
    wallCol(side, xa, xb, 0.6, FY + 1.8);
  };
  // ---------------------------------------------------------------- the ticket gates and their paid concourse
  const gates = (g, title, boards, platforms) => {
    const cx = (g.x0 + g.x1) / 2, nA = g === CG ? 8 : 5, aisle = 0.9, cab = 0.22, row = nA * aisle + (nA + 1) * cab;
    const gx0 = cx - row / 2, gx1 = cx + row / 2, zg = g.zg;
    for (let k = 0; k <= nA; k++) {
      const x = gx0 + k * (aisle + cab), xa = x, xb = x + cab;
      mb.box(xa, xb, FY, FY + 1.02, zg - 0.7, zg + 0.7, GATE, 'NSEWT');
      mb.box(xa - 0.01, xb + 0.01, FY + 0.95, FY + 1.05, zg - 0.72, zg + 0.72, GATE_T, 'NSEWT');
      lb.quad([xa + 0.03, FY + 1.052, zg + 0.62], [xb - 0.03, FY + 1.052, zg + 0.62], [xb - 0.03, FY + 1.052, zg + 0.34], [xa + 0.03, FY + 1.052, zg + 0.34], rgb('#59b8f0'));   // IC reader
      lb.quad([xa + 0.04, FY + 0.72, zg + 0.701], [xb - 0.04, FY + 0.72, zg + 0.701], [xb - 0.04, FY + 0.9, zg + 0.701], [xa + 0.04, FY + 0.9, zg + 0.701], rgb(k % 3 === 1 ? '#ff5a4a' : '#4fe08a'));   // ← / ✕ lamp
      if (k < nA) for (const sx of [xb, x + aisle + cab]) {                                             // the flaps, shut
        const fx0 = Math.min(sx, sx + (sx === xb ? 0.33 : -0.33)), fx1 = Math.max(sx, sx + (sx === xb ? 0.33 : -0.33));
        mb.box(fx0, fx1, FY + 0.45, FY + 0.95, zg - 0.03, zg + 0.03, FLAP, 'NSEWT');
      }
    }
    // the staffed window beside the gates, glass fences to the walls
    const bx0 = gx1 + 0.3, bx1 = Math.min(g.x1 - 0.4, gx1 + 3.2);
    mb.box(bx0, bx1, FY, FY + 2.6, zg - 1.6, zg + 0.4, rgb('#e8e5dc'), 'NSEWT'); mb.box(bx0 - 0.05, bx1 + 0.05, FY + 2.6, FY + 2.75, zg - 1.65, zg + 0.45, STEEL, 'NSEWT');
    mb.box(bx0 + 0.3, bx1 - 0.3, FY + 1.0, FY + 2.2, zg + 0.4, zg + 0.42, GLASS, 'S');
    for (const [a, b] of [[g.x0 + 0.2, gx0], [bx1, g.x1 - 0.2]]) if (b - a > 0.3) { mb.box(a, b, FY, FY + 1.1, zg - 0.03, zg + 0.03, GLASS, 'NSEWT'); mb.box(a, b, FY + 1.1, FY + 1.15, zg - 0.05, zg + 0.05, STEEL, 'NSEWT'); }
    phys.addBox(cx, zg, g.x1 - g.x0, 1.4, 0, G - 1, FY + 2.8);
    // the recess: side walls, the bulkhead with the departure boards and the gate's name over it
    for (const x of [g.x0, g.x1]) { const d = x === g.x0 ? 1 : -1; mb.quad(...(d > 0 ? [[x, FY, Z0], [x, FY, g.zb], [x, CY, g.zb], [x, CY, Z0]] : [[x, FY, g.zb], [x, FY, Z0], [x, CY, Z0], [x, CY, g.zb]]), WALLP); phys.addBox(x - d * 0.15, (g.zb + Z0) / 2, 0.3, Z0 - g.zb, 0, G - 1, CY); }
    mb.box(g.x0, g.x1, CY - 1.25, CY, Z0 - 0.15, Z0 + 0.15, FASC, 'SNB');
    const bw = 3.3, bh = bw / 3, total = boards.length * bw + (boards.length - 1) * 0.3 + 3.9;
    let x = cx - total / 2;
    wq(sb, 'N', x, x + 3.6, CY - 1.15, CY - 1.15 + 0.9, gateSign(ctx, A, title[0], title[0], title[1], title[2]), 0.16); x += 3.9;
    for (const bd of boards) { wq(sb, 'N', x, x + bw, CY - 1.2, CY - 1.2 + bh, bd, 0.16); x += bw + 0.3; }
    // inside: back wall, stairs and an escalator up to the platforms (into the ceiling), their platform signs
    mb.quad([g.x0, FY, g.zb], [g.x1, FY, g.zb], [g.x1, CY, g.zb], [g.x0, CY, g.zb], WALLP);
    phys.addBox(cx, g.zb - 0.15, g.x1 - g.x0, 0.3, 0, G - 1, CY);
    const z0 = zg - 1.4, depth = z0 - g.zb, rise = CY - FY, nS = Math.min(24, Math.floor((depth - 0.2) / 0.3)), run = nS * 0.3, hS = rise / 24;
    const flights = platforms.map((p, i) => [cx - (platforms.length / 2) * 3.4 + i * 3.4 + 0.2, p]);
    for (const [x0, [kind, sign]] of flights) {
      const x1 = x0 + 3.0;
      if (kind === 'stairs') for (let i = 0; i < nS; i++) { const za = z0 - i * 0.3, zb = za - 0.3; mb.box(x0, x1, FY, FY + (i + 1) * hS, zb, za, i & 1 ? STAIR : STAIR2, 'SEWT'); }
      else {
        mb.quad([x0 + 0.2, FY, z0], [x1 - 0.2, FY, z0], [x1 - 0.2, FY + nS * hS, z0 - run], [x0 + 0.2, FY + nS * hS, z0 - run], BELT);
        for (const xs of [x0 + 0.1, x1 - 0.1]) {
          mb.quad([xs, FY, z0], [xs, FY + nS * hS, z0 - run], [xs, FY + nS * hS + 1.0, z0 - run], [xs, FY + 1.0, z0], GLASS);
          mb.quad([xs, FY + nS * hS, z0 - run], [xs, FY, z0], [xs, FY + 1.0, z0], [xs, FY + nS * hS + 1.0, z0 - run], GLASS);
          mb.box(xs - 0.06, xs + 0.06, FY + 1.0, FY + 1.1, z0 - run, z0, DARK, 'NSEWT');
        }
      }
      const top = FY + nS * hS;
      mb.box(x0, x1, top, CY, z0 - run - 0.6, z0 - run, rgb('#1e1f24'), 'S');                        // the dark way up
      phys.addBox((x0 + x1) / 2, z0 - run / 2, 3.0, run, 0, G - 1, CY);
      wq(sb, 'N', x0, x1, CY - 0.62, CY - 0.1, sign, z0 + 0.4 - Z0 - 0.03);                          // hung just in front of the flight
      mb.box(x0 + 0.1, x0 + 0.14, CY - 0.1, CY, z0 + 0.38, z0 + 0.42, STEEL, 'NSEW'); mb.box(x1 - 0.14, x1 - 0.1, CY - 0.1, CY, z0 + 0.38, z0 + 0.42, STEEL, 'NSEW');
    }
  };
  const depTR = [
    departures(ctx, A, 'tr-up', '東和本線  上り  Towa Line', '#2f9e44', [['快速', '16:07', '北花渡', '1'], ['普通', '16:12', '見晴口', '2'], ['普通', '16:19', '北花渡', '1']]),
    departures(ctx, A, 'tr-dn', '東和本線  下り  Towa Line', '#2f9e44', [['普通', '16:05', '花渡港', '3'], ['快速', '16:10', '湊町', '4'], ['普通', '16:17', '花渡港', '3']]),
  ];
  const depSM = [departures(ctx, A, 'sm', '汐見線  Shiomi Line', '#1c7ed6', [['各停', '16:04', '汐見', '5'], ['急行', '16:09', '汐見', '6'], ['各停', '16:14', '鈴音', '5']])];
  // ---------------------------------------------------------------- lay out the walls (west → east)
  // north wall
  panel('N', X0, X0 + 3);
  shop('N', X0 + 3, X0 + 13, '立ち食いそば 渡し', 'SOBA · UDON', 'indigo', 'ramen');
  shop('N', X0 + 13, X0 + 23, '花渡みやげ 桜堂', 'SOUVENIRS', 'pinkChain', 'shop');
  panel('N', X0 + 23, X0 + 30, 2, 1);
  shop('N', X0 + 30, X0 + 42, 'パン工房 にしぐち', 'BAKERY', 'wood', 'bakery');
  lockers('N', X0 + 42, X0 + 48);
  shop('N', X0 + 48, X0 + 64, '花渡駅 旅行センター', 'TRAVEL CENTER', 'green', 'lobby');
  panel('N', X0 + 64, CG.x0, 3, 4);
  panel('N', CG.x1, CG.x1 + 5, 1, 7);
  machines('N', -435.4, -427.2);
  shop('N', -426.6, -414.6, 'はなまるマート 駅ナカ店', 'HANAMARU MART', 'konbiniA', 'konbini');
  shop('N', -414.6, -405, 'フラワー はなの', 'FLOWERS', 'green', 'shop');
  panel('N', -405, EG.x0);
  panel('N', EG.x1, EG.x1 + 2);
  shop('N', EG.x1 + 2, EG.x1 + 14, 'はなわたり珈琲 エキナカ', 'HANAWATARI COFFEE', 'pinkChain', 'cafe');
  shop('N', EG.x1 + 14, EG.x1 + 25, 'ベーカリー こむぎ舎', 'bakery komugisha', 'cream', 'bakery');
  panel('N', EG.x1 + 25, XE, 1, 9);
  // south wall
  panel('S', X0, X0 + 3);
  shop('S', X0 + 3, X0 + 15, '100円ショップ はなまる', '100 YEN SHOP', 'yellowRed', 'shop');
  shop('S', X0 + 15, X0 + 25, 'ドラッグ ヒカリ 西口店', 'DRUG HIKARI', 'yellowBlue', 'drug');
  panel('S', X0 + 25, X0 + 31, 2, 2);
  shop('S', X0 + 31, X0 + 43, '花渡書店 西口店', 'BOOKS', 'white', 'books');
  piano('S', X0 + 43, X0 + 50);
  shop('S', X0 + 50, X0 + 62, 'スイーツ はなさく', 'SWEETS', 'pop', 'bakery');
  panel('S', X0 + 62, X0 + 82, 4, 5);
  shop('S', -474, -459, 'みどりの窓口', 'TICKET OFFICE', 'green', 'bank');
  lockers('S', -459, -452);
  panel('S', -452, -436, 4, 8);
  shop('S', -436, -424, 'はなモバイル', 'HANA MOBILE', 'pinkChain', 'shop');
  shop('S', -424, -412, 'そば処 花渡', 'SOBA', 'indigo', 'ramen');
  shop('S', -412, -400, '観光案内所', 'TOURIST INFORMATION', 'navy', 'lobby');
  panel('S', -400, -392, 2, 3);
  shop('S', -392, -380, 'お弁当 はなわ屋', 'BENTO', 'orange', 'restaurant');
  shop('S', -380, -368, 'ブティック リラ', 'boutique lila', 'cream', 'clothes');
  panel('S', -368, XE, 3, 6);
  // the gates
  const P1 = platformSign(ctx, A, 'tr12', '1・2', '東和本線  北花渡・見晴口 方面', 'Towa Line  for Kita-hanawatari', 'TR');
  const P3 = platformSign(ctx, A, 'tr34', '3・4', '東和本線  花渡港・湊町 方面', 'Towa Line  for Hanawatari-ko', 'TR');
  const P5 = platformSign(ctx, A, 'sm56', '5・6', '汐見線  汐見・鈴音 方面', 'Shiomi Line', 'SM');
  gates(CG, ['中央改札', 'Central Gate  ·  Towa Line / Shiomi Line', ['SM', 'TR']], depTR, [['stairs', P1], ['escalator', P1], ['escalator', P3], ['stairs', P3]]);
  gates(EG, ['東口改札', 'East Gate  ·  Shiomi Line', ['SM']], depSM, [['escalator', P5], ['stairs', P5]]);
  // wall colliders (the gate recesses stay open to the passage)
  wallCol('N', X0, CG.x0); wallCol('N', CG.x1, EG.x0); wallCol('N', EG.x1, XE); wallCol('S', X0, XE);
  // ---------------------------------------------------------------- hanging direction signs (both faces)
  const hang = (x, faceE, faceW) => {
    const y0 = CY - 0.95, y1 = y0 + 3.6 / 6;
    mb.box(x - 0.06, x + 0.06, y0 - 0.02, y1 + 0.02, ZC - 1.85, ZC + 1.85, rgb('#1e1f24'), 'NSTB');
    for (const zz of [ZC - 1.2, ZC + 1.2]) mb.box(x - 0.015, x + 0.015, y1, CY, zz - 0.015, zz + 0.015, STEEL, 'NSEW');
    sb.quad([x + 0.065, y0, ZC + 1.8], [x + 0.065, y0, ZC - 1.8], [x + 0.065, y1, ZC - 1.8], [x + 0.065, y1, ZC + 1.8], faceE);   // seen walking west
    sb.quad([x - 0.065, y0, ZC - 1.8], [x - 0.065, y0, ZC + 1.8], [x - 0.065, y1, ZC + 1.8], [x - 0.065, y1, ZC - 1.8], faceW);   // seen walking east
  };
  hang(-528, hangSign(ctx, A, 'w-e', [['↑', '西口', 'West Exit'], ['↑', '路面電車', 'Tram  Hanawatari-eki-nishiguchi', ['T']]]),
    hangSign(ctx, A, 'w-w', [['↑', '中央改札', 'Central Gate', ['SM', 'TR']], ['↑', '東口', 'East Exit']]));
  hang(-484, hangSign(ctx, A, 'm-e', [['↑', '西口', 'West Exit'], ['↑', 'バス・タクシー', 'Bus · Taxi (West)']]),
    hangSign(ctx, A, 'm-w', [['↖', '中央改札', 'Central Gate', ['SM', 'TR']], ['↑', '東口', 'East Exit']]));
  hang(-420, hangSign(ctx, A, 'e-e', [['↗', '中央改札', 'Central Gate', ['SM', 'TR']], ['↑', '西口', 'West Exit']]),
    hangSign(ctx, A, 'e-w', [['↖', '東口改札', 'East Gate', ['SM']], ['↑', '東口', 'East Exit · Bus · Taxi']]));
  hang(-372, hangSign(ctx, A, 'x-e', [['↑', '中央改札  西口', 'Central Gate · West Exit'], ['↗', '東口改札', 'East Gate', ['SM']]]),
    hangSign(ctx, A, 'x-w', [['↑', '東口', 'East Exit'], ['↑', '2F デッキ', 'Deck  ·  Bus Terminal']]));
  // ---------------------------------------------------------------- the west entrance (the east one is the atrium's)
  { const x = X0;
    mb.box(x - 0.2, x + 0.2, FY, CY + 0.95, Z0 - 0.2, Z0 + 0.25, PIL, 'NSEWT'); mb.box(x - 0.2, x + 0.2, FY, CY + 0.95, Z1 - 0.25, Z1 + 0.2, PIL, 'NSEWT');
    mb.box(x - 0.15, x + 0.15, FY + 2.7, CY + 0.95, Z0, Z1, FASC, 'EWB');                                  // over the doors, up into the house's raised storey
    for (let z = Z0 + 2.4; z < Z1 - 0.1; z += 2.4) mb.box(x - 0.06, x + 0.06, FY, FY + 2.7, z - 0.06, z + 0.06, STEEL, 'NSEW');   // door mullions (doors open)
    for (let z = Z0 + 0.15; z < Z1 - 0.2; z += 2.4) mb.quad([x - 0.03, FY + 0.05, z + 0.55], [x - 0.03, FY + 0.05, z], [x - 0.03, FY + 2.65, z], [x - 0.03, FY + 2.65, z + 0.55], GLASS);   // the slid leaves
    mb.quad([x - 0.8, FY + 0.01, Z1 - 0.4], [x + 1.4, FY + 0.01, Z1 - 0.4], [x + 1.4, FY + 0.01, Z0 + 0.4], [x - 0.8, FY + 0.01, Z0 + 0.4], rgb('#5d5f66'));   // mat
  }
  // ---------------------------------------------------------------- outside: the passage's own walls and roof where no station building covers it
  // (between the west house and under 東和本線's deck), and the central gate's paid concourse
  { const oz0 = Z0 - 0.3, oz1 = Z1 + 0.3, xa = -474, xg = TRX0, xb = TRX1, yTop = (x) => (x < xg ? CY + 0.4 : SOFFIT);
    const outN = (x0, x1, z) => mb.quad([x1, G - 0.2, z], [x0, G - 0.2, z], [x0, yTop(x0 + 0.01), z], [x1, yTop(x0 + 0.01), z], OUTER);
    const outS = (x0, x1, z) => mb.quad([x0, G - 0.2, z], [x1, G - 0.2, z], [x1, yTop(x0 + 0.01), z], [x0, yTop(x0 + 0.01), z], OUTER);
    outN(xa, xg, oz0); outN(xg, CG.x0, oz0); outN(CG.x1, xb, oz0); outS(xa, xg, oz1); outS(xg, xb, oz1);
    mb.quad([xa, CY + 0.4, oz1], [xg, CY + 0.4, oz1], [xg, CY + 0.4, oz0], [xa, CY + 0.4, oz0], OUTER);                 // roof of the gap
    const cz0 = CG.zb - 0.3;
    mb.quad([CG.x0 - 0.3, G - 0.2, cz0], [CG.x0 - 0.3, G - 0.2, oz0], [CG.x0 - 0.3, SOFFIT, oz0], [CG.x0 - 0.3, SOFFIT, cz0], OUTER);
    mb.quad([CG.x1 + 0.3, G - 0.2, oz0], [CG.x1 + 0.3, G - 0.2, cz0], [CG.x1 + 0.3, SOFFIT, cz0], [CG.x1 + 0.3, SOFFIT, oz0], OUTER);
    mb.quad([CG.x1 + 0.3, G - 0.2, cz0], [CG.x0 - 0.3, G - 0.2, cz0], [CG.x0 - 0.3, SOFFIT, cz0], [CG.x1 + 0.3, SOFFIT, cz0], OUTER);
    // the passage's inner walls under the deck / in the gap run up to the deck (a fascia over the ceiling line)
    wq(mb, 'N', xa, CG.x0, CY, SOFFIT, WALLP); wq(mb, 'N', CG.x1, -436, CY, SOFFIT, WALLP); wq(mb, 'S', xa, -436, CY, SOFFIT, WALLP); }
  // ---------------------------------------------------------------- meshes
  const g = new THREE.Group(); g.name = 'concourse';
  // indoors the sun has no say: the concourse is lit evenly by its ceiling — unlit colours, a fixed shade per facing
  for (let v = 0; v < mb.n; v++) {
    const nx = mb.N[v * 3], ny = mb.N[v * 3 + 1], f = ny > 0.5 ? 0.92 : ny < -0.5 ? 0.84 : 0.78 + 0.06 * Math.abs(nx);
    mb.C[v * 3] *= f; mb.C[v * 3 + 1] *= f; mb.C[v * 3 + 2] *= f;
  }
  const m = mb.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, name: 'concourse' }), { shadow: false }); if (m) { m.receiveShadow = false; g.add(m); }
  const l = lb.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, name: 'concourse-lights' }), { shadow: false }); if (l) { l.receiveShadow = false; ctx.noOutline(l); g.add(l); }
  A.tex.needsUpdate = true;
  const s = sb.mesh(ctx.mat.emissive('#ffffff', 0.95, { map: A.tex })); if (s) { ctx.noOutline(s); g.add(s); }
  const i = ib.mesh(kit.interior); if (i) { ctx.noOutline(i); g.add(i); }
  return g;
}
