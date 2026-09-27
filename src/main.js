// 花渡市 bootstrap: renderer & post-processing, sky, player, the city world (plan → global layers → streamed
// chunks), main loop and HUD. Same platform as 桜ヶ丘駅: plain three.js, no build step, everything procedural.
import * as THREE from 'three';
import * as PLAN from './plan/index.js';
import { groundAt } from './plan/ground.js';
import { createContext } from './core/ctx.js';
import { createRenderPipeline } from './core/renderer.js';
import { createSky } from './core/sky.js';
import { Player } from './core/player.js';
import { createAudio } from './core/audio.js';
import { World } from './city/world.js';
import { Trains } from './city/trains.js';
import { createMap } from './ui/map.js';
import { LevelCrossings } from './city/fumikiri.js';
import { Signals } from './city/signals.js';
import { Traffic } from './city/traffic.js';
import { Pedestrians } from './city/pedestrians.js';
import { Rotary } from './city/rotary.js';
import { RoboTaxi } from './city/robotaxi.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
let world = null, trains = null, map = null, crossings = null, signals = null, traffic = null, peds = null, rotary = null, robo = null;
const $ = (id) => document.getElementById(id);
const SUN_DIR = [-0.776, 0.517, 0.362];   // from the west-south-west, ~31° up: a spring afternoon around 16:00

const isTouch = matchMedia('(pointer: coarse)').matches;
const QUALITY = {
  high: { name: 'high', pixelRatio: Math.min(devicePixelRatio, 1.5), msaa: 4, shadowMap: 4096, shadowSize: 75, petals: 1.0, radius: 320 },
  medium: { name: 'medium', pixelRatio: Math.min(devicePixelRatio, 1.0), msaa: 4, shadowMap: 2048, shadowSize: 60, petals: 0.6, radius: 260 },
  low: { name: 'low', pixelRatio: Math.min(devicePixelRatio, 0.75), msaa: 0, shadowMap: 2048, shadowSize: 45, petals: 0.35, radius: 200 },
};
let qName = params.get('q') || (() => { try { return localStorage.getItem('hanawatari.q'); } catch (e) { return null; } })() || (isTouch ? 'medium' : 'high');
if (!QUALITY[qName]) qName = 'high';
const quality = { ...QUALITY[qName] };
if (SHOT) quality.pixelRatio = 1;

// ------------------------------------------------------------------ renderer & scene
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: SHOT });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.2, 3200);
const sunDir = new THREE.Vector3(...SUN_DIR).normalize();
const sky = createSky(scene, sunDir, quality);
scene.fog.density = 0.0016;                       // a big city: see further than the original town
const pipeline = createRenderPipeline(renderer, quality);
const audio = createAudio();
const ctx = createContext({ scene, camera, renderer, audio, quality, sunDir, layout: PLAN, heightAt: groundAt });
ctx.sky = sky; ctx.pipeline = pipeline;
window.__ctx = ctx; window.THREE = THREE; window.PLAN = PLAN;

function resize() {
  const w = SHOT ? Number(params.get('w') || 1280) : innerWidth, h = SHOT ? Number(params.get('h') || 720) : innerHeight;
  renderer.setSize(w, h, !SHOT);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pipeline.setSize(w, h, quality.pixelRatio);
  ctx.wires.setResolution(pipeline.size.x, pipeline.size.y);
  ctx.renderSize = pipeline.size;
  if (world) for (const ch of world.chunks.values()) ch.group.traverse(o => { if (o.name === 'wires') o.material.uniforms.uRes.value.copy(pipeline.size); });
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ fonts
async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const faces = ['700 32px "Noto Sans JP"', '400 32px "Noto Sans JP"', '900 32px "Noto Sans JP"', '700 32px "Zen Maru Gothic"'];
  await Promise.race([Promise.all(faces.map(f => document.fonts.load(f, '花渡駅はなわたりHanawatari').catch(() => null))), new Promise(r => setTimeout(r, 6000))]);
}

