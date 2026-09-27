// Bicycles (ママチャリ): a step-through city bike with a front basket, a rear carrier, mudguards and a chain guard,
// drawn instanced and animated on the GPU like the people — the wheels turn, the cranks go round in step with the
// rider's legs, the bars steer. Per instance: wheel angle, crank angle, steer, frame colour. The rider is a person in
// the cycling pose (people/body.js) sitting on the saddle.
import * as THREE from 'three';
import { LAYER_CUSTOM_ND } from '../../core/renderer.js';

export const BIKE = { rt: 0.33, zf: 0.55, zr: -0.55, bb: [0.28, 0.05], saddle: [0.86, -0.15], crank: 0.17 };
const SILVER = [0.62, 0.64, 0.66], BLACK = [0.05, 0.05, 0.06], TYRE = [0.035, 0.036, 0.04], GREY = [0.3, 0.31, 0.33];

class BB {                                                                      // a tiny builder: position, normal, colour, bone, frame-coloured?
  constructor() { this.P = []; this.N = []; this.C = []; this.B = []; this.F = []; this.I = []; }
  get n() { return this.P.length / 3; }
  quad(a, b, c, d, col, bone, frame = 0) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(v => v / l);
    const k = this.n;
    for (const p of [a, b, c, d]) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.C.push(col[0], col[1], col[2]); this.B.push(bone); this.F.push(frame); }
    this.I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  /** Both faces. */
  quad2(a, b, c, d, col, bone, frame = 0) { this.quad(a, b, c, d, col, bone, frame); this.quad(d, c, b, a, col, bone, frame); }
  /** A square tube from p to q, thickness t (4 sides). */
  tube(p, q, t, col, bone, frame = 0) {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(d[0], d[1], d[2]) || 1, u = d.map(v => v / L);
    let s = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const a = norm(cross(u, s)), b = cross(u, a), h = t / 2;
    const off = (o, i, j) => [o[0] + (a[0] * i + b[0] * j) * h, o[1] + (a[1] * i + b[1] * j) * h, o[2] + (a[2] * i + b[2] * j) * h];
    const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let k = 0; k < 4; k++) { const [i0, j0] = C[k], [i1, j1] = C[(k + 1) % 4]; this.quad(off(p, i0, j0), off(p, i1, j1), off(q, i1, j1), off(q, i0, j0), col, bone, frame); }
  }
  box(x0, x1, y0, y1, z0, z1, col, bone, faces = 'NSEWTB', frame = 0) {
    const F = { T: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], B: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], S: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      N: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], E: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], W: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] };
    for (const f of faces) this.quad(...F[f], col, bone, frame);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('bone', new THREE.Float32BufferAttribute(this.B, 1)); g.setAttribute('fcol', new THREE.Float32BufferAttribute(this.F, 1));
    g.setIndex(this.I); return g;
  }
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Bones: 0 frame, 1 front wheel, 2 rear wheel, 3 cranks, 4 steering (fork, bars, basket, front mudguard). */
export function bikeGeometry() {
  const g = new BB(), R = BIKE.rt, F = [0, R, BIKE.zf], Rr = [0, R, BIKE.zr], BBp = [0, BIKE.bb[0], BIKE.bb[1]], HT = [0, 0.74, 0.36], ST = [0, 0.78, -0.12];
  // wheels: tyre, rim, six spokes, hub
  for (const [c, bone] of [[F, 1], [Rr, 2]]) {
    const n = 18, P = (r, a, x = 0) => [c[0] + x, c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      g.quad(P(R, a0, -0.018), P(R, a0, 0.018), P(R, a1, 0.018), P(R, a1, -0.018), TYRE, bone);
      for (const sx of [-1, 1]) {
        const x = sx * 0.018, q = sx > 0 ? [P(R - 0.04, a0, x), P(R, a0, x), P(R, a1, x), P(R - 0.04, a1, x)] : [P(R - 0.04, a1, x), P(R, a1, x), P(R, a0, x), P(R - 0.04, a0, x)];
        g.quad(...q, TYRE, bone);
        const r0 = R - 0.065, r1 = R - 0.04, q2 = sx > 0 ? [P(r0, a0, x * 0.6), P(r1, a0, x * 0.6), P(r1, a1, x * 0.6), P(r0, a1, x * 0.6)] : [P(r0, a1, x * 0.6), P(r1, a1, x * 0.6), P(r1, a0, x * 0.6), P(r0, a0, x * 0.6)];
        g.quad(...q2, SILVER, bone);
      }
    }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.quad2(P(0.03, a - 0.02), P(R - 0.06, a - 0.006), P(R - 0.06, a + 0.006), P(0.03, a + 0.02), SILVER, bone); }
    g.box(c[0] - 0.05, c[0] + 0.05, c[1] - 0.025, c[1] + 0.025, c[2] - 0.025, c[2] + 0.025, GREY, bone);
  }
  // frame (the instance colour): the curved step-through down tube, seat tube, stays
  const DT = [[0, 0.74, 0.36], [0, 0.56, 0.3], [0, 0.4, 0.2], [0, 0.3, 0.1], BBp];
  for (let i = 0; i + 1 < DT.length; i++) g.tube(DT[i], DT[i + 1], 0.045, [1, 1, 1], 0, 1);
  g.tube(BBp, ST, 0.04, [1, 1, 1], 0, 1);
  g.tube([0, 0.7, 0.35], [0, 0.8, 0.33], 0.05, [1, 1, 1], 0, 1);                                  // head tube
  for (const sx of [-1, 1]) { g.tube([sx * 0.04, BBp[1], BBp[2]], [sx * 0.05, R, BIKE.zr], 0.025, [1, 1, 1], 0, 1); g.tube([sx * 0.03, 0.74, -0.11], [sx * 0.05, R, BIKE.zr], 0.022, [1, 1, 1], 0, 1); }
  // saddle and post, rear carrier, rear mudguard, chain guard
  g.tube(ST, [0, BIKE.saddle[0] - 0.03, BIKE.saddle[1] + 0.01], 0.025, SILVER, 0);
  g.box(-0.075, 0.075, BIKE.saddle[0] - 0.04, BIKE.saddle[0] + 0.02, BIKE.saddle[1] - 0.13, BIKE.saddle[1] + 0.12, [0.09, 0.08, 0.08], 0);
  g.box(-0.1, 0.1, 0.74, 0.755, -0.78, -0.2, SILVER, 0, 'TBNSEW');
  for (const sx of [-1, 1]) g.tube([sx * 0.09, 0.74, -0.7], [sx * 0.06, R, BIKE.zr], 0.015, SILVER, 0);
  { const n = 8; for (let i = 0; i < n; i++) { const a0 = Math.PI * (0.15 + 0.75 * i / n), a1 = Math.PI * (0.15 + 0.75 * (i + 1) / n), P = (a, x) => [x, R + Math.sin(a) * (R + 0.05), BIKE.zr - Math.cos(a) * (R + 0.05)]; g.quad2(P(a0, -0.035), P(a0, 0.035), P(a1, 0.035), P(a1, -0.035), SILVER, 0); } }
  g.quad2([-0.07, 0.36, 0.1], [-0.07, 0.36, -0.5], [-0.07, 0.24, -0.5], [-0.07, 0.2, 0.1], BLACK, 0);
  // cranks and pedals
  for (const sx of [-1, 1]) {
    const x = sx * 0.085, dir = sx > 0 ? 1 : -1, end = [x, BBp[1] + dir * BIKE.crank, BBp[2]];
    g.tube([x, BBp[1], BBp[2]], end, 0.022, GREY, 3);
    g.box(end[0] - 0.05 + sx * 0.03, end[0] + 0.05 + sx * 0.03, end[1] - 0.012, end[1] + 0.012, end[2] - 0.035, end[2] + 0.035, BLACK, 3);
  }
  g.box(-0.02, 0.02, BBp[1] - 0.09, BBp[1] + 0.09, BBp[2] - 0.09, BBp[2] + 0.09, GREY, 3, 'EW');
  // steering: fork, stem, swept-back bars with grips, the basket, front mudguard, lamp
  for (const sx of [-1, 1]) g.tube([sx * 0.04, 0.72, 0.36], [sx * 0.05, R, BIKE.zf], 0.025, [1, 1, 1], 4, 1);
  g.tube([0, 0.8, 0.33], [0, 0.97, 0.3], 0.025, SILVER, 4);
  for (const sx of [-1, 1]) { g.tube([0, 0.97, 0.3], [sx * 0.2, 0.98, 0.22], 0.022, SILVER, 4); g.tube([sx * 0.2, 0.98, 0.22], [sx * 0.29, 0.97, 0.06], 0.024, SILVER, 4); g.tube([sx * 0.26, 0.975, 0.12], [sx * 0.3, 0.965, 0.0], 0.034, BLACK, 4); }
  { const x0 = -0.17, x1 = 0.17, y0 = 0.7, y1 = 0.93, z0 = 0.5, z1 = 0.82, W = [0.2, 0.2, 0.22];                   // wire basket
    g.quad2([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], W, 4); g.quad2([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], W, 4);
    g.quad2([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], W, 4); g.quad2([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], W, 4);
    g.quad2([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], W, 4);
    g.tube([0, 0.72, 0.4], [0, 0.72, 0.5], 0.02, SILVER, 4); }
  { const n = 7; for (let i = 0; i < n; i++) { const a0 = Math.PI * (0.1 + 0.55 * i / n), a1 = Math.PI * (0.1 + 0.55 * (i + 1) / n), P = (a, x) => [x, R + Math.sin(a) * (R + 0.05), BIKE.zf + Math.cos(a) * (R + 0.05)]; g.quad2(P(a0, -0.035), P(a0, 0.035), P(a1, 0.035), P(a1, -0.035), SILVER, 4); } }
  g.box(-0.03, 0.03, 0.62, 0.68, 0.42, 0.49, SILVER, 4);
  return g.geometry();
}

