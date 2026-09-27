// Street-level shop fronts for 花渡市, built per streamed chunk from the planned buildings (plan/urban.js): every
// building with a shop on its ground floor gets, on its front face,
//   • a fascia sign with the shop's name (its trade picked from the district's mix: 駅前 chains, 宿場町 老舗,
//     下町 焼き鳥…), pilasters, the shop glass with a painted interior behind it and a door frame;
//   • by trade: a striped awning, noren and red lanterns, or nothing;
// and the taller mixed-use buildings get a sign stack (袖看板, a panel per tenant floor) and, near the station and
// the big roads, a rooftop billboard. Everything is textured from one sign atlas (cells drawn on demand) and one
// painted-interior atlas; two meshes per chunk.
import * as THREE from 'three';
import { prng } from '../plan/geom.js';
import { URBAN } from '../plan/urban.js';
import { createAtlas, fasciaSign, stackPanel, billboard, noren, lanternTex, awningTex, crownSign, createInteriors } from './signs/atlas.js';
import { SHOP_NAMES, INTERIOR_OF, USES, TENANTS, ADS, CROWNS } from './signs/names.js';

const STATION = [-400, -150];                                  // the hub: billboards gather round it
const AWNING = new Set(['cafe', 'bakery', 'flower', 'sweets', 'wagashi', 'clothes', 'restaurant', 'tea', 'senbei', 'shop']);
const NOREN = new Set(['izakaya', 'yakitori', 'soba', 'ramen', 'sake', 'sushi', 'wagashi']);
const LANTERN = new Set(['izakaya', 'yakitori']);
const AWN_COL = ['#d9534f', '#3f7fbf', '#e8a33c', '#4c9a6a', '#8e5aa8', '#e07a8f', '#6a4a36'];
const NOREN_COL = ['#2d3e66', '#6a2f2f', '#3a3346', '#7a5a2f'];
const DARK = [0.16, 0.15, 0.18], FRAME = [0.32, 0.32, 0.35], WHITE = [1, 1, 1];

/** Textured, vertex-coloured triangles (sign atlas / interior atlas). */
class TBuf {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; }
  get n() { return this.P.length / 3; }
  /** Quad a,b,c,d counter-clockwise seen from its front; uv = [u0, v0, u1, v1] mapped a→(u0,v0) … d→(u0,v1). */
  quad(a, b, c, d, uv, col = WHITE) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const base = this.n, U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    [a, b, c, d].forEach((p, i) => { this.P.push(p[0], p[1], p[2]); this.N.push(nx, ny, nz); this.U.push(U[i][0], U[i][1]); this.C.push(col[0], col[1], col[2]); });
    this.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  mesh(mat) {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; return m;
  }
}

/** The atlases and materials, created once per world (fonts must be loaded). */
export function createShopKit(ctx) {
  const A = createAtlas(ctx, { key: 'hanawatari-signs' }), INT = createInteriors(ctx);
  return {
    A, INT, last: 0,
    sign: ctx.mat.toon('#ffffff', { map: A.tex, vertexColors: true, paint: 0.02, alphaTest: 0.45, side: 'double', name: 'signs' }),
    interior: ctx.mat.emissive('#ffffff', 0.74, { map: INT.tex }),
    /** Upload new atlas cells now and then (the atlas is one big canvas). */
    flush(now) { if (A.dirty && now - this.last > 300) { A.tex.needsUpdate = true; A.dirty = false; this.last = now; } },
  };
}

const pickW = (r, table) => { let tot = 0; for (const k in table) tot += table[k]; let x = r() * tot; for (const k in table) { x -= table[k]; if (x <= 0) return k; } return Object.keys(table)[0]; };

