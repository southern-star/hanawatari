// City map overlay (Tab / the 地図 button): the plan drawn as SVG (plan/mapsvg.js) with the player's position and
// heading. Click anywhere on the map to go there, or pick one of the named places.
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
  let built = null, marker = null;
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
      onTravel({ x, z, yaw: player.yaw * 180 / Math.PI, pitch: 0, label: null });
    });
    for (const p of places) {
      const li = document.createElement('li'); const b = document.createElement('button'); b.textContent = p.label; b.addEventListener('click', () => onTravel(p)); li.appendChild(b); list.appendChild(li);
    }
    built = r;
  }
  function update() {
    if (!built || el.hidden) return;
    const x = built.X(player.pos.x), y = built.Y(player.pos.z), deg = -player.yaw * 180 / Math.PI;
    marker.setAttribute('transform', `translate(${x},${y}) rotate(${deg.toFixed(1)})`);
  }
  const api = {
    get open() { return !el.hidden; },
    setOpen(v) { if (v && !built) build(); el.hidden = !v; update(); },
    toggle() { api.setOpen(el.hidden); },
    update,
  };
  el.querySelector('.cm-close').addEventListener('click', () => api.setOpen(false));
  return api;
}
