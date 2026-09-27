// Level crossings (踏切) where a road crosses a railway at grade: warning posts (crossbuck, twin red lamps, bell box)
// and gates (black-and-yellow booms) on both sides of the tracks. They come alive when a real train of that line is
// within ~300 m (or still on the crossing): lamps flash alternately, the booms come down, and rise again after.
import * as THREE from 'three';
import { computeCrossings } from '../plan/crossings.js';
import { LINE } from '../plan/rail.js';
import { ROAD } from '../plan/roads.js';
import { groundAt } from '../plan/ground.js';
import { TRACKS } from './structures.js';
import { MB, rgb } from './mb.js';

const POST = rgb('#e9e7e2'), BLACK = rgb('#2d2b33'), YELLOW = rgb('#f2c230'), RED_OFF = rgb('#5a2a2a'), BOX = rgb('#8e969d');

function boomGeometry(len) {
  const mb = new MB(), n = Math.max(3, Math.round(len / 0.5));
  for (let i = 0; i < n; i++) { const x0 = (len * i) / n, x1 = (len * (i + 1)) / n; mb.box(x0, x1, -0.06, 0.06, -0.05, 0.05, i & 1 ? BLACK : YELLOW, 'NSEWTB'); }
  return mb.geometry();
}

export class LevelCrossings {
  constructor(ctx, trains) {
    this.ctx = ctx; this.trains = trains; this.items = [];
    this.root = new THREE.Group(); this.root.name = 'fumikiri';
    const mat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.03, name: 'fumikiri' });
    this.lampOn = ctx.mat.emissive('#ff3a2a', 2.2); this.lampOff = ctx.mat.toon('#5a2a2a', { paint: 0.02 });
    const lampGeo = new THREE.CircleGeometry(0.16, 16);
    for (const c of computeCrossings()) {
      if (c.type !== 'level-crossing') continue;
      const rail = LINE[c.a] || LINE[c.b], road = ROAD[c.a] || ROAD[c.b]; if (!rail || !road) continue;
      const sr = LINE[c.a] ? c.sa : c.sb, sd = ROAD[c.a] ? c.sa : c.sb;
      const q = road.align.at(sd), tr = TRACKS[rail.kind], half = Math.max(...tr.map(Math.abs)) + 2.6, hw = road.w / 2;
      const posts = [];
      // for each approach side (before / after the tracks along the road) put a post at the left kerb, plus one at the
      // right kerb on wide roads
      for (const side of [-1, 1]) {
        const cx = c.x + q.hx * side * half, cz = c.z + q.hz * side * half;   // along the road from the crossing
        const kerbs = road.w >= 18 ? [-1, 1] : [side];
        for (const k of kerbs) {
          const off = k * (hw - 0.6), x = cx - q.hz * off, z = cz + q.hx * off, y = groundAt(x, z);
          const g = new THREE.Group(); g.position.set(x, y, z);
          // face approaching traffic (which comes from the far side along the road)
          g.rotation.y = Math.atan2(q.hx * side, q.hz * side);
          const mb = new MB();
          mb.box(-0.06, 0.06, 0, 3.6, -0.06, 0.06, POST, 'NSEWT');                                   // post
          mb.box(-0.2, 0.2, 3.6, 3.95, -0.2, 0.2, BOX, 'NSEWT');                                     // bell box
          for (const [a, s] of [[Math.PI / 4, 1], [-Math.PI / 4, 1]]) { const from = mb.n; mb.box(-0.55, 0.55, -0.07, 0.07, 0.07, 0.1, YELLOW, 'NSEWT'); mb.place(from, 0, 0, 3.15, 0); void a; void s; }
          mb.box(-0.48, 0.48, 2.3, 2.42, 0.02, 0.1, BLACK, 'S');                                     // lamp bar
          mb.box(-0.5, 0.5, 0, 0.9, -0.3, 0.3, BOX, 'NSEWT');                                        // gate machine
          const post = new THREE.Mesh(mb.geometry(), mat); post.castShadow = true; g.add(post);
          // crossbuck arms (rotated ±45°) in yellow with black borders
          for (const a of [Math.PI / 4, -Math.PI / 4]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.04), ctx.mat.toon('#f2c230', { paint: 0.02 })); arm.position.set(0, 3.15, 0.12); arm.rotation.z = a; g.add(arm); }
          const lamps = [-0.3, 0.3].map((lx) => { const m = new THREE.Mesh(lampGeo, this.lampOff); m.position.set(lx, 2.1, 0.13); g.add(m); return m; });
          // boom: pivots at the gate machine, reaches across the carriageway
          const dir = k * side;                                                                  // local x toward the road centre
          const pivot = new THREE.Group(); pivot.position.set(0.3 * dir, 0.75, 0); g.add(pivot);
          const len = Math.min(hw * (kerbs.length > 1 ? 1 : 2) - 1.2, 11);
          const boom = new THREE.Mesh(boomGeometry(len), mat); boom.castShadow = true;
          pivot.add(boom); pivot.userData.dir = dir;                                               // lowers toward the road centre
          pivot.scale.x = pivot.userData.dir;
          this.root.add(g);
          posts.push({ g, lamps, pivot });
        }
      }
      // which services run over this crossing, and where the crossing is on their routes
      const svc = [];
      for (const S of trains.svc) for (const part of S.route.parts) if (part.L.id === rail.id) svc.push({ S, uc: part.off + sr });
      this.items.push({ c, rail, posts, svc, down: 0 });
    }
  }
  update(t, dt) {
    for (const it of this.items) {
      let active = false;
      for (const a of this.trains.active) {
        const s = it.svc.find(v => v.S.id === a.svc); if (!s) continue;
        const uc = a.dir > 0 ? s.uc : s.S.route.length - s.uc;       // crossing on the train's own axis
        const ahead = uc - a.u;                                       // + = crossing still ahead of the head
        if (ahead < 320 && ahead > -s.S.trainLen - 8) { active = true; break; }
      }
      it.active = active;
      it.down = dt > 0 ? Math.max(0, Math.min(1, it.down + (active ? 1 : -1) * dt / 4)) : (active ? 1 : 0);
      const ang = (1 - it.down) * Math.PI * 0.46;
      const on = active && (Math.floor(t * 1.6) & 1);
      for (const p of it.posts) {
        p.pivot.rotation.z = ang * p.pivot.userData.dir;
        p.lamps[0].material = active && on ? this.lampOn : this.lampOff;
        p.lamps[1].material = active && !on ? this.lampOn : this.lampOff;
      }
    }
  }
}
