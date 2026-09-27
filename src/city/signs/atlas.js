// Sign atlas (4096×2048) + interior atlas (2048×1024) for 花渡市's street-level detail (the sign designs come from the
// 桜川市 project). Cells are drawn on demand (cached by key) with the project's Google fonts; UV rects are returned as
// [u0, v0, u1, v1] (v up, three.js flipY convention). A 2×2 px white texel serves untextured faces.
import * as THREE from 'three';

const PAD = 3;

export function createAtlas(ctx, { W = 4096, H = 2048, key = 'city-signs' } = {}) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 8, 8); // white texel at the corner
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  // shelf allocator per cell-height class
  const shelves = new Map(); let yTop = 12;
  const cache = new Map();
  function alloc(w, h) {
    let s = shelves.get(h);
    if (!s || s.x + w + PAD * 2 > W) {
      if (yTop + h + PAD * 2 > H) return null;
      s = { y: yTop, x: 12 }; shelves.set(h, s); yTop += h + PAD * 2;
    }
    const x = s.x + PAD, y = s.y + PAD; s.x += w + PAD * 2;
    return [x, y, w, h];
  }
  const uv = ([x, y, w, h]) => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];
  const white = [2 / W, 1 - 6 / H, 6 / W, 1 - 2 / H];
  /** Draw a cell once: fn(g, x, y, w, h). Returns uv rect. */
  function cell(k, w, h, fn) {
    if (cache.has(k)) return cache.get(k);
    const r = alloc(w, h);
    if (!r) { cache.set(k, white); return white; }
    g.save(); g.beginPath(); g.rect(r[0], r[1], r[2], r[3]); g.clip(); g.translate(r[0], r[1]);
    try { fn(g, r[2], r[3]); } catch (e) { console.warn('[signs atlas]', k, e); }
    g.restore();
    const u = uv(r); cache.set(k, u); api.dirty = true; return u;
  }
  const api = { canvas: c, g, tex, cell, white, W, H, dirty: true, get used() { return yTop / H; } };
  return api;
}

// ------------------------------------------------------------------ sign designs
const F = (ctx) => ctx.tex.FONTS;
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(ctx, g, text, x, y, maxW, size, font, weight, color, o = {}) {
  g.fillStyle = color; g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
  return ctx.tex.fitText(g, text, x, y, maxW, size, font, weight, o.stroke ? { stroke: o.stroke, strokeStyle: o.strokeStyle } : {});
}

