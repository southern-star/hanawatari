// ロボタクシー — call a self-driving taxi, ride it anywhere in the city, get out at the kerb. Realism relaxed: it is sent
// from out of sight to the kerb nearest the player, drives with the rest of the traffic (lights, right turns, people
// crossing) by the shortest way (the lane graph's route finding), and pulls in at the destination.
//  • T: where to? — the named places, a point on the map, or a sightseeing loop; T again cancels;
//  • E: get in when it's waiting at the kerb (or just walk up to its door); on the way, E asks it to pull in soon;
//  • V: the view (the back seat with free look, from behind, from above); X: fast-forward ×1 / ×3 / ×6.
import * as THREE from 'three';
import { lanesNear } from '../plan/lanes.js';
import { walksNear } from '../plan/walks.js';

const MODES = ['seat', 'chase', 'drone'], MODE_NAME = { seat: '車内', chase: '後ろから', drone: '上空から' };
const SCALES = [1, 3, 6], TURN = { L: '左折', R: '右折', U: 'Uターン' };
/** The sightseeing loop (観光): the places it passes, in order, and a line about each. */
const TOUR = [
  { label: '花渡駅 東口', x: -268, z: -60, say: '花渡駅の東口です。バスターミナルとペデストリアンデッキがあります' },
  { label: '本町 ダイヤモンドクロス', x: 380, z: 18, say: '本町の交差点です。路面電車の線路が十字に交わります' },
  { label: '汐見運河', x: 1040, z: 140, say: '汐見運河です。倉庫街と運河沿いの道が続きます' },
  { label: '宿場町通り', x: -248, z: 330, say: '宿場町通りです。古い街道沿いの町並みが残ります' },
];
const DEG = Math.PI / 180;

/** A point beside vehicle v: lx to its left, lz ahead of the middle of its axles, at height y. */
function beside(v, lx, lz, y) { const c = Math.cos(v.yaw), s = Math.sin(v.yaw); return new THREE.Vector3(v.x + lx * c + lz * s, y, v.z - lx * s + lz * c); }

