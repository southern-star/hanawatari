// Garden walls (ブロック塀) and hedges round the lots of the residential districts: the two sides and the back of each
// lot, never the street front. They split the backs of the blocks into the small yards they really are, and are solid.
import * as THREE from 'three';
import { groundAt } from '../plan/ground.js';
import { MB, rgb, shade } from './mb.js';

const WALLED = { shitamachi: 1.2, minami: 1.2, gaketa: 1.2, shuku: 1.5, teramachi: 1.7, 'miharashi-s': 1.5 };
const BLOCK = rgb('#bdb8ad'), BLOCK2 = rgb('#c9c3b6'), CAP = rgb('#a9a498'), HEDGE = rgb('#5f8f55'), HEDGE2 = rgb('#6d9a5f');

export function buildChunkWalls(ctx, lots) {
  const mb = new MB();
  for (const L of lots) {
    const H = WALLED[L.district]; if (!H || L.open) continue;
    const hedge = (L.district === 'teramachi' || L.district === 'miharashi-s') && ((L.id * 2654435761) >>> 0) % 3 === 0;
    const c = Math.cos(L.rot), s = Math.sin(L.rot), hw = L.w / 2 - 0.1, hd = L.d / 2 - 0.1, t = hedge ? 0.6 : 0.15;
    const edges = { 'u-': [-hw, 0, 0.001, hd * 2], 'u+': [hw, 0, 0.001, hd * 2], 'v-': [0, -hd, hw * 2, 0.001], 'v+': [0, hd, hw * 2, 0.001] };
    for (const [side, [lu, lv, ew, ed]] of Object.entries(edges)) {
      if (side === L.front) continue;
      const x = L.x + lu * c + lv * s, z = L.z - lu * s + lv * c, y = groundAt(x, z);
      const w = Math.max(ew, t), d = Math.max(ed, t);
      const col = hedge ? ((L.id & 1) ? HEDGE : HEDGE2) : ((L.id & 1) ? BLOCK : BLOCK2);
      mb.obox(x, y - 0.2, z, w, H + 0.2, d, L.rot, col);
      if (!hedge) mb.obox(x, y + H, z, w + 0.04, 0.06, d + 0.04, L.rot, CAP, 'NSEWT');
      ctx.physics.addBox(x, z, w, d, L.rot, y - 1, y + H);
    }
  }
  const m = mb.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.08, name: 'walls' }));
  void shade;
  return m;
}
