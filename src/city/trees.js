// Trees of 花渡市. Sakura come from the town's generator (world/sakura/tree.js): a few variants per setting are grown
// once (lazily, the first time a chunk needs them), and every planted tree copies one in with its own yaw, scale and
// blossom tone, merged per chunk (bark / blossom mass / cards = 3 draw calls). Street trees (ginkgo, zelkova) are
// simple cel-shaded crowns. Every chunk also has a cheap far version (trunk + painted crown blobs) shown while the
// chunk is not streamed in.
import * as THREE from 'three';
import { makeTree } from '../world/sakura/tree.js';
import { createNoise } from '../world/sakura/util.js';
import { createSakuraTextures } from '../world/sakura/textures.js';
import { createSakuraMaterials } from '../world/sakura/materials.js';
import { groundAt } from '../plan/ground.js';
import { prng } from '../plan/geom.js';
import { MB, rgb, shade } from './mb.js';

// ------------------------------------------------------------------ typed-array merge buffer (as in 桜川市)
class TBuf {
  constructor(color) { this.color = color; this.n = 0; this.ni = 0; this.cap = 0; this.icap = 0; this._alloc(4096, 8192); }
  _alloc(vc, ic) {
    const grow = (a, n, T) => { const b = new T(n); if (a) b.set(a.subarray(0, Math.min(a.length, n))); return b; };
    if (vc !== this.cap) { this.P = grow(this.P, vc * 3, Float32Array); this.N = grow(this.N, vc * 3, Float32Array); this.U = grow(this.U, vc * 2, Float32Array); if (this.color) this.C = grow(this.C, vc * 3, Float32Array); this.cap = vc; }
    if (ic !== this.icap) { this.I = grow(this.I, ic, Uint32Array); this.icap = ic; }
  }
  /** Append src rotated by yaw (cos, sin), scaled by s about its base, moved to (ox, gy, oz). enc: rotate the encoded
   *  shading normal (uv.x, colour.b, uv.y) of the blossom mass too; tone shifts its band value. */
  append(src, cs, sn, s, ox, gy, oz, enc, tone = 0, tint = null) {
    if (this.n + src.n > this.cap) this._alloc(Math.max(this.cap * 2, this.n + src.n + 2048), this.icap);
    if (this.ni + src.ni > this.icap) this._alloc(this.cap, Math.max(this.icap * 2, this.ni + src.ni + 4096));
    const b = this.n, P = this.P, N = this.N, U = this.U, C = this.C;
    for (let i = 0; i < src.n; i++) {
      const x = src.P[i * 3], y = src.P[i * 3 + 1], z = src.P[i * 3 + 2], o = (b + i) * 3;
      P[o] = ox + (x * cs + z * sn) * s; P[o + 1] = gy + y * s; P[o + 2] = oz + (-x * sn + z * cs) * s;
      const nx = src.N[i * 3], nz = src.N[i * 3 + 2];
      N[o] = nx * cs + nz * sn; N[o + 1] = src.N[i * 3 + 1]; N[o + 2] = -nx * sn + nz * cs;
      const u = src.U[i * 2], v = src.U[i * 2 + 1];
      if (enc) { U[(b + i) * 2] = u * cs + v * sn; U[(b + i) * 2 + 1] = -u * sn + v * cs; } else { U[(b + i) * 2] = u; U[(b + i) * 2 + 1] = v; }
      if (this.color) {
        if (enc) { C[o] = Math.min(1, Math.max(0, src.C[i * 3] + tone)); C[o + 1] = src.C[i * 3 + 1]; C[o + 2] = src.C[i * 3 + 2]; }
        else if (tint) { C[o] = src.C[i * 3] * tint[0]; C[o + 1] = src.C[i * 3 + 1] * tint[1]; C[o + 2] = src.C[i * 3 + 2] * tint[2]; }
        else { C[o] = src.C[i * 3]; C[o + 1] = src.C[i * 3 + 1]; C[o + 2] = src.C[i * 3 + 2]; }
      }
    }
    for (let k = 0; k < src.ni; k++) this.I[this.ni + k] = src.I[k] + b;
    this.n += src.n; this.ni += src.ni;
  }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.P.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.U.slice(0, n * 2), 2));
    if (this.color) g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, n * 3), 3));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? this.I.slice(0, this.ni) : Uint16Array.from(this.I.subarray(0, this.ni)), 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
const toSrc = (gb) => ({ P: Float32Array.from(gb.p), N: Float32Array.from(gb.n), U: Float32Array.from(gb.uv), C: Float32Array.from(gb.c), I: Uint32Array.from(gb.i), n: gb.count, ni: gb.i.length });

