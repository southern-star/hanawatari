// Road surfaces for one streamed chunk, built from the road network (plan/network.js):
//  • the ribbon of every way between its junctions — carriageway, raised sidewalks with kerbs, the national road's
//    planted median, lane / centre / edge markings by class, 路側帯 lines on streets; the tram street keeps its
//    track zone clear of lines;
//  • every junction — the carriageway with its kerb returns, the corner sidewalks, zebra crossings and stop lines;
//  • level crossings — the road rises to the rail top, the markings stop, stop lines on both approaches;
//  • the expressway and its ramps on their decks.
// Each ribbon slice belongs to the chunk holding its middle, each junction to the chunk holding its node.
import * as THREE from 'three';
import { ROADS } from '../plan/roads.js';
import { MAP, heightAt } from '../plan/terrain.js';
import { levelOf, groundAt } from '../plan/ground.js';
import { CHUNK } from '../plan/urban.js';
import { network, vertexY } from '../plan/network.js';
import { MB, rgb } from './mb.js';

const Y0 = 0.06, KERB = 0.15, MARK = 0.012;
const ASPH = rgb('#6c6e73'), ASPH_OLD = rgb('#76767a'), ASPH_ST = rgb('#727378'), ALLEY = rgb('#a9a59c');
const WALK = rgb('#c9c2b4'), WALK2 = rgb('#bdb6a8'), CURB = rgb('#b0aca3'), MEDIAN = rgb('#bab5aa'), SHRUB = rgb('#5f8f55');
const WHITE = rgb('#ecebe5'), YELLOW = rgb('#e0b53c');
const asphaltOf = (w) => (w.kind === 'alley' ? ALLEY : w.kind !== 'road' ? ASPH_ST : w.cls === 'old' ? ASPH_OLD : ASPH);

export function roadMaterials(ctx) {
  return {
    surface: ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.06, name: 'road' }),
    marks: ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02, polygonOffset: -2, name: 'road-marks' }),
  };
}

/** Slice boundaries along a way: a 4 m grid plus every junction / marking boundary, so ribbons end exactly there. */
function breaks(w) {
  if (w._br) return w._br;
  const v = [], n = Math.max(1, Math.round(w.length / 4));
  for (let i = 0; i <= n; i++) v.push((w.length * i) / n);
  for (const c of w.cuts) v.push(c[0], c[1]);
  for (const m of w.marks) v.push(m[0], m[1]);
  for (const g of w.walkGaps) v.push(g[0], g[1]);
  const out = [];
  for (const s of v.filter(s => s > 0.01 && s < w.length - 0.01).concat([0, w.length]).sort((a, b) => a - b)) if (!out.length || s - out[out.length - 1] > 0.05) out.push(s);
  return (w._br = out);
}

/** A convex-ish polygon as a fan from `c` (all [x, y, z]); oriented to face up whichever way the outline runs. */
function fan(mb, c, pts, col) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[2] - b[0] * a[2]; }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (area > 0) mb.tri(c, b, a, col); else mb.tri(c, a, b, col);
  }
}

