// Number plates (ナンバープレート): an atlas of 128 plates drawn once on a canvas — private white plates with green
// characters, kei yellow, commercial green (taxis, buses, trucks) and kei commercial black — each with its region and
// class number over a hiragana and the serial (「12-34」, or 「・・12」 for short numbers), 330 × 165 mm.
import * as THREE from 'three';
import { FONTS } from '../../core/textures.js';

export const COLS = 8, ROWS = 16, TW = 128, TH = 64;
/** Tile ranges by kind: whole atlas rows, so a kind's mipmaps only bleed into its own kind. */
export const KINDS = { white: [0, 64], kei: [64, 96], green: [96, 120], keiBiz: [120, 128] };
const STYLE = { white: ['#f3f3ec', '#1c6b3f'], kei: ['#f2cf36', '#1d1d20'], green: ['#1f6d40', '#f4f4ee'], keiBiz: ['#1d1d20', '#f2cf36'] };
const KANA = { white: 'さすせそたちつてとなにぬねのはひふほまみむめもやゆよらりるろ', kei: 'さすせそたちつてとなにぬねのはひふほまみむめもやゆよらりるろ', green: 'あいうえかきくけこを', keiBiz: 'あいうえかきくけこを' };
const CLASS = { white: ['300', '330', '301', '331', '500', '530', '501', '502'], kei: ['580', '581', '583', '585', '480'], green: ['500', '501', '400', '100', '200', '230'], keiBiz: ['480', '483', '40'] };
const REGION = [['花渡', 70], ['桜川', 15], ['丘野', 8], ['港北', 7]];

/** A random plate tile of a kind. */
export function plateTile(kind, rng) { const [a, b] = KINDS[kind] || KINDS.white; return a + Math.floor(rng() * (b - a)); }

/** The atlas texture (browser only). */
export function plateAtlas() {
  const c = document.createElement('canvas'); c.width = COLS * TW; c.height = ROWS * TH;
  const g = c.getContext('2d');
  let seed = 0x51a7e;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (list) => { let tot = 0; for (const [, w] of list) tot += w; let x = rnd() * tot; for (const [v, w] of list) { x -= w; if (x <= 0) return v; } return list[0][0]; };
  for (const [kind, [a, b]] of Object.entries(KINDS)) {
    const [bg, fg] = STYLE[kind];
    for (let t = a; t < b; t++) {
      const x0 = (t % COLS) * TW, y0 = Math.floor(t / COLS) * TH;
      g.save(); g.translate(x0, y0);
      g.fillStyle = bg; g.fillRect(0, 0, TW, TH);
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2; g.strokeRect(1.5, 1.5, TW - 3, TH - 3);           // the pressed rim
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (const bx of [28, 100]) { g.beginPath(); g.arc(bx, 9, 2.4, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = fg; g.textBaseline = 'middle';
      // region and class number
      const region = pick(REGION), cls = CLASS[kind][Math.floor(rnd() * CLASS[kind].length)];
      g.font = `700 15px ${FONTS.sans}`; g.textAlign = 'center';
      g.fillText(`${region} ${cls}`, TW / 2, 17);
      // the hiragana and the serial
      const kana = KANA[kind][Math.floor(rnd() * KANA[kind].length)];
      g.font = `700 15px ${FONTS.sans}`; g.textAlign = 'center'; g.fillText(kana, 15, 45);
      const n = rnd() < 0.8 ? 1000 + Math.floor(rnd() * 9000) : 1 + Math.floor(rnd() * 999);
      const serial = n >= 1000 ? `${String(n).slice(0, 2)}-${String(n).slice(2)}` : '・'.repeat(4 - String(n).length) + n;
      g.font = `700 36px ${FONTS.sans}`;
      g.save(); g.translate(74, 45); g.scale(0.74, 1); g.fillText(serial, 0, 1); g.restore();
      g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

/** The plates' material: toon-lit, each instance showing its own tile (instanced attribute plateTile). */
export function plateMaterial(ctx, map) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, map, gradientMap: ctx.mat.gradientMap });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float plateTile;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((mod(plateTile, ${COLS}.0) + uv.x) / ${COLS}.0, 1.0 - (floor(plateTile / ${COLS}.0) + 1.0 - uv.y) / ${ROWS}.0);`);
  };
  m.customProgramCacheKey = () => 'vehicle-plates';
  return m;
}
