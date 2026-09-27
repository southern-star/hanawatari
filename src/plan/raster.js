// Land-use raster: the whole map (+100 m) on a 2 m grid. Every plan feature is stamped into it with a priority,
// so "is this spot free to build on?" and "what is the ground here?" are one array lookup. Deterministic and fast
// (≈ 0.3 s); used by the street / lot generators, ground materials and the in-game map.
import { MAP, RIVER, CANAL, VALLEY, PLATEAU, riverOffset, heightAt } from './terrain.js';
import { LINES, STATIONS } from './rail.js';
import { ROADS } from './roads.js';
import { DISTRICTS } from './districts.js';
import { computeCrossings } from './crossings.js';
import { levelAt } from './ground.js';

export const RES = 2;
export const RX0 = MAP.x0 - 100, RZ0 = MAP.z0 - 100;
export const RN = Math.round((MAP.x1 - MAP.x0 + 200) / RES);

/** Cell kinds, in increasing priority (a stamp only overwrites lower kinds). 'under' = beneath a high deck: streets
 *  may pass there (the piers keep clear of them) but nothing is built. */
export const K = { free: 0, under: 1, scarp: 2, valley: 3, levee: 4, flood: 5, park: 6, special: 7, plaza: 8, street: 9, road: 10, viaduct: 11, rail: 12, station: 13, canal: 14, water: 15 };
export const KIND_NAMES = Object.fromEntries(Object.entries(K).map(([k, v]) => [v, k]));

export const cellOf = (x, z) => [Math.floor((x - RX0) / RES), Math.floor((z - RZ0) / RES)];
export const cellCenter = (i, j) => [RX0 + (i + 0.5) * RES, RZ0 + (j + 0.5) * RES];

export class Raster {
  constructor() { this.kind = new Uint8Array(RN * RN); this.district = new Uint8Array(RN * RN); this.owner = new Uint16Array(RN * RN); this.head = new Uint8Array(RN * RN); }
  idx(x, z) { const i = Math.floor((x - RX0) / RES), j = Math.floor((z - RZ0) / RES); return i < 0 || j < 0 || i >= RN || j >= RN ? -1 : j * RN + i; }
  kindAt(x, z) { const k = this.idx(x, z); return k < 0 ? K.water : this.kind[k]; }
  /** Headroom (m) under a deck overhead — a viaduct, a bridge — or Infinity under the open sky. */
  headAt(x, z) { const k = this.idx(x, z), v = k < 0 ? 0 : this.head[k]; return v ? v / 10 : Infinity; }
  /** Mark a deck's footprint with the headroom beneath it (decimetres; the lowest deck wins where they overlap). */
  cover(align, s0, s1, d0, d1, head) {
    const v = Math.max(1, Math.min(255, Math.round(head * 10))), step = RES * 0.5;
    for (let s = Math.max(0, s0); s <= Math.min(align.length, s1); s += step) {
      const q = align.at(s);
      for (let d = d0; d <= d1; d += step) { const k = this.idx(q.x - q.hz * d, q.z + q.hx * d); if (k >= 0 && (!this.head[k] || this.head[k] > v)) this.head[k] = v; }
    }
  }
  districtAt(x, z) { const k = this.idx(x, z); return k < 0 ? 0 : this.district[k]; }
  set(i, j, kind, owner = 0) { if (i < 0 || j < 0 || i >= RN || j >= RN) return; const k = j * RN + i; if (this.kind[k] <= kind) { this.kind[k] = kind; if (owner) this.owner[k] = owner; } }
  /** Stamp a band along an alignment from s0 to s1, offsets d0..d1 (+ = right of travel). */
  band(align, s0, s1, d0, d1, kind, owner = 0) {
    const step = RES * 0.5, reach = Math.max(Math.abs(d0), Math.abs(d1)) + RES, X1 = RX0 + RN * RES, Z1 = RZ0 + RN * RES;
    for (let s = Math.max(0, s0); s <= Math.min(align.length, s1); s += step) {
      const q = align.at(s), nx = -q.hz, nz = q.hx;
      if (q.x < RX0 - reach || q.x > X1 + reach || q.z < RZ0 - reach || q.z > Z1 + reach) continue;   // off the raster
      for (let d = d0; d <= d1; d += step) { const x = q.x + nx * d, z = q.z + nz * d; this.set(Math.floor((x - RX0) / RES), Math.floor((z - RZ0) / RES), kind, owner); }
    }
  }
  /** Stamp a (rotated) rectangle: centre, half sizes, rotation about Y (world). */
  rect(cx, cz, hw, hd, rot, kind, owner = 0) {
    const c = Math.cos(rot), s = Math.sin(rot), r = Math.hypot(hw, hd);
    const [i0, j0] = cellOf(cx - r, cz - r), [i1, j1] = cellOf(cx + r, cz + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, z] = cellCenter(i, j), dx = x - cx, dz = z - cz;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) this.set(i, j, kind, owner);
    }
  }
  /** Fill a polygon (scanline over cell centres). */
  poly(poly, fn) {
    let zmin = Infinity, zmax = -Infinity; for (const [, z] of poly) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    const [, j0] = cellOf(0, zmin), [, j1] = cellOf(0, zmax);
    for (let j = Math.max(0, j0); j <= Math.min(RN - 1, j1); j++) {
      const z = RZ0 + (j + 0.5) * RES, xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        const [xa, za] = poly[a], [xb, zb] = poly[b];
        if ((za > z) !== (zb > z)) xs.push(xa + (z - za) * (xb - xa) / (zb - za));
      }
      xs.sort((p, q) => p - q);
      for (let t = 0; t + 1 < xs.length; t += 2) {
        const i0 = Math.max(0, Math.ceil((xs[t] - RX0) / RES - 0.5)), i1 = Math.min(RN - 1, Math.floor((xs[t + 1] - RX0) / RES - 0.5));
        for (let i = i0; i <= i1; i++) fn(i, j, j * RN + i);
      }
    }
  }
  /** Fraction of cells under a rotated rect that are exactly `kind` (default free). */
  coverage(cx, cz, hw, hd, rot, kind = K.free) {
    const c = Math.cos(rot), s = Math.sin(rot); let n = 0, ok = 0;
    for (let u = -hw + RES / 2; u < hw; u += RES) for (let v = -hd + RES / 2; v < hd; v += RES) {
      const x = cx + u * c + v * s, z = cz - u * s + v * c; n++; if (this.kindAt(x, z) === kind) ok++;
    }
    return n ? ok / n : 0;
  }
}

