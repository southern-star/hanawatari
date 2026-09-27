// The city plan drawn as an SVG map (string): terrain, districts, the generated streets and buildings, roads, the
// rail network with stations, crossings and landmarks. Used by tools/plan-map.mjs (review images) and by the in-game
// map overlay. Pure JS; no DOM needed.
//   planSVG(plan, crossingList, { view: [x0,z0,x1,z1], scale, urban, bare })
//     view   area in world metres (default: the whole map + 60 m); scale: px per metre
//     urban  generateUrban() result to draw streets / buildings / sites (optional)
//     bare   no title, frame margin or legend panel (for the overlay)
//   returns { svg, W, H, X, Y } — X / Y map world x / z to SVG pixels.
export function planSVG(plan, crossingList, opts = {}) {
  const { MAP, RIVER, VALLEY, CANAL, PLATEAU, LINES, STATIONS, ROADS, DISTRICTS, LANDMARKS, heightAt, riverOffset, CITY } = plan;


  const full = !opts.view;
  const URB = opts.urban ?? null;
  const [vx0, vz0, vx1, vz1] = full ? [MAP.x0 - 60, MAP.z0 - 60, MAP.x1 + 60, MAP.z1 + 60] : opts.view;
  const k = Number(opts.scale || (full ? 0.5 : 1.2));
  const M = opts.bare ? 0 : 24, TITLE = opts.bare ? 0 : 64, PANEL = full && !opts.bare ? 470 : 0;
  const MW = (vx1 - vx0) * k, MH = (vz1 - vz0) * k;
  const W = Math.round(MW + 2 * M + PANEL), H = Math.round(MH + 2 * M + TITLE);
  const X = (x) => +(M + (x - vx0) * k).toFixed(1), Y = (z) => +(M + TITLE + (z - vz0) * k).toFixed(1);
  const FONT = `'Noto Sans CJK JP', 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif`;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const out = [];
  const add = (s) => out.push(s);

  // ------------------------------------------------------------------ helpers
  const pts = (arr) => arr.map(([x, z]) => `${X(x)},${Y(z)}`).join(' ');
  function alignPath(A, s0 = 0, s1 = A.length, off = 0, step = Math.max(2, 3 / k)) {
    const n = Math.max(1, Math.ceil((s1 - s0) / step)); let d = '';
    for (let i = 0; i <= n; i++) { const s = s0 + ((s1 - s0) * i) / n; const [x, z] = off ? A.offset(s, off) : [A.at(s).x, A.at(s).z]; d += `${i ? 'L' : 'M'}${X(x)},${Y(z)}`; }
    return d;
  }
  /** Split a feature into runs by level: 'under' (well below ground), 'grade', 'elev' (on a structure). */
  function runs(f) {
    const A = f.align, step = 4, out = []; let cur = null;
    for (let s = 0; s <= A.length + 1e-6; s += step) {
      const ss = Math.min(s, A.length), q = A.at(ss), y = f.profile.yAt(ss), g = heightAt(q.x, q.z);
      const lv = y < g - 3 ? 'under' : y > g + 3 ? 'elev' : 'grade';
      if (!cur || cur.lv !== lv) { if (cur) { cur.s1 = ss; out.push(cur); } cur = { lv, s0: ss, ysum: 0, n: 0 }; }
      cur.ysum += y; cur.n++;
    }
    if (cur) { cur.s1 = A.length; out.push(cur); }
    for (const r of out) r.y = r.ysum / r.n;
    return out;
  }
  const labels = [];   // placed label boxes for simple collision avoidance
  function freeBox(b) { return !labels.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0); }
  function text(x, y, s, { size = 13, weight = 500, fill = '#2b2b2b', halo = '#fffdf8', anchor = 'start', rot = 0, opacity = 1, spacing = 0 } = {}) {
    add(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${rot ? `transform="rotate(${rot.toFixed(1)} ${x} ${y})"` : ''} ${opacity < 1 ? `opacity="${opacity}"` : ''} ${spacing ? `letter-spacing="${spacing}"` : ''} ${halo ? `stroke="${halo}" stroke-width="${Math.max(3, size * 0.28)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(s)}</text>`);
  }
  const tw = (s, size) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? size : size * 0.58), 0);
  function placeLabel(px, py, s, opts = {}, cands = [[10, 4], [-10, 4], [0, -10], [0, 18]]) {
    const size = opts.size || 13, w = tw(s, size), h = size * 1.2;
    for (const [dx, dy] of cands) {
      const anchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle';
      const x0 = anchor === 'start' ? px + dx : anchor === 'end' ? px + dx - w : px - w / 2;
      const b = { x0, x1: x0 + w, y0: py + dy - size, y1: py + dy - size + h };
      if (freeBox(b) || (dx === cands[cands.length - 1][0] && dy === cands[cands.length - 1][1])) {
        labels.push(b); text(+(px + dx).toFixed(1), +(py + dy).toFixed(1), s, { ...opts, anchor }); return;
      }
    }
  }

  // ------------------------------------------------------------------ svg start
  add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`);
  add(`<defs>
    <clipPath id="mapclip"><rect x="${M}" y="${M + TITLE}" width="${MW}" height="${MH}"/></clipPath>
    <pattern id="hatch-plateau" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="10" height="10" fill="#ece3cf"/><line x1="0" y1="0" x2="0" y2="10" stroke="#e2d6bb" stroke-width="3"/></pattern>
  </defs>`);
  add(`<rect width="${W}" height="${H}" fill="#fbf8f1"/>`);
  add(`<g clip-path="url(#mapclip)">`);
  add(`<rect x="${M}" y="${M + TITLE}" width="${MW}" height="${MH}" fill="#f4efe3"/>`);

  // ---- plateau, valley, scarp
  add(`<polygon points="${pts(PLATEAU.poly)}" fill="url(#hatch-plateau)"/>`);
  { const S = VALLEY.align.sample(8); const a = S.map(p => [p.x + p.hz * 45, p.z - p.hx * 45]), b = S.map(p => [p.x - p.hz * 45, p.z + p.hx * 45]).reverse();
    add(`<polygon points="${pts([...a, ...b])}" fill="#e5ecd5"/>`); }
  // scarp hachures (崖記号): ticks pointing downhill (east) along the edge
  { const A = PLATEAU.edge; let d = ''; const step = Math.max(6, 9 / k);
    for (let s = 0; s < A.length; s += step) { const q = A.at(s); const [x1, z1] = A.offset(s, 14), [x2, z2] = A.offset(s, -16); d += `M${X(x1)},${Y(z1)}L${X(x2)},${Y(z2)}`; void q; }
    add(`<path d="${d}" stroke="#a88f68" stroke-width="${Math.max(1, 1.4 * k * 2)}" opacity="0.8"/>`);
    add(`<path d="${alignPath(A, 0, A.length, 14)}" fill="none" stroke="#8c7350" stroke-width="${Math.max(1.2, 2.4 * k)}"/>`); }

  // ---- districts
  const DCOL = { downtown: '#ffd3dc', redevelopment: '#ddd5ff', oldtown: '#ffe2bd', hillfoot: '#f4dcf8', shitamachi: '#fff1c4', canal: '#d6ecf6', residential: '#e4f3d4', plateau: '#00000000', valley: '#00000000', river: '#00000000', estate: '#e2e7f1' };
  for (const D of DISTRICTS) {
    if (DCOL[D.kind] && DCOL[D.kind] !== '#00000000') add(`<polygon points="${pts(D.poly)}" fill="${DCOL[D.kind]}" opacity="0.62"/>`);
  }

  // ---- river: floodplains, water, levees (with the sakura levee on the south bank)
  { const A = RIVER.align;
    const band = (d0, d1, fill, op = 1) => { const S = A.sample(10); const a = S.map(p => A.offset(p.s, d0)), b = S.map(p => A.offset(p.s, d1)).reverse(); add(`<polygon points="${pts([...a, ...b])}" fill="${fill}" opacity="${op}"/>`); };
    band(riverOffset('N', 'foot'), riverOffset('S', 'foot'), '#e7e1c9');
    band(riverOffset('N', 'flood'), riverOffset('S', 'flood'), '#d6ebbd');
    band(-RIVER.halfW, RIVER.halfW, '#a9d5f2');
    for (const side of ['N', 'S']) add(`<path d="${alignPath(A, 0, A.length, riverOffset(side, 'crest'))}" fill="none" stroke="#b9a57a" stroke-width="${Math.max(2, 10 * k)}" stroke-linecap="round"/>`);
    // sakura along the south crest (x -950..700)
    let dots = ''; const s0 = A.sOf(-950, -1000), s1 = A.sOf(700, -930);
    for (let s = s0; s < s1; s += 16) for (const off of [-6, 6]) { const [x, z] = A.offset(s, riverOffset('S', 'crest') + off); dots += `<circle cx="${X(x)}" cy="${Y(z)}" r="${Math.max(2, 5 * k)}"/>`; }
    add(`<g fill="#f6a8c3" opacity="0.95">${dots}</g>`);
  }
  // ---- canal and the valley stream (sakura on both banks)
  { const A = CANAL.align; const S = A.sample(10); const a = S.map(p => A.offset(p.s, -CANAL.halfW)), b = S.map(p => A.offset(p.s, CANAL.halfW)).reverse();
    add(`<polygon points="${pts([...a, ...b])}" fill="#a9d5f2" stroke="#7aa9c9" stroke-width="1"/>`); }
  { const A = VALLEY.align, s0 = A.sOf(-1500, 330), s1 = A.sOf(-812, 255);
    add(`<path d="${alignPath(A, s0, s1)}" fill="none" stroke="#6fb3de" stroke-width="${Math.max(1.5, 4 * k)}"/>`);
    let dots = ''; for (let s = s0; s < s1; s += 14) for (const off of [-11, 11]) { const [x, z] = A.offset(s, off); dots += `<circle cx="${X(x)}" cy="${Y(z)}" r="${Math.max(2, 5 * k)}"/>`; }
    add(`<g fill="#f6a8c3">${dots}</g>`);
    // the culverted stream under すずね通り
    const R = plan.ROAD['suzune-dori']; add(`<path d="${alignPath(R.align)}" fill="none" stroke="#6fb3de" stroke-width="${Math.max(1, 1.6 * k)}" stroke-dasharray="3 5" opacity="0.8"/>`);
  }

  // ---- sites, local streets and buildings (the generated city)
  const SITECOL = { station: '#f4b6c2', park: '#bfe0a8', cemetery: '#cfd8c4', school: '#ead9b5', university: '#d7ccf0', temple: '#e2c7a6', shrine: '#f0c2a8', mall: '#d9c6f0' };
  const BCOL = { house: '#d4c4aa', shop: '#eaa27a', zakkyo: '#e0897a', office: '#9cb3cc', mansion: '#b8abd6', tower: '#7d90c8', machiya: '#b58a68', kura: '#f2f0ea', apartment: '#c9b8dc', factory: '#9aa59c', warehouse: '#a8b2ba', danchi: '#bdc8d8', 'danchi-tower': '#9fb0cc', izakaya: '#d9785f' };
  if (URB) {
    const drawBuildings = opts.buildings !== false;
    for (const S of URB.sites) for (const [x0, z0, x1, z1] of S.parts || [S.rect]) { add(`<rect x="${X(x0)}" y="${Y(z0)}" width="${(x1 - x0) * k}" height="${(z1 - z0) * k}" fill="${SITECOL[S.kind] || '#ddd'}" stroke="#8a7f6a" stroke-width="0.6" opacity="0.9"/>`); }
    let st = '', al = '';
    for (const s of URB.streets) { const d = `M${X(s.a[0])},${Y(s.a[1])}L${X(s.b[0])},${Y(s.b[1])}`; if (s.kind === 'alley') al += d; else st += d; }
    add(`<path d="${st}" stroke="#b9b3a6" stroke-width="${Math.max(1.6, 5.5 * k) + 1.2}" stroke-linecap="square" fill="none"/><path d="${st}" stroke="#fffdf8" stroke-width="${Math.max(1.6, 5.5 * k)}" stroke-linecap="square" fill="none"/>`);
    add(`<path d="${al}" stroke="#fffaf0" stroke-width="${Math.max(0.8, 2.2 * k)}" fill="none" opacity="0.9"/>`);
    const byCol = {};
    for (const b of drawBuildings ? URB.buildings : []) {
      if (b.x < vx0 - 50 || b.x > vx1 + 50 || b.z < vz0 - 50 || b.z > vz1 + 50) continue;
      const c = Math.cos(b.rot), s = Math.sin(b.rot), hw = b.w / 2, hd = b.d / 2;
      const P = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [b.x + u * c + v * s, b.z - u * s + v * c]);
      const col = BCOL[b.kind] || '#ccc';
      (byCol[col] = byCol[col] || []).push(`M${P.map(([x, z]) => `${X(x)},${Y(z)}`).join('L')}Z`);
    }
    for (const [col, list] of Object.entries(byCol)) add(`<path d="${list.join('')}" fill="${col}" stroke="#6d6252" stroke-width="${full ? 0.25 : 0.6}"/>`);
  }

  // ---- grid (500 m) and chunk grid (120 m)
  { let d = '', c = '';
    for (let x = Math.ceil(vx0 / 120) * 120; x <= vx1; x += 120) c += `M${X(x)},${Y(vz0)}V${Y(vz1)}`;
    for (let z = Math.ceil(vz0 / 120) * 120; z <= vz1; z += 120) c += `M${X(vx0)},${Y(z)}H${X(vx1)}`;
    for (let x = Math.ceil(vx0 / 500) * 500; x <= vx1; x += 500) d += `M${X(x)},${Y(vz0)}V${Y(vz1)}`;
    for (let z = Math.ceil(vz0 / 500) * 500; z <= vz1; z += 500) d += `M${X(vx0)},${Y(z)}H${X(vx1)}`;
    add(`<path d="${c}" stroke="#8a7f6a" stroke-width="0.5" opacity="0.12"/><path d="${d}" stroke="#8a7f6a" stroke-width="0.8" opacity="0.35" stroke-dasharray="6 6"/>`); }

  // ---- district labels
  for (const D of DISTRICTS) {
    const [lx, lz] = D.label; if (lx < vx0 || lx > vx1 || lz < vz0 || lz > vz1) continue;
    const size = full ? 22 : 28;
    text(X(lx), Y(lz), D.name, { size, weight: 700, fill: '#6b5a48', halo: '#fbf8f1', anchor: 'middle', opacity: 0.75, spacing: 2 });
    labels.push({ x0: X(lx) - tw(D.name, size) / 2, x1: X(lx) + tw(D.name, size) / 2, y0: Y(lz) - size, y1: Y(lz) + 4 });
  }

  // ---- transport: underground first (dashed), then everything at grade, then structures sorted by height
  const ROADSTYLE = {
    expressway: { casing: '#4a4f57', fill: '#aeb6bf' }, ramp: { casing: '#4a4f57', fill: '#aeb6bf' },
    national: { casing: '#b8423c', fill: '#f5a3a0' }, arterial: { casing: '#c49a1c', fill: '#ffe39a' },
    collector: { casing: '#9aa1a8', fill: '#ffffff' }, old: { casing: '#a0773f', fill: '#fff4de' }, street: { casing: '#aab0b6', fill: '#ffffff' },
  };
  const items = [];
  for (const R of ROADS) for (const r of runs(R)) items.push({ kind: 'road', f: R, r });
  for (const L of LINES) for (const r of runs(L)) items.push({ kind: 'rail', f: L, r });
  const order = (it) => (it.r.lv === 'under' ? -100 + it.r.y * 0.01 : it.r.lv === 'grade' ? (it.kind === 'road' ? 0 : 1) : 10 + it.r.y);
  items.sort((a, b) => order(a) - order(b));
  function drawRoad(R, r) {
    const st = ROADSTYLE[R.cls], w = Math.max(R.cls === 'street' ? 2.2 : 3, R.w * k * (full ? 0.8 : 1)), d = alignPath(R.align, r.s0, r.s1);
    if (r.lv === 'under') { add(`<path d="${d}" fill="none" stroke="${st.casing}" stroke-width="${w}" stroke-dasharray="6 4" opacity="0.5"/>`); return; }
    if (r.lv === 'elev') add(`<path d="${d}" fill="none" stroke="#000" stroke-width="${w + 6}" opacity="0.10" stroke-linecap="butt"/>`);
    add(`<path d="${d}" fill="none" stroke="${st.casing}" stroke-width="${w + 2.2}" stroke-linecap="butt"/>`);
    add(`<path d="${d}" fill="none" stroke="${st.fill}" stroke-width="${w}" stroke-linecap="butt"/>`);
    if (R.cls === 'expressway' || R.cls === 'national') add(`<path d="${d}" fill="none" stroke="${st.casing}" stroke-width="0.8" opacity="0.6"/>`);
  }
  function drawRail(L, r) {
    const d = alignPath(L.align, r.s0, r.s1), base = { jr: 5.5, private: 4.6, metro: 4.4, tram: 3.2, agt: 4 }[L.kind] * (full ? 1 : 1.5);
    if (r.lv === 'under') { add(`<path d="${d}" fill="none" stroke="${L.color}" stroke-width="${base}" stroke-dasharray="9 6" opacity="0.85"/>`); return; }
    if (r.lv === 'elev') add(`<path d="${d}" fill="none" stroke="#000" stroke-width="${base + 7}" opacity="0.12"/>`);
    add(`<path d="${d}" fill="none" stroke="#1d1d1f" stroke-width="${base + 2.4}"/>`);
    if (L.kind === 'agt') { add(`<path d="${d}" fill="none" stroke="${L.color}" stroke-width="${base}"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${base * 0.3}"/>`); return; }
    add(`<path d="${d}" fill="none" stroke="${L.color}" stroke-width="${base}"/>`);
    if (L.kind === 'jr') add(`<path d="${d}" fill="none" stroke="#fff" stroke-width="${base * 0.42}" stroke-dasharray="10 12"/>`);
    if (L.kind === 'private') add(`<path d="${d}" fill="none" stroke="#1d1d1f" stroke-width="${base + 6}" stroke-dasharray="1.2 11" opacity="0.9"/>`);
  }
  for (const it of items) (it.kind === 'road' ? drawRoad : drawRail)(it.f, it.r);

  // ---- tunnel portals (level changes between under and not-under on rail lines)
  for (const L of LINES) {
    const R = runs(L);
    for (let i = 1; i < R.length; i++) if ((R[i - 1].lv === 'under') !== (R[i].lv === 'under')) {
      const s = R[i].s0, q = L.align.at(s), ang = Math.atan2(q.hz, q.hx) * 180 / Math.PI + (R[i].lv === 'under' ? 0 : 180);
      add(`<g transform="translate(${X(q.x)},${Y(q.z)}) rotate(${ang.toFixed(1)})"><path d="M-2,-9 A9,9 0 0 1 -2,9" fill="none" stroke="#1d1d1f" stroke-width="3"/></g>`);
    }
  }

  // ---- crossings: level crossings (踏切) and the diamond crossing
  for (const c of crossingList) {
    if (c.x < vx0 || c.x > vx1 || c.z < vz0 || c.z > vz1) continue;
    if (c.type === 'level-crossing') add(`<g transform="translate(${X(c.x)},${Y(c.z)})"><rect x="-6" y="-6" width="12" height="12" fill="#fff" stroke="#e03131" stroke-width="2.2"/><path d="M-3.5,-3.5L3.5,3.5M3.5,-3.5L-3.5,3.5" stroke="#e03131" stroke-width="2"/></g>`);
  }
  for (const c of crossingList) {
    if (c.x < vx0 || c.x > vx1 || c.z < vz0 || c.z > vz1) continue;
    if (c.type === 'diamond') add(`<g transform="translate(${X(c.x)},${Y(c.z)})"><polygon points="0,-10 3,-3 10,0 3,3 0,10 -3,3 -10,0 -3,-3" fill="#fcc419" stroke="#1d1d1f" stroke-width="1.4"/></g>`);
  }

  // ---- stations
  const groups = new Map();
  for (const st of STATIONS) {
    const L = plan.LINE[st.line], A = L.align;
    if (st.platform === 'stop' || st.platform === 'terminal' && L.kind === 'tram') {
      add(`<circle cx="${X(st.x)}" cy="${Y(st.z)}" r="${full ? 4.2 : 6}" fill="#fff" stroke="${L.color}" stroke-width="2.4"/>`);
    } else {
      const d = alignPath(A, st.s - st.len / 2, st.s + st.len / 2), dash = st.level === 'underground' ? ' stroke-dasharray="5 3"' : '';
      add(`<path d="${d}" fill="none" stroke="#1d1d1f" stroke-width="${full ? 11 : 16}" stroke-linecap="round"${dash}/><path d="${d}" fill="none" stroke="#fff" stroke-width="${full ? 8 : 12}" stroke-linecap="round"/>`);
    }
    if (st.group) { if (!groups.has(st.group)) groups.set(st.group, []); groups.get(st.group).push(st); }
  }
  // station names: one label per group (the first name), others individually
  const named = new Set();
  for (const st of STATIONS) {
    if (st.x < vx0 || st.x > vx1 || st.z < vz0 || st.z > vz1) continue;
    const L = plan.LINE[st.line], tram = L.kind === 'tram';
    if (st.group === 'hanawatari' && st.line !== 'tr') continue;
    if (named.has(st.name + st.group) && st.group) continue;
    named.add(st.name + st.group);
    if (st.group === 'hanawatari') { placeLabel(X(st.x), Y(st.z), '花渡', { size: full ? 26 : 34, weight: 800, fill: '#1d1d1f' }, [[-40, -30], [30, -30]]); continue; }
    placeLabel(X(st.x), Y(st.z), st.name, { size: tram ? (full ? 11 : 14) : (full ? 14 : 18), weight: tram ? 500 : 700, fill: tram ? '#a61e4d' : '#1d1d1f' },
      [[12, 5], [-12, 5], [0, -12], [0, 22], [14, -10], [-14, -10], [14, 20], [-14, 20]]);
  }

  // ---- line name tags (at quiet points along each line)
  const TAGS = { tr: [[-470, -620], [-520, 850]], shiomi: [[760, -72]], miharashi: [[-1060, -190]], mio: [[-330, 480]], minato: [[470, -300], [-80, 980]], tram: [[-1000, 300], [560, 30]], liner: [[560, -1350]] };
  for (const L of LINES) for (const [tx, tz] of TAGS[L.id] || []) {
    if (tx < vx0 || tx > vx1 || tz < vz0 || tz > vz1) continue;
    const s = L.align.sOf(tx, tz), q = L.align.at(s); let ang = Math.atan2(q.hz, q.hx) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const [ox, oz] = L.align.offset(s, 0), size = full ? 12 : 15, w = tw(L.name, size) + 12;
    add(`<g transform="translate(${X(ox)},${Y(oz)}) rotate(${ang.toFixed(1)})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="9" fill="${L.color}" stroke="#fff" stroke-width="1.5"/><text x="0" y="4.5" font-size="${size}" font-weight="700" fill="#fff" text-anchor="middle">${esc(L.name)}</text></g>`);
  }

  // ---- landmarks (numbered)
  LANDMARKS.forEach((lm, i) => {
    const [x, z] = lm.p; if (x < vx0 || x > vx1 || z < vz0 || z > vz1) return;
    const r = full ? 8.5 : 11;
    add(`<g transform="translate(${X(x)},${Y(z)})"><circle r="${r}" fill="#5f3dc4" stroke="#fff" stroke-width="1.6"/><text y="${r * 0.42}" font-size="${r * 1.2}" font-weight="700" fill="#fff" text-anchor="middle">${i + 1}</text></g>`);
    if (!full) placeLabel(X(x), Y(z), lm.name, { size: 13, weight: 600, fill: '#3b2a8a' }, [[14, 5], [-14, 5], [0, -14], [0, 26]]);
  });
  add(`</g>`); // clip

  // ---- frame, map boundary, title, scale bar, north arrow
  add(`<rect x="${M}" y="${M + TITLE}" width="${MW}" height="${MH}" fill="none" stroke="#6b5a48" stroke-width="1.5"/>`);
  add(`<rect x="${X(MAP.x0)}" y="${Y(MAP.z0)}" width="${(MAP.x1 - MAP.x0) * k}" height="${(MAP.z1 - MAP.z0) * k}" fill="none" stroke="#5f3dc4" stroke-width="2.5" stroke-dasharray="14 6" opacity="0.8"/>`);
  if (!opts.bare) {
    text(M, M + 30, `${CITY.name}${CITY.provisional ? '（仮）' : ''}　街の骨格案`, { size: 28, weight: 800, fill: '#2b2b2b', halo: null });
    text(M + 330, M + 30, full ? '歩ける範囲 3 km × 3 km ／ 点線の方眼 500 m ・ 細い方眼 120 m（生成チャンク）' : `拡大図 ${vx1 - vx0} m × ${vz1 - vz0} m`, { size: 14, weight: 500, fill: '#6b5a48', halo: null });
  }
  { const len = full ? 500 : 100, x0 = M + 18, y0 = M + TITLE + MH - 22;
    add(`<rect x="${x0 - 8}" y="${y0 - 22}" width="${len * k + 60}" height="34" rx="6" fill="#fbf8f1" opacity="0.9"/><path d="M${x0},${y0}h${len * k}M${x0},${y0 - 6}v12M${x0 + len * k},${y0 - 6}v12" stroke="#2b2b2b" stroke-width="2"/>`);
    text(x0 + len * k + 8, y0 + 5, `${len} m`, { size: 13, weight: 600, halo: null });
    const nx = M + MW - 40, ny = M + TITLE + 46;
    add(`<g transform="translate(${nx},${ny})"><circle r="22" fill="#fbf8f1" opacity="0.9"/><polygon points="0,-17 7,8 0,3 -7,8" fill="#2b2b2b"/></g>`); text(nx, ny + 19, 'N', { size: 12, weight: 700, anchor: 'middle', halo: null }); }

  // ---- legend panel
  if (PANEL) {
    const px = M + MW + 22; let py = M + TITLE + 8;
    const head = (s) => { text(px, py + 16, s, { size: 16, weight: 800, fill: '#2b2b2b', halo: null }); py += 28; };
    head('鉄道（7系統）');
    for (const L of LINES) {
      const n = STATIONS.filter(s => (s.line === L.id || s.shared?.includes(L.id)) && s.x >= MAP.x0 && s.x <= MAP.x1 && s.z >= MAP.z0 && s.z <= MAP.z1).length;
      const kindJa = { jr: 'JR型の幹線・4線', private: '私鉄', metro: '地下鉄', tram: '路面電車', agt: '新交通（ゴムタイヤ）' }[L.kind];
      add(`<path d="M${px},${py + 8}h34" stroke="#1d1d1f" stroke-width="7"/><path d="M${px},${py + 8}h34" stroke="${L.color}" stroke-width="5"/>`);
      text(px + 44, py + 13, `${L.name}`, { size: 14, weight: 700, halo: null });
      text(px + 44 + tw(L.name, 14) + 8, py + 13, `${L.operator}・${kindJa}・${L.kind === 'tram' ? '電停' : '駅'}${n}`, { size: 12, weight: 400, fill: '#555', halo: null });
      py += 24;
    }
    text(px, py + 12, '点線＝地下 ／ 影つき＝高架 ／ 見晴線⇄汐見線は直通運転', { size: 12, fill: '#555', halo: null }); py += 30;
    head('道路');
    for (const [cls, name] of [['expressway', '都市高速（高架）'], ['national', '国道'], ['arterial', '幹線道路'], ['old', '旧街道'], ['collector', '補助幹線'], ['street', '生活道路（抜粋）']]) {
      const st = ROADSTYLE[cls];
      add(`<path d="M${px},${py + 8}h34" stroke="${st.casing}" stroke-width="9"/><path d="M${px},${py + 8}h34" stroke="${st.fill}" stroke-width="6.5"/>`);
      text(px + 44, py + 13, name, { size: 13, weight: 500, halo: null }); py += 22;
    }
    py += 8; head('記号');
    const sym = [
      ['<rect x="-6" y="-6" width="12" height="12" fill="#fff" stroke="#e03131" stroke-width="2.2"/><path d="M-3.5,-3.5L3.5,3.5M3.5,-3.5L-3.5,3.5" stroke="#e03131" stroke-width="2"/>', '踏切'],
      ['<polygon points="0,-10 3,-3 10,0 3,3 0,10 -3,3 -10,0 -3,-3" fill="#fcc419" stroke="#1d1d1f" stroke-width="1.4"/>', 'ダイヤモンドクロス（線路と路面電車の平面交差）'],
      ['<path d="M-2,-9 A9,9 0 0 1 -2,9" fill="none" stroke="#1d1d1f" stroke-width="3"/>', 'トンネルの坑口'],
      ['<path d="M-12,0h24" stroke="#1d1d1f" stroke-width="11" stroke-linecap="round"/><path d="M-12,0h24" stroke="#fff" stroke-width="8" stroke-linecap="round"/>', '駅（ホームの長さ）'],
      ['<circle r="4.5" fill="#fff" stroke="#e64980" stroke-width="2.4"/>', '電停'],
      ['<circle r="3" cx="-5" fill="#f6a8c3"/><circle r="3" cx="5" fill="#f6a8c3"/>', '桜並木'],
      ['<path d="M-12,-4 L12,-4" stroke="#8c7350" stroke-width="2"/><path d="M-10,-4v9M-4,-4v9M2,-4v9M8,-4v9" stroke="#a88f68" stroke-width="1.5"/>', '崖（台地の縁、高さ約22 m）'],
    ];
    for (const [svg, name] of sym) { add(`<g transform="translate(${px + 17},${py + 8})">${svg}</g>`); text(px + 44, py + 13, name, { size: 13, weight: 500, halo: null }); py += 23; }
    py += 8; head('番号の場所');
    LANDMARKS.forEach((lm, i) => {
      add(`<g transform="translate(${px + 9},${py + 7})"><circle r="8.5" fill="#5f3dc4"/><text y="3.6" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${i + 1}</text></g>`);
      text(px + 24, py + 12, lm.name, { size: 12.5, weight: 500, halo: null }); py += 19.5;
    });
  }
  add(`</svg>`);
  return { svg: out.join('\n'), W, H, X, Y };
}
