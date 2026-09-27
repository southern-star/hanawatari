// 街頭ビジョン — the big screen on the station building over the east square: six spots (the cherry festival, beer,
// the day's weather, a phone plan, 汐見線, the local FM) take turns every few seconds, and a news ticker runs along
// its foot. All drawn once into two canvas textures; update(t) only moves texture offsets.
import * as THREE from 'three';
import { MB, rgb } from './mb.js';

const FW = 512, FH = 288, GAP = 52;                                   // frame size in the sheet; rows 340 px apart

function drawFrames(ctx, g) {
  const f = ctx.tex.FONTS, T = (text, x, y, maxW, size, font, weight, color, align = 'center') => { g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; ctx.tex.fitText(g, text, x, y, maxW, size, font, weight); };
  const petals = (n, col, seed) => { g.fillStyle = col; for (let k = 0; k < n; k++) { const a = Math.sin(seed + k * 12.9898) * 43758.5, x = (a - Math.floor(a)) * FW, b = Math.sin(seed + k * 78.233) * 43758.5, y = (b - Math.floor(b)) * FH; g.beginPath(); g.ellipse(x, y, 7, 4, k, 0, 7); g.fill(); } };
  const frames = [
    () => {                                                            // さくらまつり
      const gr = g.createLinearGradient(0, 0, 0, FH); gr.addColorStop(0, '#ffe3ec'); gr.addColorStop(1, '#f7b6ca'); g.fillStyle = gr; g.fillRect(0, 0, FW, FH);
      petals(40, 'rgba(255,255,255,0.85)', 1.3); petals(24, 'rgba(226,110,150,0.7)', 7.1);
      T('はなわたり', FW / 2, 70, 360, 40, f.round, 900, '#c2436e'); T('さくらまつり', FW / 2, 132, 440, 72, f.round, 900, '#c2436e');
      T('4/5 SAT – 4/13 SUN', FW / 2, 200, 400, 30, f.en, 900, '#7a2d4a'); T('花渡銀座・西口広場・鈴音川堤', FW / 2, 244, 440, 24, f.sans, 700, '#7a2d4a');
    },
    () => {                                                            // 花渡ビール
      g.fillStyle = '#8f231d'; g.fillRect(0, 0, FW, FH); g.fillStyle = '#b8322a'; g.beginPath(); g.arc(FW * 0.78, FH * 0.5, 170, 0, 7); g.fill();
      g.fillStyle = '#f2c230'; g.fillRect(360, 90, 90, 150); g.fillStyle = '#fff6e8'; g.fillRect(352, 70, 106, 30); g.beginPath(); g.arc(372, 72, 16, 0, 7); g.arc(404, 66, 20, 0, 7); g.arc(438, 72, 16, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(372, 110, 10, 110);
      T('花渡ビール', 180, 110, 320, 64, f.brush, 400, '#fff6e8'); T('春の限定 はなわたりラガー', 180, 186, 320, 26, f.sans, 900, '#f2c230');
      T('お酒は二十歳になってから', 180, 250, 300, 16, f.sans, 700, '#f6d9c2');
    },
    () => {                                                            // today's weather
      const gr = g.createLinearGradient(0, 0, 0, FH); gr.addColorStop(0, '#5fb3e8'); gr.addColorStop(1, '#bfe4f7'); g.fillStyle = gr; g.fillRect(0, 0, FW, FH);
      g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(118, 140, 56, 0, 7); g.fill(); g.strokeStyle = '#ffd43b'; g.lineWidth = 8;
      for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; g.beginPath(); g.moveTo(118 + Math.cos(a) * 70, 140 + Math.sin(a) * 70); g.lineTo(118 + Math.cos(a) * 92, 140 + Math.sin(a) * 92); g.stroke(); }
      T('きょうの花渡', 350, 56, 300, 30, f.round, 900, '#ffffff'); T('晴れ', 350, 118, 300, 60, f.round, 900, '#ffffff');
      T('18℃ / 9℃', 350, 182, 300, 40, f.en, 900, '#ffffff'); T('降水確率 10%  ·  花粉 少なめ', 350, 240, 300, 22, f.sans, 700, '#1f3a68');
    },
    () => {                                                            // はなモバイル
      g.fillStyle = '#fff4f8'; g.fillRect(0, 0, FW, FH); g.fillStyle = '#ef9fbe'; g.fillRect(0, FH - 40, FW, 40);
      g.fillStyle = '#2d2b33'; g.beginPath(); g.roundRect(360, 40, 110, 200, 16); g.fill(); g.fillStyle = '#ffd9e6'; g.fillRect(370, 56, 90, 164);
      g.fillStyle = '#ef9fbe'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; g.beginPath(); g.ellipse(415 + Math.cos(a) * 18, 130 + Math.sin(a) * 18, 12, 18, a + Math.PI / 2, 0, 7); g.fill(); }
      T('はなモバイル', 180, 86, 320, 46, f.round, 900, '#d9718f'); T('新生活 学割スタート', 180, 150, 320, 34, f.sans, 900, '#2d2b33');
      T('月額 ¥990〜', 180, 204, 300, 30, f.en, 900, '#d9718f'); T('HANA MOBILE', FW / 2, FH - 20, 300, 20, f.en, 900, '#ffffff');
    },
    () => {                                                            // 汐見線で海へ。
      g.fillStyle = '#9fd8ef'; g.fillRect(0, 0, FW, FH * 0.55); g.fillStyle = '#2e8fc7'; g.fillRect(0, FH * 0.55, FW, FH * 0.45);
      g.fillStyle = '#ffffff'; for (let k = 0; k < 6; k++) g.fillRect(40 + k * 80, FH * 0.62 + (k % 2) * 16, 40, 3);
      g.fillStyle = '#f7f6f2'; g.beginPath(); g.roundRect(60, FH * 0.36, 380, 60, 18); g.fill(); g.fillStyle = '#1c7ed6'; g.fillRect(60, FH * 0.36 + 42, 380, 8);
      g.fillStyle = '#3a4655'; for (let k = 0; k < 6; k++) g.fillRect(96 + k * 56, FH * 0.36 + 12, 36, 20);
      T('汐見線で海へ。', FW / 2, 50, 440, 50, f.round, 900, '#1f3a68'); T('花渡 → 汐見  9分', FW / 2, 238, 400, 34, f.sans, 900, '#ffffff');
    },
    () => {                                                            // FM HANAWATARI
      g.fillStyle = '#3a3346'; g.fillRect(0, 0, FW, FH); g.strokeStyle = '#ef9fbe'; g.lineWidth = 5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(FW / 2, FH + 40, 90 + k * 60, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      T('FM HANAWATARI', FW / 2, 92, 440, 52, f.en, 900, '#ffffff'); T('79.6', FW / 2, 158, 300, 58, f.en, 900, '#ef9fbe'); T('まいにち、花いろ。', FW / 2, 222, 400, 30, f.round, 900, '#ffffff');
    },
  ];
  frames.forEach((fn, i) => { const c = i % 2, r = Math.floor(i / 2); g.save(); g.translate(c * FW, r * (FH + GAP)); g.beginPath(); g.rect(0, 0, FW, FH); g.clip(); fn(); g.restore(); });
  return frames.length;
}

