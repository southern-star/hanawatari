// 花渡市（仮）— the built city, generated deterministically from the plan: special sites, local streets and alleys
// (a jittered grid per district, aligned to its main road), blocks, lots and one building per lot. Pure data.
//   generateUrban() → { raster, sites, streets, blocks, lots, buildings, byChunk, stats }
// Coordinates: world metres. A building's footprint is a rectangle centred on (x, z): w along its local x (the
// street frontage) × d along its local z (depth), rotated by rot (three.js rotation.y). Its front is local +Z
// (the project's model-forward convention) and faces the street.
import { MAP, heightAt } from './terrain.js';
import { DISTRICTS } from './districts.js';
import { prng, pointInPolygon } from './geom.js';
import { buildRaster, K, RES } from './raster.js';
import { cleanStreets } from './streets.js';
import { buildNetwork } from './network.js';

const NOBUILD = 2;                     // raster owner code: free ground kept clear round a junction

export const CHUNK = 120;
export const chunkOf = (x, z) => [Math.floor((x - MAP.x0) / CHUNK), Math.floor((z - MAP.z0) / CHUNK)];
export const chunkKey = (ci, cj) => ci + ',' + cj;
export const CHUNKS_N = Math.ceil((MAP.x1 - MAP.x0) / CHUNK);   // 25

// ------------------------------------------------------------------ special sites (not cut into lots)
/** 花渡駅's east–west free passage at ground level: from the west exit to the east atrium, under the 汐見線 viaduct
 *  between its portal columns (built by city/concourse.js). */
export const PASSAGE = { x0: -556, x1: -342, z0: -156.8, z1: -147.2,
  // the ticket gates' recesses off its north side: x0, x1, gate line z, back of the paid concourse z
  central: { x0: -465, x1: -441, zg: -158.6, zb: -173 },          // 中央改札, under 東和本線
  east: { x0: -403, x1: -387, zg: -158.6, zb: -164 } };            // 東口改札 (汐見線)
/** kind: 'station' (building + plazas), 'park', 'cemetery', 'school', 'university', 'temple', 'shrine', 'mall'. */
export const SITES = [
  // the station: rect is the whole station quarter (names, map); only `parts` are reserved (tracks + station
  // buildings, the west house, the east and west squares) — the rest of the quarter is built up like the town
  { id: 'hub', name: '花渡駅（駅ビル・東西の駅前広場）', kind: 'station', rect: [-600, -290, -262, 40],
    parts: [[-474, -262, -345, -60], [-556, -205, -474, -96], [-348, -250, -256.5, 8], [-600, -205, -556, 8]] },
  { id: 'hub-dept', name: '花渡百貨店', kind: 'dept', rect: [-432, -56, -348, 4] },
  { id: 'hub-hotel', name: 'ホテル花渡', kind: 'hotel', rect: [-338, -292, -290, -258] },
  { id: 'koen', name: '見晴台公園', kind: 'park', rect: [-965, 80, -812, 232] },
  { id: 'reien', name: '見晴霊園', kind: 'cemetery', rect: [-1214, -420, -1010, -130] },
  { id: 'univ', name: '花渡大学', kind: 'university', rect: [-560, -745, -335, -565] },
  { id: 'mall', name: '花渡北口モール', kind: 'mall', rect: [-272, -560, -120, -445] },
  { id: 'school-honcho', name: '本町小学校', kind: 'school', rect: [380, 424, 505, 534] },
  { id: 'school-minami', name: '南花渡中学校', kind: 'school', rect: [180, 1235, 320, 1345] },
  { id: 'school-plateau', name: '見晴台高校', kind: 'school', rect: [-1466, 990, -1326, 1110] },
  { id: 'park-canal', name: '汐見運河公園', kind: 'park', rect: [905, 640, 1020, 790] },
  { id: 'park-minami', name: '南花渡公園', kind: 'park', rect: [640, 990, 790, 1100] },
  { id: 'park-kita', name: '北岸公園', kind: 'park', rect: [-640, -1480, -330, -1395] },
  { id: 'temple-1', name: '見晴寺', kind: 'temple', rect: [-1410, -715, -1335, -640] },
  { id: 'temple-2', name: '月光院', kind: 'temple', rect: [-1185, -770, -1120, -705] },
  { id: 'temple-3', name: '宿場の寺（花渡寺）', kind: 'temple', rect: [-160, 350, -95, 420] },
  { id: 'shrine-1', name: '見晴稲荷', kind: 'shrine', rect: [-905, -610, -865, -570] },
];