const BIKE_GLSL = /* glsl */`
attribute float bone; attribute float fcol; attribute vec4 aBike;   // wheel angle, crank angle, steer, frame colour (packed)
mat3 bX(float a){ float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 bAxis(vec3 k, float a){ float c = cos(a), s = sin(a), t = 1. - c; return mat3(t*k.x*k.x + c, t*k.x*k.y + s*k.z, t*k.x*k.z - s*k.y, t*k.x*k.y - s*k.z, t*k.y*k.y + c, t*k.y*k.z + s*k.x, t*k.x*k.z + s*k.y, t*k.y*k.z - s*k.x, t*k.z*k.z + c); }
vec3 bikeRGB(){ float c = aBike.w; float r = floor(c / 65536.); float g = floor((c - r * 65536.) / 256.); float b = c - r * 65536. - g * 256.; return pow(vec3(r, g, b) / 255., vec3(2.2)); }
void bikePose(inout vec3 p, inout vec3 n){
  int b = int(bone + 0.5);
  const vec3 FA = vec3(0., ${BIKE.rt.toFixed(3)}, ${BIKE.zf.toFixed(3)}), RA = vec3(0., ${BIKE.rt.toFixed(3)}, ${BIKE.zr.toFixed(3)}), BBP = vec3(0., ${BIKE.bb[0].toFixed(3)}, ${BIKE.bb[1].toFixed(3)});
  const vec3 HT = vec3(0., 0.8, 0.33); const vec3 AX = vec3(0., 0.985, -0.17);          // the steering axis (head tube, raked)
  mat3 Rs = bAxis(AX, aBike.z);
  if (b == 1) { mat3 R = bX(aBike.x); p = Rs * (R * (p - FA) + FA - HT) + HT; n = Rs * (R * n); }
  else if (b == 2) { mat3 R = bX(aBike.x); p = R * (p - RA) + RA; n = R * n; }
  else if (b == 3) { mat3 R = bX(-aBike.y); p = R * (p - BBP) + BBP; n = R * n; }
  else if (b == 4) { p = Rs * (p - HT) + HT; n = Rs * n; }
}`;