/** Build the road meshes of chunk (ci, cj). */
export function buildChunkRoads(ctx, R, U, ci, cj) {
  const x0 = MAP.x0 + ci * CHUNK, z0 = MAP.z0 + cj * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
  const inChunk = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
  const surf = new MB(), mark = new MB(), N = network();
  // ---- ribbons
  for (const w of N.ways) {
    const A = w.align, bx = breaks(w), asph = asphaltOf(w), tram = w.R && w.R.id === 'honcho';
    // quick reject: is any part of this way near the chunk?
    const bb = w._bb || (w._bb = (() => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of A.samples) { a = Math.min(a, p.x); b = Math.min(b, p.z); c = Math.max(c, p.x); d = Math.max(d, p.z); } return [a - 30, b - 30, c + 30, d + 30]; })());
    if (bb[2] < x0 || bb[0] > x1 || bb[3] < z0 || bb[1] > z1) continue;
    for (let i = 0; i + 1 < bx.length; i++) {
      const s0 = bx[i], s1 = bx[i + 1], sm = (s0 + s1) / 2;
      const p = A.at(s0), q = A.at(s1), mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      if (!inChunk(mx, mz) || w.inCut(sm)) continue;
      const yp = w.yAt(s0) + Y0, yq = w.yAt(s1) + Y0, onGround = w.kind !== 'road';
      const at = onGround ? (pt, d, y) => { const x = pt.x - pt.hz * d, z = pt.z + pt.hx * d; return [x, groundAt(x, z) + y - (pt === p ? yp : yq) + Y0, z]; } : (pt, d, y) => [pt.x - pt.hz * d, y, pt.z + pt.hx * d];
      const band = (d0, d1, dy, col, M = surf) => M.quad(at(p, d0, yp + dy), at(p, d1, yp + dy), at(q, d1, yq + dy), at(q, d0, yq + dy), col);
      const gap = w.inMarkGap(sm);
      // carriageway (with the planted median outside the junction approaches)
      const med = w.median >= 2.5 && !gap ? w.median / 2 : 0;
      if (med) {
        band(-w.cw, -med, 0, asph); band(med, w.cw, 0, asph); band(-med, med, 0.2, SHRUB);
        surf.quad(at(p, -med, yp), at(q, -med, yq), at(q, -med, yq + 0.2), at(p, -med, yp + 0.2), MEDIAN);
        surf.quad(at(q, med, yq), at(p, med, yp), at(p, med, yp + 0.2), at(q, med, yq + 0.2), MEDIAN);
      } else band(-w.cw, w.cw, 0, asph);
      // sidewalks: raised, with kerbs
      if (w.sw > 0) for (const sg of [-1, 1]) {
        if (w.inWalkGap(sm, sg)) continue;                                         // a side street's mouth
        const dA = sg * w.cw, dB = sg * w.hw;
        band(Math.min(dA, dB), Math.max(dA, dB), KERB, (Math.floor(s0 / 4) & 1) ? WALK : WALK2);
        if (sg > 0) surf.quad(at(p, dA, yp), at(q, dA, yq), at(q, dA, yq + KERB), at(p, dA, yp + KERB), CURB);
        else surf.quad(at(q, dA, yq), at(p, dA, yp), at(p, dA, yp + KERB), at(q, dA, yq + KERB), CURB);
      }
      if (gap) continue;
      // markings
      const dash = (Math.floor(sm / 4) & 1) === 0;
      const line = (d, lw, col, dashed) => { if ((dashed && !dash) || (Math.abs(d) > w.cw - 1 && w.inWalkGap(sm, Math.sign(d)))) return; mark.quad(at(p, d - lw / 2, yp + MARK), at(p, d + lw / 2, yp + MARK), at(q, d + lw / 2, yq + MARK), at(q, d - lw / 2, yq + MARK), col); };
      if (w.kind !== 'road') { if (w.kind === 'street' && w.hw * 2 >= 4) for (const sg of [-1, 1]) line(sg * (w.hw - 0.45), 0.12, WHITE, false); continue; }
      const cw = w.cw, m = w.median ? w.median / 2 : 0;
      if (w.cls === 'national') {
        const lane = (cw - m) / 3;
        for (const sg of [-1, 1]) { line(sg * (m + lane), 0.15, WHITE, true); line(sg * (m + 2 * lane), 0.15, WHITE, true); line(sg * (cw - 0.35), 0.15, WHITE, false); }
      } else if (w.cls === 'arterial') {
        if (m) for (const sg of [-1, 1]) line(sg * (m + 0.3), 0.15, WHITE, false);
        else { line(-0.18, 0.15, YELLOW, false); line(0.18, 0.15, YELLOW, false); }
        if (w.lanes >= 4) for (const sg of [-1, 1]) line(sg * (m + (cw - m) / 2), 0.15, WHITE, true);
        for (const sg of [-1, 1]) line(sg * (cw - 0.35), 0.15, WHITE, false);
      } else if (w.cls === 'collector') {
        if (tram) for (const sg of [-1, 1]) line(sg * 3.1, 0.15, WHITE, false);           // 軌道敷 (the tram's zone)
        else if (m) { for (const sg of [-1, 1]) { line(sg * (m + 0.3), 0.15, WHITE, false); if (w.lanes >= 4) line(sg * (m + (cw - m) / 2), 0.15, WHITE, true); } }
        else if (w.lanes >= 4) { line(-0.18, 0.15, YELLOW, false); line(0.18, 0.15, YELLOW, false); for (const sg of [-1, 1]) line(sg * cw / 2, 0.15, WHITE, true); }
        else line(0, 0.15, WHITE, true);
        for (const sg of [-1, 1]) line(sg * (cw - 0.35), 0.15, WHITE, false);
      } else {                                                                     // old road, street-class roads: 路側帯
        for (const sg of [-1, 1]) line(sg * (cw - 0.8), 0.12, WHITE, false);
      }
    }
    // level crossings: stop lines on both approaches (keep-left: the approach half is the left of travel)
    for (const L of w.lx) {
      if (L.tram) continue;                                                        // a tram in the street: no gates, no stop lines
      for (const sg of [-1, 1]) {
        const s = L.s + sg * (L.hw + 2.2); if (s < 0 || s > w.length) continue;
        const pt = A.at(s); if (!inChunk(pt.x, pt.z) || w.inCut(s)) continue;
        const y = w.yAt(s) + Y0 + MARK, d0 = sg > 0 ? 0.2 : -(w.cw - 0.3), d1 = sg > 0 ? w.cw - 0.3 : -0.2;
        const hx = pt.hx * 0.225, hz = pt.hz * 0.225, a = [pt.x - pt.hz * d0, pt.z + pt.hx * d0], b = [pt.x - pt.hz * d1, pt.z + pt.hx * d1];
        mark.quad([a[0] - hx, y, a[1] - hz], [b[0] - hx, y, b[1] - hz], [b[0] + hx, y, b[1] + hz], [a[0] + hx, y, a[1] + hz], WHITE);
      }
    }
  }
  // ---- junctions
  for (const nd of N.nodes) {
    if (nd.plain || !nd.fills || !inChunk(nd.x, nd.z)) continue;
    const major = nd.arms.reduce((m, a) => (!m || (a.kind === 'road' && m.kind !== 'road') || a.cw > m.cw ? a : m), null);
    const col = asphaltOf(major.way);
    const streetsOnly = nd.arms.every(a => a.kind !== 'road'), vy = (v) => (streetsOnly ? groundAt(v.p[0], v.p[1]) : vertexY(v));
    for (const f of nd.fills) {
      const pts = f.verts.map(v => [v.p[0], vy(v) + Y0, v.p[1]]);
      const cy = streetsOnly ? groundAt(f.c[0], f.c[1]) : nd.minor ? pts.reduce((a, p) => a + p[1], 0) / pts.length - Y0 : nd.y;
      fan(surf, [f.c[0], cy + Y0, f.c[1]], pts, nd.minor ? asphaltOf(nd.arms.find(a => a.way !== nd.minor).way) : col);
    }
    // corner sidewalks: top (fan from the building-line corner) and the kerb face along the return
    for (const wk of nd.walks) {
      const kerb = wk.kerb.map(v => [v.p[0], vertexY(v) + Y0, v.p[1]]);
      const outer = wk.outer.map(v => [v.p[0], vertexY(v) + Y0 + KERB, v.p[1]]);
      const top = [...kerb.map(p => [p[0], p[1] + KERB, p[2]]), ...outer];
      const c = outer.length === 3 ? outer[1] : [(outer[0][0] + outer[outer.length - 1][0]) / 2, (outer[0][1] + outer[outer.length - 1][1]) / 2, (outer[0][2] + outer[outer.length - 1][2]) / 2];
      fan(surf, c, top, WALK);
      for (let i = 0; i + 1 < kerb.length; i++) {
        const a = kerb[i], b = kerb[i + 1];
        surf.quad(a, b, [b[0], b[1] + KERB, b[2]], [a[0], a[1] + KERB, a[2]], CURB);
        surf.quad(b, a, [a[0], a[1] + KERB, a[2]], [b[0], b[1] + KERB, b[2]], CURB);
      }
    }
    // zebra crossings on the approaches, stop lines behind them (on the lanes coming in: the arm's +n side)
    for (const a of nd.arms) {
      if (!a.crosswalk) continue;
      const P = (t, d) => { const s = a.s + a.dir * t; return [nd.x + a.ux * t - a.uz * d, a.way.yAt(s) + Y0 + MARK, nd.z + a.uz * t + a.ux * d]; };
      const t0 = a.cut + 0.5, t1 = a.cut + 4.5, m = a.way.median ? a.way.median / 2 : 0;
      for (let d = -a.cw + 0.6; d + 0.45 <= a.cw - 0.4; d += 0.9) mark.quad(P(t0, d), P(t0, d + 0.45), P(t1, d + 0.45), P(t1, d), WHITE);
      const ts = t1 + 2, d0 = Math.max(0.2, m), d1 = a.cw - 0.3;
      mark.quad(P(ts, d0), P(ts, d1), P(ts + 0.45, d1), P(ts + 0.45, d0), WHITE);
    }
  }
  // ---- the expressway and its ramps (on decks; no junctions)
  for (const road of ROADS) {
    if (road.cls !== 'expressway' && road.cls !== 'ramp') continue;
    const A = road.align, n = Math.max(1, Math.round(A.length / 4)), hw = road.w / 2, cw = hw;
    for (let i = 0; i < n; i++) {
      const s0 = (A.length * i) / n, s1 = (A.length * (i + 1)) / n, p = A.at(s0), q = A.at(s1);
      if (!inChunk((p.x + q.x) / 2, (p.z + q.z) / 2)) continue;
      const yp = road.profile.yAt(s0) + 0.03, yq = road.profile.yAt(s1) + 0.03;
      if (levelOf('road', yp, heightAt(p.x, p.z)) === 'tunnel') continue;
      const at = (pt, d, y) => [pt.x - pt.hz * d, y, pt.z + pt.hx * d];
      surf.quad(at(p, -cw, yp), at(p, cw, yp), at(q, cw, yq), at(q, -cw, yq), ASPH);
      const line = (d, lw, col, dashed) => { if (dashed && (i % 3)) return; mark.quad(at(p, d - lw / 2, yp + MARK), at(p, d + lw / 2, yp + MARK), at(q, d + lw / 2, yq + MARK), at(q, d - lw / 2, yq + MARK), col); };
      for (const sg of [-1, 1]) line(sg * (cw - 0.6), 0.2, WHITE, false);
      if (road.lanes >= 4) { line(-0.25, 0.15, YELLOW, false); line(0.25, 0.15, YELLOW, false); for (const sg of [-1, 1]) line(sg * cw / 2, 0.15, WHITE, true); }
    }
  }
  const M = roadMaterials(ctx), g = new THREE.Group(); g.name = 'roads';
  const a = surf.mesh(M.surface, { shadow: false }), b = mark.mesh(M.marks, { shadow: false });
  if (a) g.add(a); if (b) { ctx.noOutline(b); g.add(b); }
  return g;
}