// ------------------------------------------------------------------ places (number keys, map later)
const VIEWS = {
  Digit1: { x: -818, z: 150, yaw: -84, pitch: -6, label: '見晴台公園' },
  Digit2: { x: -268, z: -60, yaw: 100, pitch: 4, label: '花渡駅 東口' },
  Digit3: { x: -150, z: -816, yaw: -78, pitch: 0, label: '桜堤' },
  Digit4: { x: 380, z: 18, yaw: 88, pitch: 2, label: '本町 ダイヤモンドクロス' },
  Digit5: { x: -248, z: 330, yaw: 2, pitch: 2, label: '宿場町通り' },
  Digit6: { x: 1040, z: 140, yaw: 4, pitch: 2, label: '汐見運河' },
  Digit7: { x: -1050, z: 293, yaw: -78, pitch: 2, label: '鈴音川の谷' },
  Digit8: { x: -540, z: 1164, yaw: 90, pitch: 3, label: '南花渡の踏切' },
  Digit9: { x: 20, z: -1341, yaw: -88, pitch: 4, label: '北花渡' },
};
const START = VIEWS.Digit1;

// ------------------------------------------------------------------ build
const errors = []; window.__errors = errors;
const stats = { modules: {} }; window.__stats = stats;
function setProgress(frac, label) {
  const bar = $('bar'); if (bar) bar.style.transform = `scaleX(${frac})`;
  const lab = $('loadlabel'); if (lab && label !== undefined) lab.textContent = label;
}
const player = new Player(camera, canvas, ctx.physics, PLAN.MAP);
ctx.playerObj = player;

async function build() {
  await loadFonts();
  setProgress(0.05, '街の区画を計画中…');
  await new Promise(r => setTimeout(r, 0));
  const t0 = performance.now();
  world = new World(ctx, { radius: quality.radius });
  window.__world = world;
  stats.modules.plan = { ms: Math.round(performance.now() - t0), ...world.U.stats };
  const steps = ['地形', '川と運河', '高架・橋・ホーム', '街並み', '並木', '駅前広場'];
  let i = 0;
  await world.buildGlobal((label) => { setProgress(0.15 + 0.6 * (i++ / steps.length), `${label}を準備中…`); });
  stats.modules.global = world.stats.global;
  { const t2 = performance.now(); trains = new Trains(ctx); scene.add(trains.root); window.__trains = trains; crossings = new LevelCrossings(ctx, trains); scene.add(crossings.root); signals = new Signals(ctx, world.U.net, world.U.raster); scene.add(signals.root); stats.modules.global['電車・踏切'] = Math.round(performance.now() - t2); }
  { const t3 = performance.now(); traffic = new Traffic(ctx, { signals, crossings }); scene.add(traffic.root); window.__traffic = traffic; stats.modules.global['交通'] = Math.round(performance.now() - t3); }
  { const t4 = performance.now(); peds = new Pedestrians(ctx, { signals, traffic, crossings }); scene.add(peds.root); window.__peds = peds; traffic.peds = peds; traffic.peopleLook = (role) => peds.look(role); rotary = new Rotary(ctx, traffic, peds); window.__rotary = rotary; stats.modules.global['歩行者'] = Math.round(performance.now() - t4); }
  setProgress(0.8, 'まわりの街を組み立て中…');
  await new Promise(r => setTimeout(r, 0));
  const t1 = performance.now();
  const cam = params.get('cam') ? params.get('cam').split(',').map(Number) : null;
  const sx = cam ? cam[0] : START.x, sz = cam ? (cam.length === 4 ? cam[1] : cam[2]) : START.z;
  world.update(sx, sz, Infinity);
  stats.modules.chunks = { ms: Math.round(performance.now() - t1), n: world.chunks.size };
  try { renderer.compile(scene, camera); } catch (e) { console.warn(e); }
  setProgress(1, '');
}

function parseCam(s) {
  const v = s.split(',').map(Number);
  if (v.length === 4) player.setPose(v[0], v[1], v[2], v[3]);
  else if (v.length >= 5) player.setPose(v[0], v[2], v[3], v[4], v[1]);
}
window.__setCam = (x, y, z, yaw, pitch) => {
  if (world) world.update(x, z, Infinity);
  if (y === null || y === undefined) player.setPose(x, z, yaw, pitch); else player.setPose(x, z, yaw, pitch, y);
};

