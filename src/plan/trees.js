// Tree placements (pure data): the sakura of 花渡 — both shoulders of the 桜堤 (south levee), the tunnel of blossom
// over the 鈴音川, 見晴台公園 on the cliff, the avenue of 見晴霊園, school grounds and parks — and street trees
// (ginkgo / zelkova) on the sidewalks of the main roads. Each tree: { x, z, kind, rot, s (scale), v (variant 0..1),
// lean: [dx,dz] toward open space }. Indexed by 120 m chunk.
import { RIVER, VALLEY, riverOffset, heightAt } from './terrain.js';
import { K } from './raster.js';
import { ROADS } from './roads.js';
import { LINES } from './rail.js';
import { prng } from './geom.js';
import { chunkOf, chunkKey, SITES } from './urban.js';
import { network, roadSpaceAt } from './network.js';

const RAIL_CLEAR = { jr: 15, private: 8, metro: 8, tram: 5.5, agt: 6.5 };
const NOT_ON = new Set([K.road, K.street, K.rail, K.station, K.viaduct, K.water, K.canal]);

let CACHE = null;
export function generateTrees(raster) {
  if (CACHE) return CACHE;
  const trees = [], r = prng(0x7a3c1);
  const add = (x, z, kind, lean = [0, 0], s = 1) => trees.push({ x, z, kind, rot: r() * Math.PI * 2, s: s * r.range(0.9, 1.08), v: r(), lean });
  // keep clear of every road / railway that crosses the levee or the valley
  const crossers = [...ROADS, ...LINES];
  const clear = (x, z, d) => !crossers.some(f => f.align.nearest(x, z, d + (f.w ? f.w / 2 : RAIL_CLEAR[f.kind] ?? 7)))
    && !roadSpaceAt(x, z, 2) && !(raster && (NOT_ON.has(raster.kindAt(x, z)) || raster.headAt(x, z) < 25));

  // ---- 桜堤: both shoulders of the south levee crest, x −950 … 700
  { const A = RIVER.align, s0 = A.sOf(-950, -1000), s1 = A.sOf(700, -930), crest = riverOffset('S', 'crest');
    for (let s = s0; s < s1; s += 9) for (const [off, lean] of [[-8.5, -1], [8.5, 1]]) {
      const [x, z] = A.offset(s + (off > 0 ? 4.5 : 0) + r.range(-1, 1), crest + off + r.range(-0.6, 0.6));
      if (!clear(x, z, 6)) continue;
      const q = A.at(s); add(x, z, 'sakura-levee', [-q.hz * lean, q.hx * lean]);
    } }
  // ---- 鈴音川: a row on each bank, crowns meeting over the stream (the tram runs along the south bank)
  { const A = VALLEY.align, s0 = A.sOf(-1500, 330), s1 = A.sOf(-820, 257);
    for (let s = s0; s < s1; s += 8) for (const [off, lean] of [[-9, 1], [7, -1]]) {
      const [x, z] = A.offset(s + (off > 0 ? 4 : 0) + r.range(-1, 1), off + r.range(-0.8, 0.8));
      if (!clear(x, z, 3)) continue;
      const q = A.at(s); add(x, z, 'sakura-valley', [-q.hz * lean, q.hx * lean]);
    } }
  // ---- sites: park groves, the cemetery avenue, school grounds
  const siteOK = (x, z) => !roadSpaceAt(x, z, 1.5) && !(raster && (NOT_ON.has(raster.kindAt(x, z)) || raster.headAt(x, z) < 25));
  for (const S of SITES) {
    const [x0, z0, x1, z1] = S.rect;
    if (S.kind === 'park') {
      const n = Math.round((x1 - x0) * (z1 - z0) / 700);
      for (let i = 0; i < n; i++) { const x = r.range(x0 + 6, x1 - 6), z = r.range(z0 + 6, z1 - 6); if (siteOK(x, z) && !trees.some(t => Math.hypot(t.x - x, t.z - z) < 9)) add(x, z, 'sakura-park'); }
    } else if (S.kind === 'cemetery') {
      const cx = (x0 + x1) / 2; for (let z = z0 + 8; z < z1 - 8; z += 9) { if (siteOK(cx - 5.5, z)) add(cx - 5.5, z, 'sakura-park', [-1, 0]); if (siteOK(cx + 5.5, z + 4.5)) add(cx + 5.5, z + 4.5, 'sakura-park', [1, 0]); }
    } else if (S.kind === 'school') {
      for (let x = x0 + 8; x < x1 - 8; x += 10) { if (siteOK(x, z0 + 4)) add(x, z0 + 4, 'sakura-park'); }
    } else if (S.kind === 'temple' || S.kind === 'shrine') {
      const x = (x0 + x1) / 2 + r.range(-8, 8); if (siteOK(x, z1 - 8)) add(x, z1 - 8, 'sakura-park', [0, 0], 1.15);
    }
  }
  // ---- the station squares: sakura and keyaki in the east exit's north and south plazas and the west square
  for (const [x, z, k, sc] of [[-312, -25, 'sakura-park', 1.15], [-306, -2, 'zelkova', 0.9], [-284, 3, 'zelkova', 0.9], [-278, -17, 'sakura-park', 1.05], [-326, 2, 'zelkova', 0.85],
    [-320, -222, 'sakura-park', 1.1], [-299, -212, 'zelkova', 0.9], [-280, -219, 'sakura-park', 1.05], [-266, -238, 'zelkova', 0.85],
  ]) add(x, z, k, [0, 0], sc);
  // the west square's promenade: two rows of cherry trees (clear of the square in front of the exit, 汐見線 overhead)
  for (let z = -190; z <= 2; z += 12) if (!(z > -170 && z < -134)) for (const x of [-592, -571]) add(x, z, 'sakura-park', [0, 0], 0.95 + ((z * 7 + x) & 3) * 0.04);
  // tree rows in pits: along the forecourt's edge and the square's street side (clear of the deck and the drives)
  for (let z = -244; z < 6; z += 12) {
    if (!(z > -166 && z < -140)) add(-327.5, z, 'zelkova', [0, 0], 0.75);
    if (!(z > -160 && z < -114) && !(z > -76 && z < -52) && !(z > -86 && z < -44)) add(-259.5, z + 6, 'zelkova', [0, 0], 0.75);
  }
  // ---- street trees in the sidewalks of the national road, arterials and collectors (every ~14 m, in a tree pit
  // by the kerb): never in a junction or on its approach, on a bridge, by a level crossing or across a side street
  const N = network();
  if (N) for (const w of N.ways) {
    if (w.kind !== 'road' || w.sw < 2.5) continue;
    const tram = w.R.id === 'honcho', off = w.cw + Math.min(1.2, w.sw / 2), step = tram ? 28 : 14;
    for (let s = tram ? 20 : 6; s < w.length - 6; s += step) {
      if (!w.atGrade(s) || w.nearJunction(s, 6) || w.lx.some(L => Math.abs(s - L.s) < L.hw + 8)) continue;
      for (const sg of [-1, 1]) {
        const [x, z] = w.align.offset(s, sg * off);
        if (raster && (raster.idx(x, z) < 0 || [K.rail, K.station, K.viaduct, K.water, K.canal].includes(raster.kindAt(x, z)) || raster.headAt(x, z) < 25)) continue;
        const sp = roadSpaceAt(x, z, 0.8); if (!sp || sp.what !== 'sidewalk' || sp.way !== w) continue;
        add(x, z, w.cls === 'national' ? 'zelkova' : 'ginkgo', [0, 0], w.cls === 'collector' ? 0.8 : 1);
      }
    }
  }
  const byChunk = new Map();
  for (const t of trees) { const [ci, cj] = chunkOf(t.x, t.z), k = chunkKey(ci, cj); let a = byChunk.get(k); if (!a) byChunk.set(k, (a = [])); a.push(t); }
  CACHE = { trees, byChunk };
  return CACHE;
}
