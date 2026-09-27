// Instanced drawing of people: per body kind (trousers, skirt, child, elder) a near mesh (faces, small things) and a
// far one, posed on the GPU from per-instance attributes; both draw into the outline pre-pass and the shadow map with
// the same pose. Fill with begin(camera position) / add(…) / end() each frame.
import * as THREE from 'three';
import { KINDS, bodyGeometry, bodyMaterials } from './body.js';
import { LAYER_CUSTOM_ND } from '../../core/renderer.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler();
const NEAR = 42;                                                          // m: within this the detailed figures

/** '#rrggbb' → the packed colour the shader unpacks. */
export const pack = (hex) => parseInt(hex.slice(1), 16);

export class PeopleRenderer {
  /** caps: { kind: [near, far] } instance counts. */
  constructor(ctx, caps = {}) {
    this.root = new THREE.Group(); this.root.name = 'people';
    this.kinds = {}; this.cam = [0, 0, 0];
    const pairs = [];
    for (const k of KINDS) {
      const M = bodyMaterials(ctx, k), [nNear, nFar] = caps[k] ?? [120, 200];
      const lods = [0, 1].map(lod => {
        const n = lod ? nFar : nNear, geo = bodyGeometry(k, lod);
        const at = (size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
        const aAnim = at(4), aCol0 = at(4), aCol1 = at(4), aMask = at(1);
        geo.setAttribute('aAnim', aAnim); geo.setAttribute('aCol0', aCol0); geo.setAttribute('aCol1', aCol1); geo.setAttribute('aMask', aMask);
        const mesh = new THREE.InstancedMesh(geo, M.toon, n);
        mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.customDepthMaterial = M.depth; mesh.layers.set(LAYER_CUSTOM_ND);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.root.add(mesh); pairs.push([mesh, M.nd]);
        return { mesh, aAnim, aCol0, aCol1, aMask, n, i: 0 };
      });
      this.kinds[k] = lods;
    }
    if (ctx.pipeline) ctx.pipeline.addCustomND(this.root, pairs);
  }
  begin(cam) { if (cam) this.cam = [cam.x, cam.y, cam.z]; for (const k in this.kinds) for (const L of this.kinds[k]) L.i = 0; }
  /** A person standing at (x, y, z) (between the feet), facing yaw (local +z along (sin, cos)), rolled (on a bike);
   *  pose mode, phase and amplitude; height scale; look = { cols: 8 packed colours, mask }. False when full. */
  add(kind, x, y, z, yaw, mode, phase, amp, scale, look, roll = 0) {
    const Ls = this.kinds[kind]; if (!Ls) return false;
    const c = this.cam, d2 = (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2;
    let K = Ls[d2 < NEAR * NEAR ? 0 : 1]; if (K.i >= K.n) K = Ls[1]; if (K.i >= K.n) return false;
    const i = K.i++;
    if (roll) { _e.set(0, yaw, roll, 'YXZ'); _q.setFromEuler(_e); } else _q.setFromAxisAngle(_y, yaw);
    _p.set(x, y, z); _m.compose(_p, _q, _s); K.mesh.setMatrixAt(i, _m);
    K.aAnim.setXYZW(i, phase, amp, mode, scale);
    const cl = look.cols; K.aCol0.setXYZW(i, cl[0], cl[1], cl[2], cl[3]); K.aCol1.setXYZW(i, cl[4], cl[5], cl[6], cl[7]);
    K.aMask.setX(i, look.mask);
    return true;
  }
  end() {
    for (const k in this.kinds) for (const K of this.kinds[k]) {
      K.mesh.count = K.i;
      K.mesh.instanceMatrix.needsUpdate = true; K.aAnim.needsUpdate = true; K.aCol0.needsUpdate = true; K.aCol1.needsUpdate = true; K.aMask.needsUpdate = true;
    }
  }
}
