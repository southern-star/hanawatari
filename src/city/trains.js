// Trains of 花渡市: parametric cel-shaded cars in each operator's livery, running to timetables that are pure
// functions of time (deterministic screenshots). Every service runs one way along a route (one line, or two joined
// for through-running), keeps left, stops at its stations (accelerate / cruise / brake / dwell), and enters and leaves
// the map at the ends of the route. Cars are InstancedMeshes (one per car model), posed every frame.
import * as THREE from 'three';
import { LINE, STATIONS } from '../plan/rail.js';
import { heightAt } from '../plan/terrain.js';
import { levelOf } from '../plan/ground.js';
import { MB, rgb, shade } from './mb.js';

// ------------------------------------------------------------------ services
// car: livery key; n: cars per train; headway (s); phase (s); stops: 'all' or station ids; vmax (m/s)
export const SERVICES = [
  { id: 'tr-local', name: '東和本線 各駅停車', route: ['tr'], track: 10.5, car: 'tr', n: 10, headway: 300, phase: 0, stops: 'all', vmax: 25, acc: 0.8, dwell: 30 },
  { id: 'tr-rapid', name: '東和本線 快速', route: ['tr'], track: 5.5, car: 'tr', n: 10, headway: 360, phase: 150, stops: ['hanawatari-tr'], vmax: 33, acc: 0.7, dwell: 40 },
  { id: 'shiomi', name: '汐見線・見晴線 直通', route: ['miharashi', 'shiomi'], track: 2, car: 'shiomi', n: 8, headway: 300, phase: 70, stops: 'all', vmax: 25, acc: 0.85, dwell: 30 },
  { id: 'minato', name: '湊線', route: ['minato'], track: 2, car: 'minato', n: 6, headway: 360, phase: 20, stops: 'all', vmax: 22, acc: 0.9, dwell: 25 },
  { id: 'tram', name: '花渡電軌', route: ['tram'], track: 1.6, car: 'tram', n: 1, headway: 330, phase: 0, stops: 'all', vmax: 10, acc: 1.0, dwell: 18 },
  { id: 'liner', name: '花渡ライナー', route: ['liner'], track: 2, car: 'liner', n: 5, headway: 300, phase: 100, stops: 'all', vmax: 16, acc: 0.9, dwell: 25 },
];

const LIVERY = {
  tr: { len: 20, w: 2.95, h: 3.7, body: '#d9dde0', band: '#2f9e44', band2: '#2f9e44', roof: '#9aa1a8', win: '#3d4a5a', door: '#c5cbd0', front: '#2b2f38', style: 'stainless' },
  shiomi: { len: 20, w: 2.85, h: 3.65, body: '#f2ece0', band: '#1c7ed6', band2: '#8fc1ee', roof: '#a3a9b0', win: '#384656', door: '#ddd6ca', front: '#2d3440', style: 'painted' },
  minato: { len: 18, w: 2.8, h: 3.6, body: '#f1ebdf', band: '#d9363e', band2: '#d9363e', roof: '#9ea4ab', win: '#39434f', door: '#e4ddd0', front: '#d9363e', style: 'twotone' },
  tram: { len: 13, w: 2.4, h: 3.45, body: '#fbf3f5', band: '#e64980', band2: '#f3a6c3', roof: '#c9ced3', win: '#3a4655', door: '#f0e6ea', front: '#3a4655', style: 'tram' },
  liner: { len: 9, w: 2.5, h: 3.3, body: '#f4f6f6', band: '#0c8599', band2: '#7fcad6', roof: '#c3c9cf', win: '#2f3c4b', door: '#e9eeee', front: '#2f3c4b', style: 'agt' },
};

// ------------------------------------------------------------------ routes (lines joined end to end)
class Route {
  constructor(ids) {
    this.parts = []; let off = 0;
    for (const id of ids) { const L = LINE[id]; this.parts.push({ L, off }); off += L.align.length; }
    this.length = off;
  }
  /** Line, local s at route distance u. */
  at(u) { let p = this.parts[0]; for (const q of this.parts) if (u >= q.off) p = q; return { L: p.L, s: Math.min(p.L.align.length, Math.max(0, u - p.off)) }; }
  stationsOf(stops) {
    const out = [];
    for (const { L, off } of this.parts) for (const st of STATIONS) {
      if (st.line !== L.id && !(st.shared || []).includes(L.id)) continue;
      if (stops !== 'all' && !stops.includes(st.id)) continue;
      const s = st.line === L.id ? st.s : L.align.sOf(st.x, st.z);
      if (st.line !== L.id && (s <= 1 || s >= L.align.length - 1)) continue;   // shared platform lies on the other line
      out.push(off + s);
    }
    return [...new Set(out.map(v => Math.round(v)))].sort((a, b) => a - b);
  }
}

