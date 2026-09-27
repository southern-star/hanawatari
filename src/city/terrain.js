// Ground for 花渡市: a far terrain (whole map at 10 m + a coarse ring out to the horizon, always resident) and
// near terrain chunks (3 m, streamed) that sit a hair above it. Colours come from the land-use raster (roads,
// floodplain grass, levees, scarp woods, parks, lots…) so even the far terrain reads as a city plan.
import * as THREE from 'three';
import { MAP, RIVER, CANAL, VALLEY, groundKind, riverOffset } from '../plan/terrain.js';
import { groundAt } from '../plan/ground.js';
import { K, TRAM_GRASS } from '../plan/raster.js';
import { DISTRICTS } from '../plan/districts.js';
import { CHUNK } from '../plan/urban.js';

const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // linear
const C = {
  road: col('#77787c'), street: col('#85868a'), rail: col('#8a8074'), viaduct: col('#a39d92'), station: col('#c9c4b8'), plaza: col('#cfc8ba'),
  water: col('#3f5a66'), canal: col('#45606a'), flood: col('#8fbf6d'), levee: col('#9cc47a'), scarp: col('#6e9a5a'), valley: col('#86b56a'),
  park: col('#8cc070'), special: col('#d6c49c'), lotDense: col('#aaa69e'), lotGarden: col('#a4b58a'), lotConcrete: col('#b7b2a8'), lotEstate: col('#9cc27c'),
  far: col('#9aa590'), crest: col('#cfc3a6'), streamBank: col('#9fb88a'), tramGrass: col('#7fb45f'), under: col('#a39f96'),
};
const CREST0 = RIVER.halfW + 0, CREST_IN = RIVER.levee.inner, CREST_TOP = RIVER.levee.top;
const DIST_LOT = { downtown: 'lotConcrete', redevelopment: 'lotConcrete', oldtown: 'lotDense', hillfoot: 'lotDense', shitamachi: 'lotDense', canal: 'lotConcrete', residential: 'lotGarden', plateau: 'lotGarden', estate: 'lotEstate', valley: 'valley' };

