// Sanity report for the city plan (no GPU): lines, stations, roads, crossings and clearances.
// usage: node tools/plan-check.mjs [--all]   (--all also lists every road × road intersection)
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = await import(pathToFileURL(path.join(root, 'src/plan/index.js')).href);
const { computeCrossings, CROSSING_LABEL } = await import(pathToFileURL(path.join(root, 'src/plan/crossings.js')).href);
const { LINES, LINE, STATIONS, ROADS, MAP, heightAt } = plan;
const ALL = process.argv.includes('--all');
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const inMap = (x, z) => x >= MAP.x0 && x <= MAP.x1 && z >= MAP.z0 && z <= MAP.z1;
let problems = 0;
const warn = (m) => { problems++; console.log(`  ⚠ ${m}`); };

console.log('== lines');
for (const L of LINES) {
  const A = L.align; let inside = 0;
  for (let s = 0; s < A.length; s += 5) { const q = A.at(s); if (inMap(q.x, q.z)) inside += 5; }
  const g = L.profile.maxGrade(10);
  console.log(`${L.name} (${L.operator}) — ${f1(inside / 1000)} km in the map, min radius ${Number.isFinite(A.minRadius) ? A.minRadius.toFixed(0) + ' m' : 'straight'}, max grade ${g.permille.toFixed(0)}‰`);
  for (const w of A.warnings) warn(w);
  const lim = { jr: 25, private: 35, metro: 35, tram: 67, agt: 60 }[L.kind];
  if (g.permille > lim + 0.5) { const q = A.at(g.s); warn(`${L.name}: grade ${g.permille.toFixed(0)}‰ > ${lim}‰ at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})`); }
  const rmin = { jr: 400, private: 160, metro: 160, tram: 25, agt: 30 }[L.kind];
  if (A.minRadius < rmin) warn(`${L.name}: radius ${A.minRadius.toFixed(0)} m < ${rmin} m`);
  const st = STATIONS.filter(s => s.line === L.id).sort((a, b) => a.s - b.s);
  let prev = null;
  for (const s of st) {
    const gap = prev ? ` +${f1((s.s - prev.s) / 1000)} km` : '';
    console.log(`   ${s.name.padEnd(8, '　')} ${s.level.padEnd(11)} rail ${f1(s.y).padStart(6)} m  ground ${f1(heightAt(s.x, s.z)).padStart(5)} m  ${s.platform} ${s.len} m${gap}`);
    if (!inMap(s.x, s.z)) warn(`${s.name} is outside the map`);
    // platform must lie on a gentle curve (heavy rail ≥ 400 m, others ≥ 100 m)
    for (let t = -s.len / 2; t <= s.len / 2; t += 10) {
      const k = Math.abs(L.align.at(s.s + t).k);
      if (k > 0 && 1 / k < (L.kind === 'jr' ? 400 : L.kind === 'tram' ? 25 : 100)) { warn(`${s.name} platform on a ${(1 / k).toFixed(0)} m curve`); break; }
    }
    prev = s;
  }
}

console.log('\n== roads');
for (const R of ROADS) {
  const g = R.profile.maxGrade(10);
  console.log(`${R.name.padEnd(16, '　')} ${R.cls.padEnd(10)} ${f1(R.align.length / 1000)} km, min radius ${Number.isFinite(R.align.minRadius) ? R.align.minRadius.toFixed(0) + ' m' : 'straight'}, max grade ${(g.permille / 10).toFixed(1)}%`);
  for (const w of R.align.warnings) warn(w);
  const lim = { expressway: 50, ramp: 60, national: 50, arterial: 60, collector: 80, old: 80, street: 120 }[R.cls];
  if (g.permille > lim + 0.5) { const q = R.align.at(g.s); warn(`${R.name}: grade ${(g.permille / 10).toFixed(1)}% at (${q.x.toFixed(0)}, ${q.z.toFixed(0)})`); }
}

console.log('\n== crossings');
const X = computeCrossings().filter(c => inMap(c.x, c.z));
const nameOf = (id) => LINE[id]?.name || ROADS.find(r => r.id === id)?.name || { river: '澪川', canal: '汐見運河', valley: '鈴音川' }[id] || id;
const byType = {};
for (const c of X) (byType[c.type] = byType[c.type] || []).push(c);
for (const [type, list] of Object.entries(byType)) {
  console.log(`-- ${CROSSING_LABEL[type] || type} (${list.length})`);
  if (type === 'intersection' && !ALL) { console.log('   (use --all to list)'); continue; }
  for (const c of list) {
    const rel = type === 'grade-separated' ? `${nameOf(c.upper)} over ${nameOf(c.lower)}, clearance ${f1(c.clearance)} m`
      : type === 'bridge' || type === 'tunnel' ? `${nameOf(c.a)} ${type === 'bridge' ? 'over' : 'under'} ${nameOf(c.b)} (${f1(c.ya)} m, margin ${f1(c.clearance)} m)`
      : `${nameOf(c.a)} × ${nameOf(c.b)} at ${f1(c.ya)} m`;
    console.log(`   (${c.x.toFixed(0)}, ${c.z.toFixed(0)}) ${rel}${c.ok ? '' : '  ⚠'}${c.note ? ' — ' + c.note : ''}`);
    if (!c.ok) problems++;
  }
}
console.log(`\nRESULT: ${problems ? problems + ' problem(s)' : 'OK'}`);