/** Head position table u(t) for one direction: accelerate, cruise, brake to stop the train centred on each platform, dwell. */
function runTable(route, svc, dir, trainLen) {
  const L = route.length, stops = route.stationsOf(svc.stops).map(s => (dir > 0 ? s : L - s) + trainLen / 2).filter(u => u > trainLen && u < L).sort((a, b) => a - b);
  const dt = 0.5, dec = svc.acc * 1.05, T = [], V = [];
  let u = 0, v = svc.vmax * 0.8, t = 0, si = 0, dwell = 0;
  while (u < L + trainLen + 5 && t < 3600) {
    T.push(u); V.push(v);
    if (dwell > 0) { dwell -= dt; t += dt; continue; }
    const next = si < stops.length ? stops[si] : Infinity, dist = next - u;
    if (dist < 0.4 && v < 0.6) { u = next; v = 0; dwell = svc.dwell; si++; t += dt; continue; }
    const brake = (v * v) / (2 * dec);
    if (dist <= brake + v * dt) v = Math.max(0.4, Math.sqrt(Math.max(0, 2 * dec * Math.max(0, dist - 0.3))));
    else v = Math.min(svc.vmax, v + svc.acc * dt);
    u = Math.min(u + v * dt, dist > 0 ? next : u + v * dt);
    t += dt;
  }
  return { T: Float32Array.from(T), V: Float32Array.from(V), dt, dur: T.length * dt };
}