// ------------------------------------------------------------------ simulation
let simT = params.has('t') ? Number(params.get('t')) : 0;
function stepUpdates(dt, t) {
  ctx.time = t; ctx.shared.uTime.value = t;
  ctx.shared.uGust.value = 0.5 + 0.28 * Math.sin(t * 0.37) + 0.14 * Math.sin(t * 1.13 + 1.7) + 0.08 * Math.sin(t * 2.9 + 0.4);
  ctx.player.position.copy(player.pos);
  if (trains) trains.update(t);
  if (crossings) crossings.update(t, dt);
  if (signals) signals.update(t);
  if (traffic) traffic.update(dt, t, ctx.player.position);
  if (rotary) rotary.update(dt);
  if (peds) peds.update(dt, t, ctx.player.position);
  if (robo) robo.update(dt);
  for (const fn of ctx._updates) { try { fn(dt, t); } catch (e) { if (!fn.__err) { fn.__err = 1; console.error('update error', e); errors.push({ module: 'update', message: String(e && e.stack || e) }); } } }
}
/** GPU benchmark: renders n frames back-to-back (forcing sync) and returns ms/frame + counts. */
window.__bench = (n = 30) => {
  const gl = renderer.getContext(); const px = new Uint8Array(4);
  pipeline.render(scene, camera, sunDir, simT); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { renderer.info.reset(); sky.update(simT, camera); pipeline.render(scene, camera, sunDir, simT); }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = (performance.now() - t0) / n;
  return { ms: +ms.toFixed(2), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length, chunks: world ? world.chunks.size : 0 };
};
/** Debug: advance the simulation by n steps of dt (for frame-by-frame captures). */
window.__step = (dt, n = 1) => {
  for (let i = 0; i < n; i++) { simT += dt; stepUpdates(dt, simT); }
  if (robo && robo.riding && world) { world.update(player.pos.x, player.pos.z, Infinity); ctx.physics.refreshDynamic(); }   // (a ride in a capture)
};
window.__sim = (target) => { let t = 0; const dt = 1 / 30; while (t < target) { stepUpdates(dt, t); t += dt; } simT = target; stepUpdates(0, simT); };

// ------------------------------------------------------------------ HUD
let areaName = '';
let toastTimer = 0;
function showToast(name) {
  const el = $('toast'); if (!el) return;
  el.querySelector('.t-name').textContent = name;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}
let hudN = 0;
function hudTick(t) {
  if ((hudN++ & 15) === 0 && world) {
    const n = world.placeAt(player.pos.x, player.pos.z);
    if (n && n !== areaName) { areaName = n; if (started) showToast(n); }
  }
  const clock = $('clock');
  if (clock) { const m = 2 + Math.floor(t / 60); clock.textContent = `16:${String(Math.min(59, m)).padStart(2, '0')}`; }
}

// ------------------------------------------------------------------ main loop
let started = false, last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (SHOT) dt = 0;
  if (!SHOT && !(robo && robo.riding)) player.update(dt);
  if (!SHOT && world) world.update(player.pos.x, player.pos.z, 5);
  ctx.physics.refreshDynamic();
  // (riding the robotaxi with fast-forward on: the world runs faster, in small steps)
  const k = robo ? robo.scale : 1, n = k > 1 ? Math.ceil(dt * k / 0.05) : 1;
  for (let i = 0; i < n; i++) { simT += dt * k / n; stepUpdates(dt * k / n, simT); }
  try { audio.update(camera, dt); } catch (e) { if (!audio.__err) { audio.__err = 1; console.error('audio', e); } }
  sky.update(simT, camera);
  renderer.info.reset();
  pipeline.render(scene, camera, sunDir, simT);
  if (!SHOT) hudTick(simT);
  if (map && map.open) map.update();
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; const s = $('stats'); if (s && !s.hidden) s.textContent = `${fps.toFixed(0)} fps · ${renderer.info.render.calls} calls · ${(renderer.info.render.triangles / 1e6).toFixed(2)}M tris · ${world ? world.chunks.size : 0} chunks`; }
  stats.fps = fps; stats.calls = renderer.info.render.calls; stats.triangles = renderer.info.render.triangles;
}

