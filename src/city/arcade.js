// 花渡銀座 — the arcade (アーケード商店街) over the shopping street east of the station (plan: U.arcades): steel posts
// along both kerbs, arched ribs every 6 m carrying a translucent vault, a ridge light line, spring banners hanging from
// every other rib, and a gate with the street's name at each end. Built once; the shops underneath come from
// shopfronts.js (every building fronting the arcade keeps a shop).
import * as THREE from 'three';
import { groundAt } from '../plan/ground.js';
import { MB, rgb } from './mb.js';

const STEEL = rgb('#8f989f'), STEEL_D = rgb('#6f777e'), VAULT = rgb('#e8eef0'), VAULT_U = rgb('#d6e2e8'), LAMP = rgb('#fff6dc');

function gateSign(ctx, A, name, kana) {
  const f = ctx.tex.FONTS;
  return A.cell('arcade-gate|' + name, 512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#c2436e'); gr.addColorStop(1, '#8e2f52');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f6d9a8'; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#fff7ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, name, w / 2, 56, w - 90, 64, f.brush, 400);
    g.fillStyle = '#f6d9a8'; ctx.tex.fitText(g, 'HANAWATARI GINZA  ·  ' + kana, w / 2, 104, w - 80, 16, f.en, 700);
    g.fillStyle = '#f7c6d5'; for (const x of [34, w - 34]) for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 9, 64 + Math.sin(a) * 9, 6, 9, a + Math.PI / 2, 0, 7); g.fill(); }
  });
}
function banner(ctx, A, k) {
  const f = ctx.tex.FONTS;
  return A.cell('arcade-banner|' + k, 64, 192, (g, w, h) => {
    g.fillStyle = k % 2 ? '#f7c6d5' : '#fbe9ef'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c2436e'; g.fillRect(0, 0, w, 14);
    g.fillStyle = '#c2436e'; g.font = `400 34px ${f.brush}`; g.textAlign = 'center'; g.textBaseline = 'top';
    let y = 22; for (const ch of 'さくらまつり') { g.fillText(ch, w / 2, y); y += 28; }
  });
}