/** Shop fronts, sign stacks and billboards of one chunk's buildings → Group (or null). */
export function buildChunkShopfronts(ctx, kit, buildings) {
  const sign = new TBuf(), inter = new TBuf(), A = kit.A, white = A.white;
  for (const b of buildings) {
    if (b.site) continue;                                      // station, store, schools…: their own dressing
    const r = prng((b.seed ^ 0x2f1c5) >>> 0);
    const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2, zf = b.d / 2;
    const W = (x, y, z) => [b.x + x * c + z * s, b.y + y, b.z - x * s + z * c];      // local → world
    // a box in local coords; `front` uv on its +z face (others white, coloured col)
    const box = (x0, x1, y0, y1, z0, z1, col, front = null, buf = sign) => {
      const P = (x, y, z) => W(x, y, z);
      buf.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), front || white, front ? WHITE : col);
      buf.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), white, col);
      buf.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), white, col);
      buf.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), white, col);
      buf.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), white, col);
      buf.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), white, col);
    };
    const mix = URBAN[b.district]?.mix || 'downtown';
    // ---- shop fronts
    if (b.shop && b.g1 > 2.6 && b.w > 3.5) {
      const units = b.w > 15 && (b.kind === 'zakkyo' || b.kind === 'office' || b.kind === 'mansion') ? 2 : 1, g1 = b.g1;
      for (let k = 0; k < units; k++) {
        const u0 = -hw + (b.w * k) / units, u1 = -hw + (b.w * (k + 1)) / units, um = (u0 + u1) / 2;
        const use = pickW(r, USES[mix] || USES.downtown), list = SHOP_NAMES[use] || SHOP_NAMES.shop, [name, sub, style] = list[Math.floor(r() * list.length)];
        const fy0 = g1 - 1.15, fy1 = g1 - 0.2;
        // pilasters, fascia sign
        box(u0, u0 + 0.28, 0, fy1, zf, zf + 0.14, FRAME); box(u1 - 0.28, u1, 0, fy1, zf, zf + 0.14, FRAME);
        box(u0 + 0.28, u1 - 0.28, fy0, fy1, zf, zf + 0.26, DARK, fasciaSign(ctx, A, name, sub, style));
        // the shop glass with its interior, a transom bar and a door
        const gx0 = u0 + 0.4, gx1 = u1 - 0.4, gy1 = fy0 - 0.1;
        inter.quad(W(gx0, 0.12, zf + 0.04), W(gx1, 0.12, zf + 0.04), W(gx1, gy1, zf + 0.04), W(gx0, gy1, zf + 0.04), kit.INT.uv[INTERIOR_OF[use] || 'shop']);
        box(gx0, gx1, gy1 - 0.08, gy1, zf + 0.03, zf + 0.1, FRAME);
        const dx = um + (r() < 0.5 ? -1 : 1) * Math.min(1.2, (gx1 - gx0) / 4);
        for (const x of [dx - 0.55, dx + 0.55]) box(x - 0.05, x + 0.05, 0.1, gy1 - 0.08, zf + 0.03, zf + 0.1, FRAME);
        box(gx0, gx1, 0.0, 0.14, zf + 0.02, zf + 0.12, FRAME);                               // kick plate
        // by trade: awning / noren + lanterns
        if (AWNING.has(use) && r() < 0.7) {
          const uv = awningTex(ctx, A, AWN_COL[Math.floor(r() * AWN_COL.length)]), ay = fy0 - 0.15, out = Math.min(1.4, 0.6 + (u1 - u0) * 0.08);
          const a = W(u0 + 0.3, ay - 0.62, zf + out), bb = W(u1 - 0.3, ay - 0.62, zf + out), cc = W(u1 - 0.3, ay, zf + 0.05), d = W(u0 + 0.3, ay, zf + 0.05);
          sign.quad(a, bb, cc, d, uv); sign.quad(bb, a, d, cc, uv);
        }
        if (NOREN.has(use)) {
          const uv = noren(ctx, A, name.replace(/^[^ ]+ /, '').slice(0, 4), NOREN_COL[Math.floor(r() * NOREN_COL.length)]);
          const ny1 = gy1 - 0.05, ny0 = ny1 - 0.85;
          sign.quad(W(dx - 0.75, ny0, zf + 0.16), W(dx + 0.75, ny0, zf + 0.16), W(dx + 0.75, ny1, zf + 0.16), W(dx - 0.75, ny1, zf + 0.16), uv);
          box(dx - 0.85, dx + 0.85, ny1, ny1 + 0.05, zf + 0.1, zf + 0.2, FRAME);
        }
        if (LANTERN.has(use)) {
          const uv = lanternTex(ctx, A, use === 'yakitori' ? 'やきとり' : '酒');
          for (const lx of [u0 + 0.75, u1 - 0.75]) {
            const y0 = gy1 - 0.95, y1 = gy1 - 0.3, z0 = zf + 0.2, z1 = zf + 0.62, x0 = lx - 0.21, x1 = lx + 0.21;
            sign.quad(W(x0, y0, z1), W(x1, y0, z1), W(x1, y1, z1), W(x0, y1, z1), uv);
            sign.quad(W(x1, y0, z0), W(x0, y0, z0), W(x0, y1, z0), W(x1, y1, z0), uv);
            sign.quad(W(x0, y0, z0), W(x0, y0, z1), W(x0, y1, z1), W(x0, y1, z0), uv);
            sign.quad(W(x1, y0, z1), W(x1, y0, z0), W(x1, y1, z0), W(x1, y1, z1), uv);
          }
        }
      }
    }
    // ---- sign stack (袖看板) on mixed-use buildings: a panel per upper floor, out from the right-hand corner
    if ((b.kind === 'zakkyo' || (b.kind === 'shop' && b.floors >= 3)) && b.floors >= 3 && b.shop && r() < 0.8) {
      const x = hw - 0.7, n = Math.min(b.floors - 1, 6), inv = r() < 0.4;
      for (let f = 2; f <= n + 1; f++) {
        const [text, col] = TENANTS[Math.floor(r() * TENANTS.length)], uv = stackPanel(ctx, A, text, col, f, inv);
        const y0 = b.g1 + (f - 2) * b.fh + 0.25, y1 = y0 + Math.min(2.6, b.fh - 0.3), z0 = zf + 0.35, z1 = zf + 1.3;
        sign.quad(W(x + 0.06, y0, z1), W(x + 0.06, y0, z0), W(x + 0.06, y1, z0), W(x + 0.06, y1, z1), uv);   // faces +x
        sign.quad(W(x - 0.06, y0, z0), W(x - 0.06, y0, z1), W(x - 0.06, y1, z1), W(x - 0.06, y1, z0), uv);   // faces −x
        box(x - 0.06, x + 0.06, y1, y1 + 0.06, z0, z1, FRAME);
      }
      box(x - 0.05, x + 0.05, b.g1 + 0.1, b.g1 + n * b.fh + 0.2, zf, zf + 0.35, FRAME);                   // bracket to the wall
    }
    // ---- rooftop billboard: tall buildings round the station and along the arterials
    const dSt = Math.hypot(b.x - STATION[0], b.z - STATION[1]);
    if (b.roof === 'flat' && b.h > 16 && b.w > 9 && (dSt < 420 || mix === 'downtown') && r() < 0.3) {
      const ad = ADS[Math.floor(r() * ADS.length)], uv = billboard(ctx, A, ad), bw = Math.min(b.w - 2, 11), bh = bw / 2.9;
      const y0 = b.h + 1.6, y1 = y0 + bh, z = zf - 1.2;
      sign.quad(W(-bw / 2, y0, z), W(bw / 2, y0, z), W(bw / 2, y1, z), W(-bw / 2, y1, z), uv);
      sign.quad(W(bw / 2, y0, z - 0.2), W(-bw / 2, y0, z - 0.2), W(-bw / 2, y1, z - 0.2), W(bw / 2, y1, z - 0.2), white, FRAME);
      for (const lx of [-bw * 0.35, bw * 0.35]) box(lx - 0.12, lx + 0.12, b.h, y0 + 0.2, z - 0.35, z - 0.15, FRAME);
      box(-bw / 2, bw / 2, y0 - 0.2, y0, z - 0.4, z + 0.05, FRAME);
    } else if (b.h > 40 && r() < 0.6) {
      // a crown sign on the high-rises
      const [text, col] = CROWNS[Math.floor(r() * CROWNS.length)], uv = crownSign(ctx, A, text, col), cw = Math.min(b.w * 0.8, 22), ch = cw * 96 / 512;
      const y1 = b.h - 0.8, y0 = y1 - ch;
      sign.quad(W(-cw / 2, y0, zf + 0.08), W(cw / 2, y0, zf + 0.08), W(cw / 2, y1, zf + 0.08), W(-cw / 2, y1, zf + 0.08), uv);
    }
  }
  const g = new THREE.Group(); g.name = 'shopfronts';
  const a = sign.mesh(kit.sign), b2 = inter.mesh(kit.interior);
  if (a) { a.castShadow = true; a.receiveShadow = true; g.add(a); }
  if (b2) { ctx.noOutline(b2); g.add(b2); }
  return g.children.length ? g : null;
}