function travel(v) {
  player.fly = false; player.vel.set(0, 0, 0);
  world.update(v.x, v.z, Infinity);
  player.setPose(v.x, v.z, v.yaw ?? 0, v.pitch ?? 0);
  const n = v.label || world.placeAt(v.x, v.z); if (n) { areaName = n; showToast(n); }
}

function start() {
  if (started) { player.requestLock(); return; }
  started = true;
  player.enabled = true;
  document.body.classList.add('playing');
  player.requestLock();
  try { audio.start(); } catch (e) { console.warn(e); }
  showToast(world.placeAt(player.pos.x, player.pos.z) || '花渡市');
}

async function main() {
  try { await build(); } catch (e) { console.error(e); errors.push({ module: 'build', message: String(e && e.stack || e) }); }
  // the robotaxi (the map comes later: reach it when it's there)
  const mapProxy = { pick: (t, cb) => map && map.pick(t, cb), setRoute: (p) => map && map.setRoute(p), setOpen: (v) => map && map.setOpen(v), get open() { return !!(map && map.open); } };
  if (traffic) { robo = new RoboTaxi(ctx, { traffic, player, places: Object.values(VIEWS), toast: showToast, map: mapProxy, placeAt: (x, z) => world.placeAt(x, z) }); window.__robo = robo; }
  if (params.get('cam')) parseCam(params.get('cam')); else player.setPose(START.x, START.z, START.yaw, START.pitch);
  if (params.has('fly')) player.fly = true;
  window.__sim(simT);
  sky.update(simT, camera);
  requestAnimationFrame(frame);
  if (SHOT) {
    document.body.classList.add('shot');
    let n = 0; const wait = () => { if (++n > 6) { window.__ready = true; } else requestAnimationFrame(wait); }; requestAnimationFrame(wait);
    return;
  }
  document.body.classList.add('loaded');
  const go = $('go'); if (go) { go.disabled = false; go.focus(); go.addEventListener('click', start); }
  canvas.addEventListener('click', () => { if (started) player.requestLock(); });
  document.addEventListener('pointerlockchange', () => { document.body.classList.toggle('locked', document.pointerLockElement === canvas); });
  addEventListener('keydown', (e) => {
    if (e.code === 'Enter' && !started) start();
    if (!started) return;
    if (robo && !(map && map.open) && robo.key(e)) { e.preventDefault(); return; }
    if (e.code === 'KeyH') document.body.classList.toggle('noui');
    if (e.code === 'KeyM') { audio.muted = !audio.muted; const b = $('mute'); if (b) b.setAttribute('aria-pressed', String(audio.muted)); }
    if (e.code === 'KeyR') { if (robo && robo.riding) return; player.setPose(START.x, START.z, START.yaw, START.pitch); }
    if (e.code === 'Backquote') { const s = $('stats'); if (s) s.hidden = !s.hidden; }
    const v = VIEWS[e.code];
    if (v && !(map && map.open) && !(robo && robo.riding)) travel(v);
    const riding = robo && robo.riding;
    if (e.code === 'Tab') { e.preventDefault(); map.toggle(); player.enabled = !map.open && !riding; if (map.open && document.pointerLockElement) document.exitPointerLock(); }
    if (e.code === 'Escape' && map.open) { map.setOpen(false); player.enabled = !riding; }
  });
  map = createMap({ plan: PLAN, urban: world.U, player, places: Object.values(VIEWS), onTravel: (p) => { if (robo && robo.riding) return; travel(p); map.setOpen(false); player.enabled = true; } });
  const roboBtn = $('roboBtn'); if (roboBtn) roboBtn.addEventListener('click', () => { if (started) robo.key({ code: 'KeyT' }); });
  const mapBtn = $('mapBtn'); if (mapBtn) mapBtn.addEventListener('click', () => { if (!started) return; map.toggle(); player.enabled = !map.open; });
  const q = $('quality');
  if (q) { q.value = qName; q.addEventListener('change', () => { try { localStorage.setItem('hanawatari.q', q.value); } catch (e) {} location.reload(); }); }
  const mute = $('mute'); if (mute) mute.addEventListener('click', () => { audio.muted = !audio.muted; mute.setAttribute('aria-pressed', String(audio.muted)); });
  if (params.has('stats')) $('stats').hidden = false;
  if (errors.length) console.warn('errors', errors);
}
main();
