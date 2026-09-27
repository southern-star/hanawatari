// 花渡市（仮）— terrain skeleton. A low river plain (下町 side, east) under the 見晴台 plateau (west, +22 m) with a
// steep scarp (崖線), the 鈴音川 valley cut into the plateau, the 澪川 river along the north with floodplains and
// levees, and the 汐見運河 canal. heightAt(x, z) is the bare ground (before roads and buildings adapt it).
import { Alignment, Profile, pointInPolygon, smoothstep, lerp } from './geom.js';

/** Walkable, fully built city (3 km × 3 km). Beyond it the far city continues as massing only. */
export const MAP = { x0: -1500, x1: 1500, z0: -1500, z1: 1500 };
export const FAR = { x0: -6000, x1: 6000, z0: -6000, z1: 6000 };

/** The plain rises gently away from the river: 0 m at the south levee, +1.2 m at the south edge. */
export function plainY(x, z) { return 1.2 * smoothstep(-800, 1500, z); }

// ------------------------------------------------------------------ 澪川 (river, flows west → east; +d = south bank)
export const RIVER = {
  name: '澪川', kana: 'みおがわ',
  align: new Alignment([[-6000, -1200], [-1900, -1070, 2500], [-1100, -1010, 1800], [-450, -990, 2500], [150, -1000, 2500], [750, -930, 1600], [1250, -850, 1600], [1900, -790, 2500], [6000, -600]], { name: 'river' }),
  halfW: 75, floodS: 90, floodN: 60,             // water half-width; floodplain width south / north
  waterY: -3, bedY: -6, floodY: -1,
  levee: { inner: 16, top: 10, outer: 22, y: 6.5 }, // slope widths (m) and crest height
};
RIVER.reach = RIVER.halfW + Math.max(RIVER.floodS, RIVER.floodN) + RIVER.levee.inner + RIVER.levee.top + RIVER.levee.outer + 2;
RIVER.align.axisIndex('x');

/** Offset of a river feature from the centreline (+ = south): side 'S' | 'N', what: 'water'|'flood'|'crest'|'foot'. */
export function riverOffset(side, what) {
  const R = RIVER, F = side === 'S' ? R.floodS : R.floodN, sg = side === 'S' ? 1 : -1;
  const d = { water: R.halfW, flood: R.halfW + F, crest: R.halfW + F + R.levee.inner + R.levee.top / 2, foot: R.halfW + F + R.levee.inner + R.levee.top + R.levee.outer }[what];
  return sg * d;
}

// ------------------------------------------------------------------ 見晴台 (plateau) and its scarp
export const PLATEAU = {
  name: '見晴台', kana: 'みはらしだい', height: 22, halfSlope: 20,
  // scarp line, north → south; the plateau lies on its right (west) side
  edge: new Alignment([[-1080, -1010], [-930, -700, 420], [-790, -350, 520], [-770, 0, 650], [-830, 320, 520], [-960, 650, 520], [-1080, 1000, 650], [-1150, 1700, 1500], [-1250, FAR.z1]], { name: 'scarp' }),
};
PLATEAU.poly = [...PLATEAU.edge.sample(20).map(p => [p.x, p.z]), [FAR.x0, FAR.z1], [FAR.x0, -1010]];
PLATEAU.edge.axisIndex('z');

function plateauAt(x, z) {
  const P = PLATEAU, xe = P.edge.crossAt(z);
  if (xe === null) return z > 0 && pointInPolygon(x, z, P.poly) ? P.height : 0;
  if (Math.abs(x - xe) > P.halfSlope * 1.6 + 6) return x < xe ? P.height : 0;   // well away from the scarp
  const n = P.edge.nearestWin(x, z, P.halfSlope + 2, 40);
  const t = n ? smoothstep(-P.halfSlope, P.halfSlope, n.d) : (x < xe ? 1 : 0);
  return P.height * t;
}

// ------------------------------------------------------------------ 鈴音川 (stream in a valley cut into the plateau)
export const VALLEY = {
  name: '鈴音川', kana: 'すずねがわ',
  align: new Alignment([[-3000, 470], [-1700, 400, 600], [-1350, 340, 300], [-1050, 285, 300], [-760, 250, 200], [-690, 244]], { name: 'valley' }),
  halfW: 30, side: 26,   // flat floor half-width, side-slope width
};
// the floor runs out onto the plain at the mouth without a step (the carve only ever lowers the ground)
VALLEY.align.axisIndex('x');
VALLEY.mouthX = -835;   // where the 鈴音川 goes underground (暗渠), just before the tram crosses it at the foot of the scarp
VALLEY.floor = new Profile(VALLEY.align, [{ p: [-2600, 450], y: 21 }, { p: [-1700, 400], y: 11 }, { p: [-812, 255], y: 0.5 }, { p: [-690, 244], y: 0.4 }]);