// ------------------------------------------------------------------ variants (grown around the origin, lazily)
const MID = { lod: 1, meshH: 0.7, cardDensity: 1.05, padR: 1.9 };
function spec(kind, i) {
  const r = prng(0x51c0 + i * 7919 + kind.length * 104729), lean = kind === 'sakura-park' ? 0.25 : 0.8;
  const spread = kind === 'sakura-valley' ? 4.0 + r() * 0.8 : 4.4 + r() * 1.0, height = kind === 'sakura-valley' ? 7.2 + r() * 1.2 : 7.8 + r() * 1.6;
  return {
    id: `hana-${kind}-${i}`, seed: `hana2-${kind}-${i}`, kind: 'medium', x: 0, z: 0, height, spread, spreadZ: spread * (0.9 + r() * 0.12),
    vr: 0.56 + r() * 0.09, trunkR: 0.24 + r() * 0.09, forkH: 2.2 + r() * 0.6, limbs: 4 + (r() < 0.4 ? 1 : 0),
    lean: [(r() - 0.5) * 0.5, lean * (0.7 + r() * 0.4)], leanEarly: 0.3, offset: [(r() - 0.5) * 0.8, lean * (1.2 + r() * 0.8)],
    inner: 0.14, rootReach: 0.55, gnarl: 0.13 + r() * 0.06, limbArch: 0.2 + r() * 0.08, limbReach: 0.66, thetaMax: 1.95 + r() * 0.15, bark: 'old',
    archDirs: [Math.PI / 2], ...MID,
  };
}

export class Trees {
  constructor(ctx, plan) {
    this.ctx = ctx; this.plan = plan;                   // plan = generateTrees() result
    this.M = null; this.variants = new Map(); this.env = null;
    this.far = new Map();                               // chunk key -> far mesh
    this.farRoot = new THREE.Group(); this.farRoot.name = 'far-trees';
    this.farMat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.06, name: 'far-trees' });
    this.streetMat = this.farMat;
  }
  mats() {
    if (!this.M) { this.M = createSakuraMaterials(this.ctx, createSakuraTextures(this.ctx)); this.env = { rng: this.ctx.rng, noise: createNoise(this.ctx.rng('hana-sakura-noise')), heightAt: () => 0 }; }
    return this.M;
  }
  variant(kind, v) {
    const n = kind === 'sakura-valley' ? 5 : 7, i = Math.floor(v * n) % n, key = kind + i;
    let V = this.variants.get(key);
    if (!V) {
      this.mats();
      const t = makeTree(spec(kind, i), this.env);
      V = { bark: toSrc(t.bark), blob: toSrc(t.blob), cards: toSrc(t.cards), colliders: t.colliders };
      this.variants.set(key, V);
    }
    return V;
  }

  /** Far versions of every chunk's trees (added once; hidden while the chunk is streamed in). */
  buildFar() {
    for (const [key, list] of this.plan.byChunk) {
      const mb = new MB();
      for (const t of list) simpleTree(mb, t, false);
      const m = mb.mesh(this.farMat, { shadow: false });
      if (!m) continue;
      m.castShadow = false; this.ctx.noOutline(m); m.name = 'far-trees ' + key;
      this.far.set(key, m); this.farRoot.add(m);
    }
    return this.farRoot;
  }
  setNear(key, near) { const m = this.far.get(key); if (m) m.visible = !near; }

  /** Near trees of one chunk: detailed sakura (3 merged meshes) + street trees; colliders on the trunks. */
  buildChunk(key) {
    const list = this.plan.byChunk.get(key); if (!list) return null;
    const g = new THREE.Group(); g.name = 'trees';
    const bark = new TBuf(false), blob = new TBuf(true), cards = new TBuf(true), mb = new MB();
    for (const t of list) {
      const gy = groundAt(t.x, t.z);
      if (!t.kind.startsWith('sakura')) { simpleTree(mb, t, true); this.ctx.physics.addCylinder(t.x, t.z, 0.25, gy - 1, gy + 3); continue; }
      const V = this.variant(t.kind, t.v);
      // orient the variant's lean (+z) toward the tree's open side
      const yaw = (t.lean[0] || t.lean[1]) ? Math.atan2(t.lean[0], t.lean[1]) + (t.v - 0.5) * 0.5 : t.rot;
      const cs = Math.cos(yaw), sn = Math.sin(yaw), s = t.s;
      const tj = Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453, tv = (tj - Math.floor(tj)) - 0.5;
      const tone = tv * 0.14, tint = [1, 1 - Math.max(0, -tv) * 0.1, 1 - Math.max(0, -tv) * 0.06];
      bark.append(V.bark, cs, sn, s, t.x, gy, t.z, false);
      blob.append(V.blob, cs, sn, s, t.x, gy, t.z, true, tone);
      cards.append(V.cards, cs, sn, s, t.x, gy, t.z, false, 0, tint);
      for (const c of V.colliders) { const x = t.x + (c.x * cs + c.z * sn) * s, z = t.z + (-c.x * sn + c.z * cs) * s; this.ctx.physics.addCylinder(x, z, c.r * s, gy + c.y0 * s, gy + c.y1 * s); }
    }
    const M = this.M;
    if (bark.n) { const m = new THREE.Mesh(bark.geometry(), M.barkOld); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; g.add(m); }
    if (blob.n) { const m = new THREE.Mesh(blob.geometry(), M.blob); m.castShadow = true; m.customDepthMaterial = M.blobDepth; m.matrixAutoUpdate = false; g.add(m); }
    if (cards.n) { const m = new THREE.Mesh(cards.geometry(), M.cards); m.castShadow = true; m.matrixAutoUpdate = false; this.ctx.noOutline(m); g.add(m); }
    const st = mb.mesh(this.streetMat); if (st) g.add(st);
    return g.children.length ? g : null;
  }
}

