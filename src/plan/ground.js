// The built ground: natural terrain (terrain.heightAt) reshaped by every road and railway that runs on the
// ground — cuttings, embankments and the flat corridor they sit on. Structures (viaducts, bridges) and tunnels
// leave the terrain alone. groundAt(x, z) is what the player walks on and what the terrain meshes follow.
import { heightAt } from './terrain.js';
import { LINES } from './rail.js';
import { ROADS } from './roads.js';
import { clamp } from './geom.js';
import { computeCrossings } from './crossings.js';

/** How a line or road meets the ground at one point: rail/road top y vs. natural ground g. */
export function levelOf(kind, y, g) {
  const d = y - g;
  if (d > 6) return 'structure';              // viaduct / bridge / elevated deck
  if (d < (kind === 'road' ? -40 : -8)) return 'tunnel';   // roads here never tunnel; railways do below 8 m
  if (d > 0.8) return 'embankment';
  if (d < -0.8) return 'cut';
  return 'grade';
}

// ------------------------------------------------------------------ bridge spans
const RAIL_HW = { jr: 13, private: 6, metro: 5.5, tram: 3.8, agt: 4.5 };
const SLOPE = 1.5;                            // earthwork side slope (horizontal per vertical)
let SPANS = null;
/**
 * Where a road or railway crosses over another one that runs on the ground, it does so on a bridge: along that
 * stretch there is no embankment. Where the embankment resumes it ends at an abutment (a wall across the line, see
 * groundAt), but its side slopes still reach out sideways — on a skew crossing their corner comes nearest the road
 * below — so the span reaches the lower corridor's edge + 2 m + (the upper half-width + that slope) · cos, all ÷ sin
 * of the crossing angle. The slope is sized for the higher of the embankment at the crossing and where the span ends
 * (a line climbing to a bridge is higher there).
 */
export function bridgeSpans(id) {
  if (!SPANS) {
    SPANS = new Map();
    const F = new Map([...LINES.map(l => [l.id, l]), ...ROADS.map(r => [r.id, r])]);
    const hwOf = (f) => (f.w ? f.w / 2 : RAIL_HW[f.kind] ?? 5);
    for (const c of computeCrossings()) {
      if (c.type !== 'grade-separated') continue;
      const up = F.get(c.upper), lo = F.get(c.lower); if (!up || !lo) continue;
      const sUp = c.upper === c.a ? c.sa : c.sb, sLo = c.upper === c.a ? c.sb : c.sa;
      const g = heightAt(c.x, c.z), yLo = lo.profile.yAt(sLo), yUp = up.profile.yAt(sUp);
      if (yLo < g - 3 || yUp - g < 2.5) continue;                 // the lower one is sunk (no burial), or no real height
      const qa = up.align.at(sUp), qb = lo.align.at(sLo), sin = Math.max(0.3, Math.abs(qa.hx * qb.hz - qa.hz * qb.hx));
      const cos = Math.abs(qa.hx * qb.hx + qa.hz * qb.hz);
      let H = yUp - g, half = 0;
      for (let k = 0; k < 3; k++) {
        half = (hwOf(lo) + 2 + (hwOf(up) + H * SLOPE) * cos) / sin;
        for (const e of [sUp - half, sUp + half]) {
          if (e < 0 || e > up.align.length) continue;
          const q = up.align.at(e); H = Math.max(H, Math.min(6, up.profile.yAt(e) - heightAt(q.x, q.z)));
        }
      }
      let a = SPANS.get(up.id); if (!a) SPANS.set(up.id, (a = []));
      a.push([sUp - half, sUp + half]);
    }
  }
  return SPANS.get(id) || [];
}
/** levelOf + bridge spans: over another line an embankment (or a stretch at grade) is a bridge. */
function spanLevel(F, s, y, g) {
  const lv = levelOf(F.w ? 'road' : 'rail', y, g);
  if ((lv === 'embankment' || lv === 'grade') && bridgeSpans(F.id).some(([a, b]) => s > a && s < b)) return 'structure';
  return lv;
}
let ISLANDS = null;
/**
 * Short ground-contact stretches between two structure stretches — a viaduct passing a few metres over a levee crest,
 * say — stay a structure: an embankment there would be an island of earth as wide as the line whose end slopes
 * spill onto whatever passes beneath the viaduct nearby.
 */
function islands(id) {
  if (!ISLANDS) {
    ISLANDS = new Map();
    for (const F of [...LINES, ...ROADS]) {
      const A = F.align, n = Math.max(1, Math.ceil(A.length / 4)), lv = [];
      for (let i = 0; i <= n; i++) { const s = (A.length * i) / n, q = A.at(s), y = F.profile.yAt(s); lv.push({ s, lv: spanLevel(F, s, y, heightAt(q.x, q.z)) }); }
      const out = [];
      for (let i = 0; i < lv.length;) {
        if (lv[i].lv === 'structure') { i++; continue; }
        let j = i; while (j < lv.length && lv[j].lv !== 'structure') j++;
        if (i > 0 && j < lv.length && lv[j].s - lv[i - 1].s < 60 && lv.slice(i, j).every(p => p.lv === 'embankment' || p.lv === 'grade')) out.push([lv[i - 1].s, lv[j].s]);
        i = j;
      }
      if (out.length) ISLANDS.set(F.id, out);
    }
  }
  return ISLANDS.get(id) || [];
}
/** How a feature meets the ground at along-distance s (rail/road top y, natural ground g): levelOf + bridges. */
export function levelAt(F, s, y, g) {
  const lv = spanLevel(F, s, y, g);
  if ((lv === 'embankment' || lv === 'grade') && islands(F.id).some(([a, b]) => s > a && s < b)) return 'structure';
  return lv;
}

