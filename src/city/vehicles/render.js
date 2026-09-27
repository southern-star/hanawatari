// Instanced drawing of vehicles: per model a painted body (instance colour), the fixed details, the see-through glass
// and the lamps (a small shader switches brake lamps and indicators per instance); shared meshes for the wheels (three
// kinds, spinning, the front ones steering) and for every number plate (one atlas, a tile per instance). Fill with
// begin() / add(…) / end() each frame.
import * as THREE from 'three';
import { MODELS } from './models.js';
import { MB, rgb } from '../mb.js';
import { plateAtlas, plateMaterial } from './plates.js';

const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
const _qs = new THREE.Quaternion(), _ex = new THREE.Euler();
const WHEELS = ['alloy', 'cap', 'truck'];

/**
 * A unit wheel (radius 1, width 1, axis x): a tread with rounded shoulders, sidewalls, the rim set back in its barrel.
 * Rims: alloy (five spokes), cap (a steel wheel's hubcap), truck (a steel disc, a raised hub and its nuts).
 */
function wheelGeometry(kind) {
  const mb = new MB(), n = 20, TYRE = rgb('#232428'), WALL = rgb('#2d2e33');
  const RIM = kind === 'truck' ? rgb('#8b9197') : rgb('#b9bfc5'), RIM_D = kind === 'truck' ? rgb('#4d5258') : rgb('#565b61'), HUB = kind === 'truck' ? rgb('#a9afb5') : rgb('#8a9097');
  const rr = kind === 'alloy' ? 0.72 : kind === 'cap' ? 0.66 : 0.62, xr = 0.3;
  const P = (x, r, a) => [x, Math.sin(a) * r, Math.cos(a) * r];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2, rad = [0, Math.sin(am), Math.cos(am)];
    mb.quadF(P(-0.36, 1, a0), P(0.36, 1, a0), P(0.36, 1, a1), P(-0.36, 1, a1), TYRE, rad);
    for (const sx of [-1, 1]) {
      const out = [sx, 0, 0], ring = (x, r0, r1, col) => mb.quadF(P(x, r0, a0), P(x, r1, a0), P(x, r1, a1), P(x, r0, a1), col, out);
      mb.quadF(P(sx * 0.36, 1, a0), P(sx * 0.5, 0.92, a0), P(sx * 0.5, 0.92, a1), P(sx * 0.36, 1, a1), TYRE, [sx, rad[1], rad[2]]);   // shoulder
      ring(sx * 0.5, rr, 0.92, WALL);
      mb.quadF(P(sx * 0.5, rr, a0), P(sx * xr, rr, a0), P(sx * xr, rr, a1), P(sx * 0.5, rr, a1), RIM_D, [0, -rad[1], -rad[2]]);   // the barrel
      const x = sx * xr;
      if (kind === 'alloy') {
        ring(x, rr - 0.07, rr, RIM);
        ring(x, 0.2, rr - 0.07, (i % 4) < 2 ? RIM : RIM_D);
        ring(x, 0.07, 0.2, RIM); ring(x, 0, 0.07, RIM_D);
      } else if (kind === 'cap') {
        ring(x, rr - 0.05, rr, RIM_D);
        ring(x, 0.5, rr - 0.05, RIM); ring(x, 0.4, 0.5, i % 5 === 0 ? RIM_D : RIM); ring(x, 0.14, 0.4, RIM); ring(x, 0, 0.14, HUB);
      } else {
        ring(x, rr - 0.05, rr, RIM); ring(x, 0.34, rr - 0.05, RIM_D); ring(x, 0.3, 0.34, RIM);
        ring(x + sx * 0.06, 0, 0.3, HUB);
        mb.quadF(P(x, 0.3, a0), P(x + sx * 0.06, 0.3, a0), P(x + sx * 0.06, 0.3, a1), P(x, 0.3, a1), HUB, rad);
        if (i % 2 === 0 && i < 12) { const c = P(x + sx * 0.065, 0.2, am); mb.quadF([c[0], c[1] - 0.035, c[2] - 0.035], [c[0], c[1] + 0.035, c[2] - 0.035], [c[0], c[1] + 0.035, c[2] + 0.035], [c[0], c[1] - 0.035, c[2] + 0.035], RIM_D, out); }
      }
    }
  }
  return mb.geometry();
}

