// Utility poles and overhead wires (電柱・電線), and the tram street's catenary. Placed from the road network, so
// nothing stands in a carriageway or a junction:
//  • local streets of the districts that still have overhead lines: a pole every ~30 m on one side, just inside the
//    street edge (as on Japanese back streets), only between the junctions;
//  • the old road and the collectors: on the sidewalk by the kerb (or just outside the old road's edge);
//  • 本町通り (the tram street): steel poles on both sidewalks, a span wire across, a contact wire over each track.
// Crossarms and insulators, a transformer can on every third pole, a street light on some; three power lines and a
// communication cable between neighbours. Built per streamed chunk (poles by position, spans by their middle),
// wires through the core's screen-space wire system.
import * as THREE from 'three';
import { groundAt } from '../plan/ground.js';
import { chunkOf, chunkKey } from '../plan/urban.js';
import { prng } from '../plan/geom.js';
import { roadSpaceAt } from '../plan/network.js';
import { generateTrees } from '../plan/trees.js';
import { createWireSystem } from '../core/geo.js';
import { MB, rgb } from './mb.js';

const OVERHEAD = new Set(['shuku', 'gaketa', 'shitamachi', 'minami', 'teramachi', 'miharashi-s', 'canal', 'hub', 'kita']);
const CONC = rgb('#b9b6ae'), CONC_D = rgb('#a19e96'), ARM = rgb('#8d949b'), INSUL = rgb('#e8e4dc'), TRANS = rgb('#9aa3a8'), LAMP = rgb('#eef0e8'), YEL = rgb('#e8c547');
const STEEL = rgb('#8e969d'), STEEL_D = rgb('#737b82');
const TRACK = 1.6;                                   // tram tracks either side of 本町通り's centreline

/** How far the junction at a way's start (end = 0) or end (end = 1) reaches along it. */
function cutAt(w, end) {
  let v = 0;
  for (const c of w.cuts) { if (end === 0 && c[0] <= 0.5) v = Math.max(v, c[1]); if (end === 1 && c[1] >= w.length - 0.5) v = Math.max(v, w.length - c[0]); }
  return v;
}
const nearCut = (w, s, m) => w.nearJunction(s, m) || w.lx.some(L => Math.abs(s - L.s) < L.hw + m + 2);