// ------------------------------------------------------------------ district urban parameters
// theta: grid rotation (deg), origin: a point the grid is anchored to (usually on the district's main road),
// cell: street spacing [along u, along v] (m), street: local street width (m), drop: chance a street segment is
// missing (T-junctions, merged blocks), alley: chance a block is split by a 2 m alley, lot: frontage range (m),
// minDepth: minimum lot depth for two rows back to back, set: front setback range, gap: side gap range.
export const URBAN = {
  hub: { theta: 0, origin: [-451, -150], cell: [54, 42], street: 6, jitter: 0.16, drop: 0.12, alley: 0.25, lot: [7, 13], minDepth: 12, set: [0, 0.3], gap: [0, 0.4], mix: 'downtown' },
  kitaguchi: { theta: 0, origin: [-450, -600], cell: [118, 92], street: 10, jitter: 0.08, drop: 0.05, alley: 0, lot: [34, 62], minDepth: 34, set: [4, 9], gap: [6, 12], mix: 'redevelopment' },
  shuku: { theta: 0, origin: [-250, 0], cell: [80, 84], street: 5, jitter: 0.12, drop: 0.1, alley: 0.2, lot: [6, 10], minDepth: 15, set: [0, 0.2], gap: [0, 0.3], mix: 'oldtown' },
  gaketa: { theta: 0, origin: [-620, 0], cell: [46, 40], street: 4, jitter: 0.2, drop: 0.15, alley: 0.2, lot: [6, 9], minDepth: 10, set: [0, 0.6], gap: [0.3, 0.8], mix: 'hillfoot' },
  shitamachi: { theta: 2, origin: [0, 20], cell: [46, 34], street: 4.5, jitter: 0.2, drop: 0.12, alley: 0.3, lot: [6, 9.5], minDepth: 11, set: [0, 0.5], gap: [0.2, 0.8], mix: 'shitamachi' },
  canal: { theta: -1, origin: [1070, 0], cell: [86, 62], street: 7, jitter: 0.12, drop: 0.08, alley: 0, lot: [18, 36], minDepth: 20, set: [0.5, 2], gap: [1, 3], mix: 'canal' },
  minami: { theta: 0, origin: [0, 1160], cell: [72, 36], street: 6, jitter: 0.1, drop: 0.08, alley: 0.1, lot: [9, 13], minDepth: 14, set: [1, 3], gap: [0.8, 1.6], mix: 'residential' },
  teramachi: { theta: 0, origin: [-1230, -300], cell: [64, 52], street: 5, jitter: 0.15, drop: 0.1, alley: 0.1, lot: [12, 20], minDepth: 16, set: [1.5, 4], gap: [1.5, 3], mix: 'plateau' },
  'miharashi-s': { theta: 4, origin: [-1300, 800], cell: [66, 42], street: 5, jitter: 0.15, drop: 0.1, alley: 0.1, lot: [11, 17], minDepth: 15, set: [1.5, 3.5], gap: [1.2, 2.5], mix: 'plateau' },
  kita: { theta: -3, origin: [0, -1345], cell: [150, 110], street: 9, jitter: 0.08, drop: 0.05, alley: 0, lot: [70, 130], minDepth: 50, set: [6, 12], gap: [8, 14], mix: 'estate' },
};

// ------------------------------------------------------------------ building mixes
// Each entry: [weight, kind, floors [min,max], roof, styles, walls]. Colours are sRGB hex (pastel / neutral).
const WALLS = {
  plaster: ['#e9e1d2', '#e3d9c6', '#efe8dc', '#dcd3c3', '#e6dccb'], tile: ['#d8d2c7', '#cfc8bb', '#c9c2b6', '#ddd6c9'],
  siding: ['#d6d9d4', '#cfd6d8', '#e0d6c4', '#d9cfc0', '#c8cfc9', '#e2dccd'], wood: ['#9c7b5f', '#8a6b52', '#a88867', '#7d6350'],
  concrete: ['#c9c7c0', '#bebdb6', '#d2d0c8', '#b8b8b2'], white: ['#ece9e2', '#e5e3dc', '#f0ede6'], pastel: ['#e8d6cf', '#d8dfe6', '#e4dcc4', '#d5e0d2', '#e6d3d9'],
  brick: ['#b98c74', '#a97f6b', '#c29a80'], warehouse: ['#c2c6c4', '#b7bec2', '#cdc7ba', '#a9b3b5', '#c7bfae'],
};
const MIX = {
  downtown: [[45, 'zakkyo', [4, 9], 'flat', 'punched'], [22, 'shop', [2, 3], 'flat', 'punched'], [15, 'office', [6, 12], 'flat', 'ribbon'], [10, 'mansion', [8, 14], 'flat', 'balcony'], [8, 'izakaya', [1, 2], 'gable', 'small']],
  redevelopment: [[20, 'tower', [26, 42], 'flat', 'curtain'], [40, 'mansion', [10, 18], 'flat', 'balcony'], [25, 'office', [8, 16], 'flat', 'grid'], [15, 'plaza', [0, 0], 'flat', 'blank']],
  oldtown: [[52, 'machiya', [2, 2], 'gable', 'punched'], [10, 'kura', [2, 2], 'gable', 'slit'], [28, 'shop', [2, 3], 'flat', 'punched'], [10, 'house', [2, 2], 'hip', 'punched']],
  hillfoot: [[55, 'house', [2, 2], 'gable', 'punched'], [25, 'apartment', [2, 3], 'flat', 'balcony'], [20, 'shop', [2, 3], 'flat', 'punched']],
  shitamachi: [[50, 'house', [2, 2], 'hip', 'punched'], [18, 'shop', [2, 3], 'flat', 'punched'], [12, 'factory', [1, 2], 'saw', 'ribbon'], [15, 'apartment', [3, 5], 'flat', 'balcony'], [5, 'house', [3, 3], 'flat', 'punched']],
  canal: [[55, 'warehouse', [2, 4], 'flat', 'louver'], [20, 'factory', [1, 2], 'saw', 'ribbon'], [15, 'mansion', [6, 12], 'flat', 'balcony'], [10, 'office', [3, 6], 'flat', 'ribbon']],
  residential: [[62, 'house', [2, 2], 'hip', 'punched'], [25, 'apartment', [3, 5], 'flat', 'balcony'], [13, 'mansion', [7, 11], 'flat', 'balcony']],
  plateau: [[72, 'house', [2, 2], 'hip', 'punched'], [15, 'apartment', [2, 3], 'flat', 'balcony'], [8, 'mansion', [5, 8], 'flat', 'balcony'], [5, 'house', [3, 3], 'flat', 'punched']],
  estate: [[70, 'danchi', [5, 5], 'flat', 'balcony'], [30, 'danchi-tower', [11, 14], 'flat', 'balcony']],
};
const WALL_OF = {
  zakkyo: ['tile', 'concrete', 'pastel', 'white'], shop: ['tile', 'siding', 'pastel', 'white'], office: ['concrete', 'white', 'tile'], mansion: ['white', 'tile', 'pastel', 'brick'],
  izakaya: ['wood', 'plaster'], tower: ['white', 'concrete', 'tile'], machiya: ['wood', 'plaster'], kura: ['white'], house: ['siding', 'plaster', 'pastel', 'siding'],
  apartment: ['siding', 'tile', 'pastel', 'white'], factory: ['warehouse', 'concrete'], warehouse: ['warehouse', 'brick', 'concrete'], danchi: ['white', 'pastel'], 'danchi-tower': ['white', 'pastel'],
};
const ROOFS = { gable: ['#4a4f58', '#56677a', '#5a5553', '#6a5448', '#4d6457'], hip: ['#4a4f58', '#56677a', '#4d6457', '#5a5553', '#6a5448', '#7b8691'], saw: ['#8a939b', '#7b8691', '#9aa1a8'], flat: ['#b9bab4', '#aeb2ae', '#c2c0b8'] };
const GLASS = ['#3b5570', '#46607a', '#3d566b', '#4f6a80', '#34495e', '#5a7488'];
const STYLE_ID = { blank: 0, punched: 1, ribbon: 2, curtain: 3, grid: 4, balcony: 5, small: 7, louver: 9, slit: 10 };