export class RoboTaxi {
  constructor(ctx, { traffic, player, places, toast, map, placeAt }) {
    this.ctx = ctx; this.T = traffic; this.player = player; this.toast = toast; this.map = map; this.placeAt = placeAt;
    this.places = places; this.state = 'idle'; this.v = null; this.mode = 0; this.scaleI = 0; this.look = { yaw: 0, pitch: -4 * DEG }; this.t = 0; this.hudT = 0;
    this.cam = new THREE.Vector3(); this.camOk = false;
    this.buildHud();
    addEventListener('mousemove', (e) => {
      if (!this.riding || MODES[this.mode] !== 'seat' || document.pointerLockElement !== ctx.renderer.domElement) return;
      this.look.yaw -= e.movementX * 0.0022; this.look.pitch = Math.max(-60 * DEG, Math.min(50 * DEG, this.look.pitch - e.movementY * 0.0022));
    });
    // the pin over where it will stop for you
    const pin = new THREE.Group(), m = ctx.mat.emissive('#27d3bf', 1.6);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 12), m); cone.rotation.x = Math.PI; cone.position.y = 0.3; pin.add(cone);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 28), m); ring.rotation.x = Math.PI / 2; ring.position.y = -2.6; pin.add(ring);
    pin.visible = false; pin.traverse(o => { if (o.isMesh) ctx.noOutline(o); }); this.pin = pin; ctx.scene.add(pin);
  }
  get riding() { return this.state === 'riding' || this.state === 'arrived'; }
  get scale() { return this.state !== 'idle' ? SCALES[this.scaleI] : 1; }

  // ---------------------------------------------------------------- keys and the menu
  /** A key while playing; true when the robotaxi used it. */
  key(e) {
    if (!this.menuEl.hidden) {
      if (e.code === 'Escape' || e.code === 'KeyT') { this.closeMenu(); return true; }
      const i = /^Digit(\d)$/.exec(e.code); if (i) { const b = this.menuEl.querySelectorAll('.rm-list button')[+i[1] - 1]; if (b) b.click(); return true; }
      return true;
    }
    if (e.code === 'KeyT') { if (this.state === 'idle') this.openMenu(); else this.cancel(); return true; }
    if (e.code === 'KeyE' && this.state === 'waiting' && this.near(90)) { this.board(); return true; }       // (from where you stand: no need to walk over)
    if (e.code === 'KeyE' && this.state === 'riding') { this.pullIn(); return true; }
    if (e.code === 'KeyV' && this.riding) { this.mode = (this.mode + 1) % MODES.length; this.camOk = false; this.toast(`視点：${MODE_NAME[MODES[this.mode]]}`); return true; }
    if (e.code === 'KeyX' && this.state !== 'idle') { this.scaleI = (this.scaleI + 1) % SCALES.length; this.toast(SCALES[this.scaleI] > 1 ? `早送り ×${SCALES[this.scaleI]}` : '早送り オフ'); return true; }
    return false;
  }
  openMenu() {
    const list = this.menuEl.querySelector('.rm-list'); list.innerHTML = '';
    const add = (text, sub, fn) => { const li = document.createElement('li'), b = document.createElement('button'); b.innerHTML = `<span>${text}</span>${sub ? `<small>${sub}</small>` : ''}`; b.addEventListener('click', fn); li.appendChild(b); list.appendChild(li); };
    this.places.forEach((p, i) => add(`<kbd>${i + 1}</kbd> ${p.label}`, '', () => { this.closeMenu(); this.call(p); }));
    add('🗺 地図で選ぶ', 'クリックした場所へ', () => { this.closeMenu(); this.player.enabled = false; this.map.pick('ロボタクシーの行き先をクリックしてください', (p) => { this.map.setOpen(false); this.player.enabled = true; this.call({ ...p, label: p.label || this.placeAt(p.x, p.z) || '地図の地点' }); }); });
    add('✿ おまかせ観光', TOUR.map(p => p.label).join(' → '), () => { this.closeMenu(); this.call(TOUR[TOUR.length - 1], TOUR); });
    this.menuEl.hidden = false; this.player.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  closeMenu() { this.menuEl.hidden = true; if (!this.riding) this.player.enabled = true; }

  // ---------------------------------------------------------------- calling, getting in and out
  /** Where a car can pull in near (x, z): on the kerb lane of a link (clear of its ends), best with (x, z) on its left. */
  kerbNear(x, z, reach = 60) {
    const T = this.T, o = {}; let best = null;
    for (const ln of lanesNear(x, z, reach)) {
      const L = ln.link; if (L.private || ln.k !== 0 || L.len < 26 || L.lx.length) continue;
      const u1 = Math.min(L.len - 10, (L.stopAt ?? L.len) - (L.control === 'signal' ? 30 : 8));   // (not in the queue at the lights)
      for (let u = 10; u <= u1; u += 2) {
        T.pos(ln, u, o);
        const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz); if (d > reach) continue;
        const score = d + (dx * o.hz - dz * o.hx > 0 ? 0 : 10) + (L.cls === 'national' ? 12 : L.cls === 'arterial' ? 4 : 0);
        if (!best || score < best.score) best = { ln, u, score, x: o.x, y: o.y, z: o.z };
      }
    }
    return best;
  }
  /** Send one to the player, bound for place `dest` (via the places in `via`, if a tour). */
  call(dest, via = null) {
    const P = this.player.pos, pick = this.kerbNear(P.x, P.z, 50) || this.kerbNear(P.x, P.z, 130);
    if (!pick) { this.toast('近くに車が停まれる道がありません'); return; }
    const stops = (via || [dest]).map(p => ({ p, k: this.kerbNear(p.x, p.z, 90) }));
    if (stops.some(s => !s.k)) { this.toast('行き先の近くに車が停まれる道がありません'); return; }
    // start out of sight, some way off by road
    const T = this.T, goal = pick.ln.link, D = T.distTo(goal, false);
    let at = null;
    for (const [lo, hi, away, roads] of [[60, 200, 70, true], [30, 160, 50, false], [0, 400, 0, false]]) {
      const cand = [];
      for (const ln of lanesNear(P.x, P.z, hi + 60)) { const L = ln.link; if (L.private || L.cls === 'station' || ln.len < 12 || (roads && L.cls === 'street')) continue; const d = D[L.id]; if (d >= lo && d <= hi) cand.push(ln); }
      for (let i = 0; i < 20 && cand.length && !at; i++) {
        const ln = cand[Math.floor(Math.random() * cand.length)], u = 5 + Math.random() * (ln.len - 6), q = T.pos(ln, u, {});
        if (Math.hypot(q.x - P.x, q.z - P.z) < away || ln.veh.some(w => Math.abs(w.u - u) < 12)) continue;
        at = [ln, u];
      }
      if (at) break;
    }
    if (!at) { this.toast('配車できませんでした'); return; }
    // (the ones let go earlier, still driving about: off the road, to make room)
    if ((T.count.robotaxi || 0) >= T.render.models.robotaxi.n) { const old = T.veh.filter(w => w.name === 'robotaxi' && w !== this.v).sort((a, b) => Math.hypot(b.x - P.x, b.z - P.z) - Math.hypot(a.x - P.x, a.z - P.z))[0]; if (old) T.remove(old); }
    const v = T.spawnAt('robotaxi', at[0], at[1], at[0].link.vmax * 0.5, { robo: true, plan: [goal], stops: [this.pickupStop(pick)] });
    if (!v) { this.toast('配車できませんでした'); return; }
    this.v = v; this.pick = pick; this.dest = dest; this.route = stops; this.state = 'coming'; this.t = 0; this.said = new Set();
    this.toast(`ロボタクシーを呼びました · ${dest.label} まで`);
  }
  /** (Tools) Ride at once: the car appears at the kerb by the player and sets off for dest. */
  rideNow(dest, tour = false) {
    const P = this.player.pos, pick = this.kerbNear(P.x, P.z, 60); if (!pick) return false;
    if (tour) dest = TOUR[TOUR.length - 1];
    const stops = (tour ? TOUR : [dest]).map(p => ({ p, k: this.kerbNear(p.x, p.z, 90) })); if (stops.some(s => !s.k)) return false;
    const v = this.T.spawnAt('robotaxi', pick.ln, pick.u, 0, { robo: true, plan: [], stops: [this.pickupStop(pick)] }); if (!v) return false;
    this.v = v; this.pick = pick; this.dest = dest; this.route = stops; this.state = 'waiting'; this.said = new Set(); this.T.place(v);
    this.board(); return true;
  }
  pickupStop(pick) {
    return { lane: pick.ln, u: pick.u, dwell: 0.5, kind: 'pickup', anyLane: true, ready: () => this.state === 'riding' && this.t > 1.6,
      arrive: (v) => { if (this.state === 'coming' && v === this.v) { this.state = 'waiting'; v.hazard = true; this.toast('ロボタクシーが到着しました · E で乗車'); } } };
  }
  dropStop(k) {
    return { lane: k.ln, u: k.u, dwell: 1.2, kind: 'drop', anyLane: true, ready: () => this.state === 'idle',
      arrive: (v) => { if (this.state === 'riding' && v === this.v) { this.state = 'arrived'; this.t = 0; v.hazard = true; this.toast('到着しました · お忘れ物のないようご注意ください'); } } };
  }
  near(r) { const v = this.v, P = this.player.pos; return v && Math.hypot(v.x - P.x, v.z - P.z) < r; }
  board() {
    const v = this.v; if (!v) return;
    this.state = 'riding'; this.t = 0; this.mode = 0; this.look = { yaw: 0, pitch: -4 * DEG }; this.camOk = false;
    this.ctx.riding = true; this.player.enabled = false; this.pin.visible = false;
    v.hazard = false;
    // the plan: the places on the way in turn (a tour), the destination last, where it pulls in
    const last = this.route[this.route.length - 1].k;
    v.plan = this.route.map(s => s.k.ln.link);
    while (v.plan.length > 1 && v.plan[0] === v.el.link) v.plan.shift();
    if (v.plan.length === 1 && v.plan[0] === v.el.link && last.u > v.u + 5) v.plan = [];      // (just along this street)
    v.stops = [v.stops[0], this.dropStop(last)];
    this.T.route(v, v.el);
    this.toast(`発車します · ${this.dest.label} まで`);
  }
  /** On the way: pull in a little further on (on this street, or just past the next junction). */
  pullIn() {
    const v = this.v; if (!v || this.state !== 'riding') return;
    let ln, u;
    if (v.el.link && v.el.len - v.u > 34) { ln = v.el.link.lanes[0]; u = v.u + 22; }
    else { const nx = v.el.link ? v.next && v.next.to : v.el.to; if (!nx) return; ln = nx.link.lanes[0]; u = Math.min(16, nx.len - 3); }
    if (u < 2) { this.toast('少し先で停まります'); return; }
    const k = { ln, u };
    this.route = [{ p: { label: 'ここ' }, k }]; this.dest = { label: this.placeAt(v.x, v.z) || 'この辺り' };
    v.plan = ln.link === v.el.link ? [] : [ln.link];
    v.stops = [this.dropStop(k)];
    this.toast('まもなく停車します');
  }
  getOut() {
    const v = this.v, D = this.T.dims.robotaxi; if (!v) return;
    // onto the walk by the kerb (or beside the car)
    const side = beside(v, D.W / 2 + 1.4, -0.4, v.y);
    let best = null, bd = 7;
    for (const e of walksNear(side.x, side.z, 8)) {
      if (e.zone || e.kind === 'stairs' || e.kind === 'deck') continue;
      for (let k = 0; k + 1 < e.pts.length; k++) {
        const p = e.pts[k], q = e.pts[k + 1], ex = q[0] - p[0], ez = q[2] - p[2], l2 = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((side.x - p[0]) * ex + (side.z - p[2]) * ez) / l2));
        const x = p[0] + ex * t, z = p[2] + ez * t, d = Math.hypot(x - side.x, z - side.z); if (d < bd && Math.abs(p[1] - v.y) < 1.5) { bd = d; best = [x, z]; }
      }
    }
    const [x, z] = best || [side.x, side.z], yawDeg = (Math.atan2(-Math.sin(v.yaw), -Math.cos(v.yaw))) / DEG;
    this.player.setPose(x, z, yawDeg, 0); this.player.fly = false;
    const g = this.ctx.physics.groundHeight(x, z, v.y + 1.2); if (isFinite(g)) this.player.pos.y = g;
    this.player.enabled = true; this.ctx.riding = false;
    this.release();
    this.toast('ご乗車ありがとうございました');
  }
  /** Let the car go (it drives off into the traffic). */
  release() {
    const v = this.v;
    if (v) { v.hazard = false; v.plan = null; v.robo = false; v.stops = []; if (v.el.link) this.T.route(v, v.el); }
    this.v = null; this.state = 'idle'; this.pin.visible = false; this.scaleI = 0; this.map.setRoute(null);
  }
  cancel() {
    if (this.riding) { this.pullIn(); return; }
    this.release(); this.toast('配車をキャンセルしました');
  }

  // ---------------------------------------------------------------- each step
  update(dt) {
    const v = this.v;
    if (this.state !== 'idle' && (!v || !this.T.veh.includes(v))) {                      // (it was taken off the road)
      if (this.riding) { this.ctx.riding = false; this.player.enabled = true; }
      this.v = null; this.state = 'idle'; this.pin.visible = false; this.hud.hidden = true; return;
    }
    this.t += dt;
    if (this.state === 'idle') { this.hud.hidden = true; return; }
    // the pin: over the kerb where it will stop, then over the car
    if (this.state === 'coming' || this.state === 'waiting') {
      const at = this.state === 'waiting' ? v : this.pick;
      this.pin.visible = true; this.pin.position.set(at.x, at.y + (this.state === 'waiting' ? 3.2 : 2.8) + Math.sin(this.t * 3) * 0.12, at.z); this.pin.rotation.y = this.t * 1.5;
      this.pin.children[1].visible = this.state === 'coming';
      if (this.state === 'waiting' && this.near(2.6) && this.t > 0.5) this.board();       // walked up to its door
    }
    if (this.riding) {
      const P = this.player.pos; P.set(v.x, v.y, v.z);
      if (this.state === 'arrived' && this.t > 1.4) { this.getOut(); return; }
      if (this.state === 'riding' && v.plan && this.said) {                                  // a tour: the places passed
        for (const s of this.route) if (!this.said.has(s) && s.p.say && Math.hypot(v.x - s.k.x, v.z - s.k.z) < 40) { this.said.add(s); this.toast(`${s.p.label} · ${s.p.say}`); }
      }
      this.camera(dt);
    }
    if ((this.hudT -= dt) <= 0) { this.hudT = 0.25; this.drawHud(); }
  }
  /** The view from (or of) the car. */
  camera(dt) {
    const v = this.v, cam = this.ctx.camera, mode = MODES[this.mode], fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), carYaw = Math.atan2(-fx, -fz);
    if (mode === 'seat') {                                                                 // the front passenger's seat: nobody at the wheel
      const d = this.T.dims.taxi.driver || [-0.38, 0.55, 0.3], p = beside(v, -d[0], d[2] - 0.12, v.y + d[1] + 0.8);
      cam.position.copy(p); cam.rotation.set(this.look.pitch + (v.pitch || 0), carYaw + this.look.yaw, 0, 'YXZ');
      this.player.yaw = carYaw + this.look.yaw;
      return;
    }
    const back = mode === 'chase' ? 8.5 : 20, up = mode === 'chase' ? 3.5 : 30;
    const want = new THREE.Vector3(v.x - fx * back, v.y + up, v.z - fz * back), look = new THREE.Vector3(v.x + fx * (mode === 'chase' ? 4 : 6), v.y + 1.1, v.z + fz * (mode === 'chase' ? 4 : 6));
    if (!this.camOk) { this.cam.copy(want); this.camOk = true; } else this.cam.lerp(want, Math.min(1, dt * 3.5));
    cam.position.copy(this.cam); cam.lookAt(look); this.player.yaw = carYaw;
  }

  // ---------------------------------------------------------------- the panel
  buildHud() {
    const hud = document.createElement('div'); hud.className = 'hud'; hud.id = 'robo'; hud.hidden = true;
    hud.innerHTML = `<div class="rb-head"><span class="rb-lamp"></span><b>ロボタクシー</b><span class="rb-state"></span></div>
      <div class="rb-dest"></div><div class="rb-meta"></div><div class="rb-next"></div><div class="rb-keys"></div>`;
    document.body.appendChild(hud); this.hud = hud;
    hud.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) this.key({ code: b.dataset.k }); });   // (the keys as buttons, for touch)
    const menu = document.createElement('div'); menu.id = 'robomenu'; menu.hidden = true;
    menu.innerHTML = `<div class="rm-panel" role="dialog" aria-label="ロボタクシーの行き先"><div class="rm-head"><span class="rm-title"><span class="rb-lamp"></span>ロボタクシー · どこへ行きますか？</span><button class="rm-close" aria-label="閉じる">×</button></div>
      <ul class="rm-list"></ul><div class="rm-hint">数字キーか、クリックで選べます · 車はいちばん近い道の路肩に迎えに来ます · <kbd>T</kbd> / <kbd>Esc</kbd> で閉じる</div></div>`;
    document.body.appendChild(menu); this.menuEl = menu;
    menu.querySelector('.rm-close').addEventListener('click', () => this.closeMenu());
    menu.addEventListener('click', (e) => { if (e.target === menu) this.closeMenu(); });
  }
  drawHud() {
    const v = this.v, q = (s) => this.hud.querySelector(s); if (!v) return;
    this.hud.hidden = false;
    const P = this.player.pos, far = Math.hypot(v.x - P.x, v.z - P.z);
    const st = { coming: '迎車中', waiting: '到着・乗車待ち', riding: '走行中', arrived: '到着' }[this.state];
    q('.rb-state').textContent = st; q('.rb-dest').textContent = `→ ${this.dest.label}`;
    let meta = '', next = '', keys = '';
    if (this.state === 'coming') {
      const sec = this.eta(v, this.pick.ln.link, this.pick.u);
      meta = `あと約 ${sec > 90 ? Math.round(sec / 60) + ' 分' : Math.max(5, Math.round(sec / 5) * 5) + ' 秒'} · ${Math.round(far)} m 先`;
      next = 'ピンの立っている路肩で待っていてください'; keys = `${this.btn('KeyX', 'X', `早送り ×${SCALES[this.scaleI]}`)} ${this.btn('KeyT', 'T', 'キャンセル')}`;
    } else if (this.state === 'waiting') {
      meta = `${Math.round(far)} m 先に停車中`; next = 'E で乗車（ドアまで歩いても乗れます）'; keys = `${this.btn('KeyE', 'E', '乗車')} ${this.btn('KeyT', 'T', 'キャンセル')}`;
    } else {
      const goal = v.plan && v.plan.length ? v.plan[v.plan.length - 1] : null, last = this.route[this.route.length - 1];
      const left = goal ? this.left(v, last.k.ln.link, last.k.u) : Math.max(0, (v.stops[0] ? v.stops[0].u - v.u : 0));
      const sec = goal ? this.eta(v, last.k.ln.link, last.k.u) : left / 5;
      meta = `${(v.v * 3.6).toFixed(0)} km/h · 残り ${left > 950 ? (left / 1000).toFixed(1) + ' km' : Math.round(left / 10) * 10 + ' m'} · 約 ${Math.max(1, Math.ceil(sec / 60))} 分`;
      next = this.state === 'arrived' ? '降車します' : this.nextTurn(v);
      keys = `${this.btn('KeyV', 'V', `視点：${MODE_NAME[MODES[this.mode]]}`)} ${this.btn('KeyX', 'X', `早送り ×${SCALES[this.scaleI]}`)} ${this.btn('KeyE', 'E', 'ここで降りる')}`;
      if (this.map.open) this.map.setRoute(this.path(v));
    }
    q('.rb-meta').textContent = meta; q('.rb-next').textContent = next;
    if (this._keys !== keys) { q('.rb-keys').innerHTML = keys; this._keys = keys; }
  }
  btn(code, key, label) { return `<button class="rb-btn" data-k="${code}"><kbd>${key}</kbd> ${label}</button>`; }
  /** Seconds (of city time) from v to u along link L, by the traffic's reckoning. */
  eta(v, L, u) {
    const D = this.T.timeTo(L, false), el = v.el, rest = (x) => x / Math.max(3, L.vmax * 0.8);
    if (el.link) return el.link === L && u >= v.u ? rest(u - v.u) : (el.len - v.u) / Math.max(3, el.link.vmax * 0.8) + Math.min(...el.out.map(c => c.len / Math.max(2, c.vmax) + D[c.to.link.id])) + rest(u);
    return (el.len - v.u) / Math.max(2, el.vmax) + D[el.to.link.id] + rest(u);
  }
  /** Metres by road from v to u along link L. */
  left(v, L, u) {
    const D = this.T.distTo(L, false), el = v.el;
    if (el.link) return el.link === L && u >= v.u ? u - v.u : (el.len - v.u) + Math.min(...el.out.map(c => c.len + D[c.to.link.id])) + u;
    return el.len - v.u + D[el.to.link.id] + u;
  }
  /** The way ahead of v: [{ c (connector), d (metres to it) }…], as the traffic will choose it. */
  ahead(v, n = 30) {
    const out = [], goal = v.plan && v.plan[0]; let el = v.el, d = el.len - v.u, c = el.link ? v.next : el;
    if (!el.link) { out.push({ c: el, d: 0 }); d = el.len - v.u; el = el.to; c = null; }
    const D = goal ? this.T.distTo(goal, false) : null;
    for (let i = 0; i < n && el; i++) {
      if (!c) { if (!D || el.link === goal) break; let best = Infinity; for (const l of el.link.lanes) for (const k of l.out) { const x = k.len + D[k.to.link.id]; if (x < best) { best = x; c = k; } } if (!c) break; }
      out.push({ c, d }); d += c.len + c.to.len; el = c.to; c = null;
    }
    return out;
  }
  nextTurn(v) {
    for (const { c, d } of this.ahead(v)) {
      if (d > 600) break;
      if (c.kind !== 'S') return d < 25 ? `まもなく${TURN[c.kind]}します` : `${Math.round(d / 10) * 10} m 先 ${TURN[c.kind]}`;
    }
    return '道なりに進みます';
  }
  /** The route ahead as points (for the map). */
  path(v) {
    const pts = [[v.x, v.z]];
    for (const { c } of this.ahead(v, 60)) { for (const p of c.pts) pts.push(p); const L = c.to.link, o = {}; this.T.pos(c.to, c.to.len, o); pts.push([o.x, o.z]); if (pts.length > 900) break; }
    return pts;
  }
}