let PLAN = null;
/** All poles, spans and tram catenary of the map (pure data), indexed by chunk. */
export function polePlan(U) {
  if (PLAN) return PLAN;
  const N = U.net, poles = [], spans = [], tram = [];
  // a spot is fine if it is not in a junction nor in another way's carriageway, and clear of the street trees
  const T = generateTrees(U.raster);
  const treeNear = (x, z) => { const [ci, cj] = chunkOf(x, z); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const t of T.byChunk.get(chunkKey(ci + i, cj + j)) || []) if (Math.hypot(t.x - x, t.z - z) < 2.2) return true; return false; };
  const free = (x, z, own) => { const r = roadSpaceAt(x, z, 0.25); return (!r || (r.what !== 'junction' && (r.what === 'sidewalk' || r.way === own))) && !treeNear(x, z); };
  // nothing stands or runs under a viaduct or a bridge deck
  const covered = (x, z) => U.raster.headAt(x, z) < 30;
  const spanOK = (a, b) => { for (let k = 1; k < 8; k++) { const u = k / 8; if (covered(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u)) return false; } return true; };
  const pole = (x, z, q, top, seed, i, side) => ({ x, z, y: groundAt(x, z), top, hx: q.hx, hz: q.hz, trans: (seed + i) % 3 === 0, lamp: (seed + i) % 2 === 0, side });
  for (const w of N.ways) {
    if (w.kind === 'street') {
      const st = w.st; if (!OVERHEAD.has(st.district)) continue;
      // no poles under an arcade (the lines run behind its roof)
      if ((U.arcades || []).some(A => Math.abs(st.a[1] - A.z) < 2 && Math.abs(st.b[1] - A.z) < 2 && Math.max(st.a[0], st.b[0]) > A.x0 - 1 && Math.min(st.a[0], st.b[0]) < A.x1 + 1)) continue;
      const side = (st.id * 2654435761 >>> 0) % 2 ? 1 : -1, d = side * (w.hw - 0.35), r = prng(st.id * 7 + 3);
      const s0 = cutAt(w, 0) + 2.5, s1 = w.length - cutAt(w, 1) - 2.5; if (s1 - s0 < 5) continue;
      const n = Math.max(1, Math.round((s1 - s0) / 30));
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const s = s0 + ((s1 - s0) * i) / n, q = w.align.at(s), x = q.x - q.hz * d, z = q.z + q.hx * d;
        if (!free(x, z, w) || covered(x, z)) { prev = null; continue; }
        const p = pole(x, z, q, 10.6 + r.range(-0.4, 0.5), st.id, i, side);
        poles.push(p); if (prev && spanOK(prev, p)) spans.push([prev, p]); prev = p;
      }
    } else if (w.kind === 'road' && (w.cls === 'old' || w.cls === 'collector') && w.R.id !== 'honcho') {
      const d = w.sw > 0 ? w.cw + 0.5 : w.hw + 0.3;
      let prev = null, i = 0;
      for (let s = 8; s < w.length - 8; s += 34, i++) {
        if (!w.atGrade(s) || nearCut(w, s, 3)) { prev = null; continue; }
        const q = w.align.at(s), x = q.x - q.hz * d, z = q.z + q.hx * d;
        if (!free(x, z, w) || covered(x, z)) { prev = null; continue; }
        const p = pole(x, z, q, 11.2, 7, i, 1);
        p.lamp = true; poles.push(p); if (prev && spanOK(prev, p)) spans.push([prev, p]); prev = p;
      }
    } else if (w.kind === 'road' && w.R.id === 'honcho') {
      // the tram street: a pair of poles every ~28 m on the sidewalks, span wire between them
      // (at a junction the pair moves on a few metres; the contact wire runs on across it)
      let prev = null;
      for (let s = 6; s < w.length - 6; s += 4) {
        if (!w.atGrade(s)) { prev = null; continue; }
        if (prev && s - prev.s < 28) continue;
        if (nearCut(w, s, 2)) continue;
        const q = w.align.at(s), y = w.yAt(s), d = w.cw + 0.55;
        const Lp = [q.x + q.hz * d, q.z - q.hx * d], Rp = [q.x - q.hz * d, q.z + q.hx * d];
        if (!free(Lp[0], Lp[1], w) || !free(Rp[0], Rp[1], w)) continue;
        if (covered(Lp[0], Lp[1]) || covered(Rp[0], Rp[1]) || covered(q.x, q.z)) continue;
        // the contact wire dips under a viaduct over the street (head[i]: the headroom over the wire's sample i)
        const head = [];
        if (prev) { const n = Math.max(4, Math.round((s - prev.s) / 4)); for (let i = 0; i <= n; i++) { const qq = w.align.at(prev.s + (s - prev.s) * i / n); head.push(U.raster.headAt(qq.x, qq.z)); } }
        const t = { s, w, x: q.x, z: q.z, y, hx: q.hx, hz: q.hz, L: [Lp[0], groundAt(Lp[0], Lp[1]), Lp[1]], R: [Rp[0], groundAt(Rp[0], Rp[1]), Rp[1]], prev, head };
        tram.push(t); prev = t;
      }
    }
  }
  const byChunk = new Map();
  const put = (x, z, kind, v) => { const [ci, cj] = chunkOf(x, z), k = chunkKey(ci, cj); let c = byChunk.get(k); if (!c) byChunk.set(k, (c = { poles: [], spans: [], tram: [] })); c[kind].push(v); };
  for (const p of poles) put(p.x, p.z, 'poles', p);
  for (const s of spans) put((s[0].x + s[1].x) / 2, (s[0].z + s[1].z) / 2, 'spans', s);
  for (const t of tram) put(t.x, t.z, 'tram', t);
  PLAN = { poles, spans, tram, byChunk };
  return PLAN;
}

