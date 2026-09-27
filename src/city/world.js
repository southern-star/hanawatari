// 花渡市 world: the always-resident layers (far terrain, water, structures, the massing of every building) plus
// 120 m chunks of detail streamed around the player (fine terrain, road surfaces and markings, building
// details, colliders). Chunks are built nearest-first within a per-frame time budget and dropped when far.
import * as THREE from 'three';
import { MAP } from '../plan/terrain.js';
import { generateUrban, CHUNK, CHUNKS_N, chunkOf, chunkKey } from '../plan/urban.js';
import { groundAt } from '../plan/ground.js';
import { K } from '../plan/raster.js';
import { DISTRICTS } from '../plan/districts.js';
import { facadeMaterial } from './facade.js';
import { FacadeBuf, emitFar, emitNear } from './mass.js';
import { buildFarTerrain, buildChunkTerrain, buildWater } from './terrain.js';
import { buildChunkRoads } from './roads.js';
import { buildStructures } from './structures.js';
import { generateTrees } from '../plan/trees.js';
import { Trees } from './trees.js';
import { buildChunkTrack } from './track.js';
import { buildStation } from './station.js';
import { buildArcades } from './arcade.js';
import { buildYokocho } from './yokocho.js';
import { buildConcourse } from './concourse.js';
import { buildChunkPoles } from './poles.js';
import { buildChunkWalls } from './walls.js';
import { createShopKit, buildChunkShopfronts } from './shopfronts.js';