// ------------------------------------------------------------------ 汐見運河 (canal, joins the river through a sluice gate)
export const CANAL = {
  name: '汐見運河', kana: 'しおみうんが',
  align: new Alignment([[1080, -880], [1070, 300, 900], [1120, 1700]], { name: 'canal' }),
  halfW: 18, waterY: -2, bedY: -4,
};
CANAL.align.axisIndex('z');

// ------------------------------------------------------------------ height
function riverSection(d, base) {
  const R = RIVER, a = Math.abs(d), F = d >= 0 ? R.floodS : R.floodN, W = R.halfW, L = R.levee;
  if (a < W - 12) return R.bedY;
  if (a < W + 2) return lerp(R.bedY, R.floodY, smoothstep(W - 12, W + 2, a));
  const e = a - (W + F);                     // distance beyond the floodplain edge
  if (e < 0) return R.floodY;
  let lev;
  if (e < L.inner) lev = lerp(R.floodY, L.y, e / L.inner);
  else if (e < L.inner + L.top) lev = L.y;
  else if (e < L.inner + L.top + L.outer) lev = lerp(L.y, Math.min(base, L.y), smoothstep(0, 1, (e - L.inner - L.top) / L.outer));
  else lev = -Infinity;
  // where the plateau meets the river the bank becomes a steep bluff (max slope 2:1)
  return Math.min(Math.max(base, lev), R.floodY + e * 2);
}

/** Bare ground height (m) at (x, z). */
export function heightAt(x, z) {
  let y = plainY(x, z) + plateauAt(x, z);
  const v = y > 3 ? VALLEY.align.nearestWin(x, z, VALLEY.halfW + VALLEY.side, 60) : null;
  if (v) {
    const floor = VALLEY.floor.yAt(v.s), ad = Math.abs(v.d);
    y = Math.min(y, lerp(floor, y, smoothstep(VALLEY.halfW, VALLEY.halfW + VALLEY.side, ad)));
    if (x < VALLEY.mouthX && ad < 3.2) y = Math.min(y, floor - 0.9 + 0.9 * smoothstep(1.8, 3.2, ad));   // the stream's channel
  }
  const zc = RIVER.align.crossAt(x);
  const r = zc !== null && Math.abs(z - zc) > RIVER.reach * 1.1 + 10 ? null : RIVER.align.nearestWin(x, z, RIVER.reach, 70);
  if (r) y = riverSection(r.d, y);
  const xc = CANAL.align.crossAt(z);
  const c = xc !== null && Math.abs(x - xc) > CANAL.halfW + 8 ? null : CANAL.align.nearestWin(x, z, CANAL.halfW + 1.5, 30);
  if (c) y = Math.min(y, Math.abs(c.d) < CANAL.halfW ? CANAL.bedY : lerp(CANAL.bedY, y, (Math.abs(c.d) - CANAL.halfW) / 1.5));
  return y;
}

/** What the ground is at (x, z) — for maps and generators. */
export function groundKind(x, z) {
  const c = CANAL.align.nearestWin(x, z, CANAL.halfW, 30);
  if (c) return 'canal';
  const r = RIVER.align.nearestWin(x, z, RIVER.reach, 70);
  if (r) {
    const a = Math.abs(r.d), F = r.d >= 0 ? RIVER.floodS : RIVER.floodN;
    if (a < RIVER.halfW) return 'water';
    if (a < RIVER.halfW + F) return 'flood';
    if (heightAt(x, z) > plainY(x, z) + 1.5 && plateauAt(x, z) < 1) return 'levee';
  }
  const p = plateauAt(x, z);
  if (p > 0.5 && p < PLATEAU.height - 0.5) return 'scarp';
  const v = VALLEY.align.nearestWin(x, z, VALLEY.halfW, 60);
  if (v && p > 0.5) return 'valley';
  return p >= PLATEAU.height - 0.5 ? 'plateau' : 'plain';
}
