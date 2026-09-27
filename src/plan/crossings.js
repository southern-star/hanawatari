// Every place where two plan features cross: level crossings (踏切), the tram's street running, diamond crossings,
// road intersections, grade separations (with vertical clearance checks), bridges and tunnels. Generators use the
// same list later (crossing gates, bridge decks, portals), so it lives with the plan.
import { crossings } from './geom.js';
import { heightAt, RIVER, CANAL, VALLEY } from './terrain.js';
import { LINES } from './rail.js';
import { ROADS } from './roads.js';

/** Envelope above the running surface that must stay free (m), and structure depth below it (m). */
const NEED = { jr: 5.7, private: 5.7, metro: 5.7, tram: 5.0, agt: 3.8, expressway: 4.7, ramp: 4.7, national: 4.7, arterial: 4.7, collector: 4.7, old: 4.5, street: 3.8 };
const DEPTH = { jr: 2.0, private: 2.0, metro: 2.0, tram: 0.6, agt: 1.6, expressway: 2.2, ramp: 1.8, national: 2.0, arterial: 2.0, collector: 1.6, old: 1.4, street: 1.2 };

const feats = () => [
  ...LINES.map(l => ({ f: l, kind: l.kind, rail: true, id: l.id, name: l.name })),
  ...ROADS.map(r => ({ f: r, kind: r.cls, rail: false, id: r.id, name: r.name })),
];

let cache = null;
/** [{ a, b (feature ids), x, z, ya, yb, ground, type, clearance, ok, note }] */
export function computeCrossings() {
  if (cache) return cache;
  const F = feats(), out = [];
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const A = F[i], B = F[j];
    if (A.f.runsOn?.includes(B.id) || B.f.runsOn?.includes(A.id)) continue;   // a tram on its own street
    for (const c of crossings(A.f.align, B.f.align)) {
      const ya = A.f.profile.yAt(c.sa), yb = B.f.profile.yAt(c.sb), ground = heightAt(c.x, c.z);
      const rec = { a: A.id, b: B.id, x: c.x, z: c.z, sa: c.sa, sb: c.sb, ya, yb, ground };
      if (Math.abs(ya - yb) < 1.2) {
        const tram = A.kind === 'tram' || B.kind === 'tram';
        if (A.rail && B.rail) rec.type = tram ? 'diamond' : 'rail-junction';
        else if (A.rail || B.rail) rec.type = tram ? 'street-running' : 'level-crossing';
        else rec.type = 'intersection';
        rec.ok = !(A.rail && B.rail && !tram); rec.clearance = 0;
        if (rec.type === 'level-crossing' && Math.abs(ya - ground) > 1.5) { rec.ok = false; rec.note = 'at-grade crossing off the ground'; }
      } else {
        const up = ya > yb ? A : B, lo = ya > yb ? B : A, yu = Math.max(ya, yb), yl = Math.min(ya, yb);
        rec.upper = up.id; rec.lower = lo.id;
        rec.clearance = (yu - DEPTH[up.kind]) - (yl + NEED[lo.kind]);
        rec.type = 'grade-separated';
        rec.ok = rec.clearance >= 0;
      }
      out.push(rec);
    }
  }
  // water: river centreline, canal centreline, valley stream
  const waters = [
    { id: 'river', name: RIVER.name, align: RIVER.align, surface: RIVER.waterY, bed: RIVER.bedY, free: 5 },
    { id: 'canal', name: CANAL.name, align: CANAL.align, surface: CANAL.waterY, bed: CANAL.bedY, free: 3 },
    { id: 'valley', name: VALLEY.name, align: VALLEY.align, surface: null, bed: null, free: 3 },
  ];
  for (const W of waters) for (const A of F) {
    for (const c of crossings(A.f.align, W.align)) {
      const y = A.f.profile.yAt(c.sa), ground = heightAt(c.x, c.z);
      const surface = W.surface ?? ground;
      const rec = { a: A.id, b: W.id, x: c.x, z: c.z, sa: c.sa, ya: y, yb: surface, ground };
      if (W.id === 'valley' && Math.abs(y - ground) < 1.5) { rec.type = 'culvert'; rec.clearance = 0; rec.ok = true; }
      else if (y - DEPTH[A.kind] > surface + W.free - 0.01) { rec.type = 'bridge'; rec.clearance = y - DEPTH[A.kind] - surface; rec.ok = true; }
      else if (y + NEED[A.kind] + 5 < (W.bed ?? ground)) { rec.type = 'tunnel'; rec.clearance = (W.bed ?? ground) - (y + NEED[A.kind]); rec.ok = true; }
      else { rec.type = 'water-conflict'; rec.clearance = y - DEPTH[A.kind] - surface - W.free; rec.ok = false; }
      out.push(rec);
    }
  }
  return (cache = out);
}

export const CROSSING_LABEL = {
  'level-crossing': '踏切', 'diamond': 'ダイヤモンドクロス', 'street-running': '併用軌道の交差点', 'rail-junction': '線路の平面交差',
  'intersection': '交差点', 'grade-separated': '立体交差', 'bridge': '橋', 'tunnel': 'トンネル', 'culvert': '暗渠の上', 'water-conflict': '水面と干渉',
};