/** The screen on a wall facing +x at x, spanning z0..z1 (16:9), bottom at y0. Returns { group, update(t) }. */
export function buildVision(ctx, { x, z0, z1, y0 }) {
  const w = z1 - z0, h = w * 9 / 16, y1 = y0 + h;
  const sheet = ctx.tex.draw(1024, 1024, (g) => { g.fillStyle = '#000000'; g.fillRect(0, 0, 1024, 1024); drawFrames(ctx, g); }, { key: 'hanawatari-vision' });
  sheet.repeat.set(0.5, FH / 1024);
  const n = 6;
  const ticker = ctx.tex.draw(2048, 64, (g) => {
    g.fillStyle = '#16213e'; g.fillRect(0, 0, 2048, 64); g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `700 34px ${ctx.tex.FONTS.sans}`;
    g.fillText('◆ はなわたり さくらまつり 4/5〜4/13  ◆ 東和本線・汐見線は平常どおり運転しています  ◆ きょうの花渡 晴れ 最高18℃  ◆ 花渡銀座 春の大売り出し  ◆ 西口 ストリートピアノ 設置中', 12, 34);
  }, { key: 'hanawatari-ticker' });
  ticker.wrapS = THREE.RepeatWrapping; ticker.repeat.set(0.62, 1);
  const quad = (tex, ya, yb) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([x, ya, z1, x, ya, z0, x, yb, z0, x, yb, z1], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, ctx.mat.emissive('#ffffff', 1.0, { map: tex })); ctx.noOutline(m); return m;
  };
  const group = new THREE.Group(); group.name = 'vision';
  group.add(quad(sheet, y0, y1), quad(ticker, y0 - 0.95, y0 - 0.12));
  const mb = new MB(), BEZ = rgb('#1e1f24');                          // the housing round screen + ticker
  mb.box(x - 0.45, x - 0.02, y0 - 1.2, y1 + 0.3, z0 - 0.3, z1 + 0.3, BEZ, 'NSEWTB');
  mb.box(x - 0.03, x + 0.02, y0 - 0.12, y0, z0, z1, BEZ, 'EWTB');
  const m = mb.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.02, name: 'vision' })); if (m) group.add(m);
  let shown = -1;
  const update = (t) => {
    const k = Math.floor(t / 6) % n;
    if (k !== shown) { shown = k; sheet.offset.set((k % 2) * 0.5, 1 - (Math.floor(k / 2) * (FH + GAP) + FH) / 1024); }
    ticker.offset.x = (t * 0.035) % 1;
  };
  update(0);
  return { group, update };
}