// ------------------------------------------------------------------ car models
export function carModel(key, cab) {
  const S = LIVERY[key], mb = new MB(), L = S.len, hw = S.w / 2, H = S.h;
  const body = rgb(S.body), band = rgb(S.band), band2 = rgb(S.band2), roof = rgb(S.roof), win = rgb(S.win), door = rgb(S.door), front = rgb(S.front), under = rgb('#4f535b'), bogie = rgb('#3f4249');
  const z0 = -L / 2 + 0.1, z1 = L / 2 - 0.1;
  const yF = S.style === 'tram' ? 0.35 : S.style === 'agt' ? 0.6 : 1.05;       // body bottom above rail top
  const yW0 = yF + 0.95, yW1 = yF + 1.85, yR = H - 0.35;
  // body sides in horizontal bands (livery), doors as panels breaking the window band
  const doors = S.style === 'tram' ? [-3.5, 3.5] : S.style === 'agt' ? [0] : L >= 20 ? [-7.2, -2.4, 2.4, 7.2] : [-5.6, 0, 5.6];
  const dw = S.style === 'agt' ? 0.9 : 0.65;
  const bands = S.style === 'stainless' ? [[yF, yF + 0.15, body], [yF + 0.15, yF + 0.45, band], [yF + 0.45, yW0, body], [yW0, yW1, win], [yW1, yW1 + 0.08, band2], [yW1 + 0.08, yR, body]]
    : S.style === 'twotone' ? [[yF, yW0 - 0.1, band], [yW0 - 0.1, yW0, body], [yW0, yW1, win], [yW1, yR, body]]
    : S.style === 'tram' ? [[yF, yF + 0.9, band], [yF + 0.9, yF + 1.05, band2], [yF + 1.05, yW1 + 0.35, win], [yW1 + 0.35, yR, body]]
    : [[yF, yF + 0.25, body], [yF + 0.25, yF + 0.5, band], [yF + 0.5, yW0, body], [yW0, yW1, win], [yW1, yW1 + 0.12, band2], [yW1 + 0.12, yR, body]];
  for (const sg of [-1, 1]) {
    const x = sg * hw;
    const cuts = [z0, ...doors.flatMap(d => [d - dw, d + dw]), z1];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const za = cuts[k], zb = cuts[k + 1], isDoor = k % 2 === 1;
      for (const [ya, yb, c] of bands) {
        const col = isDoor && ya >= yF + 0.1 && yb <= yR ? (c === win ? shade(door, 0.85) : door) : c;
        if (sg > 0) mb.quad([x, ya, zb], [x, ya, za], [x, yb, za], [x, yb, zb], col); else mb.quad([x, ya, za], [x, ya, zb], [x, yb, zb], [x, yb, za], col);
      }
      if (isDoor) { const wz0 = za + 0.12, wz1 = zb - 0.12; if (sg > 0) mb.quad([x + 0.01, yW0 + 0.05, wz1], [x + 0.01, yW0 + 0.05, wz0], [x + 0.01, yW1 - 0.1, wz0], [x + 0.01, yW1 - 0.1, wz1], win); else mb.quad([x - 0.01, yW0 + 0.05, wz0], [x - 0.01, yW0 + 0.05, wz1], [x - 0.01, yW1 - 0.1, wz1], [x - 0.01, yW1 - 0.1, wz0], win); }
    }
  }
  // roof: chamfered edges + top
  const rt = H, ri = hw - 0.3;
  mb.quad([hw, yR, z1], [hw, yR, z0], [ri, rt, z0], [ri, rt, z1], shade(roof, 0.9));
  mb.quad([-ri, rt, z1], [-ri, rt, z0], [-hw, yR, z0], [-hw, yR, z1], shade(roof, 0.9));
  mb.quad([-ri, rt, z1], [ri, rt, z1], [ri, rt, z0], [-ri, rt, z0], roof);
  // ends: gangway (flat) or cab front
  for (const end of [-1, 1]) {
    const z = end > 0 ? z1 : z0, isCab = cab && end > 0;
    const face = (ya, yb, xa, xb, c, dz = 0) => { if (end > 0) mb.quad([xa, ya, z + dz], [xb, ya, z + dz], [xb, yb, z + dz], [xa, yb, z + dz], c); else mb.quad([xb, ya, z + dz], [xa, ya, z + dz], [xa, yb, z + dz], [xb, yb, z + dz], c); };
    if (isCab) {
      const nose = S.style === 'agt' || S.style === 'tram' ? 0.6 : 0.35;
      face(yF, yW0, -hw, hw, S.style === 'twotone' ? band : S.style === 'stainless' ? band : body, 0);
      // raked windshield
      mb.quad([-hw, yW0, z1], [hw, yW0, z1], [hw * 0.92, yR, z1 - nose], [-hw * 0.92, yR, z1 - nose], front);
      mb.quad([-hw * 0.92, yR, z1 - nose], [hw * 0.92, yR, z1 - nose], [ri, rt, z1 - nose - 0.2], [-ri, rt, z1 - nose - 0.2], roof);
      for (const sg of [-1, 1]) mb.quad(...(sg > 0 ? [[hw, yW0, z1], [hw, yW0, z1 - 0.01], [hw * 0.92, yR, z1 - nose], [hw, yR, z1 - nose]] : [[-hw, yW0, z1 - 0.01], [-hw, yW0, z1], [-hw, yR, z1 - nose], [-hw * 0.92, yR, z1 - nose]]), body);
      // headlights
      for (const sg of [-1, 1]) face(yF + 0.35, yF + 0.55, sg * hw * 0.55 - 0.18, sg * hw * 0.55 + 0.18, rgb('#fff7d8'), 0.02);
      face(yF - 0.35, yF, -hw * 0.8, hw * 0.8, under, -0.2);   // skirt
    } else {
      face(yF, yR, -hw, hw, shade(body, 0.92), 0);
      face(yW0, yW1 - 0.1, -0.45, 0.45, win, 0.02);            // gangway door window
    }
  }
  // underfloor equipment and bogies
  mb.box(-hw + 0.25, hw - 0.25, yF - 0.55, yF, z0 + 2.2, z1 - 2.2, under, 'NSEW');
  if (S.style !== 'agt') for (const bz of [-(L / 2 - 2.6), L / 2 - 2.6]) mb.box(-1.05, 1.05, 0.05, Math.max(0.2, yF - 0.05), bz - 1.3, bz + 1.3, bogie, 'NSEWT');
  else for (const bz of [-(L / 2 - 1.8), L / 2 - 1.8]) mb.box(-1.1, 1.1, 0.0, yF - 0.05, bz - 0.6, bz + 0.6, bogie, 'NSEWT');
  // pantograph on electric heavy-rail cab cars
  if (cab && (S.style === 'stainless' || S.style === 'painted' || S.style === 'twotone')) { mb.box(-0.9, 0.9, rt, rt + 0.12, -L / 2 + 4.5, -L / 2 + 6.2, rgb('#6f757c'), 'NSEWT'); mb.box(-0.75, 0.75, rt + 1.2, rt + 1.26, -L / 2 + 5.2, -L / 2 + 5.5, rgb('#6f757c'), 'NSEWT'); }
  if (cab && S.style === 'tram') mb.box(-0.6, 0.6, rt + 0.9, rt + 0.95, -0.2, 0.2, rgb('#6f757c'), 'NSEWT');
  return mb.geometry();
}