const MASS_CELL = 360;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class World {
  constructor(ctx, { radius = 300 } = {}) {
    this.ctx = ctx; this.radius = radius;
    this.U = generateUrban(); this.R = this.U.raster;
    this.trees = new Trees(ctx, generateTrees(this.R));
    this.chunks = new Map();
    this.root = new THREE.Group(); this.root.name = 'world'; ctx.scene.add(this.root);
    this.nearRoot = new THREE.Group(); this.nearRoot.name = 'near'; this.root.add(this.nearRoot);
    this.stats = { global: {}, chunkMs: [], built: 0, disposed: 0 };
    // the walker: never into water or onto an open railway (bridges and level crossings are fine)
    const R = this.R, phys = ctx.physics;
    phys.blocked = (x, z, feetY) => {
      const k = R.kindAt(x, z);
      if (k !== K.water && k !== K.canal && k !== K.rail) return false;
      return phys.groundHeight(x, z, feetY + 0.5) < groundAt(x, z) + 1.5;   // on a deck above it: allowed
    };
  }

  /** Build the global layers (call once, before the first frame). onStep(label) reports progress. */
  async buildGlobal(onStep = () => {}) {
    const ctx = this.ctx, T = this.stats.global, tick = async (label, fn) => { onStep(label); await new Promise(r => setTimeout(r, 0)); const t0 = now(); const o = fn(); T[label] = Math.round(now() - t0); if (o) this.root.add(o); return o; };
    this.far = await tick('地形', () => buildFarTerrain(ctx, this.R));
    await tick('川と運河', () => buildWater(ctx));
    await tick('高架・橋・ホーム', () => buildStructures(ctx));
    await tick('街並み', () => this.buildMassing());
    await tick('並木', () => this.trees.buildFar());
    if (!this.shopKit) this.shopKit = createShopKit(ctx);
    this.station = await tick('駅前広場', () => buildStation(ctx, this.shopKit));
    await tick('自由通路', () => buildConcourse(ctx, this.shopKit));
    await tick('商店街', () => buildArcades(ctx, this.shopKit, this.U.arcades || []));
    await tick('横丁', () => buildYokocho(ctx, this.shopKit));
  }

  /** Walls and roofs of every building, merged per 360 m cell (one draw call each, one shared material). */
  buildMassing() {
    const mat = facadeMaterial(this.ctx, null), cells = new Map(), g = new THREE.Group(); g.name = 'massing';
    for (const b of this.U.buildings) {
      const k = Math.floor(b.x / MASS_CELL) + ',' + Math.floor(b.z / MASS_CELL);
      let buf = cells.get(k); if (!buf) cells.set(k, (buf = new FacadeBuf(8192)));
      emitFar(buf, b);
    }
    let tris = 0;
    for (const buf of cells.values()) {
      const m = new THREE.Mesh(buf.geometry(), mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
      tris += buf.tris; g.add(m);
    }
    this.stats.massTris = tris;
    return g;
  }

  // ------------------------------------------------------------------ chunks
  buildChunk(ci, cj) {
    const key = chunkKey(ci, cj), t0 = now(), ctx = this.ctx;
    const group = new THREE.Group(); group.name = 'chunk ' + key;
    group.add(buildChunkTerrain(ctx, this.R, ci, cj));
    const roads = buildChunkRoads(ctx, this.R, this.U, ci, cj); if (roads.children.length) group.add(roads);
    const track = buildChunkTrack(ctx, ci, cj); if (track) group.add(track);
    const cell = this.U.byChunk.get(key);
    ctx.physics.owner = key;
    const tg = this.trees.buildChunk(key); if (tg) group.add(tg);
    const pg = buildChunkPoles(ctx, this.U, key, ctx.renderSize); if (pg) group.add(pg);
    this.trees.setNear(key, true);
    if (cell && cell.lots.length) { const wm = buildChunkWalls(ctx, cell.lots); if (wm) group.add(wm); }
    if (cell && cell.buildings.length) {
      if (!this.shopKit) this.shopKit = createShopKit(ctx);
      const sf = buildChunkShopfronts(ctx, this.shopKit, cell.buildings); if (sf) group.add(sf);
      const buf = new FacadeBuf(4096);
      for (const b of cell.buildings) {
        emitNear(buf, b);
        ctx.physics.addBox(b.x, b.z, b.w, b.d, b.rot, b.y - 1, b.y + b.h + 3);
      }
      if (buf.n) { const m = new THREE.Mesh(buf.geometry(), facadeMaterial(ctx, null)); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; group.add(m); }
    }
    ctx.physics.owner = null;
    this.nearRoot.add(group);
    const ms = now() - t0;
    this.chunks.set(key, { key, ci, cj, group, ms }); this.farDirty = true;
    this.stats.chunkMs.push(ms); this.stats.built++;
    return ms;
  }

  disposeChunk(key) {
    const ch = this.chunks.get(key); if (!ch) return;
    ch.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.nearRoot.remove(ch.group);
    this.ctx.physics.removeOwner(key);
    this.trees.setNear(key, false);
    this.chunks.delete(key); this.stats.disposed++; this.farDirty = true;
  }

  /** Stream chunks around (px, pz): build nearest-first until budgetMs is spent; drop chunks beyond the keep radius. */
  update(px, pz, budgetMs = 6) {
    if (this.shopKit) this.shopKit.flush(now());
    if (this.station?.userData.update) this.station.userData.update(now() / 1000);
    const r = this.radius, span = Math.ceil((r + 90) / CHUNK), [pci, pcj] = chunkOf(px, pz), want = [];
    for (let dj = -span; dj <= span; dj++) for (let di = -span; di <= span; di++) {
      const ci = pci + di, cj = pcj + dj; if (ci < 0 || cj < 0 || ci >= CHUNKS_N || cj >= CHUNKS_N) continue;
      const cx = MAP.x0 + (ci + 0.5) * CHUNK, cz = MAP.z0 + (cj + 0.5) * CHUNK, d = Math.hypot(cx - px, cz - pz);
      if (d < r + 85 && !this.chunks.has(chunkKey(ci, cj))) want.push([d, ci, cj]);
    }
    want.sort((a, b) => a[0] - b[0]);
    const t0 = now();
    for (const [, ci, cj] of want) { this.buildChunk(ci, cj); if (now() - t0 > budgetMs) break; }
    for (const ch of [...this.chunks.values()]) {
      const cx = MAP.x0 + (ch.ci + 0.5) * CHUNK, cz = MAP.z0 + (ch.cj + 0.5) * CHUNK;
      if (Math.hypot(cx - px, cz - pz) > r + 85 + 150) this.disposeChunk(ch.key);
    }
    // the far terrain steps aside wherever a chunk's near terrain is built
    if (this.farDirty && this.far) { this.far.userData.setHoles((ci, cj) => this.chunks.has(chunkKey(ci, cj))); this.farDirty = false; }
    return want.length;
  }

  /** District / place name at (x, z) for the HUD. */
  placeAt(x, z) {
    for (const S of this.U.sites) for (const [x0, z0, x1, z1] of S.parts || [S.rect]) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return S.name;
    const d = this.R.districtAt(x, z);
    return d ? DISTRICTS[d - 1].name : null;
  }
}