// ------------------------------------------------------------------ helpers
function frameOf(theta, origin) {
  const t = theta * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return {
    rot: -t,
    w: (u, v) => [origin[0] + u * c - v * s, origin[1] + u * s + v * c],
    l: (x, z) => { const dx = x - origin[0], dz = z - origin[1]; return [dx * c + dz * s, -dx * s + dz * c]; },
  };
}
const pickW = (r, list) => { let tot = 0; for (const e of list) tot += e[0]; let x = r() * tot; for (const e of list) { x -= e[0]; if (x <= 0) return e; } return list[list.length - 1]; };

// ------------------------------------------------------------------ generate
let CACHE = null;
export function generateUrban() {
  if (CACHE) return CACHE;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const phases = {}; let tp = t0;
  const phase = (k) => { const t = typeof performance !== 'undefined' ? performance.now() : Date.now(); phases[k] = Math.round(t - tp); tp = t; };
  const R = buildRaster();
  phase('raster');
  // sites
  SITES.forEach((S, i) => {
    const kind = S.kind === 'park' || S.kind === 'cemetery' ? K.park : S.kind === 'station' ? K.plaza : K.special;
    for (const [x0, z0, x1, z1] of S.parts || [S.rect]) R.rect((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, kind, 1000 + i);
  });
  const streets = [], blocks = [], lots = [], buildings = [];
  const stats = { byDistrict: {} };

  for (let di = 0; di < DISTRICTS.length; di++) {
    const D = DISTRICTS[di], U = URBAN[D.id]; if (!U) continue;
    const r = prng(0x9e37 + di * 7919);
    const F = frameOf(U.theta, U.origin);
    // local bbox of the district
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of D.poly) { const [u, v] = F.l(Math.max(MAP.x0 - 40, Math.min(MAP.x1 + 40, x)), Math.max(MAP.z0 - 40, Math.min(MAP.z1 + 40, z))); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const lines = (a0, a1, step) => {
      const out = [0]; let p = 0; while (p > a0) { p -= step * (1 + U.jitter * (r() * 2 - 1)); out.unshift(p); }
      p = 0; while (p < a1) { p += step * (1 + U.jitter * (r() * 2 - 1)); out.push(p); }
      return out;
    };
    const us = lines(u0, u1, U.cell[0]), vs = lines(v0, v1, U.cell[1]);
    const inD = (u, v) => { const [x, z] = F.w(u, v); return pointInPolygon(x, z, D.poly) && x > MAP.x0 - 20 && x < MAP.x1 + 20 && z > MAP.z0 - 20 && z < MAP.z1 + 20; };
    const BLOCKING = new Set([K.rail, K.station, K.water, K.canal, K.scarp, K.valley, K.levee, K.flood, K.special, K.park, K.plaza, K.viaduct]);
    const trySeg = (ua, va, ub, vb, w, kind) => {
      if (!inD((ua + ub) / 2, (va + vb) / 2)) return null;
      const L = Math.hypot(ub - ua, vb - va), n = Math.max(2, Math.ceil(L / 2));
      let road = 0;
      for (let k = 0; k <= n; k++) {
        const [x, z] = F.w(ua + (ub - ua) * k / n, va + (vb - va) * k / n), kk = R.kindAt(x, z);
        if (BLOCKING.has(kk) && k > 0 && k < n) return null;
        if (kk === K.road) road++;
      }
      if (road > n * 0.6) return null;                              // runs along a planned road
      const a = F.w(ua, va), b = F.w(ub, vb);
      const seg = { id: streets.length, a, b, w, kind, district: D.id };
      streets.push(seg);                                            // stamped after the network clean-up
      return seg;
    };
    // streets along u (constant v) and along v (constant u)
    for (let j = 0; j < vs.length; j++) for (let i = 0; i + 1 < us.length; i++) if (!r.chance(U.drop)) trySeg(us[i], vs[j], us[i + 1], vs[j], U.street, 'street');
    for (let i = 0; i < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) if (!r.chance(U.drop)) trySeg(us[i], vs[j], us[i], vs[j + 1], U.street, 'street');
    // blocks
    const hs = U.street / 2 + 0.5;
    for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
      let bu0 = us[i] + hs, bu1 = us[i + 1] - hs, bv0 = vs[j] + hs, bv1 = vs[j + 1] - hs;
      if (bu1 - bu0 < 8 || bv1 - bv0 < 8) continue;
      // a block whose centre lies just across the district border is kept as an "edge" block: its lots only fill what
      // the neighbouring district's grid leaves over, so the seam between two street grids is not a vacant strip
      const inside = inD((bu0 + bu1) / 2, (bv0 + bv1) / 2);
      if (!inside && !(inD(bu0, bv0) || inD(bu1, bv0) || inD(bu0, bv1) || inD(bu1, bv1))) continue;
      const parts = [];
      // an alley splits the block along its long side
      if (inside && r.chance(U.alley) && Math.max(bu1 - bu0, bv1 - bv0) > 30) {
        if (bu1 - bu0 >= bv1 - bv0) { const m = (bu0 + bu1) / 2 + (r() - 0.5) * 6; if (trySeg(m, bv0 - hs, m, bv1 + hs, 2.2, 'alley')) { parts.push([bu0, m - 1.6, bv0, bv1], [m + 1.6, bu1, bv0, bv1]); } }
        else { const m = (bv0 + bv1) / 2 + (r() - 0.5) * 6; if (trySeg(bu0 - hs, m, bu1 + hs, m, 2.2, 'alley')) { parts.push([bu0, bu1, bv0, m - 1.6], [bu0, bu1, m + 1.6, bv1]); } }
      }
      if (!parts.length) parts.push([bu0, bu1, bv0, bv1]);
      for (const p of parts) blocks.push({ id: blocks.length, district: D.id, di, F, U, rect: p, edge: !inside });
    }
  }
  phase('grids');
  // ---- the street network: joined up with the planned roads and across district seams, then stamped
  { const clean = cleanStreets(streets, R);
    phase('cleanStreets');
    streets.length = 0;
    for (const st of clean) {
      streets.push(st);
      const [ax, az] = st.a, [bx, bz] = st.b, len = Math.hypot(bx - ax, bz - az);
      R.rect((ax + bx) / 2, (az + bz) / 2, len / 2 + st.w / 2, st.w / 2, -Math.atan2(bz - az, bx - ax), K.street);
    }
  }
  // the junctions (kerb returns, corner sidewalks) are street space too: nothing is built on them
  const net = buildNetwork(streets);
  phase('network');
  for (const nd of net.nodes) {
    if (nd.plain || !nd.fills) continue;
    // stamped as drawn; a ring 1.2 m wider is kept free of buildings without changing the ground's colour
    const grow = (p) => { const dx = p[0] - nd.x, dz = p[1] - nd.z, l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * 1.2, p[1] + dz / l * 1.2]; };
    const road = nd.arms.some(a => a.kind === 'road');
    for (const poly of [...nd.fills.map(f => f.verts), ...nd.walks.map(wk => [...wk.kerb, ...wk.outer])]) {
      R.poly(poly.map(v => v.p), (i, j) => R.set(i, j, K.street));
      if (road) R.poly(poly.map(v => grow(v.p)), (i, j, k) => { if (R.kind[k] === K.free) R.owner[k] = NOBUILD; });
    }
  }

  phase('junctionStamps');
  // ---- lots and buildings per block (after all streets are stamped, so frontage detection sees them). Every lot
  // claims its ground in `occ`; the edge blocks come in a second pass and only take ground nobody has claimed.
  const occ = new Uint8Array(R.kind.length);
  const cover = (cx, cz, hw, hd, rot, claim = false) => {   // fraction of the rect that is free, unclaimed ground
    const c = Math.cos(rot), s = Math.sin(rot); let n = 0, ok = 0;
    for (let u = -hw + RES / 2; u < hw; u += RES) for (let v = -hd + RES / 2; v < hd; v += RES) {
      const k = R.idx(cx + u * c + v * s, cz - u * s + v * c); n++;
      if (k < 0) continue;
      if (claim) occ[k] = 1; else if (R.kind[k] === K.free && R.owner[k] !== NOBUILD && !occ[k]) ok++;
    }
    return n ? ok / n : 0;
  };
  // and an exact footprint test against the buildings already standing (two grids' lots may still overlap a little);
  // each building sits in every 16 m hash cell its bounding circle touches
  const BH = new Map(), BC = 16, FEET = [];
  const foot = (b) => { const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2 - 0.15, hd = b.d / 2 - 0.15; return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [b.x + u * c + v * s, b.z - u * s + v * c]); };
  const apart = (P, Q) => {
    for (const E of [P, Q]) for (let i = 0; i < 2; i++) {
      const ax = -(E[i + 1][1] - E[i][1]), az = E[i + 1][0] - E[i][0];
      let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
      for (const [x, z] of P) { const d = x * ax + z * az; p0 = Math.min(p0, d); p1 = Math.max(p1, d); }
      for (const [x, z] of Q) { const d = x * ax + z * az; q0 = Math.min(q0, d); q1 = Math.max(q1, d); }
      if (p1 < q0 || q1 < p0) return true;
    }
    return false;
  };
  const standsFree = (b) => {
    const P = foot(b), rb = Math.hypot(b.w, b.d) / 2;
    const i0 = Math.floor((b.x - rb) / BC), i1 = Math.floor((b.x + rb) / BC), j0 = Math.floor((b.z - rb) / BC), j1 = Math.floor((b.z + rb) / BC);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const o of BH.get(i * 8192 + j) || []) {
      if (Math.hypot(o.x - b.x, o.z - b.z) < rb + o.rb && !apart(P, FEET[o.id])) return false;
    }
    FEET[b.id] = P;
    const e = { id: b.id, x: b.x, z: b.z, rb };
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 8192 + j; let a = BH.get(k); if (!a) BH.set(k, (a = [])); a.push(e); }
    return true;
  };
  // a lot may still lie up to 10 % on a road (and its 2 m sampling misses slivers): pull each side of the footprint in
  // off roads / streets 1 m at a time (at most 30 % of a side), or give the building up
  const onFree = (x, z, w, d, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot); let n = 0, ok = 0;
    for (let u = -w / 2 + 0.5; u < w / 2; u += 1) for (let v = -d / 2 + 0.5; v < d / 2; v += 1) { const k = R.idx(x + u * c + v * s, z - u * s + v * c); n++; if (k >= 0 && R.kind[k] === K.free && R.owner[k] !== NOBUILD) ok++; }
    return n ? ok / n : 0;
  };
  const fitFoot = (x, z, w, d, rot) => {
    if (onFree(x, z, w, d, rot) >= 0.97) return [x, z, w, d];
    const c = Math.cos(rot), s = Math.sin(rot), w0 = w, d0 = d, at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
    let cu = 0, cv = 0;
    for (let it = 0; it < 14; it++) {
      let moved = false;
      for (const [su, sv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [sx, sz] = at(cu + su * (w / 2 - 0.5), cv + sv * (d / 2 - 0.5));
        if (onFree(sx, sz, su ? 1 : w, sv ? 1 : d, rot) < 0.99) { if (su) { w -= 1; cu -= su * 0.5; } else { d -= 1; cv -= sv * 0.5; } moved = true; }
      }
      if (w < Math.max(4, w0 * 0.7) || d < Math.max(4, d0 * 0.7)) return null;
      const [X, Z] = at(cu, cv);
      if (onFree(X, Z, w, d, rot) >= 0.97) return [X, Z, w, d];
      if (!moved) return null;
    }
    return null;
  };
  for (const pass of [false, true]) for (const B of blocks) {
    if (!!B.edge !== pass) continue;
    const { F, U } = B, r = prng(0x51ed + B.id * 104729);
    let [bu0, bu1, bv0, bv1] = B.rect;
    // pull each side of the block in off a planned road, railway or earlier lots running along it (2 m at a time)
    const strip = (a0, a1, b0, b1) => { const [x, z] = F.w((a0 + a1) / 2, (b0 + b1) / 2); return cover(x, z, (a1 - a0) / 2, (b1 - b0) / 2, F.rot); };
    for (let k = 0; k < 10 && bv1 - bv0 > 10 && strip(bu0, bu1, bv0, bv0 + 2) < 0.5; k++) bv0 += 2;
    for (let k = 0; k < 10 && bv1 - bv0 > 10 && strip(bu0, bu1, bv1 - 2, bv1) < 0.5; k++) bv1 -= 2;
    for (let k = 0; k < 10 && bu1 - bu0 > 10 && strip(bu0, bu0 + 2, bv0, bv1) < 0.5; k++) bu0 += 2;
    for (let k = 0; k < 10 && bu1 - bu0 > 10 && strip(bu1 - 2, bu1, bv0, bv1) < 0.5; k++) bu1 -= 2;
    const side = (which) => {   // is there a street/road just outside this side?
      let n = 0, hit = 0;
      const probe = (u, v) => { const [x, z] = F.w(u, v); const k = R.kindAt(x, z); n++; if (k === K.street || k === K.road) hit++; };
      if (which === 'v-') for (let u = bu0 + 1; u < bu1; u += 2) probe(u, bv0 - 2.5);
      if (which === 'v+') for (let u = bu0 + 1; u < bu1; u += 2) probe(u, bv1 + 2.5);
      if (which === 'u-') for (let v = bv0 + 1; v < bv1; v += 2) probe(bu0 - 2.5, v);
      if (which === 'u+') for (let v = bv0 + 1; v < bv1; v += 2) probe(bu1 + 2.5, v);
      return n ? hit / n : 0;
    };
    const S = { 'v-': side('v-'), 'v+': side('v+'), 'u-': side('u-'), 'u+': side('u+') };
    const alongU = (bu1 - bu0) >= (bv1 - bv0);
    const W = alongU ? bu1 - bu0 : bv1 - bv0, Dp = alongU ? bv1 - bv0 : bu1 - bu0;
    const longA = alongU ? 'v-' : 'u-', longB = alongU ? 'v+' : 'u+';
    const rows = [];
    if (Dp >= 2 * U.minDepth) rows.push({ front: longA, d0: 0, d1: Dp / 2 }, { front: longB, d0: Dp / 2, d1: Dp });
    else rows.push({ front: S[longA] >= S[longB] ? longA : longB, d0: 0, d1: Dp });
    for (const row of rows) {
      // frontage split along the long side
      const cuts = [0]; let a = 0;
      while (W - a > U.lot[0] * 1.6) { a += r.range(U.lot[0], U.lot[1]); if (W - a < U.lot[0] * 0.8) break; cuts.push(a); }
      cuts.push(W);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const a0 = cuts[k], a1 = cuts[k + 1];
        // lot rect in block-local (along a, depth d) -> (u,v)
        let lu0, lu1, lv0, lv1;
        if (alongU) { lu0 = bu0 + a0; lu1 = bu0 + a1; lv0 = bv0 + row.d0; lv1 = bv0 + row.d1; }
        else { lv0 = bv0 + a0; lv1 = bv0 + a1; lu0 = bu0 + row.d0; lu1 = bu0 + row.d1; }
        // a planned road, a railway or the neighbouring grid cutting into the lot: trim it (depth from either
        // end first, then the frontage) rather than leaving the plot empty
        const fitsIn = (a0, a1, b0, b1) => { const [x, z] = F.w((a0 + a1) / 2, (b0 + b1) / 2); return cover(x, z, (a1 - a0) / 2, (b1 - b0) / 2, F.rot) >= 0.9; };
        if (!fitsIn(lu0, lu1, lv0, lv1)) {
          const [x, z] = F.w((lu0 + lu1) / 2, (lv0 + lv1) / 2);
          if (cover(x, z, (lu1 - lu0) / 2, (lv1 - lv0) / 2, F.rot) < 0.45) continue;   // mostly taken: no trim will do
          let hit = null;
          const tries = [];
          for (let cut = 2; cut <= 12; cut += 2) tries.push(alongU ? [0, 0, cut, 0] : [cut, 0, 0, 0], alongU ? [0, 0, 0, cut] : [0, cut, 0, 0]);
          for (let cut = 2; cut <= 6; cut += 2) tries.push(alongU ? [cut, 0, 0, 0] : [0, 0, cut, 0], alongU ? [0, cut, 0, 0] : [0, 0, 0, cut]);
          for (const [a, b, c, d] of tries) {
            const r0 = [lu0 + a, lu1 - b, lv0 + c, lv1 - d], dep = alongU ? r0[3] - r0[2] : r0[1] - r0[0], wid = alongU ? r0[1] - r0[0] : r0[3] - r0[2];
            if (dep < U.minDepth * 0.6 || wid < U.lot[0] * 0.7) continue;
            if (fitsIn(...r0)) { hit = r0; break; }
          }
          if (!hit) continue;
          [lu0, lu1, lv0, lv1] = hit;
        }
        const cu = (lu0 + lu1) / 2, cv = (lv0 + lv1) / 2, [cx, cz] = F.w(cu, cv);
        const hw = (lu1 - lu0) / 2, hd = (lv1 - lv0) / 2;
        cover(cx, cz, hw, hd, F.rot, true);
        const lot = { id: lots.length, block: B.id, district: B.district, x: cx, z: cz, w: lu1 - lu0, d: lv1 - lv0, rot: F.rot, front: row.front, street: S[row.front] > 0.3 };
        lots.push(lot);
        // ---- building
        const mix = MIX[U.mix]; let e = pickW(r, mix);
        // big lots in dense districts: bigger buildings; tiny lots: houses / shops
        const frontW = alongU ? lot.w : lot.d, depth = alongU ? lot.d : lot.w;
        if (U.mix === 'downtown' && frontW > 11 && r.chance(0.35)) e = mix.find(m => m[1] === 'office') || e;
        if ((e[1] === 'mansion' || e[1] === 'office' || e[1] === 'apartment' || e[1] === 'tower') && frontW < 8.5) e = mix.find(m => m[1] === 'house' || m[1] === 'shop' || m[1] === 'zakkyo' || m[1] === 'machiya') || e;
        const kind = e[1];
        if (kind === 'plaza') { lot.open = 'plaza'; continue; }
        if (U.mix === 'estate') { estateSlabs(lot, alongU, F, cu, cv, r, e); continue; }
        const setF = r.range(U.set[0], U.set[1]), gap = r.range(U.gap[0], U.gap[1]);
        const rear = Math.min(depth * 0.25, kind === 'house' ? r.range(1.5, 4) : r.range(0.3, 1.5));
        let fw = frontW - gap, fd = depth - setF - rear;
        if (kind === 'danchi' || kind === 'danchi-tower') { fd = Math.min(fd, kind === 'danchi' ? 11 : 16); fw = Math.min(fw, kind === 'danchi' ? r.range(40, 60) : r.range(24, 32)); }
        if (kind === 'tower') { fw = Math.min(fw, r.range(26, 36)); fd = Math.min(fd, r.range(24, 32)); }
        if (kind === 'house' && fd > 13) fd = r.range(9, 13);
        if (fw < 4 || fd < 4) continue;
        // footprint centre: pushed to the front of the lot
        let du, dv;
        if (alongU) { du = 0; dv = (row.front === 'v-' ? (lv0 + setF + fd / 2) : (lv1 - setF - fd / 2)) - cv; }
        else { dv = 0; du = (row.front === 'u-' ? (lu0 + setF + fd / 2) : (lu1 - setF - fd / 2)) - cu; }
        let [bx, bz] = F.w(cu + du, cv + dv);
        // front direction in local frame -> building rotation so that local -z (front) faces the street
        const frontRot = { 'v-': Math.PI, 'v+': 0, 'u-': -Math.PI / 2, 'u+': Math.PI / 2 }[row.front];
        const rot = F.rot + frontRot;
        const floors = r.int(e[2][0], e[2][1]);
        const fh = kind === 'house' || kind === 'machiya' || kind === 'kura' ? r.range(2.8, 3.0) : kind === 'factory' || kind === 'warehouse' ? r.range(4.2, 5.5) : kind === 'office' || kind === 'tower' ? r.range(3.6, 4.0) : r.range(3.0, 3.3);
        const g1 = kind === 'shop' || kind === 'zakkyo' || kind === 'office' || kind === 'tower' || kind === 'mansion' ? r.range(3.8, 4.6) : fh;
        const h = g1 + (floors - 1) * fh;
        const wallSet = WALLS[r.pick(WALL_OF[kind] || ['plaster'])];
        const fit = fitFoot(bx, bz, fw, fd, rot); if (!fit) continue;
        [bx, bz, fw, fd] = fit;
        const y = heightAt(bx, bz);
        const b = {
          id: buildings.length, lot: lot.id, district: B.district, kind, x: bx, z: bz, y, w: fw, d: fd, rot, floors, fh, g1, h,
          roof: e[3], style: STYLE_ID[e[4]] ?? 1, wall: r.pick(wallSet), glass: r.pick(GLASS), roofCol: r.pick(ROOFS[e[3]] || ROOFS.flat),
          shop: lot.street && (kind === 'shop' || kind === 'zakkyo' || kind === 'izakaya' || (kind === 'house' && U.mix === 'shitamachi' && r.chance(0.15)) || (kind === 'machiya' && r.chance(0.6))),
          seed: Math.floor(r() * 1e9),
        };
        if (!standsFree(b)) continue;
        const [ci, cj] = chunkOf(bx, bz); b.chunk = chunkKey(ci, cj);
        buildings.push(b);
      }
    }
  }
  /** 団地: rows of 5-storey slabs (sometimes an 11–14 storey block), all facing south, 26–30 m apart. */
  function estateSlabs(lot, alongU, F, cu, cv, r) {
    const W = lot.w - 8, Dd = lot.d - 8;                         // lot-local u (w) and v (d) extents inside a margin
    const rows = Math.max(1, Math.floor((Dd - 11) / 28) + 1), rowGap = rows > 1 ? (Dd - 11) / (rows - 1) : 0;
    for (let ri = 0; ri < rows; ri++) {
      const tower = r.chance(0.18), L = tower ? r.range(24, 34) : r.range(42, 62), dep = tower ? 15 : 11;
      const cols = Math.max(1, Math.floor((W + 10) / (L + 10)));
      const span = cols * L + (cols - 1) * 10;
      for (let ci = 0; ci < cols; ci++) {
        const u = cu - span / 2 + L / 2 + ci * (L + 10), v = cv - Dd / 2 + dep / 2 + ri * rowGap;
        const [bx, bz] = F.w(u, v);
        const floors = tower ? r.int(11, 14) : 5, fh = 2.75, h = fh * floors;
        if (onFree(bx, bz, L, dep, F.rot) < 0.97) continue;                   // not onto the levee, a viaduct, the water
        const b = { id: buildings.length, lot: lot.id, district: lot.district, kind: tower ? 'danchi-tower' : 'danchi', x: bx, z: bz, y: heightAt(bx, bz), w: L, d: dep, rot: F.rot,
          floors, fh, g1: fh, h, roof: 'flat', style: STYLE_ID.balcony, wall: r.pick(WALLS[r.pick(['white', 'pastel', 'white'])]), glass: r.pick(GLASS), roofCol: r.pick(ROOFS.flat), shop: false, seed: Math.floor(r() * 1e9) };
        if (!standsFree(b)) continue;
        const [cci, ccj] = chunkOf(bx, bz); b.chunk = chunkKey(cci, ccj);
        buildings.push(b);
      }
    }
  }
  // ---- buildings of the special sites (station complex, campus, mall, schools, temples, shrine)
  const special = (siteId, kind, x0, z0, x1, z1, floors, o = {}) => {
    const r = prng(0x517e + buildings.length * 131), w = x1 - x0, d = z1 - z0, fh = o.fh || 3.8;
    const front = o.front || 'S', rot = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }[front];
    const bw = front === 'E' || front === 'W' ? d : w, bd = front === 'E' || front === 'W' ? w : d;
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2, g1 = o.g1 || fh + 0.8;
    const b = { id: buildings.length, lot: -1, site: siteId, district: DISTRICTS.find(D => pointInPolygon(x, z, D.poly))?.id || 'hub', kind, x, z, y: heightAt(x, z) + (o.base || 0), w: bw, d: bd, rot,
      floors, fh, g1, h: g1 + (floors - 1) * fh, roof: o.roof || 'flat', style: STYLE_ID[o.style || 'ribbon'], wall: o.wall || r.pick(WALLS.white), glass: o.glass || r.pick(GLASS), roofCol: o.roofCol || r.pick(ROOFS.flat),
      shop: !!o.shop, seed: Math.floor(r() * 1e9) };
    const [ci, cj] = chunkOf(x, z); b.chunk = chunkKey(ci, cj); buildings.push(b); return b;
  };
  // 花渡駅: the station building rises on both sides of the 汐見線 viaduct (4F level), joined by the concourse under it.
  // The east–west free passage (city/concourse.js, PASSAGE) runs through at ground level: the concourse block and the
  // west house stand either side of it, and over it only their upper storey (raised 5 m) bridges across.
  const PZ0 = PASSAGE.z0, PZ1 = PASSAGE.z1;
  special('hub', 'station', -432, -252, -345, -166, 7, { style: 'curtain', wall: '#dcdad3', glass: '#4f6a80', shop: true, front: 'E' });
  special('hub', 'station', -432, -140, -345, -60, 6, { style: 'ribbon', wall: '#e3ded2', glass: '#46607a', shop: true, front: 'E' });
  const EGx0 = PASSAGE.east.x0, EGx1 = PASSAGE.east.x1;              // behind the 東口改札 its paid concourse, under a raised storey
  special('hub', 'station', -436, -164, EGx0, PZ0 - 2, 2, { style: 'curtain', wall: '#d9d6cc', glass: '#3d566b', front: 'E', fh: 4.2 });
  special('hub', 'station', EGx1, -164, -348, PZ0 - 2, 2, { style: 'curtain', wall: '#d9d6cc', glass: '#3d566b', front: 'E', fh: 4.2 });
  special('hub', 'station', EGx0, -164, EGx1, PZ0 - 2, 2, { style: 'curtain', wall: '#d9d6cc', glass: '#3d566b', front: 'E', fh: 4.2, g1: 0.2, base: 5.0 });
  special('hub', 'station', -436, PZ1, -348, -142, 2, { style: 'curtain', wall: '#d9d6cc', glass: '#3d566b', front: 'E', fh: 4.2 });
  special('hub', 'station', -436, PZ0 - 2, -348, PZ1, 2, { style: 'curtain', wall: '#d9d6cc', glass: '#3d566b', front: 'E', fh: 4.2, g1: 0.2, base: 5.0 });
  special('hub', 'station', -556, -205, -474, PZ0, 2, { style: 'ribbon', wall: '#e6e0d2', glass: '#46607a', shop: true, front: 'W', fh: 4.2 });
  special('hub', 'station', -556, PZ1, -474, -96, 2, { style: 'ribbon', wall: '#e6e0d2', glass: '#46607a', shop: true, front: 'W', fh: 4.2 });
  special('hub', 'station', -556, PZ0, -474, PZ1, 2, { style: 'ribbon', wall: '#e6e0d2', glass: '#46607a', front: 'W', fh: 4.2, g1: 0.2, base: 5.0 });
  // the department store joined to the station's south block (facing 本町通り) and the hotel over the east square
  special('hub-dept', 'dept', -430, -54, -350, 2, 8, { style: 'ribbon', wall: '#ece5d8', glass: '#4a5f73', shop: true, front: 'S', fh: 4.6 });
  special('hub-hotel', 'hotel', -336, -290, -292, -260, 17, { style: 'grid', wall: '#d9d3c7', glass: '#51687c', front: 'S', fh: 3.3 });
  // 花渡大学: four teaching buildings round a quad; 北口モール; schools (main building + gym); temple halls; shrine
  special('univ', 'univ', -555, -740, -500, -722, 6, { style: 'grid', wall: '#c9b8a4' });
  special('univ', 'univ', -440, -740, -340, -722, 5, { style: 'grid', wall: '#d2c4b2' });
  special('univ', 'univ', -555, -600, -516, -572, 7, { style: 'curtain', wall: '#d8d6d0' });
  special('univ', 'univ', -370, -700, -345, -590, 4, { style: 'grid', wall: '#c9b8a4', front: 'W' });
  special('mall', 'mall', -267, -555, -125, -450, 4, { style: 'ribbon', wall: '#e8e2d6', fh: 5, shop: true });
  for (const S of SITES) {
    const [x0, z0, x1, z1] = S.rect;
    if (S.kind === 'school') { special(S.id, 'school', x0 + 8, z1 - 22, x1 - 8, z1 - 6, 4, { style: 'ribbon', wall: '#e6e1d6', front: 'N' }); special(S.id, 'gym', x1 - 38, z0 + 8, x1 - 8, z0 + 38, 1, { style: 'louver', fh: 9, wall: '#cfd3d4', roof: 'gable', roofCol: '#7b8691' }); }
    if (S.kind === 'temple') special(S.id, 'temple', (x0 + x1) / 2 - 11, z0 + 12, (x0 + x1) / 2 + 11, z0 + 32, 1, { style: 'blank', fh: 6, wall: '#8a6b52', roof: 'hip', roofCol: '#4a4f58' });
    if (S.kind === 'shrine') special(S.id, 'shrine', (x0 + x1) / 2 - 5, z0 + 8, (x0 + x1) / 2 + 5, z0 + 18, 1, { style: 'blank', fh: 4.5, wall: '#b8573f', roof: 'gable', roofCol: '#4d6457' });
  }
  // index by chunk
  const byChunk = new Map();
  const put = (key, kind, item) => { let c = byChunk.get(key); if (!c) byChunk.set(key, (c = { buildings: [], streets: [], lots: [] })); c[kind].push(item); };
  for (const b of buildings) put(b.chunk, 'buildings', b);
  for (const l of lots) { const [ci, cj] = chunkOf(l.x, l.z); put(chunkKey(ci, cj), 'lots', l); }
  for (const s of streets) {
    const n = Math.max(1, Math.ceil(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / (CHUNK / 2))), seen = new Set();
    for (let k = 0; k <= n; k++) { const x = s.a[0] + (s.b[0] - s.a[0]) * k / n, z = s.a[1] + (s.b[1] - s.a[1]) * k / n, [ci, cj] = chunkOf(x, z), key = chunkKey(ci, cj); if (!seen.has(key)) { seen.add(key); put(key, 'streets', s); } }
  }
  for (const D of DISTRICTS) stats.byDistrict[D.id] = { buildings: 0, lots: 0, streets: 0 };
  for (const b of buildings) stats.byDistrict[b.district].buildings++;
  for (const l of lots) stats.byDistrict[l.district].lots++;
  for (const s of streets) stats.byDistrict[s.district].streets++;
  phase('lotsBuildings');
  // ---- 花渡銀座: the east–west street between 駅前通り and 本町通り from 宿場町通り to the next cross street is an
  // arcade (アーケード商店街); every building fronting it keeps a shop on its ground floor
  const arcades = [];
  { const pcs = streets.filter(st => st.kind === 'street' && Math.abs(st.a[1] - st.b[1]) < 1 && (st.a[1] + st.b[1]) / 2 > -82 && (st.a[1] + st.b[1]) / 2 < -58 && Math.min(st.a[0], st.b[0]) > -250 && Math.max(st.a[0], st.b[0]) < -80);
    if (pcs.length) {
      const zs = pcs.map(st => (st.a[1] + st.b[1]) / 2).sort((a, b) => a - b), z = zs[Math.floor(zs.length / 2)];
      const x0 = Math.min(...pcs.map(st => Math.min(st.a[0], st.b[0]))), x1 = Math.max(...pcs.map(st => Math.max(st.a[0], st.b[0])));
      const A = { id: 'ginza', name: '花渡銀座', kana: 'はなわたりぎんざ', z, x0: Math.max(x0, -236), x1, w: pcs[0].w };
      arcades.push(A);
      for (const st of pcs) if (Math.max(st.a[0], st.b[0]) > A.x0 + 1 && Math.min(st.a[0], st.b[0]) < A.x1 - 1) st.arcade = A.id;   // pedestrians only
      for (const b of buildings) {
        if (b.site || b.district !== 'hub') continue;
        const c = Math.cos(b.rot), s2 = Math.sin(b.rot), fx = b.x + s2 * b.d / 2, fz = b.z + c * b.d / 2;
        if (Math.abs(c) > 0.7 && Math.abs(fz - z) < A.w / 2 + 3 && fx > A.x0 - 3 && fx < A.x1 + 3) { b.shop = true; b.arcade = A.id; }
      }
    }
  }
  stats.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  stats.phases = phases;
  for (const B of blocks) { delete B.F; delete B.U; }
  CACHE = { raster: R, sites: SITES, streets, blocks, lots, buildings, byChunk, stats, net, arcades };
  return CACHE;
}
