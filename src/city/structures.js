// Structures that are seen from far away, built once for the whole map (merged per 480 m cell): railway and road
// viaducts / bridges (deck, parapets or sound walls, piers), the 東和本線 truss over the 澪川, tunnel portals,
// station platforms with canopies, and the ballast bed of every railway that runs on the ground.
import * as THREE from 'three';
import { LINES, STATIONS } from '../plan/rail.js';
import { ROADS } from '../plan/roads.js';
import { heightAt, RIVER } from '../plan/terrain.js';
import { groundAt, levelOf, levelAt } from '../plan/ground.js';
import { roadSpaceAt } from '../plan/network.js';
import { YOKOCHO } from './yokocho.js';
import { PASSAGE } from '../plan/urban.js';
import { stationBlocked } from './station.js';
import { MB, rgb, shade } from './mb.js';

const CELL = 480;
const CONC = rgb('#c3bfb5'), CONC_D = rgb('#a8a49a'), CONC_L = rgb('#d4d0c6'), STEEL = rgb('#7f8c95'), STEEL_G = rgb('#5f7f73'), WALL = rgb('#d8d6ce');
const BALLAST = rgb('#8b857c'), BALLAST_D = rgb('#77726a'), PLAT = rgb('#c9c4b8'), PLAT_EDGE = rgb('#e8d56a'), ROOF = rgb('#8fa0ad'), ROOF_U = rgb('#d9dcd8');
const TRUSS = rgb('#5d7a8c');

/** Deck geometry per kind: half width of the deck, depth below the running surface, parapet height. */
const DECK = {
  jr: { hw: 13.2, depth: 1.9, wall: 1.3, span: 24, color: CONC }, private: { hw: 5.4, depth: 1.8, wall: 1.3, span: 24, color: CONC },
  metro: { hw: 5.2, depth: 1.8, wall: 1.3, span: 24, color: CONC }, agt: { hw: 4.2, depth: 1.6, wall: 1.2, span: 30, color: CONC_L }, tram: { hw: 3.6, depth: 1.2, wall: 1.1, span: 20, color: CONC },
  expressway: { hw: 13, depth: 2.2, wall: 2.6, span: 40, color: CONC_L }, ramp: { hw: 4.5, depth: 1.8, wall: 1.4, span: 34, color: CONC_L },
  national: { hw: 20, depth: 2.2, wall: 1.1, span: 44, color: CONC }, arterial: { hw: 15, depth: 1.8, wall: 1.1, span: 36, color: CONC }, collector: { hw: 8, depth: 1.4, wall: 1.1, span: 30, color: CONC },
  old: { hw: 6, depth: 1.2, wall: 1.1, span: 24, color: CONC }, street: { hw: 4, depth: 1.0, wall: 1.0, span: 20, color: CONC },
};
/** Offset of the deck top below the running surface (rail top sits on ballast + sleepers). */
const SURF = { jr: 0.6, private: 0.6, metro: 0.6, agt: 0.3, tram: 0.3 };
export const TRACKS = { jr: [-10.5, -5.5, 5.5, 10.5], private: [-2, 2], metro: [-2, 2], tram: [-1.6, 1.6], agt: [-2, 2] };

let PHYS = null;
function cellKey(x, z) { return Math.floor(x / CELL) + ',' + Math.floor(z / CELL); }
/** A pier may not stand here: a road / street / junction / sidewalk at street level, or another railway's corridor. */
function blocked(x, z, F) {
  if (x > PASSAGE.x0 - 12 && x < PASSAGE.x1 + 18 && z > PASSAGE.z0 - 0.6 && z < PASSAGE.z1 + 0.6) return true;   // 花渡駅's free passage + its approaches
  for (const g of [PASSAGE.central, PASSAGE.east]) if (x > g.x0 - 1 && x < g.x1 + 1 && z > g.zb - 0.6 && z < PASSAGE.z0) return true;   // and its gates
  if (stationBlocked(x, z)) return true;                                                                       // the east square's lanes
  const sp = roadSpaceAt(x, z, 0.8);
  if (sp) {
    // a raised median is where a viaduct over a road stands its columns
    const inMedian = sp.what === 'carriageway' && sp.way.median >= 2.5 && Math.abs(sp.d) < sp.way.median / 2 - 0.2 && !sp.way.inMarkGap(sp.s);
    if (!inMedian) return true;
  }
  for (const L of LINES) {
    if (L === F.f || L.kind === 'metro' && L.id === 'mio') continue;
    const n = L.align.nearest(x, z, 16); if (!n) continue;
    const y = L.profile.yAt(n.s), g = heightAt(n.x, n.z), hw = (TRACKS[L.kind] ? Math.max(...TRACKS[L.kind].map(Math.abs)) : 2) + 3.5;
    if (Math.abs(n.d) < hw && y > g - 3 && y < g + 3) return true;           // that line runs at grade right here
  }
  return false;
}

