// Track for one streamed chunk: rails and sleepers on every railway that is not in a tunnel (ballast / viaduct
// deck come from structures.js), the tram's grooved rails set into the street, the AGT's concrete running pads
// and guide rail, and catenary poles (portals over the four-track trunk line). One vertex-coloured mesh per chunk.
import * as THREE from 'three';
import { LINES } from '../plan/rail.js';
import { MAP, heightAt } from '../plan/terrain.js';
import { levelAt } from '../plan/ground.js';
import { CHUNK } from '../plan/urban.js';
import { tramOwnWay } from '../plan/raster.js';
import { roadSpaceAt } from '../plan/network.js';

/** Is this spot on a road (carriageway / junction / sidewalk) at street level? */
const onRoad = (x, z, m = 0.4) => !!roadSpaceAt(x, z, m);
import { TRACKS } from './structures.js';
import { MB, rgb, shade } from './mb.js';

const RAIL = rgb('#8d949b'), RAIL_TOP = rgb('#cfd5da'), SLEEPER = rgb('#8a8378'), SLEEPER_W = rgb('#6d5a4a'), PAD = rgb('#b9b6ae'), GUIDE = rgb('#7d858c');
const POLE = rgb('#9aa2a8'), POLE_D = rgb('#7c848b'), GROOVE = rgb('#3f3d44');
const GAUGE = { jr: 1.067, private: 1.067, metro: 1.067, tram: 1.372 };
const STEP = 4;

let SAMP = null;
function lineSamples() {
  if (SAMP) return SAMP;
  SAMP = LINES.map((L) => {
    const A = L.align, n = Math.max(1, Math.round(A.length / STEP)), out = [];
    for (let i = 0; i <= n; i++) { const s = (A.length * i) / n, q = A.at(s), y = L.profile.yAt(s); out.push({ s, x: q.x, z: q.z, hx: q.hx, hz: q.hz, y, lv: levelAt(L, s, y, heightAt(q.x, q.z)) }); }
    return out;
  });
  return SAMP;
}

export function trackMaterial(ctx) { return ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05, name: 'track' }); }

