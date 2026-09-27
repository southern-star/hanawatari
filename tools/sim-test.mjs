// Run the traffic and the people for a while at a place, headless, and report what they did.
// usage: node tools/sim-test.mjs [x,z,seconds]      e.g. node tools/sim-test.mjs -300,-150,60   (the station)
//  • vehicles: count, mean speed, stuck > 60 s, red-light runs, overlapping vehicles
//  • people: count by kind and where they are, crossing on a red walk light, cars over people, the longest wait
//  • ms per simulation step for each
import { serve, launch, openCity } from './lib/headless.mjs';

const [px, pz, secs] = (process.argv[2] || '-47,-126,90').split(',').map(Number);
const { server, port } = await serve();
const browser = await launch({ width: 640, height: 400 });
try {
  const { page, logs } = await openCity(browser, port, `${px},${pz},0,0`);
  const res = await page.evaluate((secs) => {
    const T = window.__traffic, Pd = window.__peds, S = window.__ctx, P = S.player.position, sig = T.signals;
    let t = S.time || 0, msT = 0, msP = 0, redRun = 0, overlaps = 0, hits = 0, redCross = 0, maxWait = 0, nan = 0;
    const waits = new Map(), hitAt = [], ovAt = [], nm = (el) => el.link ? (el.link.name || el.link.way.id) + (el.link.dir < 0 ? '-' : '') : 'c:' + (el.from.link.name || el.from.link.way.id) + '>' + (el.to.link.name || el.to.link.way.id);
    for (let i = 0; i < secs * 10; i++) {
      const a = performance.now(); T.update(0.1, t, P); if (window.__rotary) window.__rotary.update(0.1); const b = performance.now(); Pd.update(0.1, t, P); const c = performance.now();
      msT += b - a; msP += c - b; t += 0.1;
      for (const v of T.veh) {
        const L = v.el.link;
        if (L && L.control === 'signal') { const was = v._pu ?? v.u; if (was <= L.stopAt && v.u > L.stopAt && sig.vehState(L.node.id, L.group, t - 1.2) === 'r' && sig.vehState(L.node.id, L.group, t) === 'r') redRun++; }
        v._pu = v.u; if (v._pel !== v.el) { v._pu = -1; v._pel = v.el; }
      }
      if (i % 10 === 0) for (let x = 0; x < T.veh.length; x++) for (let y = x + 1; y < T.veh.length; y++) { const A = T.veh[x], B = T.veh[y]; if (Math.hypot(A.x - B.x, A.z - B.z) < 1.6) { overlaps++; if (ovAt.length < 10) ovAt.push(`${A.name}#${A.id}@${nm(A.el)} u${A.u.toFixed(1)} v${A.v.toFixed(1)} / ${B.name}#${B.id}@${nm(B.el)} u${B.u.toFixed(1)} v${B.v.toFixed(1)} (${A.x.toFixed(0)},${A.z.toFixed(0)}) t${(i / 10).toFixed(0)}`); } }
      if (i % 5 === 0) for (const p of Pd.peds) {
        if (!isFinite(p.x) || !isFinite(p.z)) nan++;
        for (const v of T.veh) {
          if (Math.abs(v.x - p.x) > 6 || Math.abs(v.z - p.z) > 6) continue;
          const hx = Math.sin(v.yaw), hz = Math.cos(v.yaw), o = v.fo + v.wb / 2 - v.L / 2, dx = p.x - v.x - hx * o, dz = p.z - v.z - hz * o;
          if (Math.abs(dx * hx + dz * hz) < v.L / 2 && Math.abs(-dx * hz + dz * hx) < v.W / 2 && Math.abs(p.y - v.y) < 2) { hits++; if (hitAt.length < 12) hitAt.push(`${v.name}@${v.el.link ? v.el.link.name || v.el.link.way.id : 'c:' + (v.el.from.link.name || v.el.from.link.way.id) + '>' + (v.el.to.link.name || v.el.to.link.way.id)} ped:${p.e.kind}/${p.state} (${p.x.toFixed(1)},${p.z.toFixed(1)}) v${v.v.toFixed(1)}`); }
        }
        if (p.state === 'wait') { const w = (waits.get(p) || 0) + 0.5; waits.set(p, w); maxWait = Math.max(maxWait, w); } else waits.delete(p);
        if (p.state === 'cross' && p.e.zone && p.e.zone.kind === 'zebra' && !p._cz) { p._cz = 1; if (sig.pedState(p.e.zone.nd.id, p.e.zone.group, t) === 'stop') redCross++; }
        if (p.state !== 'cross') p._cz = 0;
      }
    }
    const count = (arr, f) => { const o = {}; for (const x of arr) { const k = f(x); o[k] = (o[k] || 0) + 1; } return o; };
    const sp = T.veh.map(v => v.v);
    return {
      vehicles: { n: T.veh.length, meanKmh: +(sp.reduce((a, b) => a + b, 0) / Math.max(1, sp.length) * 3.6).toFixed(1), stuck60s: T.veh.filter(v => v.stopped > 60 && !(v.station && v.station.inside)).length, waitingInStation: T.veh.filter(v => v.stopped > 60 && v.station && v.station.inside).length, redRuns: redRun, overlaps, ovAt, msPerStep: +(msT / (secs * 10)).toFixed(2), types: count(T.veh, v => v.name) },
      rotary: window.__rotary && window.__rotary.on ? { ...window.__rotary.stats(), stuck: T.veh.filter(v => v.station && v.stopped > 60 && !(v.stops && v.stops[0] && v.stops[0].at) && !(v.station.kind === 'taxi')).map(v => v.name + '@' + (v.el.link ? v.el.link.name || v.el.link.way.id : 'c') + ':' + v.u.toFixed(1)) } : null,
      people: { n: Pd.peds.length, actors: Pd.actors.length, regulars: Pd.fixed.length, states: Pd.stats(), kinds: count(Pd.peds, p => p.bike ? 'bike' : p.L.kind), on: count(Pd.peds, p => p.e.kind), redWalkCrossings: redCross, carsOverPeople: hits, hitAt, maxWaitS: maxWait, nan, msPerStep: +(msP / (secs * 10)).toFixed(2) },
    };
  }, secs);
  console.log(JSON.stringify(res, null, 1));
  if (logs.length) console.log(logs.slice(0, 10).join('\n'));
} finally { await browser.close(); server.close(); }