/** Build all global structures; returns a Group of merged meshes (one per 480 m cell). */
export function buildStructures(ctx) {
  PHYS = ctx.physics;
  const cells = new Map();
  const mbAt = (x, z) => { const k = cellKey(x, z); let m = cells.get(k); if (!m) cells.set(k, (m = new MB())); return m; };
  const feats = [...LINES.map(L => ({ f: L, kind: L.kind, rail: true })), ...ROADS.map(R => ({ f: R, kind: R.cls, rail: false }))];
  for (const F of feats) buildFeature(F, mbAt);
  for (const st of STATIONS) buildPlatform(st, mbAt);
  const mat = ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.07, name: 'structures' });
  const g = new THREE.Group(); g.name = 'structures';
  for (const mb of cells.values()) { const m = mb.mesh(mat); if (m) g.add(m); }
  return g;
}

function buildFeature(F, mbAt) {
  const A = F.f.align, P = F.f.profile, D = DECK[F.kind], step = 4;
  const n = Math.max(1, Math.round(A.length / step)), smp = [];
  for (let i = 0; i <= n; i++) {
    const s = (A.length * i) / n, q = A.at(s), y = P.yAt(s), g = heightAt(q.x, q.z);
    smp.push({ s, x: q.x, z: q.z, hx: q.hx, hz: q.hz, y, g, lv: levelAt(F.f, s, y, g) });
  }
  const surf = F.rail ? SURF[F.kind] : 0.02;
  const at = (p, d, y) => [p.x - p.hz * d, y, p.z + p.hx * d];
  let lastPier = -1e9;
  // elevated stations need a wider deck to carry their platforms
  const wide = F.rail ? STATIONS.filter(st => st.line === F.f.id && st.level === 'elevated').map(st => {
    const tr = TRACKS[F.kind], outer = st.platform === 'island2' ? tr[3] + 1.45 + 4 : tr[tr.length - 1] + 1.45 + 3.6;
    return { s0: st.s - st.len / 2 - 12, s1: st.s + st.len / 2 + 12, hw: outer + 0.6 };
  }) : [];
  const hwAt = (s) => { let h = D.hw; for (const w of wide) if (s >= w.s0 && s <= w.s1) h = Math.max(h, w.hw); return h; };
  for (let i = 0; i + 1 < smp.length; i++) {
    const p = smp[i], q = smp[i + 1], mb = mbAt((p.x + q.x) / 2, (p.z + q.z) / 2);
    const struct = p.lv === 'structure' || q.lv === 'structure';
    if (struct && !(F.kind === 'tram')) {
      const tp = p.y - surf, tq = q.y - surf, bp = tp - D.depth, bq = tq - D.depth, hw = hwAt((p.s + q.s) / 2);
      // deck: top, underside, both sides; parapets / sound walls
      mb.quad(at(p, -hw, tp), at(p, hw, tp), at(q, hw, tq), at(q, -hw, tq), shade(D.color, 1.02));
      mb.quad(at(q, -hw, bq), at(q, hw, bq), at(p, hw, bp), at(p, -hw, bp), shade(D.color, 0.72));
      mb.quad(at(q, -hw, bq), at(p, -hw, bp), at(p, -hw, tp + D.wall), at(q, -hw, tq + D.wall), D.color);
      mb.quad(at(p, hw, bp), at(q, hw, bq), at(q, hw, tq + D.wall), at(p, hw, tp + D.wall), D.color);
      const iw = hw - 0.35;   // inner face + top of the parapet
      mb.quad(at(p, -iw, tp), at(q, -iw, tq), at(q, -iw, tq + D.wall), at(p, -iw, tp + D.wall), shade(D.color, 0.93));
      mb.quad(at(q, iw, tq), at(p, iw, tp), at(p, iw, tp + D.wall), at(q, iw, tq + D.wall), shade(D.color, 0.93));
      mb.quad(at(p, -hw, tp + D.wall), at(p, -iw, tp + D.wall), at(q, -iw, tq + D.wall), at(q, -hw, tq + D.wall), CONC_L);
      mb.quad(at(p, iw, tp + D.wall), at(p, hw, tp + D.wall), at(q, hw, tq + D.wall), at(q, iw, tq + D.wall), CONC_L);
      // piers: on dry ground every span, in the river every 2.5 spans — but never on a road, a street, a junction or
      // another railway: the pier moves on along the deck until it stands clear (a longer girder), or becomes a
      // portal of two columns outside the road, or is left out
      const overWater = p.g < -2;
      const span = overWater ? D.span * 2.5 : D.span;
      if (p.s - lastPier >= span && p.lv === 'structure') {
        const gy = overWater ? -6 : groundAt(p.x, p.z), top = bp;
        if (top - gy > 1.2) {
          const rot = Math.atan2(p.hx, p.hz);                       // local z along the line
          const column = F.kind === 'expressway' || F.kind === 'ramp' || F.kind === 'national' || F.kind === 'agt', cs = F.kind === 'agt' ? 1.8 : 3.2;
          const wallW = Math.max(2, hw * 2 - 2.5), wallD = overWater ? 3 : 1.6;
          const clear = (d0, d1, t) => { for (let d = d0; d <= d1 + 0.01; d += Math.max(0.5, Math.min(2, (d1 - d0) / 2 || 2))) for (const e of [-t, 0, t]) { const x = p.x - p.hz * d + p.hx * e, z = p.z + p.hx * d + p.hz * e; if (blocked(x, z, F)) return false; } return true; };
          let kind = null;
          // under the 横丁 (高架下の飲み屋横丁) the viaduct stands on portal bents so the lane runs through
          const yokocho = F.f.id === YOKOCHO.line && p.z > YOKOCHO.z0 - 8 && p.z < YOKOCHO.z1 + 8;
          // 花渡駅: 汐見線 runs over the free passage and the west square on portal bents (the passage between their
          // columns, the square open underneath) and over the east square on single columns
          const station = F.f.id === 'shiomi' && p.x > -604 && p.x < -250;
          // portal columns: pw wide at ±pd from the centreline — slim ones at the deck edges over the station, and over the
          // east square straddling the pedestrian deck that runs right under 汐見線
          const pw = station ? 1.2 : 1.8, pd = station && p.x > -344 ? 7.8 : hw - (station ? 0.8 : 1.3);
          const portalClear = () => clear(-pd - pw / 2, -pd + pw / 2, 1) && clear(pd - pw / 2, pd + pw / 2, 1);
          if (yokocho || station) kind = portalClear() ? 'portal' : null;                                    // columns clear of streets, passage, lanes
          else if (overWater) kind = column ? 'column' : 'wall';
          else if (column ? clear(-cs / 2 - 0.2, cs / 2 + 0.2, cs / 2 + 0.2) : clear(-wallW / 2, wallW / 2, 0.9)) kind = column ? 'column' : 'wall';
          else if (p.s - lastPier >= span * 1.6 && hw > 3 && portalClear()) kind = 'portal';
          else if (p.s - lastPier < span * 2.6) kind = null;
          else kind = 'skip';
          if (kind === 'column') {
            mb.obox(p.x, gy - 0.5, p.z, cs, top - 1.4 - gy + 0.5, cs, rot, CONC_D);                            // column
            mb.obox(p.x, top - 1.4, p.z, hw * 2 - 1, 1.4, cs, rot, shade(CONC_D, 1.05));                        // cap beam across
            if (PHYS && !overWater) PHYS.addBox(p.x, p.z, cs, cs, rot, gy - 1, top);
          } else if (kind === 'wall') {
            mb.obox(p.x, gy - 0.5, p.z, wallW, top - gy + 0.5, wallD, rot, CONC_D, 'NSEW');
            if (PHYS && !overWater) PHYS.addBox(p.x, p.z, wallW, wallD, rot, gy - 1, top);
          } else if (kind === 'portal') {
            for (const sg of [-1, 1]) {
              const d = sg * pd, x = p.x - p.hz * d, z = p.z + p.hx * d, g2 = groundAt(x, z);
              mb.obox(x, g2 - 0.5, z, pw, top - 1.2 - g2 + 0.5, 1.8, rot, CONC_D);
              if (PHYS) PHYS.addBox(x, z, pw, 1.8, rot, g2 - 1, top);
            }
            mb.obox(p.x, top - 1.2, p.z, Math.max(hw * 2 - 0.4, pd * 2 + pw), 1.2, 1.8, rot, shade(CONC_D, 1.05));   // cross beam
          }
          if (kind) lastPier = p.s;
        } else lastPier = p.s;
      }
      // walkable road decks (not the expressway): the player can cross bridges
      if (PHYS && !F.rail && F.kind !== 'expressway' && F.kind !== 'ramp') {
        const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, len = Math.hypot(q.x - p.x, q.z - p.z) + 0.3;
        PHYS.addWalkBox(mx, mz, (hw - 0.35) * 2, len, Math.atan2(p.hx, p.hz), (p.y + q.y) / 2 + 0.03, Math.min(bp, bq) - 0.5);
        for (const sg of [-1, 1]) { const [ex, ez] = [mx - p.hz * sg * (hw - 0.2), mz + p.hx * sg * (hw - 0.2)]; PHYS.addBox(ex, ez, 0.35, len, Math.atan2(p.hx, p.hz), (p.y + q.y) / 2, (p.y + q.y) / 2 + D.wall); }
      }
      // 東和本線's river crossing: a through truss above the deck
      if (F.kind === 'jr' && p.g < 1 && Math.abs(RIVER.align.nearestWin(p.x, p.z, 400, 80)?.d ?? 999) < 170) truss(mb, p, q, tp, tq, hw);
    } else if (F.rail && (p.lv === 'grade' || p.lv === 'cut' || p.lv === 'embankment')) {
      // ballast bed on the ground (street-running tram track is part of the road)
      if (F.kind === 'tram') continue;
      const tr = TRACKS[F.kind], w0 = tr[0] - 1.7, w1 = tr[tr.length - 1] + 1.7, top = -surf + 0.25;
      mb.quad(at(p, w0 + 0.6, p.y + top), at(p, w1 - 0.6, p.y + top), at(q, w1 - 0.6, q.y + top), at(q, w0 + 0.6, q.y + top), BALLAST);
      mb.quad(at(p, w0, p.y + top - 0.5), at(p, w0 + 0.6, p.y + top), at(q, w0 + 0.6, q.y + top), at(q, w0, q.y + top - 0.5), BALLAST_D);
      mb.quad(at(p, w1 - 0.6, p.y + top), at(p, w1, p.y + top - 0.5), at(q, w1, q.y + top - 0.5), at(q, w1 - 0.6, q.y + top), BALLAST_D);
    }
    // tunnel portal where the line goes underground
    if (F.rail && ((p.lv === 'tunnel') !== (q.lv === 'tunnel'))) portal(mb, p.lv === 'tunnel' ? q : p, p.lv === 'tunnel' ? -1 : 1, F.kind);
    // abutment where a deck meets its embankment: a wall across the deck from the ground up to the deck top, with a
    // wing wall each side over the embankment's side slope (the earth stops at the abutment's back face, ground.js)
    if ((p.lv === 'structure') !== (q.lv === 'structure') && (p.lv === 'embankment' || q.lv === 'embankment') && F.kind !== 'tram') {
      const e = p.lv === 'structure' ? q : p, hw = hwAt(e.s) + 0.3, top = e.y - surf, gy = Math.min(groundAt(e.x - e.hz * hw, e.z + e.hx * hw), groundAt(e.x + e.hz * hw, e.z - e.hx * hw), groundAt(e.x, e.z)) - 0.5;
      mb.obox(e.x, gy, e.z, hw * 2, top - gy, 1.4, Math.atan2(e.hx, e.hz), CONC_D, 'NSEW');
      if (PHYS) PHYS.addBox(e.x, e.z, hw * 2, 1.4, Math.atan2(e.hx, e.hz), gy, top - 0.1);
      const yb = heightAt(e.x, e.z) - 0.3, L = Math.max(0, top - yb) * 1.5, from = mb.n;
      if (L > 0.5) {
        for (const sg of [-1, 1]) {
          const P = (u, y, v) => [sg * u, y, v], T = (v) => P(hw, top, v), B = (v) => P(hw, yb, v), O = (v) => P(hw + L, yb, v);
          if (sg > 0) { mb.tri(B(0.7), O(0.7), T(0.7), CONC_D); mb.tri(O(-0.7), B(-0.7), T(-0.7), CONC_D); mb.quad(T(0.7), O(0.7), O(-0.7), T(-0.7), shade(CONC_D, 1.04)); }
          else { mb.tri(O(0.7), B(0.7), T(0.7), CONC_D); mb.tri(B(-0.7), O(-0.7), T(-0.7), CONC_D); mb.quad(T(0.7), T(-0.7), O(-0.7), O(0.7), shade(CONC_D, 1.04)); }
        }
        mb.place(from, Math.atan2(e.hx, e.hz) + (p.lv === 'structure' ? Math.PI : 0), e.x, 0, e.z);   // local +z toward the deck
      }
    }
  }
}