export function buildArcades(ctx, kit, arcades) {
  const mb = new MB(), vb = new MB(), sb = { P: [], N: [], U: [], C: [], I: [] }, phys = ctx.physics, A = kit.A;
  const board = (a, b, c, d, uv) => {   // textured quad
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0]; const l = Math.hypot(nx, ny, nz) || 1;
    const k = sb.P.length / 3, U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    [a, b, c, d].forEach((p, i) => { sb.P.push(...p); sb.N.push(nx / l, ny / l, nz / l); sb.U.push(...U[i]); sb.C.push(1, 1, 1); });
    sb.I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  for (const Ar of arcades) {
    const z = Ar.z, half = Ar.w / 2 + 0.9, post = Ar.w / 2 + 0.15, spring = 6.4, crown = 8.2, x0 = Ar.x0, x1 = Ar.x1;
    const n = Math.max(2, Math.round((x1 - x0) / 6)), dx = (x1 - x0) / n;
    const arcY = (t) => spring + (crown - spring) * Math.sin(t * Math.PI);                          // t 0..1 across
    const K = 10;                                                                                    // vault segments across
    for (let i = 0; i <= n; i++) {
      const x = x0 + dx * i, gy = groundAt(x, z);
      // posts at both kerbs and the rib over the street
      for (const sg of [-1, 1]) { const pz = z + sg * post; mb.box(x - 0.12, x + 0.12, gy, gy + spring, pz - 0.12, pz + 0.12, STEEL, 'NSEW'); phys.addCylinder(x, pz, 0.15, gy - 1, gy + spring); }
      // the rib: a steel arch just under the vault, following it (both faces + underside)
      for (let k = 0; k < K; k++) {
        const t0 = k / K, t1 = (k + 1) / K, za = z - half + 2 * half * t0, zb = z - half + 2 * half * t1, ya = gy + arcY(t0) - 0.05, yb = gy + arcY(t1) - 0.05;
        for (const sx of [-0.08, 0.08]) { const q = [[x + sx, ya - 0.22, za], [x + sx, yb - 0.22, zb], [x + sx, yb, zb], [x + sx, ya, za]]; if (sx > 0) mb.quad(q[1], q[0], q[3], q[2], STEEL_D); else mb.quad(q[0], q[1], q[2], q[3], STEEL_D); }
        mb.quad([x - 0.08, ya - 0.22, za], [x + 0.08, ya - 0.22, za], [x + 0.08, yb - 0.22, zb], [x - 0.08, yb - 0.22, zb], STEEL_D);
      }
      if (i < n && i % 2 === 1) {                                                                    // spring banners
        const uv = banner(ctx, A, i);
        for (const sg of [-1, 1]) { const bz = z + sg * (Ar.w / 2 - 0.6), by1 = gy + spring - 0.3, by0 = by1 - 1.9; board([x - 0.02, by0, bz - 0.35], [x - 0.02, by0, bz + 0.35], [x - 0.02, by1, bz + 0.35], [x - 0.02, by1, bz - 0.35], uv); board([x + 0.02, by0, bz + 0.35], [x + 0.02, by0, bz - 0.35], [x + 0.02, by1, bz - 0.35], [x + 0.02, by1, bz + 0.35], uv); }
      }
    }
    // the vault: panels between ribs (both faces: light from below, weathered from above), ridge lamps
    for (let i = 0; i < n; i++) {
      const xa = x0 + dx * i, xb = xa + dx, ga = groundAt(xa, z), gb = groundAt(xb, z);
      for (let k = 0; k < K; k++) {
        const t0 = k / K, t1 = (k + 1) / K, za = z - half + 2 * half * t0, zb = z - half + 2 * half * t1;
        const a = [xa, ga + arcY(t0), za], b = [xb, gb + arcY(t0), za], c = [xb, gb + arcY(t1), zb], d = [xa, ga + arcY(t1), zb];
        mb.quad(a, b, c, d, VAULT); vb.quad(d, c, b, a, VAULT_U);
      }
      mb.box(xa + dx / 2 - 0.25, xa + dx / 2 + 0.25, ga + crown - 0.35, ga + crown - 0.2, z - 0.25, z + 0.25, LAMP, 'NSEWB');
      for (const sg of [-1, 1]) { const pz = z + sg * post; mb.box(xa, xb, ga + spring - 0.25, ga + spring, pz - 0.1, pz + 0.1, STEEL, 'NSEWTB'); }   // eaves beam
    }
    // gates at both ends: portal frame and the name board on both faces
    for (const [x, out] of [[x0, -1], [x1, 1]]) {
      const gy = groundAt(x, z), top = crown + 1.8, bw = Ar.w + 2.2, uv = gateSign(ctx, A, Ar.name, Ar.kana || '');
      for (const sg of [-1, 1]) { const pz = z + sg * (half + 0.3); mb.box(x - 0.3, x + 0.3, gy, gy + top, pz - 0.3, pz + 0.3, rgb('#8e2f52'), 'NSEWT'); phys.addBox(x, pz, 0.6, 0.6, 0, gy - 1, gy + top); }
      mb.box(x - 0.25, x + 0.25, gy + crown - 0.2, gy + top, z - half - 0.6, z + half + 0.6, rgb('#8e2f52'), 'NSEWTB');
      const bh = bw * 128 / 512, by0 = gy + crown + 0.05;
      // a board facing (fx, 0) reads left→right along (0, −fx)... i.e. its right-hand end is at z − fx·bw/2
      for (const f of [out, -out]) { const px = x + f * 0.27, zl = z + f * bw / 2, zr = z - f * bw / 2; board([px, by0, zl], [px, by0, zr], [px, by0 + bh, zr], [px, by0 + bh, zl], uv); }
    }
  }
  const g = new THREE.Group(); g.name = 'arcades';
  const m = mb.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.04, name: 'arcade' })); if (m) g.add(m);
  // the vault seen from below: translucent polycarbonate, lit by the sky
  const v = vb.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02, emissive: '#b9c9d0', emissiveIntensity: 0.55, name: 'arcade-vault' }), { shadow: false }); if (v) g.add(v);
  if (sb.I.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(sb.P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(sb.N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(sb.U, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(sb.C, 3)); geo.setIndex(sb.I); geo.computeBoundingSphere();
    g.add(new THREE.Mesh(geo, kit.sign));
  }
  return g;
}