const FAR_KIND = { water: C.water, canal: C.canal, flood: C.flood, levee: C.levee, scarp: C.scarp, valley: C.valley, plateau: C.lotGarden, plain: C.lotDense };
function colorAt(R, x, z, out) {
  let c;
  if (R.idx(x, z) < 0) { c = FAR_KIND[groundKind(x, z)] || C.far; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
  const k = R.kindAt(x, z);
  switch (k) {
    case K.under: c = C.under; break; case K.road: c = C.road; break; case K.street: c = C.street; break; case K.rail: c = R.owner[R.idx(x, z)] === TRAM_GRASS ? C.tramGrass : C.rail; break; case K.viaduct: c = C.viaduct; break;
    case K.station: c = C.station; break; case K.plaza: c = C.plaza; break; case K.water: c = C.water; break; case K.canal: c = C.canal; break;
    case K.flood: c = C.flood; break;
    case K.levee: { const n = RIVER.align.nearestWin(x, z, RIVER.reach, 70); const e = n ? Math.abs(n.d) - RIVER.halfW - (n.d >= 0 ? RIVER.floodS : RIVER.floodN) - CREST_IN : -1; c = e > 0.3 && e < CREST_TOP - 0.3 ? C.crest : C.levee; break; } case K.scarp: c = C.scarp; break; case K.valley: c = C.valley; break;
    case K.park: c = C.park; break; case K.special: c = C.special; break;
    default: { const d = R.districtAt(x, z); const D = d ? DISTRICTS[d - 1] : null; c = D ? C[DIST_LOT[D.kind]] || C.lotDense : C.far; }
  }
  // gentle low-frequency variation so large areas are not flat colour
  const n = Math.sin(x * 0.031 + z * 0.017) * 0.5 + Math.sin(x * 0.011 - z * 0.023 + 1.7) * 0.5;
  const f = 1 + n * 0.04;
  out[0] = c[0] * f; out[1] = c[1] * f; out[2] = c[2] * f;
  return out;
}

/** Grid mesh over [x0,x1]×[z0,z1] with `step`; y = groundAt + dy; optional skirt depth; skip(cx,cz) drops cells. */
function gridMesh(R, x0, z0, x1, z1, step, { dy = 0, skirt = 0, skip = null } = {}) {
  const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
  const V = (nx + 1) * (nz + 1), pos = new Float32Array(V * 3), colr = new Float32Array(V * 3), c3 = [0, 0, 0];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * step, z = z0 + j * step, k = j * (nx + 1) + i;
    pos[k * 3] = x; pos[k * 3 + 1] = groundAt(x, z) + dy; pos[k * 3 + 2] = z;
    colorAt(R, x, z, c3); colr[k * 3] = c3[0]; colr[k * 3 + 1] = c3[1]; colr[k * 3 + 2] = c3[2];
  }
  const idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (skip && skip(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  let P = pos, Cl = colr;
  if (skirt > 0) {  // vertical skirts along the four edges hide seams to the coarser terrain below
    const extra = [], ecol = [], eidx = [];
    const edge = (ids) => {
      const base = V + extra.length / 3;
      for (const k of ids) { extra.push(pos[k * 3], pos[k * 3 + 1] - skirt, pos[k * 3 + 2]); ecol.push(colr[k * 3], colr[k * 3 + 1], colr[k * 3 + 2]); }
      for (let t = 0; t + 1 < ids.length; t++) { const a = ids[t], b = ids[t + 1], a2 = base + t, b2 = base + t + 1; eidx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2); }
    };
    const row = (j) => Array.from({ length: nx + 1 }, (_, i) => j * (nx + 1) + i), colm = (i) => Array.from({ length: nz + 1 }, (_, j) => j * (nx + 1) + i);
    edge(row(0)); edge(row(nz)); edge(colm(0)); edge(colm(nx));
    P = new Float32Array(pos.length + extra.length); P.set(pos); P.set(extra, pos.length);
    Cl = new Float32Array(colr.length + ecol.length); Cl.set(colr); Cl.set(ecol, colr.length);
    for (const v of eidx) idx.push(v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Cl, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

export function terrainMaterial(ctx) { return ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.07, name: 'terrain' }); }

/**
 * Far terrain: the map (+100 m) at 10 m, and a 80 m ring out to ±4 km. Sits 0.3 m low. A 10 m grid cuts the corners of
 * every sharp step in the ground — an embankment ending at its abutment, a revetment, a levee, a cutting — by metres,
 * so it would show through the near terrain there: group.userData.setHoles(isBuilt) leaves out the inner mesh's
 * cells over every chunk whose near terrain is built (the chunk grid is a multiple of the 10 m grid).
 */
export function buildFarTerrain(ctx, R) {
  const m = terrainMaterial(ctx), group = new THREE.Group(); group.name = 'far-terrain';
  const E = 1600, N = (2 * E) / 10, geo = gridMesh(R, -E, -E, E, E, 10, { dy: -0.3, skirt: 3 });
  const inner = new THREE.Mesh(geo, m);
  const outer = new THREE.Mesh(gridMesh(R, -4000, -4000, 4000, 4000, 80, { dy: -0.6, skip: (x, z) => Math.abs(x) < E && Math.abs(z) < E }), m);
  for (const o of [inner, outer]) { o.receiveShadow = true; o.matrixAutoUpdate = false; group.add(o); }
  // cells come first in the index (row by row, 6 indices each), then the skirts
  const full = geo.index.array.slice(), cellChunk = new Int32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -E + (i + 0.5) * 10, z = -E + (j + 0.5) * 10;
    const ci = Math.floor((x - MAP.x0) / CHUNK), cj = Math.floor((z - MAP.z0) / CHUNK);
    cellChunk[j * N + i] = x > MAP.x0 && x < MAP.x1 && z > MAP.z0 && z < MAP.z1 ? cj * 1000 + ci : -1;
  }
  group.userData.setHoles = (isBuilt) => {
    const out = geo.index.array; let n = 0;
    for (let c = 0; c < N * N; c++) {
      const k = cellChunk[c]; if (k >= 0 && isBuilt(k % 1000, Math.floor(k / 1000))) continue;
      for (let t = 0; t < 6; t++) out[n + t] = full[c * 6 + t]; n += 6;
    }
    for (let t = N * N * 6; t < full.length; t++) out[n++] = full[t];
    geo.index.needsUpdate = true; geo.setDrawRange(0, n);
  };
  return group;
}

/** Near terrain for one chunk (3 m grid with skirts). */
export function buildChunkTerrain(ctx, R, ci, cj) {
  const x0 = MAP.x0 + ci * CHUNK, z0 = MAP.z0 + cj * CHUNK;
  const mesh = new THREE.Mesh(gridMesh(R, x0, z0, x0 + CHUNK, z0 + CHUNK, 3, { skirt: 1.5 }), terrainMaterial(ctx));
  mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  return mesh;
}

/** River and canal water surfaces (global). */
export function buildWater(ctx) {
  const m = ctx.mat.toon('#8dbfdf', { paint: 0.05, name: 'water' });
  const ribbon = (A, hw, y, step = 8) => {
    const n = Math.ceil(A.length / step), P = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const s = (A.length * i) / n, [lx, lz] = A.offset(s, -hw), [rx, rz] = A.offset(s, hw);
      P.push(lx, y, lz, rx, y, rz);
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  };
  const group = new THREE.Group(); group.name = 'water';
  // the river surface reaches a little under the revetments so no gap shows at the banks
  const river = new THREE.Mesh(ribbon(RIVER.align, RIVER.halfW + 3, RIVER.waterY), m);
  // 鈴音川: a narrow stream in its channel along the valley floor (down to where it goes underground)
  const V = VALLEY.align, sv0 = V.sOf(-1650, 395), sv1 = V.sOf(VALLEY.mouthX, 255), sp = [], si = [];
  for (let i = 0, n = Math.ceil((sv1 - sv0) / 4); i <= n; i++) { const s = sv0 + (sv1 - sv0) * i / n, y = VALLEY.floor.yAt(s) - 0.45, [lx, lz] = V.offset(s, -2.4), [rx, rz] = V.offset(s, 2.4); sp.push(lx, y, lz, rx, y, rz); if (i < n) { const a = i * 2; si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals(); sg.computeBoundingSphere();
  const stream = new THREE.Mesh(sg, m); stream.matrixAutoUpdate = false; stream.receiveShadow = true;
  const canal = new THREE.Mesh(ribbon(CANAL.align, CANAL.halfW + 0.5, CANAL.waterY, 6), m);
  for (const o of [river, canal, stream]) { o.receiveShadow = true; o.matrixAutoUpdate = false; group.add(o); }
  return group;
}