/** Warren through-truss over a deck segment (top chord, verticals and diagonals on both sides). */
function truss(mb, p, q, tp, tq, hw) {
  const H = 9, at = (pt, d, y) => [pt.x - pt.hz * d, y, pt.z + pt.hx * d];
  for (const sg of [-1, 1]) {
    const d = sg * (hw - 0.4), t = 0.5;
    const bar = (a, b) => {   // a thin box between two points (vertical plane of the truss)
      mb.quad([a[0], a[1] - t / 2, a[2]], [b[0], b[1] - t / 2, b[2]], [b[0], b[1] + t / 2, b[2]], [a[0], a[1] + t / 2, a[2]], TRUSS);
      mb.quad([b[0], b[1] - t / 2, b[2]], [a[0], a[1] - t / 2, a[2]], [a[0], a[1] + t / 2, a[2]], [b[0], b[1] + t / 2, b[2]], TRUSS);
    };
    bar(at(p, d, tp + H), at(q, d, tq + H));                                  // top chord
    if (Math.round(p.s / 4) % 3 === 0) { bar(at(p, d, tp + 1.2), at(p, d, tp + H)); bar(at(p, d, tp + 1.2), at(q, d, tq + H)); }
  }
  // portal bracing overhead
  if (Math.round(p.s / 4) % 6 === 0) {
    const a = at(p, -hw + 0.4, tp + H), b = at(p, hw - 0.4, tp + H);
    mb.quad([a[0], a[1] - 0.3, a[2]], [b[0], b[1] - 0.3, b[2]], [b[0], b[1] + 0.3, b[2]], [a[0], a[1] + 0.3, a[2]], TRUSS);
    mb.quad([b[0], b[1] - 0.3, b[2]], [a[0], a[1] - 0.3, a[2]], [a[0], a[1] + 0.3, a[2]], [b[0], b[1] + 0.3, b[2]], TRUSS);
  }
}