// ------------------------------------------------------------------ simple trees (street trees; far sakura)
const BARK = rgb('#6b5646'), GINKGO = [rgb('#a9c86a'), rgb('#98bd5e'), rgb('#b5d27a')], ZELKOVA = [rgb('#7fae5c'), rgb('#73a354'), rgb('#8cba68')];
const SAKURA = [rgb('#f3c3d3'), rgb('#f7d4df'), rgb('#eeb3c7')];
let ICO = null;
function ico() {
  if (ICO) return ICO;
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, P = [];
  for (let i = 0; i < p.count; i++) P.push([p.getX(i), p.getY(i), p.getZ(i)]);
  return (ICO = P);
}
/** Trunk prism + lumpy crown blobs. near: a little more detail. */
function simpleTree(mb, t, near) {
  const gy = groundAt(t.x, t.z), r = prng(Math.floor((t.x * 73.1 + t.z * 19.7) * 10) >>> 0), s = t.s;
  const sakura = t.kind.startsWith('sakura'), ginkgo = t.kind === 'ginkgo';
  const H = sakura ? 7.5 * s : ginkgo ? 8.5 * s : 10 * s, trunkH = sakura ? 2.6 * s : ginkgo ? 3.2 * s : 3.6 * s, tr = sakura ? 0.3 : 0.22;
  // trunk (hexagonal prism)
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI * 2, a1 = ((k + 1) / 6) * Math.PI * 2;
    const p0 = [t.x + Math.cos(a0) * tr, gy - 0.2, t.z + Math.sin(a0) * tr], p1 = [t.x + Math.cos(a1) * tr, gy - 0.2, t.z + Math.sin(a1) * tr];
    const q0 = [t.x + Math.cos(a0) * tr * 0.7, gy + trunkH + 0.6, t.z + Math.sin(a0) * tr * 0.7], q1 = [t.x + Math.cos(a1) * tr * 0.7, gy + trunkH + 0.6, t.z + Math.sin(a1) * tr * 0.7];
    mb.quad(p1, p0, q0, q1, BARK);
  }
  const pal = sakura ? SAKURA : ginkgo ? GINKGO : ZELKOVA, P = ico();
  const lobes = sakura ? 3 : ginkgo ? (near ? 3 : 2) : 3;
  const lx = t.lean[0] || 0, lz = t.lean[1] || 0;
  for (let b = 0; b < lobes; b++) {
    // ginkgo: tall narrow crown; zelkova: broad vase; sakura: wide umbrella leaning to open space
    const cx = t.x + (r() - 0.5) * (sakura ? 3 : 1.6) * s + lx * (sakura ? 1.6 : 0), cz = t.z + (r() - 0.5) * (sakura ? 3 : 1.6) * s + lz * (sakura ? 1.6 : 0);
    const cy = gy + trunkH + (sakura ? 1.8 : ginkgo ? 2.2 + b * 1.4 : 3) * s + r() * 0.6;
    const rx = (sakura ? 3.4 : ginkgo ? 1.9 : 3.2) * s * (0.8 + r() * 0.3), ry = (sakura ? 2.1 : ginkgo ? 2.6 : 2.6) * s * (0.8 + r() * 0.3), rz = rx * (0.85 + r() * 0.3);
    const col = pal[Math.floor(r() * pal.length)], rot = r() * 6.28, c = Math.cos(rot), sn = Math.sin(rot);
    for (let i = 0; i < P.length; i += 3) {
      const v = [P[i], P[i + 1], P[i + 2]].map(([x, y, z]) => {
        const bump = 1 + 0.12 * Math.sin(x * 5.1 + y * 3.7 + b) * Math.sin(z * 4.3 + b * 2);
        const X = x * rx * bump, Z = z * rz * bump; return [cx + X * c + Z * sn, cy + y * ry * bump, cz - X * sn + Z * c];
      });
      const lit = shade(col, 0.92 + 0.12 * ((P[i][1] + P[i + 1][1] + P[i + 2][1]) / 3 + 1) / 2);
      mb.tri(v[0], v[1], v[2], lit);
    }
  }
  void H;
}
