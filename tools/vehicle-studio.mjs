// Close-ups of vehicle models, each alone on a cleared road, from four sides:
// node tools/vehicle-studio.mjs shots/city/st "sedan:#a8232a,bus:#f1ecdf" [distance]   → shots/city/st_<model>_0..3.png
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from './lib/headless.mjs';

const [out, list, dist = '5.2'] = process.argv.slice(2);
if (!out || !list) { console.log('usage: node tools/vehicle-studio.mjs outPrefix "model:#colour,…" [distance]'); process.exit(1); }
const px = -41.5, pz = -392, D = +dist;
for (const [name, col] of list.split(',').map(s => s.split(':'))) {
  const cams = [[0.55, 0.85, 1.5], [-0.8, 0.6, 1.7], [0.7, -0.7, 1.6], [1, 0.05, 1.3]].map(([ax, az, h]) => {
    const cx = px + ax * D, cz = pz + az * D, yaw = Math.atan2(-(px - cx), -(pz - cz)) * 180 / Math.PI;
    return `${cx.toFixed(2)},${h},${cz.toFixed(2)},${yaw.toFixed(1)},-9`;
  }).join(';');
  const ev = `(() => { const T = window.__traffic; T.freeze(); T.parked.length = 0; window.__peds && window.__peds.freeze(); T.addParked("${name}", ${px}, ${pz}, 0, "${col || '#f4f4f0'}"); })()`;
  const r = execFileSync('node', [path.join(root, 'tools/shot.mjs'), '--eval', ev, '--cams', cams, '--t', '5', '--out', `${out}_${name}`, '--quiet'], { cwd: root, encoding: 'utf8', timeout: 600000 });
  console.log(r.split('\n').filter(l => /saved|rror/.test(l)).join('\n'));
}
