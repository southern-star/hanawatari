// 花渡横丁 — the drinking alley under the 東和本線 viaduct south of 本町通り (高架下の飲み屋横丁): a narrow lane along
// the viaduct's middle with tiny bars on both sides (plywood / corrugated fronts, a lit counter window, noren, a red
// lantern, a little name board, crates), a string of lanterns over the lane and a name gate at each end of every block
// (the streets that pass under the viaduct cut the lane into blocks and stay open).
// The viaduct stands on portal bents along this stretch (structures.js) so the lane runs through. Built once.
import * as THREE from 'three';
import { LINE } from '../plan/rail.js';
import { groundAt } from '../plan/ground.js';
import { prng } from '../plan/geom.js';
import { MB, rgb } from './mb.js';
import { roadSpaceAt } from '../plan/network.js';
import { fasciaSign, noren, lanternTex } from './signs/atlas.js';

/** The alley: along 東和本線 between these world z (south of 本町通り). */
export const YOKOCHO = { line: 'tr', z0: 36, z1: 196, lane: 1.4, depth: 9.2 };
/** Filled when the alley is built (for the people who come here): each block's lane (points down its middle) and
 *  each stall's front — { x, y, z (the middle of its front), fx, fz (out toward the lane), ux, uz (along), len, kind, crate }. */
export const YOKOCHO_BLOCKS = [], YOKOCHO_STALLS = [];
// [name, fascia style, interior] — mostly bars and eateries, a few odd little trades (a fictional town: invented names)
const NAMES = [['もつ焼き 大衆', 'redLantern', 'izakaya'], ['立ち飲み 花', 'dark', 'izakaya'], ['おでん まる', 'indigo', 'izakaya'], ['スナック 夜舟', 'purple', 'bar'],
  ['焼きとん ちょうちん', 'redLantern', 'izakaya'], ['酒場 鈴の音', 'dark', 'izakaya'], ['串カツ だるま', 'yellowRed', 'izakaya'], ['ホルモン 炎', 'redLantern', 'izakaya'],
  ['居酒屋 汐', 'indigo', 'izakaya'], ['餃子 まんぷく', 'yellowRed', 'restaurant'], ['やきとり 大吉', 'redLantern', 'izakaya'], ['BAR 月見', 'dark', 'bar'],
  ['中華そば 横丁', 'white', 'ramen'], ['酒処 ひさご', 'indigo', 'izakaya'], ['角打ち 升屋', 'wood', 'izakaya'], ['海鮮 汐見丸', 'navy', 'izakaya'],
  ['焼き鳥 とり花', 'redLantern', 'izakaya'], ['大衆酒場 花渡', 'yellowRed', 'izakaya'], ['天ぷら 小春', 'cream', 'restaurant'], ['煮込み 鍋島', 'wood', 'izakaya'],
  ['立ち食いそば 渡し', 'white', 'ramen'], ['喫茶 ガード下', 'cream', 'cafe'], ['定食 あさひ', 'orange', 'restaurant'], ['ハイボール酒場', 'popBlue', 'bar'],
  ['ワイン酒場 ぶどう', 'purple', 'bar'], ['沖縄料理 ちゅら', 'green', 'izakaya'], ['韓国屋台 ソウル', 'pop', 'restaurant'], ['もんじゃ 鉄板', 'orange', 'restaurant'],
  ['昭和酒場 ふじ', 'redLantern', 'izakaya'], ['地酒 花渡川', 'indigo', 'izakaya'], ['古本 高架堂', 'wood', 'books'], ['靴修理・合鍵', 'white', 'shop'],
  ['占い 星の小径', 'purple', 'shop'], ['たい焼き 花ぎん', 'cream', 'bakery'], ['串焼き 備長', 'dark', 'izakaya'], ['レモンサワー酒場', 'yellowBlue', 'bar'],
  ['四川料理 麻辣', 'redLantern', 'restaurant'], ['スタンド 汽笛', 'navy', 'bar'], ['焼肉 ガード下', 'dark', 'restaurant'], ['酒場 終電', 'indigo', 'izakaya']];
const LANTERN = { izakaya: '酒', bar: '夜', ramen: '麺', restaurant: '味' };
const WALLS = ['#6a4a36', '#7d6a58', '#8a8f96', '#5f6f7a', '#9a7452', '#6f5f73'];