/** Horizontal fascia sign (384×64 → ~6:1). */
export function fasciaSign(ctx, A, name, sub, style) {
  const f = F(ctx);
  return A.cell('fascia|' + name + '|' + style, 384, 64, (g, w, h) => {
    const S = {
      konbiniA: () => { g.fillStyle = '#f6f3ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#2c9a91'; g.fillRect(0, h - 14, w, 7); g.fillStyle = '#f3c14b'; g.fillRect(0, h - 7, w, 7); g.fillStyle = '#f3c14b'; g.beginPath(); g.arc(34, 25, 15, 0, 7); g.fill(); g.strokeStyle = '#e9a23b'; g.lineWidth = 3; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(34 + Math.cos(a) * 18, 25 + Math.sin(a) * 18); g.lineTo(34 + Math.cos(a) * 23, 25 + Math.sin(a) * 23); g.stroke(); } fit(ctx, g, name, w / 2 + 26, 25, w - 110, 30, f.round, 900, '#227c75'); },
      konbiniB: () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f8f5b'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillStyle = '#5ab56a'; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.ellipse(34 + Math.cos(a) * 8, 32 + Math.sin(a) * 8, 8, 8, 0, 0, 7); g.fill(); } fit(ctx, g, name, w / 2 + 24, 32, w - 110, 30, f.sans, 900, '#2f7a48'); },
      konbiniC: () => { g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#e36b3d'; g.fillRect(0, h - 16, w * 0.6, 16); g.fillStyle = '#e9a23b'; g.fillRect(w * 0.6, h - 16, w * 0.4, 16); fit(ctx, g, name, w / 2, 24, w - 40, 32, f.sans, 900, '#d9463b'); },
      wood: () => { g.fillStyle = '#6a4a36'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(40,24,16,0.35)'; g.lineWidth = 1; for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(0, 4 + k * 7); g.bezierCurveTo(w * 0.3, k * 7, w * 0.6, 8 + k * 7, w, 4 + k * 7); g.stroke(); } fit(ctx, g, name, w / 2, sub ? 25 : 33, w - 40, 30, f.serif, 700, '#f4e6c8'); if (sub) fit(ctx, g, sub, w / 2, 50, w - 80, 13, f.en, 500, '#e6d2ae'); },
      pinkChain: () => { g.fillStyle = '#ef9fbe'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; g.beginPath(); g.ellipse(32 + Math.cos(a) * 9, 32 + Math.sin(a) * 9, 6, 9, a + Math.PI / 2, 0, 7); g.fill(); } fit(ctx, g, name, w / 2 + 22, sub ? 26 : 33, w - 100, 30, f.round, 900, '#ffffff'); if (sub) fit(ctx, g, sub, w / 2 + 22, 50, w - 110, 12, f.en, 700, '#fff3f7'); },
      dark: () => { g.fillStyle = '#3a3346'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c9a86a'; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10); fit(ctx, g, name, w / 2, sub ? 26 : 33, w - 50, 30, f.serif, 700, '#f1e3c2'); if (sub) fit(ctx, g, sub, w / 2, 50, w - 90, 12, f.en, 500, '#c9a86a'); },
      cream: () => { g.fillStyle = '#f4ecdc'; g.fillRect(0, 0, w, h); g.fillStyle = '#b48a62'; g.fillRect(0, h - 6, w, 6); fit(ctx, g, name, w / 2, sub ? 25 : 31, w - 40, 30, f.round, 700, '#6a4a36'); if (sub) fit(ctx, g, sub, w / 2, 49, w - 80, 13, f.en, 500, '#9a7a5a'); },
      navy: () => { g.fillStyle = '#1f3a68'; g.fillRect(0, 0, w, h); g.fillStyle = '#e6c24a'; g.fillRect(0, h - 5, w, 5); fit(ctx, g, name, w / 2, sub ? 25 : 31, w - 40, 30, f.sans, 900, '#ffffff'); if (sub) fit(ctx, g, sub, w / 2, 49, w - 70, 12, f.en, 700, '#cfdcef'); },
      redLantern: () => { g.fillStyle = '#b8322a'; g.fillRect(0, 0, w, h); g.fillStyle = '#8f231d'; g.fillRect(0, h - 8, w, 8); fit(ctx, g, name, w / 2, 30, w - 40, 36, f.brush, 400, '#fff6e8'); },
      indigo: () => { g.fillStyle = '#2d3e66'; g.fillRect(0, 0, w, h); fit(ctx, g, name, w / 2, sub ? 26 : 32, w - 40, 34, f.brush, 400, '#f7f3ea'); if (sub) fit(ctx, g, sub, w / 2, 52, w - 80, 12, f.sans, 700, '#e6c24a'); },
      yellowRed: () => { g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#d9463b'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); fit(ctx, g, name, w / 2, 32, w - 30, 36, f.sans, 900, '#c0392b'); },
      white: () => { g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f64b5'; g.fillRect(0, 0, 10, h); fit(ctx, g, name, w / 2 + 5, sub ? 25 : 32, w - 50, 30, f.sans, 700, '#1f3a68'); if (sub) fit(ctx, g, sub, w / 2 + 5, 50, w - 80, 12, f.sans, 500, '#556'); },
      pop: () => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#e8457d'); gr.addColorStop(1, '#f5a623'); g.fillStyle = gr; g.fillRect(0, 0, w, h); fit(ctx, g, name, w / 2, sub ? 26 : 32, w - 30, 32, f.round, 900, '#ffffff', { stroke: 5, strokeStyle: '#8a1f4a' }); if (sub) fit(ctx, g, sub, w / 2, 52, w - 80, 12, f.en, 900, '#fff6c0'); },
      popBlue: () => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2f64b5'); gr.addColorStop(1, '#3fc1d9'); g.fillStyle = gr; g.fillRect(0, 0, w, h); fit(ctx, g, name, w / 2, sub ? 26 : 32, w - 30, 32, f.round, 900, '#ffffff', { stroke: 4, strokeStyle: '#1c3a70' }); if (sub) fit(ctx, g, sub, w / 2, 52, w - 80, 12, f.en, 900, '#e6f6ff'); },
      purple: () => { g.fillStyle = '#5b3a7a'; g.fillRect(0, 0, w, h); fit(ctx, g, name, w / 2, 32, w - 40, 32, f.hand, 400, '#f7d8ef'); },
      yellowBlue: () => { g.fillStyle = '#f5d33a'; g.fillRect(0, 0, w, h); fit(ctx, g, name, w / 2, sub ? 26 : 32, w - 30, 32, f.sans, 900, '#1f4fa0'); if (sub) fit(ctx, g, sub, w / 2, 51, w - 80, 12, f.en, 900, '#1f4fa0'); },
      green: () => { g.fillStyle = '#3f8f5b'; g.fillRect(0, 0, w, h); fit(ctx, g, name, w / 2, sub ? 26 : 32, w - 40, 30, f.sans, 900, '#ffffff'); if (sub) fit(ctx, g, sub, w / 2, 51, w - 80, 12, f.en, 700, '#e8f4e6'); },
      orange: () => { g.fillStyle = '#e9853b'; g.fillRect(0, 0, w, h); fit(ctx, g, name, w / 2, 32, w - 30, 34, f.sans, 900, '#ffffff'); },
      lobby: () => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d8dadc'); gr.addColorStop(1, '#b9bcc0'); g.fillStyle = gr; g.fillRect(0, 0, w, h); fit(ctx, g, sub || name, w / 2, 26, w - 40, 22, f.en, 700, '#3a3a44'); fit(ctx, g, name, w / 2, 50, w - 80, 14, f.sans, 700, '#55555f'); },
      plate: () => { g.fillStyle = '#4b4650'; g.fillRect(0, 0, w, h); fit(ctx, g, name, w / 2, 26, w - 40, 26, f.serif, 700, '#e8d9b0'); if (sub) fit(ctx, g, sub, w / 2, 50, w - 80, 12, f.en, 500, '#c8b890'); },
    };
    (S[style] || S.white)();
  });
}

/** Vertical tenant panel for a sign stack (袖看板): floor label + vertical text. */
export function stackPanel(ctx, A, text, color, floor, inverted) {
  const f = F(ctx);
  return A.cell('stack|' + text + '|' + color + '|' + floor + '|' + (inverted ? 1 : 0), 64, 176, (g, w, h) => {
    g.fillStyle = inverted ? color : '#f7f6f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = inverted ? 'rgba(255,255,255,0.9)' : color; g.fillRect(0, 0, w, 26);
    g.fillStyle = inverted ? color : '#ffffff'; g.font = `900 17px ${f.en}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(floor + 'F', w / 2, 14);
    g.fillStyle = inverted ? '#ffffff' : color;
    const chars = [...text]; const avail = h - 36; const size = Math.min(44, avail / Math.max(1, chars.length) * 0.95, w * 0.78);
    g.font = `900 ${size}px ${f.sans}`; g.textBaseline = 'top';
    const total = chars.length * size * 1.02; let y = 30 + (avail - total) / 2;
    for (const ch of chars) { if (/[A-Z]/.test(ch) && chars.length > 3) { g.save(); g.translate(w / 2, y + size / 2); g.rotate(Math.PI / 2); g.textBaseline = 'middle'; g.fillText(ch, 0, 0); g.restore(); } else g.fillText(ch, w / 2, y); y += size * 1.02; }
  });
}
/** Window lettering (cut vinyl on glass): transparent cell with coloured text + white rim. */
export function lettering(ctx, A, text, color) {
  const f = F(ctx);
  return A.cell('let|' + text + '|' + color, 192, 56, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.lineJoin = 'round';
    fit(ctx, g, text, w / 2, h / 2 + 2, w - 12, 42, f.sans, 900, color, { stroke: 7, strokeStyle: 'rgba(255,255,255,0.95)' });
  });
}
/** Rooftop / wall billboard. */
export function billboard(ctx, A, ad) {
  const f = F(ctx);
  const [head, sub, bg, fg, acc] = ad;
  return A.cell('bb|' + head, 512, 176, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = acc; g.globalAlpha = 0.9; g.beginPath(); g.arc(w * 0.86, h * 0.3, h * 0.55, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = acc; g.fillRect(0, h - 14, w, 14);
    fit(ctx, g, head, w * 0.44, h * 0.42, w * 0.8, 74, f.round, 900, fg, { align: 'center' });
    fit(ctx, g, sub, w * 0.44, h * 0.76, w * 0.78, 28, f.sans, 700, fg, { align: 'center' });
  });
}
export function noren(ctx, A, text, bg) {
  const f = F(ctx);
  return A.cell('noren|' + text + '|' + bg, 160, 112, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg; const n = 3, gap = 5, pw = (w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) g.fillRect(i * (pw + gap), 0, pw, h);
    g.fillStyle = '#1f1a24'; g.fillRect(0, 0, w, 8);
    fit(ctx, g, text, w / 2, h * 0.55, w * 0.9, 50, f.brush, 400, '#f7f3ea');
  });
}
export function lanternTex(ctx, A, text) {
  const f = F(ctx);
  return A.cell('lant|' + text, 96, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#9f241d'); gr.addColorStop(0.5, '#e0463a'); gr.addColorStop(1, '#9f241d');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,16,12,0.5)'; g.lineWidth = 2; for (let y = 10; y < h; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#1f1a24'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#1f1a24'; g.font = `400 ${Math.min(40, (h - 24) / [...text].length)}px ${f.brush}`; g.textAlign = 'center'; g.textBaseline = 'top';
    let y = 14; for (const ch of text) { g.fillText(ch, w * 0.5, y); y += Math.min(40, (h - 24) / [...text].length); }
  });
}
export function menuBoard(ctx, A, lines, seed) {
  const f = F(ctx);
  return A.cell('menu|' + lines.join('/'), 112, 176, (g, w, h) => {
    g.fillStyle = '#6a4a36'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f3a35'; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f2efe6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let y = 26; for (const [i, l] of lines.entries()) { g.fillStyle = i === 0 ? '#f2c9d6' : i % 2 ? '#f2efe6' : '#f5e3a0'; ctx.tex.fitText(g, l, w / 2, y, w - 20, i === 0 ? 20 : 15, f.hand, 400); y += i === 0 ? 30 : 24; }
    g.fillStyle = '#f2b5c8'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(18 + ((seed * 37 + k * 23) % (w - 36)), h - 22 - (k % 2) * 8, 3, 0, 7); g.fill(); }
  });
}
export function awningTex(ctx, A, col) {
  return A.cell('awn|' + col, 128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f5f1e8' : col; g.fillRect(i * w / 8, 0, w / 8 + 1, h - 12); }
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f5f1e8' : col; g.beginPath(); g.arc(i * w / 8 + w / 16, h - 12, w / 16, 0, Math.PI); g.fill(); }
  });
}
/** Glass door / poster stickers etc. */
export function sticker(ctx, A, text, bg, fg) {
  const f = F(ctx);
  return A.cell('stk|' + text + '|' + bg, 128, 48, (g, w, h) => { g.fillStyle = bg; rr(g, 2, 2, w - 4, h - 4, 8); g.fill(); fit(ctx, g, text, w / 2, h / 2 + 1, w - 14, 22, f.sans, 900, fg); });
}
/** AC outdoor unit face (fan grille). */
export function acFace(ctx, A) {
  return A.cell('acface', 96, 72, (g, w, h) => {
    g.fillStyle = '#e4e3dc'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b9b8b1'; g.beginPath(); g.arc(w * 0.38, h / 2, h * 0.38, 0, 7); g.fill();
    g.strokeStyle = '#8d8c86'; g.lineWidth = 2; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(w * 0.38, h / 2, h * (0.08 + k * 0.06), 0, 7); g.stroke(); }
    g.fillStyle = '#cfcec7'; g.fillRect(w * 0.76, 6, w * 0.2, h - 12);
  });
}
/** Helipad marking (H in a circle), transparent background. */
export function helipad(ctx, A) {
  const f = F(ctx);
  return A.cell('heli', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#e8c547'; g.lineWidth = 14; g.beginPath(); g.arc(w / 2, h / 2, w * 0.42, 0, 7); g.stroke();
    g.fillStyle = '#f2f1ec'; g.font = `900 ${w * 0.5}px ${f.en}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, h / 2 + 6);
  });
}

// ------------------------------------------------------------------ painted interiors (2048×1024, 512×256 cells)
export const INTERIOR_KINDS = ['konbini', 'cafe', 'izakaya', 'ramen', 'clothes', 'drug', 'bank', 'lobby', 'restaurant', 'books', 'shop', 'entrance', 'karaoke', 'clinic', 'bakery', 'bar'];
export function createInteriors(ctx) {
  const W = 2048, H = 1024, cw = 512, ch = 256;
  const tex = ctx.tex.draw(W, H, (g) => {
    INTERIOR_KINDS.forEach((k, i) => {
      const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
      g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); g.translate(x, y);
      paintInterior(ctx, g, k, cw, ch, i);
      g.restore();
    });
  }, { key: 'city-interiors' });
  tex.anisotropy = 4;
  const uv = {};
  INTERIOR_KINDS.forEach((k, i) => { const x = (i % 4) * cw, y = Math.floor(i / 4) * ch; uv[k] = [(x + 2) / W, 1 - (y + ch - 2) / H, (x + cw - 2) / W, 1 - (y + 2) / H]; });
  return { tex, uv };
}
function paintInterior(ctx, g, kind, w, h, seed) {
  let s = seed * 7919 + 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const warm = ['izakaya', 'ramen', 'cafe', 'restaurant', 'bar', 'bakery', 'karaoke'].includes(kind);
  const back = warm ? '#e9c79a' : kind === 'lobby' ? '#d9d4ca' : '#eef0ee';
  g.fillStyle = back; g.fillRect(0, 0, w, h);
  // ceiling + lights
  g.fillStyle = warm ? '#caa27a' : '#f7f7f3'; g.fillRect(0, 0, w, 34);
  for (let x = 30; x < w; x += 90) { g.fillStyle = warm ? '#fff1c8' : '#ffffff'; if (warm) { g.beginPath(); g.arc(x, 44, 10, 0, 7); g.fill(); g.fillRect(x - 1, 20, 2, 16); } else g.fillRect(x - 30, 30, 60, 6); }
  // floor
  g.fillStyle = warm ? '#9a6f4e' : '#c9c7c0'; g.fillRect(0, h - 44, w, 44);
  const shelf = (x, sw, rows, cols) => {
    g.fillStyle = '#d9d7d0'; g.fillRect(x, 70, sw, h - 120);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const hue = Math.floor(r() * 360); g.fillStyle = `hsl(${hue},${40 + r() * 35}%,${55 + r() * 20}%)`; g.fillRect(x + 4 + i * (sw - 8) / cols, 76 + j * (h - 128) / rows, (sw - 8) / cols - 2, (h - 128) / rows - 6); }
  };
  const person = (x, col) => { g.fillStyle = '#3a3346'; g.beginPath(); g.arc(x, h - 120, 11, 0, 7); g.fill(); g.fillStyle = col; g.fillRect(x - 13, h - 108, 26, 50); };
  if (kind === 'konbini' || kind === 'drug' || kind === 'books' || kind === 'shop') {
    for (let x = 20; x < w - 60; x += 120) shelf(x, 90, kind === 'books' ? 7 : 5, kind === 'books' ? 12 : 6);
    if (kind === 'konbini') { g.fillStyle = '#2c9a91'; g.fillRect(0, 34, w, 10); }
    if (kind === 'drug') { g.fillStyle = '#f5d33a'; g.fillRect(0, 34, w, 10); }
    person(w * 0.55, '#6a8fb8');
  } else if (kind === 'cafe' || kind === 'restaurant' || kind === 'bakery') {
    g.fillStyle = '#8a6446'; g.fillRect(w * 0.55, h - 110, w * 0.45, 66); // counter
    for (let x = 40; x < w * 0.5; x += 80) { g.fillStyle = '#6a4a36'; g.fillRect(x, h - 86, 50, 8); g.fillRect(x + 22, h - 80, 6, 36); }
    for (let x = 40; x < w; x += 140) { g.fillStyle = '#5a4032'; g.fillRect(x, 60, 3, 30); }
    if (kind === 'bakery') for (let k = 0; k < 14; k++) { g.fillStyle = '#d99a52'; g.beginPath(); g.ellipse(w * 0.6 + (k % 7) * 28, h - 118 - Math.floor(k / 7) * 16, 12, 7, 0, 0, 7); g.fill(); }
    person(w * 0.3, '#e7d7c4'); person(w * 0.75, '#3a3346');
  } else if (kind === 'izakaya' || kind === 'ramen' || kind === 'bar') {
    g.fillStyle = '#6a4a36'; g.fillRect(0, h - 104, w, 26); // counter
    for (let x = 30; x < w; x += 70) { g.fillStyle = '#3a3346'; g.fillRect(x, h - 78, 20, 6); g.fillRect(x + 8, h - 72, 4, 28); }
    for (let x = 20; x < w; x += 46) { g.fillStyle = '#f7f1e2'; g.fillRect(x, 60, 34, 60); g.fillStyle = '#3a3346'; g.fillRect(x + 15, 66, 4, 48); } // menu tags
    if (kind === 'izakaya') for (let x = 60; x < w; x += 150) { g.fillStyle = '#d9463b'; g.beginPath(); g.ellipse(x, 140, 14, 20, 0, 0, 7); g.fill(); }
    if (kind === 'bar') { g.fillStyle = '#3a3346'; g.fillRect(0, 0, w, h - 104); for (let x = 20; x < w; x += 30) { g.fillStyle = `hsl(${(x * 7) % 360},50%,60%)`; g.fillRect(x, 80, 10, 40); } }
    person(w * 0.4, '#f2efe6'); person(w * 0.66, '#35507a');
  } else if (kind === 'clothes') {
    for (let x = 30; x < w; x += 110) { g.fillStyle = '#9aa1a8'; g.fillRect(x, 90, 80, 4); for (let k = 0; k < 6; k++) { g.fillStyle = `hsl(${(x * 3 + k * 50) % 360},35%,${60 + k * 3}%)`; g.fillRect(x + k * 13, 94, 11, 70); } }
    g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(w * 0.85, 110, 12, 0, 7); g.fill(); g.fillStyle = '#d97aa0'; g.fillRect(w * 0.85 - 16, 122, 32, 70);
  } else if (kind === 'bank' || kind === 'clinic') {
    g.fillStyle = kind === 'bank' ? '#2f64b5' : '#8fd1c1'; g.fillRect(0, 34, w, 14);
    g.fillStyle = '#e8e6df'; g.fillRect(40, h - 120, w - 80, 70);
    for (let x = 60; x < w - 60; x += 90) { g.fillStyle = '#c9ccd1'; g.fillRect(x, h - 150, 50, 30); }
    person(w * 0.3, '#3a3346'); person(w * 0.6, '#f2efe6');
  } else if (kind === 'lobby' || kind === 'entrance') {
    g.fillStyle = kind === 'lobby' ? '#cfc8bb' : '#d8d2c6'; g.fillRect(0, 34, w, h - 78);
    g.fillStyle = '#b8b1a4'; for (let x = 0; x < w; x += 64) g.fillRect(x, 34, 2, h - 78);
    if (kind === 'lobby') { g.fillStyle = '#6a4a36'; g.fillRect(w * 0.35, h - 110, w * 0.3, 60); g.fillStyle = '#5f8c5c'; g.beginPath(); g.ellipse(60, h - 110, 26, 40, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(w - 60, h - 110, 26, 40, 0, 0, 7); g.fill(); person(w * 0.5, '#3a3346'); }
    else { for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { g.fillStyle = '#b9bcc0'; g.fillRect(40 + i * 34, 80 + j * 26, 30, 22); } g.fillStyle = '#5f8c5c'; g.beginPath(); g.ellipse(w - 70, h - 100, 24, 36, 0, 0, 7); g.fill(); }
  } else if (kind === 'karaoke') {
    g.fillStyle = '#3a2f55'; g.fillRect(0, 34, w, h - 78);
    for (let x = 30; x < w; x += 60) { g.fillStyle = `hsl(${(x * 5) % 360},70%,65%)`; g.beginPath(); g.arc(x, 90, 6, 0, 7); g.fill(); }
    g.fillStyle = '#e8457d'; g.fillRect(w * 0.3, h - 110, w * 0.4, 60);
  }
  // window glare
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, w, h);
}

/** Crown sign: bold channel letters on a transparent cell (mounted on a tower facade). */
export function crownSign(ctx, A, text, color) {
  const f = ctx.tex.FONTS;
  return A.cell('crown|' + text, 512, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.lineJoin = 'round';
    ctx.tex.fitText(g, text, w / 2, h / 2 + 3, w - 16, 80, /[A-Z]/.test(text) ? f.en : f.sans, 900, { stroke: 6, strokeStyle: 'rgba(58,51,70,0.55)' });
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, w, h * 0.62); g.globalCompositeOperation = 'source-over';
  });
}
