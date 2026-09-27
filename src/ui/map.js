// City map overlay (Tab / the 地図 button): the plan drawn as SVG (plan/mapsvg.js) with the player's position and
// heading. Click anywhere on the map to go there, or pick one of the named places. pick() asks for a point instead (the
// robotaxi's destination); setRoute() draws a route on it.
import { planSVG } from '../plan/mapsvg.js';
import { computeCrossings } from '../plan/crossings.js';

export function createMap({ plan, urban, player, places, onTravel }) {
  const el = document.createElement('div'); el.id = 'citymap'; el.hidden = true;
  el.innerHTML = `<div class="cm-panel" role="dialog" aria-label="地図">
    <div class="cm-head"><span class="cm-title">${plan.CITY.name}${plan.CITY.provisional ? '（仮）' : ''} 地図</span><button class="cm-close" aria-label="閉じる">×</button></div>
    <div class="cm-body"><div class="cm-svg"></div><ul class="cm-places"></ul></div>
    <div class="cm-hint">地図をクリックするとその場所へ移動します · <kbd>Tab</kbd> / <kbd>Esc</kbd> で閉じる</div></div>`;
  document.body.appendChild(el);
  const wrap = el.querySelector('.cm-svg'), list = el.querySelector('.cm-places');
  let built = null, marker = null, picking = null, route = null, routePts = null;
  const hint = el.querySelector('.cm-hint'), hint0 = hint.innerHTML;
  const scale = 0.3, view = [plan.MAP.x0 - 60, plan.MAP.z0 - 60, plan.MAP.x1 + 60, plan.MAP.z1 + 60];
  function build() {
    const r = planSVG(plan, computeCrossings(), { bare: true, scale, view, urban, buildings: false });
    wrap.innerHTML = r.svg;
    const svg = wrap.querySelector('svg');
    svg.setAttribute('width', '100%'); svg.removeAttribute('height'); svg.style.display = 'block';
    marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    marker.innerHTML = '<circle r="11" fill="#1c7ed6" fill-opacity="0.18"/><path d="M0,-9 L6,6 L0,3 L-6,6 Z" fill="#1c7ed6" stroke="#fff" stroke-width="1.6"/>';
    svg.appendChild(marker);
    svg.addEventListener('click', (e) => {
      const b = svg.getBoundingClientRect(), px = (e.clientX - b.left) / b.width * r.W, py = (e.clientY - b.top) / b.height * r.H;
      const x = view[0] + px / scale, z = view[1] + py / scale;
      if (x < plan.MAP.x0 || x > plan.MAP.x1 || z < plan.MAP.z0 || z > plan.MAP.z1) return;
      const p = { x, z, yaw: player.yaw * 180 / Math.PI, pitch: 0, label: null };
      if (picking) { const f = picking; picking = null; f(p); } else onTravel(p);
    });
    for (const p of places) {
      const li = document.createElement('li'); const b = document.createElement('button'); b.textContent = p.label; b.addEventListener('click', () => { if (picking) { const f = picking; picking = null; f(p); } else onTravel(p); }); li.appendChild(b); list.appendChild(li);
    }
    route = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    route.innerHTML = '<polyline fill="none" stroke="#ffffff" stroke-width="14" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.9"/><polyline fill="none" stroke="#12b3a0" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/><circle r="11" fill="#12b3a0" stroke="#fff" stroke-width="4" visibility="hidden"/>';
    svg.insertBefore(route, marker);
    built = r; drawRoute();
  }
  function drawRoute() {
    if (!built || !route) return;
    const pts = routePts ? routePts.map(([x, z]) => `${built.X(x).toFixed(1)},${built.Y(z).toFixed(1)}`).join(' ') : '';
    for (const pl of route.querySelectorAll('polyline')) pl.setAttribute('points', pts);
    const c = route.querySelector('circle'), end = routePts && routePts[routePts.length - 1];
    c.setAttribute('visibility', end ? 'visible' : 'hidden'); if (end) { c.setAttribute('cx', built.X(end[0]).toFixed(1)); c.setAttribute('cy', built.Y(end[1]).toFixed(1)); }
  }
  function update() {
    if (!built || el.hidden) return;
    const x = built.X(player.pos.x), y = built.Y(player.pos.z), deg = -player.yaw * 180 / Math.PI;
    marker.setAttribute('transform', `translate(${x},${y}) rotate(${deg.toFixed(1)})`);
  }
  const api = {
    get open() { return !el.hidden; },
    setOpen(v) { if (v && !built) build(); el.hidden = !v; if (!v) { picking = null; hint.innerHTML = hint0; } update(); },
    toggle() { api.setOpen(el.hidden); },
    /** Open the map to choose a point: cb({ x, z, label }) (the named places too). */
    pick(text, cb) { api.setOpen(true); picking = cb; hint.textContent = text; },
    /** A route to draw ([[x, z]…], or null). */
    setRoute(pts) { routePts = pts; drawRoute(); },
    update,
  };
  el.querySelector('.cm-close').addEventListener('click', () => api.setOpen(false));
  return api;
}