/** Raster owner code of the tram's grassed track, and where the tram runs on its own way (west of 本町通り's start). */
export const TRAM_GRASS = 1;
export const TRAM_STREET_X0 = -771.8;          // where 本町通り (the tram street) begins at the foot of the scarp
export const tramOwnWay = (x) => x < TRAM_STREET_X0;

/** Width of the ground corridor a line occupies (m): tracks + ballast shoulders. */
export function railWidth(L) { return { jr: 26, private: 12, metro: 11, tram: 7.5, agt: 9 }[L.kind] + (L.tracks > 2 ? 0 : 0); }

/** Build the raster from the plan's natural features, lines, roads and stations (streets and lots are added later). */
/** Depth from a deck's running surface down to its underside (structures.js: DECK depth + the surface build-up). */
const UNDERSIDE = { expressway: 2.25, ramp: 1.85, national: 2.25, arterial: 1.85, collector: 1.45, old: 1.25, street: 1.05, jr: 2.5, private: 2.4, metro: 2.4, agt: 1.9 };

export function buildRaster() {
  const R = new Raster();
  // districts
  DISTRICTS.forEach((D, i) => { if (D.kind === 'river') return; R.poly(D.poly, (ii, jj, k) => { R.district[k] = i + 1; }); });
  // natural ground
  R.band(PLATEAU.edge, 0, PLATEAU.edge.length, -PLATEAU.halfSlope - 2, PLATEAU.halfSlope + 2, K.scarp);
  R.band(VALLEY.align, 0, VALLEY.align.length, -VALLEY.halfW - VALLEY.side, VALLEY.halfW + VALLEY.side, K.valley);
  R.band(RIVER.align, 0, RIVER.align.length, riverOffset('N', 'foot'), riverOffset('S', 'foot'), K.levee);
  R.band(RIVER.align, 0, RIVER.align.length, riverOffset('N', 'flood'), riverOffset('S', 'flood'), K.flood);
  R.band(RIVER.align, 0, RIVER.align.length, -RIVER.halfW, RIVER.halfW, K.water);
  R.band(CANAL.align, 0, CANAL.align.length, -CANAL.halfW - 3, CANAL.halfW + 3, K.canal);
  // roads: at grade = road surface incl. sidewalks; a deck high enough for a street to pass beneath = 'under' (its
  // whole width + a margin: no building pokes into it); a low deck, a ramp or an embankment (with its side slopes)
  // = 'viaduct' (nothing crosses or is built there)
  for (const r of ROADS) {
    const hw = r.w / 2, A = r.align;
    for (let s = 0; s < A.length; s += 4) {
      const q = A.at(s), y = r.profile.yAt(s), g = heightAt(q.x, q.z);
      if (y > g + 7 || levelAt(r, s + 2, y, g) === 'structure') { R.band(A, s, s + 4, -hw - 1.5, hw + 1.5, K.under); R.cover(A, s, s + 4, -hw - 0.5, hw + 0.5, y - g - (UNDERSIDE[r.cls] ?? 2)); }
      else if (Math.abs(y - g) > 1.5) { const e = hw + 1 + Math.abs(y - g) * 1.5; R.band(A, s, s + 4, -e, e, K.viaduct); R.band(A, s, s + 4, -hw - 0.5, hw + 0.5, K.road); }
      else R.band(A, s, s + 4, -hw - 0.5, hw + 0.5, K.road);
    }
  }
  // rail: at grade / cutting = rail corridor; an embankment adds its side slopes; a high viaduct = 'under' (streets
  // may pass beneath), a low one = 'viaduct'; tunnel = nothing
  for (const L of LINES) {
    if (L.kind === 'tram') continue;                               // street running / own lane: stamped as road below
    const hw = railWidth(L) / 2, A = L.align;
    for (let s = 0; s < A.length; s += 4) {
      const q = A.at(s), y = L.profile.yAt(s), g = heightAt(q.x, q.z);
      if (y < g - 8) continue;
      if (y > g + 7.5 || (y > g + 2.5 && levelAt(L, s + 2, y, g) === 'structure')) { R.band(A, s, s + 4, -hw - 1.5, hw + 1.5, K.under); R.cover(A, s, s + 4, -hw - 0.5, hw + 0.5, y - g - (UNDERSIDE[L.kind] ?? 2.5)); }
      else if (y > g + 6) R.band(A, s, s + 4, -hw - 1.5, hw + 1.5, K.viaduct);
      else if (y > g + 0.8) { const e = hw + (y - g) * 1.5; R.band(A, s, s + 4, -e, e, K.rail); }
      else R.band(A, s, s + 4, -hw, hw, K.rail);
    }
  }
  // the tram: own grassed track (芝生軌道) on the plateau, down the ramp and along the valley; a paved lane / the
  // street itself from the valley mouth on
  { const T = LINES.find(l => l.kind === 'tram'), A = T.align;
    for (let s = 0; s < A.length; s += 4) {
      const q = A.at(s), y = T.profile.yAt(s), g = heightAt(q.x, q.z);
      if (!tramOwnWay(q.x)) R.band(A, s, s + 4, -4, 4, K.road);
      else if (y > g - 8) R.band(A, s, s + 4, -3.75, 3.75, y > g + 6 ? K.viaduct : K.rail, TRAM_GRASS);
    }
  }
  // stations: platforms + station building corridor
  for (const st of STATIONS) {
    const L = LINES.find(l => l.id === st.line); if (st.level === 'underground' || L.kind === 'tram') continue;
    const w = { jr: 40, private: 22, metro: 22, agt: 16 }[L.kind] || 20;
    R.band(L.align, st.s - st.len / 2 - 6, st.s + st.len / 2 + 6, -w / 2, w / 2, K.station);
  }
  // level crossings: the road surface wins over the rail corridor there (people and cars may cross)
  for (const c of computeCrossings()) {
    if (c.type !== 'level-crossing' && c.type !== 'diamond' && c.type !== 'street-running') continue;
    const [i0, j0] = cellOf(c.x - 14, c.z - 14), [i1, j1] = cellOf(c.x + 14, c.z + 14);
    const road = ROADS.find(r => r.id === c.a || r.id === c.b), hw = road ? road.w / 2 : 5;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, z] = cellCenter(i, j);
      if (road) { const n = road.align.nearest(x, z, hw + 0.5); if (!n) continue; }
      if (i >= 0 && j >= 0 && i < RN && j < RN) { const k = j * RN + i; if (R.kind[k] === K.rail || R.kind[k] === K.station) R.kind[k] = K.road; }
    }
  }
  return R;
}