function mouthSign(ctx, A) {
  const f = ctx.tex.FONTS;
  return A.cell('yokocho-mouth', 512, 112, (g, w, h) => {
    g.fillStyle = '#2d2b33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2c230'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, '花渡横丁', w / 2, 48, w - 120, 64, f.brush, 400);
    g.fillStyle = '#f7e3b0'; ctx.tex.fitText(g, 'HANAWATARI YOKOCHO  ·  ガード下 飲食街', w / 2, 94, w - 80, 16, f.en, 700);
    for (const x of [40, w - 40]) { g.fillStyle = '#d9463b'; g.beginPath(); g.ellipse(x, 52, 20, 28, 0, 0, 7); g.fill(); }
  });
}

export function buildYokocho(ctx, kit) {
  const L = LINE[YOKOCHO.line], Al = L.align, mb = new MB(), sb = new QBuf(), ib = new QBuf(), lb = new QBuf(), phys = ctx.physics, S = kit.A;
  const r = prng(0x70c0), lane = YOKOCHO.lane, depth = YOKOCHO.depth;
  const s0 = Al.sOf(-452, YOKOCHO.z0), s1 = Al.sOf(-452, YOKOCHO.z1), sa = Math.min(s0, s1), sz = Math.max(s0, s1);
  const pt = (s, d) => { const q = Al.at(s); return [q.x - q.hz * d, q.z + q.hx * d]; };
  // the lane runs in blocks between the streets that pass under the viaduct (their carriageways and footways stay open)
  const blocks = []; { let cur = null;
    for (let s = sa; s <= sz + 1e-6; s += 1) {
      const free = ![-lane - depth, -lane, 0, lane, lane + depth].some(d => { const [x, z] = pt(s, d); return roadSpaceAt(x, z, 1.2); });
      if (free) { if (!cur) cur = [s, s]; else cur[1] = s; } else if (cur) { blocks.push(cur); cur = null; }
    }
    if (cur) blocks.push(cur); }
  const B = blocks.filter(([a, b]) => b - a > 10);
  const order = NAMES.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let ni = 0;
  const stall = (s, len, side) => {
    const sm = s + len / 2, q = Al.at(sm), rot = Math.atan2(q.hx, q.hz);
    const dm = side * (lane + depth / 2), cx = q.x - q.hz * dm, cz = q.z + q.hx * dm, gy = groundAt(cx, cz), H = r.range(2.6, 3.0);
    // local frame of the stall: u along the line (to the right as seen from the lane), v across toward the lane (front at +v)
    const fx = q.hz * side, fz = -q.hx * side;                          // front normal (toward the lane)
    const ux = -side * q.hx, uz = -side * q.hz;
    const W = (u, y, v) => [cx + ux * u + fx * v, gy + y, cz + uz * u + fz * v];
    const hd = depth / 2, hl = len / 2 - 0.05, wall = rgb(WALLS[Math.floor(r() * WALLS.length)]);
    const from = mb.n;
    mb.box(-hl, hl, 0, H, -hd, hd - 0.02, wall, 'NSEWT');
    mb.box(-hl - 0.05, hl + 0.05, H, H + 0.12, -hd - 0.05, hd + 0.35, rgb('#3a3346'), 'NSEWTB');     // roof with a small eave
    // the back toward the street outside the viaduct: a steel door and an air-conditioner unit
    if (len > 2.6) { const u = r.range(-hl + 0.6, hl - 0.6); mb.box(u - 0.45, u + 0.45, 0, 2.0, -hd - 0.04, -hd, rgb('#8a9096'), 'NSEWT'); }
    if (r() < 0.6) { const u = r.range(-hl + 0.5, hl - 0.5); mb.box(u - 0.4, u + 0.4, 0.05, 0.65, -hd - 0.34, -hd - 0.02, rgb('#dcdad4'), 'NSEWT'); }
    mb.place(from, Math.atan2(fx, fz), cx, gy, cz);
    phys.addBox(cx, cz, depth, len - 0.1, rot, gy - 1, gy + H);
    // front: lit counter window, name board, noren, a lantern; crates by some doors
    const [name, style, kind] = NAMES[order[ni++ % NAMES.length]];
    ib.quad(W(-hl + 0.3, 0.9, hd + 0.01), W(hl - 0.3, 0.9, hd + 0.01), W(hl - 0.3, 2.05, hd + 0.01), W(-hl + 0.3, 2.05, hd + 0.01), kit.INT.uv[kind]);
    sb.quad(W(-hl + 0.15, H - 0.62, hd + 0.08), W(hl - 0.15, H - 0.62, hd + 0.08), W(hl - 0.15, H - 0.12, hd + 0.08), W(-hl + 0.15, H - 0.12, hd + 0.08), fasciaSign(ctx, S, name, '', style));
    const nuv = noren(ctx, S, name.replace(/^[^ ]+ /, '').slice(0, 3), ['#2d3e66', '#6a2f2f', '#3a3346'][ni % 3]);
    sb.quad(W(-0.55, 1.35, hd + 0.12), W(0.55, 1.35, hd + 0.12), W(0.55, 2.1, hd + 0.12), W(-0.55, 2.1, hd + 0.12), nuv);
    if (LANTERN[kind] && r() < 0.75) lantern(lb, W, hl - 0.35, 1.6, hd + 0.32, 0.17, 0.55, lanternTex(ctx, S, LANTERN[kind]));
    let crate = null;
    if ((kind === 'izakaya' || kind === 'restaurant') && r() < 0.45) { const f2 = mb.n; mb.box(-hl + 0.2, -hl + 0.7, 0, 0.35, hd + 0.1, hd + 0.5, rgb(r() < 0.5 ? '#c9463b' : '#e0b53c'), 'NSEWT'); mb.box(-hl + 0.25, -hl + 0.65, 0.35, 0.7, hd + 0.12, hd + 0.48, rgb('#c9463b'), 'NSEWT'); mb.place(f2, Math.atan2(fx, fz), cx, gy, cz); crate = W(-hl + 0.45, 0.7, hd + 0.3); }
    const F = W(0, 0, hd);
    YOKOCHO_STALLS.push({ x: F[0], y: F[1], z: F[2], fx, fz, ux, uz, len, kind, name, crate });
  };
  for (const [ra, rb] of B) for (const side of [-1, 1]) {
    const n = Math.max(1, Math.round((rb - ra) / 3.6)), wts = Array.from({ length: n }, () => r.range(0.8, 1.25)), tot = wts.reduce((a, b) => a + b, 0);
    let s = ra; for (const w of wts) { const len = (rb - ra) * w / tot; stall(s, len, side); s += len; }
  }
  // each block: a darker lane floor, a string of lanterns overhead, a name gate at both ends facing the street
  const gate = mouthSign(ctx, S), lt = lanternTex(ctx, S, '横丁');
  for (const [ra, rb] of B) {
    { const pts = []; for (let k = 0, n = Math.max(1, Math.ceil((rb - ra) / 3)); k <= n; k++) { const q = Al.at(ra + (rb - ra) * k / n); pts.push([q.x, groundAt(q.x, q.z) + 0.04, q.z]); } YOKOCHO_BLOCKS.push({ pts }); }
    const n = Math.ceil((rb - ra) / 2);
    for (let i = 0; i < n; i++) {
      const p = Al.at(ra + (rb - ra) * i / n), q = Al.at(ra + (rb - ra) * (i + 1) / n), w = lane - 0.05;
      const P = (o, d) => { const x = o.x - o.hz * d, z = o.z + o.hx * d; return [x, groundAt(x, z) + 0.04, z]; };
      mb.quad(P(p, -w), P(p, w), P(q, w), P(q, -w), rgb('#5c5a60'));
    }
    // the lantern string: a wire along the lane's middle and a lantern every 2.4 m
    const a = Al.at(ra), b = Al.at(rb), ya = groundAt(a.x, a.z) + 3.3, yb = groundAt(b.x, b.z) + 3.3;
    mb.quad([a.x, ya, a.z], [b.x, yb, b.z], [b.x, yb + 0.03, b.z], [a.x, ya + 0.03, a.z], rgb('#2d2b33'));
    mb.quad([b.x, yb, b.z], [a.x, ya, a.z], [a.x, ya + 0.03, a.z], [b.x, yb + 0.03, b.z], rgb('#2d2b33'));
    for (let s = ra + 1.2; s < rb - 0.6; s += 2.4) {
      const q = Al.at(s), gy = groundAt(q.x, q.z), fx = q.hz, fz = -q.hx, ux = -q.hx, uz = -q.hz;
      const W = (u, y, v) => [q.x + ux * u + fx * v, gy + y, q.z + uz * u + fz * v];
      lantern(lb, W, 0, 2.72, 0, 0.16, 0.5, lt);
      mb.box(q.x - 0.01, q.x + 0.01, gy + 3.22, gy + 3.3, q.z - 0.01, q.z + 0.01, rgb('#2d2b33'), 'NSEW');
    }
    // gates: a board on two posts across the lane mouth, just outside the end stalls, facing the street
    for (const [s, out] of [[ra, -1], [rb, 1]]) {
      const q = Al.at(s + out * 0.7), gy = groundAt(q.x, q.z), bw = 3.6, bh = bw * 112 / 512, y0 = 2.62;
      const nx = q.hx * out, nz = q.hz * out, rx = nz, rz = -nx;       // board faces (nx, nz); its right-hand end at (rx, rz)
      for (const f of [1, -1]) { const cx = q.x + nx * 0.03 * f, cz = q.z + nz * 0.03 * f, ex = rx * f * bw / 2, ez = rz * f * bw / 2;
        sb.quad([cx - ex, gy + y0, cz - ez], [cx + ex, gy + y0, cz + ez], [cx + ex, gy + y0 + bh, cz + ez], [cx - ex, gy + y0 + bh, cz - ez], gate); }
      for (const sg of [-1, 1]) { const px = q.x + rx * sg * (bw / 2 + 0.08), pz = q.z + rz * sg * (bw / 2 + 0.08); mb.box(px - 0.08, px + 0.08, gy, gy + y0 + bh + 0.1, pz - 0.08, pz + 0.08, rgb('#2d2b33'), 'NSEWT'); phys.addCylinder(px, pz, 0.1, gy - 1, gy + 3.6); }
      mb.box(q.x - Math.abs(rx) * (bw / 2 + 0.16) - Math.abs(nx) * 0.06, q.x + Math.abs(rx) * (bw / 2 + 0.16) + Math.abs(nx) * 0.06, gy + y0 + bh, gy + y0 + bh + 0.1, q.z - Math.abs(rz) * (bw / 2 + 0.16) - Math.abs(nz) * 0.06, q.z + Math.abs(rz) * (bw / 2 + 0.16) + Math.abs(nz) * 0.06, rgb('#2d2b33'), 'NSEWTB');
    }
  }
  const g = new THREE.Group(); g.name = 'yokocho';
  const m = mb.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.08, name: 'yokocho' })); if (m) g.add(m);
  const add = (buf, mat, outline) => { const me = buf.mesh(mat); if (!me) return; if (!outline) ctx.noOutline(me); g.add(me); };
  add(sb, kit.sign, true); add(ib, kit.interior, false); add(lb, ctx.mat.emissive('#ffffff', 1.0, { map: S.tex }), false);
  return g;
}

/** A paper lantern: four textured faces around (u, v) from y0 up, half-width hw, height h. */
function lantern(buf, W, u, y0, v, hw, h, uv) {
  const y1 = y0 + h;
  buf.quad(W(u - hw, y0, v + hw), W(u + hw, y0, v + hw), W(u + hw, y1, v + hw), W(u - hw, y1, v + hw), uv);
  buf.quad(W(u + hw, y0, v - hw), W(u - hw, y0, v - hw), W(u - hw, y1, v - hw), W(u + hw, y1, v - hw), uv);
  buf.quad(W(u - hw, y0, v - hw), W(u - hw, y0, v + hw), W(u - hw, y1, v + hw), W(u - hw, y1, v - hw), uv);
  buf.quad(W(u + hw, y0, v + hw), W(u + hw, y0, v - hw), W(u + hw, y1, v - hw), W(u + hw, y1, v + hw), uv);
}

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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    geo.setIndex(this.I); geo.computeBoundingSphere();
    return new THREE.Mesh(geo, mat);
  }
}