/** The lamps' material: vertex colour × (dim … bright) by lampKind and the instance's lamp state (brake, left, right). */
function lampMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float lampKind;\nattribute vec3 lampState;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        float on = lampKind < 0.5 ? 1.0 : lampKind < 1.5 ? lampState.x : lampKind < 2.5 ? lampState.y : lampState.z;
        vColor.rgb *= mix(lampKind > 0.5 && lampKind < 1.5 ? 0.55 : 0.4, 1.45, on);`);
  };
  m.customProgramCacheKey = () => 'vehicle-lamps';
  return m;
}

export class VehicleRenderer {
  /** cap: max instances per model. */
  constructor(ctx, cap = {}) {
    this.root = new THREE.Group(); this.root.name = 'vehicles';
    const paintMat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02, name: 'vehicle-paint' });
    const fixedMat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02, name: 'vehicle-fixed' });
    const glassMat = ctx.mat.glass({ tint: '#3f4c59', opacity: 0.4, refl: 0.2, fresnel: 0.55, streaks: 0.45 });
    const lampMat = lampMaterial();
    const im = (geo, mat, n, shadow) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = shadow; m.receiveShadow = shadow; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(m); return m; };
    this.models = {}; const wheelCap = { alloy: 0, cap: 0, truck: 0 }; let plateCap = 0;
    for (const [name, make] of Object.entries(MODELS)) {
      const M = make(), n = cap[name] ?? 60;
      const paint = im(M.paint.geometry(), paintMat, n, true);
      paint.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); paint.instanceColor.setUsage(THREE.DynamicDrawUsage);
      const fixed = im(M.fixed.geometry(), fixedMat, n, true);
      const glass = M.glass.n ? im(M.glass.geometry(), glassMat, n, true) : null;
      if (glass) glass.renderOrder = 1;
      const lg = M.lamps.geometry(); lg.setAttribute('lampKind', new THREE.Float32BufferAttribute(M.lamps.K, 1));
      const state = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); state.setUsage(THREE.DynamicDrawUsage); lg.setAttribute('lampState', state);
      const lamps = im(lg, lampMat, n, false); ctx.noOutline(lamps);
      this.models[name] = { M, n, paint, fixed, glass, lamps, state, i: 0 };
      wheelCap[M.wheel] += n * M.wheels.length; plateCap += n * M.plates.length;
    }
    const wheelMat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.01, name: 'vehicle-wheel' });
    this.wheels = {};
    for (const k of WHEELS) { const m = im(wheelGeometry(k), wheelMat, Math.max(1, wheelCap[k]), true); m.receiveShadow = false; this.wheels[k] = { m, i: 0 }; }
    // number plates: a unit plate (330 × 165 mm) per instance, its tile from the atlas
    const pg = new THREE.PlaneGeometry(0.33, 0.165), tiles = new THREE.InstancedBufferAttribute(new Float32Array(plateCap), 1);
    tiles.setUsage(THREE.DynamicDrawUsage); pg.setAttribute('plateTile', tiles);
    this.plates = { m: im(pg, plateMaterial(ctx, plateAtlas()), plateCap, false), tiles, i: 0 };
  }
  dims(name) { const M = this.models[name].M; return { L: M.L, W: M.W, H: M.H, wb: M.wb, rt: M.rt, fo: M.fo, driver: M.driver, rider: M.rider, moto: !!M.moto }; }
  begin() { for (const k in this.models) this.models[k].i = 0; for (const k in this.wheels) this.wheels[k].i = 0; this.plates.i = 0; }
  /** One vehicle: model, position (ground under the axle midpoint), yaw (local +z along (sin, cos)), pitch (nose up +),
   *  colour (hex / Color), lamps [brake, left, right] 0..1, wheel spin angle, front wheel steer angle, plate tile (−1: none). */
  add(name, x, y, z, yaw, pitch, color, brake, left, right, spin, steer, plate = -1, roll = 0) {
    const R = this.models[name]; if (!R || R.i >= R.n) return;
    const i = R.i++;
    _e.set(-pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
    R.paint.setMatrixAt(i, _m); R.fixed.setMatrixAt(i, _m); R.lamps.setMatrixAt(i, _m); if (R.glass) R.glass.setMatrixAt(i, _m);
    _c.set(color); R.paint.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
    R.state.setXYZ(i, brake, left, right);
    const M = R.M, W = this.wheels[M.wheel];
    for (const [wx, wz] of M.wheels) {
      if (W.i >= W.m.instanceMatrix.count) break;
      _ex.set(spin, wz > 0 ? steer : 0, 0, 'YXZ'); _qs.setFromEuler(_ex);
      _p.set(wx, M.rt, wz); _s.set(M.tw, M.rt, M.rt); _w.compose(_p, _qs, _s); _s.set(1, 1, 1);
      _w.premultiply(_m); W.m.setMatrixAt(W.i++, _w);
    }
    if (plate >= 0) for (const [py, pz, sg, tilt = 0, ps = 1] of M.plates) {
      const Pl = this.plates; if (Pl.i >= Pl.m.instanceMatrix.count) break;
      _ex.set(-tilt, sg < 0 ? Math.PI : 0, 0, 'YXZ'); _qs.setFromEuler(_ex);
      _p.set(0, py, pz); _s.set(ps, ps, ps); _w.compose(_p, _qs, _s); _s.set(1, 1, 1); _w.premultiply(_m);
      Pl.m.setMatrixAt(Pl.i, _w); Pl.tiles.setX(Pl.i, plate); Pl.i++;
    }
  }
  end() {
    for (const k in this.models) {
      const R = this.models[k];
      for (const m of [R.paint, R.fixed, R.lamps, R.glass]) { if (!m) continue; m.count = R.i; m.instanceMatrix.needsUpdate = true; }
      R.paint.instanceColor.needsUpdate = true; R.state.needsUpdate = true;
    }
    for (const k in this.wheels) { const W = this.wheels[k]; W.m.count = W.i; W.m.instanceMatrix.needsUpdate = true; }
    this.plates.m.count = this.plates.i; this.plates.m.instanceMatrix.needsUpdate = true; this.plates.tiles.needsUpdate = true;
  }
}
