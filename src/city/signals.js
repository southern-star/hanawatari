// Traffic signals (信号機) at every junction where planned roads meet (the ones with zebra crossings). On each
// approach: a pole at the kerb just past the zebra, an arm over the incoming lanes, and the horizontal three-lamp head
// (green · yellow · red from the driver's left, as in Japan); pedestrian signals at both ends of every zebra. Each
// junction runs a fixed cycle: the major road and the cross road take turns, pedestrians cross while the traffic they
// cross is held. Built once for the whole map; lamps are instanced (lit / unlit) and switched in update(t).
import * as THREE from 'three';
import { groundAt } from '../plan/ground.js';
import { MB, rgb } from './mb.js';

const RANK = { alley: 0, street: 1, old: 2, collector: 3, arterial: 4, national: 5 };
const CYCLE = 64, GREEN = 26, AMBER = 3, FLASH = 5;      // s; the cross road gets the second half; the walk light blinks for its last 5 s
const POLE = rgb('#9aa1a8'), HEAD = rgb('#3b3e45'), VISOR = rgb('#2c2e33'), PED = rgb('#40434a');
const LAMPS = { g: '#35d07f', y: '#f5c030', r: '#ff4030', pr: '#ff4a3a', pg: '#3fe08a' };

export class Signals {
  constructor(ctx, net, raster = null) {
    this.root = new THREE.Group(); this.root.name = 'signals';
    this.junctions = []; this.byNode = new Map();
    const mb = new MB(), lamps = { g: [], y: [], r: [], pr: [], pg: [] };
    let seed = 0;
    for (const nd of net.nodes) {
      if (nd.plain || !nd.arms.some(a => a.crosswalk)) continue;
      const major = nd.arms.reduce((m, a) => (!m || RANK[a.cls] > RANK[m.cls] || (a.cls === m.cls && a.cw > m.cw) ? a : m), null).way;
      const J = { offset: (seed++ * 17.3) % CYCLE, lamps: [] };
      this.byNode.set(nd.id, J);
      for (const a of nd.arms) {
        if (!a.crosswalk) continue;
        const group = a.way === major ? 0 : 1;
        const P = (t, d) => [nd.x + a.ux * t - a.uz * d, nd.z + a.uz * t + a.ux * d];
        const rotU = Math.atan2(a.ux, a.uz);                                 // local +z → the arm's direction u
        // vehicle signal: pole on the incoming side (+n), arm over the lanes, head facing the traffic (+u)
        const dPole = a.cw + (a.sw > 0 ? 0.9 : 0.6), [px, pz] = P(a.cut + 5.4, dPole), gy = groundAt(px, pz);
        // under a viaduct: a short pole with the head beside the kerb, clear of the deck
        const head = raster ? Math.min(raster.headAt(px, pz), raster.headAt(...P(a.cut + 5.4, dPole - 3))) : Infinity, low = head < 6.2;
        const reach = low ? 0.55 : Math.min(Math.max(3, a.cw - 1.2), 7.5), [hx, hz] = P(a.cut + 5.4, dPole - reach), hy = gy + (low ? Math.min(5.25, head - 0.75) : 5.25);
        mb.obox(px, gy - 0.3, pz, 0.24, hy - gy + 0.75, 0.24, rotU, POLE);
        { const mx = (px + hx) / 2, mz = (pz + hz) / 2; mb.obox(mx, hy + 0.3, mz, reach, 0.14, 0.14, rotU, POLE); }
        mb.obox(hx, hy - 0.22, hz, 1.3, 0.44, 0.3, rotU, HEAD);
        mb.obox(hx + a.ux * 0.2, hy + 0.2, hz + a.uz * 0.2, 1.36, 0.04, 0.26, rotU, VISOR);
        // lamps on the face toward the traffic; green at the driver's left (+n), red at the right
        for (const [k, dd] of [['g', 0.42], ['y', 0], ['r', -0.42]]) {
          const lx = hx + a.ux * 0.16 - a.uz * dd, lz = hz + a.uz * 0.16 + a.ux * dd;
          const L = { kind: k, group, veh: true, p: [lx, hy, lz], rot: rotU };
          lamps[k].push(L); J.lamps.push(L);
        }
        // pedestrian signals at both ends of the zebra, each facing across to the other end
        for (const sg of [-1, 1]) {
          const [qx, qz] = P(a.cut + 2.5, sg * (a.cw + (a.sw > 0 ? 0.6 : 0.4))), g2 = groundAt(qx, qz);
          const face = Math.atan2(a.uz * sg, -a.ux * sg);                   // local +z → toward the other kerb (−sg·n)
          mb.obox(qx, g2 - 0.3, qz, 0.14, 2.9, 0.14, face, POLE);
          mb.obox(qx, g2 + 1.9, qz, 0.36, 0.78, 0.24, face, PED);
          for (const [k, dy] of [['pr', 2.47], ['pg', 2.08]]) {
            const L = { kind: k, group, veh: false, p: [qx - a.uz * sg * -0.13, g2 + dy, qz + a.ux * sg * -0.13], rot: face };
            lamps[k].push(L); J.lamps.push(L);
          }
        }
        ctx.physics.addCylinder(px, pz, 0.2, gy - 1, hy + 0.3);
      }
      this.junctions.push(J);
    }
    const mat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.04, name: 'signals' });
    const m = mb.mesh(mat); if (m) this.root.add(m);
    // instanced lamps: a lit and an unlit mesh per colour; a lamp lives in one of them at a time
    const geo = new THREE.CircleGeometry(0.13, 14);
    this.sets = {};
    for (const k of Object.keys(lamps)) {
      const n = lamps[k].length; if (!n) continue;
      const lit = new THREE.InstancedMesh(geo, ctx.mat.emissive(LAMPS[k], 2.4), n), dim = new THREE.InstancedMesh(geo, ctx.mat.toon(new THREE.Color(LAMPS[k]).multiplyScalar(0.22).getStyle(), { paint: 0.02 }), n);
      for (const im of [lit, dim]) { im.frustumCulled = false; ctx.noOutline(im); this.root.add(im); }
      lamps[k].forEach((L, i) => { L.i = i; });
      this.sets[k] = { lit, dim, list: lamps[k] };
    }
    this._m = new THREE.Matrix4(); this._z = new THREE.Matrix4().makeScale(0, 0, 0); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this.last = -1;
    this.update(0);
  }
  /** The vehicle light an approach of group `group` shows at junction node `ndId` at time t: 'g' | 'y' | 'r'. */
  vehState(ndId, group, t) { const J = this.byNode.get(ndId); if (!J) return 'g'; return Signals.state(group, (t + J.offset) % CYCLE); }
  /** The walk light over the zebra across an approach of group `group`: 'go' | 'flash' (青点滅: don't start) | 'stop'.
   *  People cross an approach while its traffic is held and the other road's flows. */
  pedState(ndId, group, t) {
    const J = this.byNode.get(ndId); if (!J) return 'go';
    return Signals.ped(group, (t + J.offset) % CYCLE);
  }
  static ped(group, c) {
    if (Signals.state(group, c) !== 'r') return 'stop';
    const o = group === 0 ? (c + CYCLE / 2) % CYCLE : c;                            // the other group's own clock
    return o < GREEN - FLASH ? 'go' : o < GREEN ? 'flash' : 'stop';
  }
  /** Which lamp of group `group` is on at cycle time c (0..CYCLE). */
  static state(group, c) {
    const t = group === 0 ? c : (c + CYCLE / 2) % CYCLE;
    return t < GREEN ? 'g' : t < GREEN + AMBER ? 'y' : 'r';
  }
  update(t) {
    const tick = Math.floor(t * 2); if (tick === this.last) return; this.last = tick;
    for (const J of this.junctions) {
      const c = (t + J.offset) % CYCLE;
      for (const L of J.lamps) {
        let on;
        if (L.veh) on = Signals.state(L.group, c) === L.kind;
        else {                        // pedestrians cross this approach while its traffic is held and the other flows
          const ps = Signals.ped(L.group, c), blink = (Math.floor(t * 2) & 1) === 0;
          on = L.kind === 'pg' ? ps === 'go' || (ps === 'flash' && blink) : ps === 'stop';
        }
        const S = this.sets[L.kind];
        this._e.set(0, L.rot, 0); this._q.setFromEuler(this._e); this._v.set(L.p[0], L.p[1], L.p[2]);
        this._m.compose(this._v, this._q, this._s);
        S.lit.setMatrixAt(L.i, on ? this._m : this._z); S.dim.setMatrixAt(L.i, on ? this._z : this._m);
      }
    }
    for (const k in this.sets) { this.sets[k].lit.instanceMatrix.needsUpdate = true; this.sets[k].dim.instanceMatrix.needsUpdate = true; }
  }
}