/** Tunnel portal: a head wall with a dark opening, facing the open side (dir = +1 facing forward along s). */
function portal(mb, p, dir, kind) {
  const hw = (TRACKS[kind] ? Math.max(...TRACKS[kind].map(Math.abs)) : 2) + 2.6, H = 6.4, rot = Math.atan2(p.hx, p.hz) + (dir > 0 ? Math.PI : 0);
  const y0 = p.y - 1.2, gy = Math.max(heightAt(p.x, p.z), p.y + H + 2);
  const from = mb.n;
  mb.box(-hw - 3, -hw, y0, gy, -0.8, 0.8, CONC);                     // side walls of the head wall
  mb.box(hw, hw + 3, y0, gy, -0.8, 0.8, CONC);
  mb.box(-hw, hw, y0 + H, gy, -0.8, 0.8, CONC);                      // lintel
  mb.box(-hw, hw, y0, y0 + H, 0.6, 0.8, rgb('#2c2a33'), 'S');         // dark opening
  mb.place(from, rot, p.x, 0, p.z);
}

/** Platforms (and a canopy over their middle) for every non-underground station. */
function buildPlatform(st, mbAt) {
  const L = LINES.find(l => l.id === st.line); if (st.level === 'underground') return;
  const A = L.align, tr = TRACKS[L.kind]; if (!tr) return;
  const top = st.y + (L.kind === 'tram' ? 0.25 : L.kind === 'agt' ? 0.9 : 1.1) - (L.kind === 'tram' ? 0 : 0);
  const tram = L.kind === 'tram';
  // platform bands (offsets across the line): island between the two tracks, or sides outside them
  let bands;
  if (st.platform === 'island2') bands = [[tr[1] + 1.45, tr[2] - 1.45], [tr[0] - 1.45 - 4, tr[0] - 1.45], [tr[3] + 1.45, tr[3] + 1.45 + 4]];   // central island + two sides
  else if (st.platform === 'island' || st.platform === 'terminal') bands = L.kind === 'jr' ? [[tr[1] + 1.45, tr[2] - 1.45]] : [[tr[0] + 1.45, tr[1] - 1.45]];
  else bands = [[tr[0] - 1.45 - (tram ? 1.1 : 3.6), tr[0] - 1.45], [tr[tr.length - 1] + 1.45, tr[tr.length - 1] + 1.45 + (tram ? 1.1 : 3.6)]];
  if (bands[0][1] - bands[0][0] < (tram ? 1 : 2)) { const pw = tram ? 1.1 : 3.4; bands = [[tr[0] - 1.45 - pw, tr[0] - 1.45], [tr[tr.length - 1] + 1.45, tr[tr.length - 1] + 1.45 + pw]]; }   // tracks too close for an island
  const step = 4, s0 = st.s - st.len / 2, s1 = st.s + st.len / 2;
  for (let s = s0; s < s1 - 0.01; s += step) {
    const sa = s, sb = Math.min(s1, s + step), p = A.at(sa), q = A.at(sb), yp = L.profile.yAt(sa) + (top - st.y), yq = L.profile.yAt(sb) + (top - st.y);
    const mb = mbAt((p.x + q.x) / 2, (p.z + q.z) / 2), at = (pt, d, y) => [pt.x - pt.hz * d, y, pt.z + pt.hx * d];
    for (const [d0, d1] of bands) {
      mb.quad(at(p, d0, yp), at(p, d1, yp), at(q, d1, yq), at(q, d0, yq), PLAT);
      for (const [d, sg] of [[d0, -1], [d1, 1]]) {   // platform edge faces + yellow tactile strip
        const lo = yp - (tram ? 0.25 : 1.1), loq = yq - (tram ? 0.25 : 1.1);
        if (sg < 0) mb.quad(at(q, d, loq), at(p, d, lo), at(p, d, yp), at(q, d, yq), CONC_D); else mb.quad(at(p, d, lo), at(q, d, loq), at(q, d, yq), at(p, d, yp), CONC_D);
        const e = d - sg * (tram ? 0.4 : 0.9); mb.quad(at(p, Math.min(d, e) + 0.02, yp + 0.01), at(p, Math.max(d, e) - 0.3, yp + 0.01), at(q, Math.max(d, e) - 0.3, yq + 0.01), at(q, Math.min(d, e) + 0.02, yq + 0.01), PLAT_EDGE);
      }
      // canopy over the middle 60 %
      if (Math.abs((sa + sb) / 2 - st.s) < st.len * 0.3 && !tram) {
        const h = 3.4, c0 = d0 - 0.6, c1 = d1 + 0.6;
        mb.quad(at(p, c0, yp + h), at(p, c1, yp + h), at(q, c1, yq + h), at(q, c0, yq + h), ROOF);
        mb.quad(at(q, c0, yq + h - 0.12), at(q, c1, yq + h - 0.12), at(p, c1, yp + h - 0.12), at(p, c0, yp + h - 0.12), ROOF_U);
        if (Math.round(sa / step) % 3 === 0) { const m = (d0 + d1) / 2, c = at(p, m, yp); mb.box(c[0] - 0.18, c[0] + 0.18, yp, yp + h, c[2] - 0.18, c[2] + 0.18, STEEL, 'NSEW'); }
      }
    }
  }
  void STEEL_G; void WALL;
}