/** Poles (merged mesh) + wires (screen-space ribbons) for one chunk; colliders on the poles. */
export function buildChunkPoles(ctx, U, key, res) {
  const P = polePlan(U), c = P.byChunk.get(key); if (!c) return null;
  const mb = new MB(), W = createWireSystem();
  for (const p of c.poles) {
    const y0 = p.y, top = y0 + p.top, ax = -p.hz, az = p.hx;            // across the street
    // tapered pole: 8-sided prism
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2, r0 = 0.17, r1 = 0.12;
      mb.quad([p.x + Math.cos(a1) * r0, y0 - 0.3, p.z + Math.sin(a1) * r0], [p.x + Math.cos(a0) * r0, y0 - 0.3, p.z + Math.sin(a0) * r0], [p.x + Math.cos(a0) * r1, top, p.z + Math.sin(a0) * r1], [p.x + Math.cos(a1) * r1, top, p.z + Math.sin(a1) * r1], k & 1 ? CONC : CONC_D);
    }
    mb.obox(p.x, y0, p.z, 0.4, 1.8, 0.4, Math.atan2(p.hx, p.hz), YEL, 'NSEW');                 // guard sleeve
    mb.obox(p.x, top - 0.45, p.z, 1.9, 0.1, 0.1, Math.atan2(p.hx, p.hz), ARM);                  // crossarm + insulators
    for (const d of [-0.8, 0, 0.8]) mb.obox(p.x + ax * d, top - 0.35, p.z + az * d, 0.09, 0.16, 0.09, 0, INSUL);
    mb.obox(p.x, top - 1.35, p.z, 1.4, 0.08, 0.08, Math.atan2(p.hx, p.hz), ARM);
    if (p.trans) mb.obox(p.x - ax * 0.45, top - 3.4, p.z - az * 0.45, 0.62, 1.05, 0.62, 0, TRANS);
    if (p.lamp) { const lx = p.x - ax * p.side * 1.3, lz = p.z - az * p.side * 1.3; mb.obox((p.x + lx) / 2, top - 4.6, (p.z + lz) / 2, 0.06, 0.06, 1.3, Math.atan2(ax, az), ARM); mb.obox(lx, top - 4.75, lz, 0.28, 0.12, 0.5, Math.atan2(ax, az), LAMP); }
    ctx.physics.addCylinder(p.x, p.z, 0.22, y0 - 1, top);
  }
  for (const [a, b] of c.spans) {
    const ax = -a.hz, az = a.hx;
    const wire = (d, dy, sag, width, color) => {
      const A = [a.x + ax * d, a.y + a.top + dy, a.z + az * d], B = [b.x + ax * d, b.y + b.top + dy, b.z + az * d], pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t]); }
      W.add(pts, { width, color });
    };
    for (const d of [-0.8, 0, 0.8]) wire(d, -0.3, 0.45, 0.016, '#3a3640');
    wire(0, -3.9, 0.7, 0.04, '#34303a');   // thick communication cable
    wire(0.3, -4.3, 0.8, 0.022, '#3d3845');
  }
  // tram street catenary: steel poles with a lamp, span wire across, contact wire over each track
  for (const t of c.tram) {
    const Hs = 7.2, Hc = 5.9;
    for (const [P0, sg] of [[t.L, -1], [t.R, 1]]) {
      mb.obox(P0[0], P0[1] - 0.3, P0[2], 0.26, Hs + 0.8, 0.26, Math.atan2(t.hx, t.hz), STEEL);
      mb.obox(P0[0], P0[1] + Hs + 0.5, P0[2], 0.34, 0.12, 0.34, 0, STEEL_D);
      // street light on a short bracket toward the carriageway
      const lx = P0[0] + t.hz * sg * 1.6, lz = P0[2] - t.hx * sg * 1.6;
      mb.obox((P0[0] + lx) / 2, P0[1] + 6.2, (P0[2] + lz) / 2, 0.07, 0.07, 1.6, Math.atan2(t.hz, -t.hx), STEEL_D);
      mb.obox(lx, P0[1] + 6.05, lz, 0.3, 0.12, 0.55, Math.atan2(t.hz, -t.hx), LAMP);
      ctx.physics.addCylinder(P0[0], P0[2], 0.2, P0[1] - 1, P0[1] + Hs);
    }
    const yL = t.L[1] + Hs, yR = t.R[1] + Hs, pts = [];
    for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push([t.L[0] + (t.R[0] - t.L[0]) * u, yL + (yR - yL) * u - 0.35 * 4 * u * (1 - u), t.L[2] + (t.R[2] - t.L[2]) * u]); }
    W.add(pts, { width: 0.02, color: '#3a3640' });
    // droppers + contact wires to the previous span
    if (t.prev) for (const d of [-TRACK, TRACK]) {
      const cw = [], n = Math.max(4, Math.round((t.s - t.prev.s) / 4)), head = t.head || [];
      // under a viaduct the wire runs 0.35 m below its underside (from one sample, ~4 m, before its edge), easing back
      // up over the next three samples (~12 m)
      const hAt = (i) => { let h = Hc; head.forEach((hd, j) => { const lo = Math.min(Hc, hd - 0.35); h = Math.min(h, lo + (Hc - lo) * Math.min(1, Math.max(0, Math.abs(j - i) - 1) / 3)); }); return h; };
      for (let i = 0; i <= n; i++) { const u = i / n, s = t.prev.s + (t.s - t.prev.s) * u, q = t.w.align.at(s), h = hAt(i); cw.push([q.x - q.hz * d, t.w.yAt(s) + h - 0.12 * 4 * u * (1 - u) * (h < Hc - 0.01 ? 0 : 1), q.z + q.hx * d]); }
      W.add(cw, { width: 0.018, color: '#2f2c35' });
    }
  }
  const g = new THREE.Group(); g.name = 'poles';
  const m = mb.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05, name: 'poles' })); if (m) g.add(m);
  const wm = W.build(); if (wm) { if (res) wm.material.uniforms.uRes.value.copy(res); g.add(wm); }
  return g;
}