export function buildChunkTrack(ctx, ci, cj) {
  const x0 = MAP.x0 + ci * CHUNK, z0 = MAP.z0 + cj * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
  const mb = new MB(), S = lineSamples();
  for (let li = 0; li < LINES.length; li++) {
    const L = LINES[li], sm = S[li], tr = TRACKS[L.kind], kind = L.kind;
    let lastPole = -1e9;
    for (let i = 0; i + 1 < sm.length; i++) {
      const p = sm[i], q = sm[i + 1], mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2;
      if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1 || p.lv === 'tunnel' || q.lv === 'tunnel') continue;
      const at = (pt, d, y) => [pt.x - pt.hz * d, y, pt.z + pt.hx * d];
      for (const tc of tr) {
        const g = GAUGE[kind] / 2 + 0.035;
        if (kind === 'agt') {
          // two concrete running pads + a central guide rail
          for (const d of [tc - 0.95, tc + 0.95]) { const a = d - 0.3, b = d + 0.3, yp = p.y - 0.02, yq = q.y - 0.02; mb.quad(at(p, a, yp), at(p, b, yp), at(q, b, yq), at(q, a, yq), PAD); }
          mb.quad(at(p, tc - 0.06, p.y + 0.35), at(p, tc + 0.06, p.y + 0.35), at(q, tc + 0.06, q.y + 0.35), at(q, tc - 0.06, q.y + 0.35), GUIDE);
          continue;
        }
        const atGrade = kind === 'tram' && Math.abs(p.y - heightAt(p.x, p.z)) < 1.5;
        // a level crossing: the rails lie flush in the road surface (flangeway grooves), no sleepers
        const xing = (kind !== 'tram' || tramOwnWay(p.x)) && (p.lv === 'grade' || kind === 'tram') && onRoad(mx, mz, 0) && onRoad(p.x, p.z, 0);
        if (xing) {
          const up = kind === 'tram' ? 0.075 : 0.035;
          for (const d of [tc - g, tc + g]) { const a = d - 0.05, b = d + 0.05; mb.quad(at(p, a, p.y + up), at(p, b, p.y + up), at(q, b, q.y + up), at(q, a, q.y + up), GROOVE); }
          continue;
        }
        if (atGrade && !tramOwnWay(p.x)) {
          // street running: grooved rails flush with the road surface
          for (const d of [tc - g, tc + g]) { const a = d - 0.05, b = d + 0.05; mb.quad(at(p, a, p.y + 0.075), at(p, b, p.y + 0.075), at(q, b, q.y + 0.075), at(q, a, q.y + 0.075), GROOVE); }
          continue;
        }
        // sleepers every 0.6 m (a flat block); on the grassed tram track they lie on the lawn, rails on top
        const n = 7, lift = atGrade ? 0.21 : 0;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, cx = p.x + (q.x - p.x) * t, cz = p.z + (q.z - p.z) * t, cy = p.y + (q.y - p.y) * t - 0.17 + lift, hx = p.hx, hz = p.hz;
          const c = [cx - hz * tc, cy, cz + hx * tc], hl = 1.05, hwid = 0.11;
          const ax = -hz, az = hx;   // across the track
          const col = kind === 'tram' ? SLEEPER_W : SLEEPER;
          mb.quad([c[0] - ax * hl - hx * hwid, cy, c[2] - az * hl - hz * hwid], [c[0] + ax * hl - hx * hwid, cy, c[2] + az * hl - hz * hwid], [c[0] + ax * hl + hx * hwid, cy, c[2] + az * hl + hz * hwid], [c[0] - ax * hl + hx * hwid, cy, c[2] - az * hl + hz * hwid], col);
        }
        // rails: top + inner / outer faces
        for (const d of [tc - g, tc + g]) {
          const a = d - 0.035, b = d + 0.035, yp = p.y + lift, yq = q.y + lift, lo = -0.16;
          mb.quad(at(p, a, yp), at(p, b, yp), at(q, b, yq), at(q, a, yq), RAIL_TOP);
          mb.quad(at(q, a, yq + lo), at(p, a, yp + lo), at(p, a, yp), at(q, a, yq), RAIL);
          mb.quad(at(p, b, yp + lo), at(q, b, yq + lo), at(q, b, yq), at(p, b, yp), RAIL);
        }
      }
      // catenary poles (electrified lines, not the AGT)
      const streetTram = kind === 'tram' && !tramOwnWay(p.x) && Math.abs(p.y - heightAt(p.x, p.z)) < 1.5;
      if (kind !== 'agt' && !streetTram && p.s - lastPole >= (kind === 'tram' ? 30 : 45)) {
        const top = p.y + (kind === 'tram' ? 6.2 : 6.6), outer = tr[tr.length - 1] + (kind === 'jr' ? 2.6 : 2.2), arm = 3.2;
        // masts stand on the ground beside the line, never in a road or a junction: try again 4 m on if blocked
        const ground = p.lv !== 'structure';
        if (ground && [-1, 1].some(sg => { const c = at(p, sg * outer, 0); return onRoad(c[0], c[2], 0.6); })) continue;
        lastPole = p.s;
        if (kind === 'jr') {
          // portal: two masts outside the outer tracks and a beam across
          for (const sg of [-1, 1]) { const c = at(p, sg * outer, 0); mb.obox(c[0], p.y - 0.8, c[2], 0.35, top - p.y + 1.1, 0.35, Math.atan2(p.hx, p.hz), POLE); }
          const a = at(p, -outer, top), b = at(p, outer, top);
          mb.quad([a[0], top - 0.35, a[2]], [b[0], top - 0.35, b[2]], [b[0], top, b[2]], [a[0], top, a[2]], POLE_D);
          mb.quad([b[0], top - 0.35, b[2]], [a[0], top - 0.35, a[2]], [a[0], top, a[2]], [b[0], top, b[2]], POLE_D);
        } else {
          // one mast on each side with a cantilever arm reaching over its track
          for (const sg of [-1, 1]) {
            const c = at(p, sg * outer, 0); mb.obox(c[0], p.y - 0.8, c[2], 0.3, top - p.y + 0.9, 0.3, Math.atan2(p.hx, p.hz), POLE);
            const a = at(p, sg * outer, top - 0.4), b = at(p, sg * (outer - arm), top - 0.4);
            mb.quad([a[0], top - 0.55, a[2]], [b[0], top - 0.55, b[2]], [b[0], top - 0.4, b[2]], [a[0], top - 0.4, a[2]], POLE_D);
            mb.quad([b[0], top - 0.55, b[2]], [a[0], top - 0.55, a[2]], [a[0], top - 0.4, a[2]], [b[0], top - 0.4, b[2]], POLE_D);
          }
        }
      }
    }
  }
  return mb.mesh(trackMaterial(ctx), { shadow: true });
}
void shade;