// ------------------------------------------------------------------ the train system
export class Trains {
  constructor(ctx) {
    this.ctx = ctx;
    this.mat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.03, name: 'trains' });
    this.root = new THREE.Group(); this.root.name = 'trains';
    this.svc = SERVICES.map((svc) => {
      const route = new Route(svc.route), S = LIVERY[svc.car], trainLen = S.len * svc.n;
      const plus = runTable(route, svc, 1, trainLen), minus = runTable(route, svc, -1, trainLen);
      return { ...svc, route, S, trainLen, dirs: [{ d: 1, tab: plus }, { d: -1, tab: minus }] };
    });
    // one InstancedMesh per livery × {cab, middle}; capacity from the number of trains that can be on the route
    this.meshes = {};
    for (const key of Object.keys(LIVERY)) {
      let cap = 0; for (const s of this.svc) if (s.car === key) cap += 2 * s.n * (Math.ceil(Math.max(s.dirs[0].tab.dur, s.dirs[1].tab.dur) / s.headway) + 1);
      if (!cap) continue;
      const mk = (cab) => { const m = new THREE.InstancedMesh(carModel(key, cab), this.mat, cap); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.root.add(m); return m; };
      this.meshes[key] = { cab: mk(true), mid: mk(false) };
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._e = new THREE.Euler();
    this.active = [];
  }

  /** Where a point at route distance u (head direction dir) is: world position + heading, or null in a tunnel. */
  pointAt(svc, u, dir) {
    const r = svc.route; if (u < 0 || u > r.length) return null;
    const { L, s } = r.at(u), q = L.align.at(s), y = L.profile.yAt(s), d = -dir * svc.track;   // keep left
    return { x: q.x - q.hz * d, y, z: q.z + q.hx * d, hx: q.hx * dir, hz: q.hz * dir, tunnel: levelOf('rail', y, heightAt(q.x, q.z)) === 'tunnel' };
  }

  update(t) {
    for (const k in this.meshes) { this.meshes[k].cab.count = 0; this.meshes[k].mid.count = 0; }
    this.active.length = 0;
    for (const svc of this.svc) for (const D of svc.dirs) {
      const tab = D.tab, H = svc.headway, k0 = Math.floor((t - svc.phase - tab.dur) / H), k1 = Math.floor((t - svc.phase) / H);
      for (let k = k0; k <= k1; k++) {
        const tau = t - (svc.phase + k * H + (D.d < 0 ? H * 0.5 : 0)); if (tau < 0 || tau >= tab.dur) continue;
        const f = tau / tab.dt, i = Math.min(tab.T.length - 2, Math.floor(f)), uh = tab.T[i] + (tab.T[i + 1] - tab.T[i]) * (f - i);
        const v = tab.V[i];
        this.active.push({ svc: svc.id, dir: D.d, u: uh, v });
        const M = this.meshes[svc.car];
        for (let c = 0; c < svc.n; c++) {
          // car centre and its two bogie points along the route (u runs against the route when dir < 0)
          const uc = uh - (c + 0.5) * svc.S.len, ua = uc + svc.S.len * 0.35, ub = uc - svc.S.len * 0.35;
          const toS = (uu) => (D.d > 0 ? uu : svc.route.length - uu);
          const A = this.pointAt(svc, toS(ua), D.d), B = this.pointAt(svc, toS(ub), D.d);
          if (!A || !B || (A.tunnel && B.tunnel)) continue;
          const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2, cz = (A.z + B.z) / 2;
          const yaw = Math.atan2(A.x - B.x, A.z - B.z), pitch = -Math.atan2(A.y - B.y, Math.hypot(A.x - B.x, A.z - B.z));
          this._e.set(pitch, yaw, 0, 'YXZ'); this._q.setFromEuler(this._e); this._p.set(cx, cy, cz);
          // the first car's cab faces forward; the last car is a cab car turned around
          const isCab = c === 0 || c === svc.n - 1;
          if (c === svc.n - 1 && svc.n > 1) { this._e.set(-pitch, yaw + Math.PI, 0, 'YXZ'); this._q.setFromEuler(this._e); }
          this._m.compose(this._p, this._q, this._s);
          const target = isCab ? M.cab : M.mid;
          if (target.count < target.instanceMatrix.count) target.setMatrixAt(target.count++, this._m);
        }
      }
    }
    for (const k in this.meshes) { this.meshes[k].cab.instanceMatrix.needsUpdate = true; this.meshes[k].mid.instanceMatrix.needsUpdate = true; }
  }
}