function bikeMaterials(ctx) {
  const inject = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + BIKE_GLSL); };
  const toon = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: ctx.mat.gradientMap });
  toon.onBeforeCompile = (sh) => {
    inject(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vec3 posedP = position; bikePose(posedP, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = posedP;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  if (fcol > 0.5) vColor.rgb *= bikeRGB();');
  };
  toon.customProgramCacheKey = () => 'bikes';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => { inject(sh); sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  { vec3 nn = vec3(0., 1., 0.); bikePose(transformed, nn); }'); };
  depth.customProgramCacheKey = () => 'bikes-depth';
  const nd = new THREE.ShaderMaterial({
    uniforms: { uFar: ctx.pipeline ? ctx.pipeline.ndMat.uniforms.uFar : { value: 2000 } },
    vertexShader: /* glsl */`
      #include <common>
      ${BIKE_GLSL}
      varying vec3 vN; varying float vD;
      void main(){ vec3 p = position, n = normal; bikePose(p, n); vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * n); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform float uFar; varying vec3 vN; varying float vD; void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n*0.5+0.5, vD/uFar); }`,
    side: THREE.DoubleSide,
  });
  return { toon, depth, nd };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
export class BikeRenderer {
  constructor(ctx, cap = 160) {
    const geo = bikeGeometry(), a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aBike', a);
    const M = bikeMaterials(ctx);
    const mesh = new THREE.InstancedMesh(geo, M.toon, cap);
    mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.customDepthMaterial = M.depth; mesh.layers.set(LAYER_CUSTOM_ND);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh = mesh; this.attr = a; this.cap = cap; this.i = 0;
    this.root = new THREE.Group(); this.root.name = 'bikes'; this.root.add(mesh);
    if (ctx.pipeline) ctx.pipeline.addCustomND(this.root, [[mesh, M.nd]]);
  }
  begin() { this.i = 0; }
  add(x, y, z, yaw, wheel, crank, steer, colour) {
    if (this.i >= this.cap) return false;
    const i = this.i++;
    _q.setFromAxisAngle(_y, yaw); _p.set(x, y, z); _m.compose(_p, _q, _s); this.mesh.setMatrixAt(i, _m);
    this.attr.setXYZW(i, wheel, crank, steer, colour);
    return true;
  }
  end() { this.mesh.count = this.i; this.mesh.instanceMatrix.needsUpdate = true; this.attr.needsUpdate = true; }
}