/** Corridor definitions: every road, and every railway except where it runs on a street. */
let CORR = null;
function corridors() {
  if (CORR) return CORR;
  const feats = [];
  for (const L of LINES) feats.push({ id: L.id, f: L, kind: 'rail', hw: { jr: 13, private: 6, metro: 5.5, tram: 3.8, agt: 4.5 }[L.kind], off: L.kind === 'tram' ? 0 : -0.55, order: 0 });
  for (const R of ROADS) feats.push({ id: R.id, f: R, kind: 'road', hw: R.w / 2, off: -0.04, order: { street: 1, old: 2, collector: 3, arterial: 4, ramp: 5, national: 6, expressway: 7 }[R.cls] });
  feats.sort((a, b) => a.order - b.order);
  // sample every 4 m; the ground-contact stretches become chains of segments in a 24 m grid index. A chain that
  // meets a structure ends at an abutment and one that meets a tunnel at its portal: a wall across the line, so
  // beyond that plane the chain leaves the ground alone (no cone of earth spilling under the deck / over the hill).
  const segs = [], grid = new Map(), CELL = 24, ground = (p) => p.lv !== 'structure' && p.lv !== 'tunnel';
  for (const F of feats) {
    const A = F.f.align, P = F.f.profile, n = Math.max(1, Math.ceil(A.length / 4)), smp = [];
    for (let i = 0; i <= n; i++) {
      const s = (A.length * i) / n, q = A.at(s), y = P.yAt(s), g = heightAt(q.x, q.z);
      smp.push({ s, x: q.x, z: q.z, y: y + F.off, lv: levelAt(F.f, s, y, g) });
    }
    for (let i = 0; i < smp.length;) {
      if (!ground(smp[i])) { i++; continue; }
      let j = i; while (j + 1 < smp.length && ground(smp[j + 1])) j++;
      if (j > i) {
        const chain = { ends: [] };
        // the wall's plane: 0.7 m behind the last ground sample (the abutment's back face), 1 m into a tunnel
        const end = (e, o) => { const dx = o.x - e.x, dz = o.z - e.z, l = Math.hypot(dx, dz) || 1, b = o.lv === 'tunnel' ? 1 : -0.7; chain.ends.push({ x: e.x + (dx / l) * b, z: e.z + (dz / l) * b, dx: dx / l, dz: dz / l }); };
        if (i > 0) end(smp[i], smp[i - 1]);
        if (j < smp.length - 1) end(smp[j], smp[j + 1]);
        for (let k = i; k < j; k++) {
          const a = smp[k], b = smp[k + 1], seg = { F, a, b, idx: segs.length, chain };
          segs.push(seg);
          const reach = F.hw + 30;
          const x0 = Math.floor((Math.min(a.x, b.x) - reach) / CELL), x1 = Math.floor((Math.max(a.x, b.x) + reach) / CELL);
          const z0 = Math.floor((Math.min(a.z, b.z) - reach) / CELL), z1 = Math.floor((Math.max(a.z, b.z) + reach) / CELL);
          for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const kk = ix * 65536 + iz; let L = grid.get(kk); if (!L) grid.set(kk, (L = [])); L.push(seg.idx); }
        }
      }
      i = j + 1;
    }
  }
  CORR = { feats, segs, grid, CELL };
  return CORR;
}

/** Past one of the chain's end walls (and near the line there)? */
function beyondEnd(sg, x, z) {
  for (const e of sg.chain.ends) {
    const u = (x - e.x) * e.dx + (z - e.z) * e.dz;
    if (u > 0 && Math.abs((z - e.z) * e.dx - (x - e.x) * e.dz) < sg.F.hw + 30) return true;
  }
  return false;
}

const _best = new Map();
/**
 * Ground height at (x, z) after earthworks. Each ground-contact corridor flattens its own width to its formation
 * height and cuts / fills a 1:1.5 slope back to the natural ground; corridors are applied from minor to major
 * (a national road wins over a street where they overlap).
 */
export function groundAt(x, z) {
  const nat = heightAt(x, z);
  const C = corridors(), list = C.grid.get(Math.floor(x / C.CELL) * 65536 + Math.floor(z / C.CELL));
  if (!list) return nat;
  _best.clear();
  for (const i of list) {
    const sg = C.segs[i], a = sg.a, b = sg.b, ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez || 1e-9;
    if (sg.chain.ends.length && beyondEnd(sg, x, z)) continue;
    const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / L2, 0, 1), px = a.x + ex * t, pz = a.z + ez * t;
    const d = Math.hypot(x - px, z - pz);
    const prev = _best.get(sg.F); if (prev && prev.d <= d) continue;
    _best.set(sg.F, { d, y: a.y + (b.y - a.y) * t, F: sg.F });
  }
  if (!_best.size) return nat;
  const hits = [..._best.values()].sort((p, q) => p.F.order - q.F.order);
  let y = nat;
  for (const h of hits) {
    const hw = h.F.hw, e = h.d - hw;
    if (e <= 0) { y = h.y; continue; }
    const reach = Math.abs(y - h.y) * SLOPE;
    if (e >= reach) continue;
    // cut (ground above the corridor) or fill (below): follow the side slope from the corridor edge
    y = y > h.y ? Math.min(y, h.y + e / SLOPE) : Math.max(y, h.y - e / SLOPE);
  }
  return y;
}

/** Height of the road or rail surface a feature has at along-distance s (for decks, bridges, platforms). */
export function surfaceAt(feature, s) { return feature.profile.yAt(s); }
