// 花渡市（仮）— road network skeleton: the expressway, the national road, arterials and the collectors that give
// each district its shape. Local streets and alleys are generated later, per district. Heights = road surface.
// 'r' anchors in a profile pin bridges and cuttings to the ground height at that point (see geom.Profile).
import { Alignment, Profile } from './geom.js';
import { heightAt } from './terrain.js';

/** cls: 'expressway' | 'ramp' | 'national' | 'arterial' | 'collector' | 'old' | 'street'.
 *  w = total width incl. sidewalks (m); lanes = total traffic lanes (left-hand traffic). */
export const ROADS = [];
function road(def, pts, prof = [{ s: 0, y: 'g' }]) {
  const align = new Alignment(pts, { name: def.id });
  const r = { ...def, align, profile: new Profile(align, prof, { groundAt: heightAt, off: 0 }) };
  ROADS.push(r); return r;
}

// ---- 都市高速 花渡線 (elevated over the north floodplain, +22 m) and its branch over the 汐見運河
road({ id: 'expwy', name: '都市高速 花渡線', cls: 'expressway', w: 26, lanes: 4 },
  [[-6000, -1310], [-1900, -1175, 3000], [-1100, -1115, 2000], [-450, -1095, 3000], [150, -1105, 3000], [750, -1037, 2000], [1250, -957, 2000], [1900, -897, 3000], [6000, -710]],
  [{ s: 0, y: 22 }, { p: [6000, -710], y: 22 }]);
road({ id: 'expwy-canal', name: '都市高速 汐見線', cls: 'expressway', w: 18, lanes: 2 },
  [[700, -1045], [1000, -980, 230], [1075, -700, 600], [1072, 300, 1000], [1120, 1800]],
  [{ s: 0, y: 22 }, { p: [1075, -760], y: 22 }, { p: [1074, -400], y: 13 }, { p: [1073, -130], y: 19 }, { p: [1073, 120], y: 19 }, { p: [1074, 400], y: 13 }, { p: [1120, 1800], y: 13 }]);
road({ id: 'ramp-off', name: '花渡出口', cls: 'ramp', w: 9, lanes: 1 },                     // passes over 花渡ライナー and 北岸通り
  [[-500, -1098], [-230, -1140, 200], [-100, -1240, 150], [-92, -1600]],
  [{ s: 0, y: 22 }, { p: [-264, -1135], y: 20 }, { p: [-92, -1346], y: 6.9 }, { p: [-92, -1560], y: 'g' }]);
road({ id: 'ramp-on', name: '花渡入口', cls: 'ramp', w: 9, lanes: 1 },
  [[-8, -1600], [-6, -1240, 150], [120, -1135, 200], [400, -1108]],
  [{ s: 0, y: 'g' }, { p: [-8, -1560], y: 'g' }, { p: [-6, -1346], y: 6.9 }, { p: [400, -1108], y: 22 }]);

// ---- 国道 花渡街道 (6 lanes + median; 花渡大橋 over the river)
road({ id: 'kokudo', name: '花渡街道（国道）', cls: 'national', w: 40, lanes: 6, median: 4 },
  [[-70, -1800], [-50, -1000, 3000], [-45, 400, 3000], [-30, 1800]],
  [{ s: 0, y: 'g' }, { p: [-62, -1500], y: 'g' }, { p: [-60, -1346], y: 6.9 }, { p: [-56, -1190], y: 9 }, { p: [-47, -770], y: 9 }, { p: [-44, -560], y: 'g' }, { p: [-30, 1800], y: 'g' }]);

// ---- arterials
road({ id: 'kanjo', name: '花渡環状通り', cls: 'arterial', w: 30, lanes: 4, median: 2 },   // cuts down the scarp in a 切通し
  [[-1800, 565], [-1250, 550, 2000], [-600, 552, 3000], [-50, 560, 3000], [600, 562, 3000], [1070, 572, 2000], [1800, 590]],
  [{ s: 0, y: 'g' }, { p: [-1260, 550], y: 'g' }, { p: [-850, 552], y: 'r' }, { p: [-800, 552], y: 'g' }, { p: [1020, 570], y: 'g' }, { p: [1080, 572], y: 3.4 }, { p: [1140, 574], y: 'g' }]);
road({ id: 'kitadori', name: '花渡北通り', cls: 'arterial', w: 30, lanes: 4, median: 3 },     // 花渡ライナー above its median; from
  [[-230, -336], [-330, -336, 60], [-290, -600, 600], [-275, -779.5]]);                                     // 宿場町通り north to 河岸通り
road({ id: 'ekimae', name: '駅前通り・汐見通り', cls: 'arterial', w: 26, lanes: 4 },         // along the 汐見線 viaduct
  [[-262, -127], [120, -125, 1200], [700, -55, 1200], [1300, 55, 1200], [1800, 85]],
  [{ s: 0, y: 'g' }, { p: [1015, -15], y: 'g' }, { p: [1072, -4], y: 3.4 }, { p: [1130, 8], y: 'g' }]);

// ---- collectors and old roads
road({ id: 'shukuba', name: '宿場町通り', cls: 'old', w: 12, lanes: 2 },                    // the old post road to the ferry
  [[-255, -779.5], [-240, -400, 800], [-250, 0, 1000], [-232, 500, 800], [-262, 1100, 600], [-250, 1800]]);
road({ id: 'honcho', name: '本町通り', cls: 'collector', w: 22, lanes: 2 },                  // the tram street: from the foot of the
  [[-771.8, 230.4], [-690, 170, 80], [-620, 40, 60], [-520, 20, 60], [330, 20, 250], [700, 40, 300], [1045, 46]]);   // scarp (the tram's own track goes on up the valley) past the station
road({ id: 'kagan', name: '河岸通り', cls: 'collector', w: 14, lanes: 2 },                   // foot of the south levee
  [[-900, -800], [-450, -775, 2000], [150, -783, 2000], [750, -713, 1600], [1250, -633, 1600], [1800, -576]],
  [{ s: 0, y: 'g' }, { p: [1020, -672], y: 'g' }, { p: [1078, -660], y: 3.4 }, { p: [1135, -650], y: 'g' }]);
road({ id: 'miharashi-dori', name: '見晴台通り', cls: 'collector', w: 16, lanes: 2 },        // plateau main street; 鈴音橋 over the valley
  [[-1250, -830], [-1230, -300, 800], [-1262, 200, 800], [-1300, 800, 1000], [-1350, 1800]],
  [{ s: 0, y: 'g' }, { p: [-1262, 255], y: 'r' }, { p: [-1270, 405], y: 'r' }, { p: [-1275, 440], y: 'g' }]);
road({ id: 'miharashi-zaka', name: '見晴坂', cls: 'street', w: 8, lanes: 2 },               // steep (≈10 %) slope down the scarp in a
  [[-905, 46.5], [-726, -73]],                                                                  // cutting, from the plateau's streets to 崖下's
  [{ s: 0, y: 'r' }, { p: [-726, -73], y: 'r' }]);
road({ id: 'kitagishi-dori', name: '北岸通り', cls: 'collector', w: 22, lanes: 4, median: 3 }, // 花渡ライナー above its median (east part)
  [[-1800, -1325], [-600, -1330, 1500], [-116, -1345, 800], [300, -1358, 1500], [900, -1340, 1500], [1800, -1320]]);
road({ id: 'unga-dori', name: '運河通り', cls: 'collector', w: 12, lanes: 2 },               // west bank of the canal, under the expressway
  [[1036, -669.5], [1030, 300, 900], [1078, 1800]]);
road({ id: 'minami-dori', name: '南花渡通り', cls: 'collector', w: 16, lanes: 2 },           // level crossings with 東和本線 (4 tracks) and 湊線
  [[-1080, 1165], [300, 1158, 3000], [1800, 1150]],
  [{ s: 0, y: 'g' }, { p: [1045, 1157], y: 'g' }, { p: [1100, 1156], y: 3.6 }, { p: [1160, 1155], y: 'g' }]);
road({ id: 'suzune-dori', name: 'すずね通り', cls: 'street', w: 6, lanes: 1 },               // winds over the culverted 鈴音川
  [[-771.8, 230.4], [-560, 330, 60], [-300, 290, 80], [0, 360, 80], [300, 330, 80], [650, 385, 80], [1045, 350]]);

export const ROAD = Object.fromEntries(ROADS.map(r => [r.id, r]));

// 運河通り runs along the canal's west bank and meets each canal bridge's approach where it is already on the rise:
// it climbs to the bridge road's height across the junction (flat there) and eases back to the ground at 4 %.
{
  const U = ROAD['unga-dori'], pts = [];
  for (const id of ['kagan', 'ekimae', 'kanjo', 'minami-dori']) {
    const M = ROAD[id]; let prev = null, hit = null;
    for (let s = 0; s <= M.align.length && !hit; s += 1) {      // where M's centreline crosses 運河通り's
      const q = M.align.at(s), n = U.align.nearest(q.x, q.z, 40), d = n ? n.d : null;
      if (d != null && prev && Math.sign(d) !== Math.sign(prev.d)) hit = prev.s + (s - prev.s) * prev.d / (prev.d - d);
      prev = d == null ? null : { s, d };
    }
    if (hit == null) continue;
    const q = M.align.at(hit), sU = U.align.sOf(q.x, q.z), yM = M.profile.yAt(hit), dy = yM - heightAt(q.x, q.z);
    if (dy < 0.15) continue;
    const half = M.w / 2, L = Math.max(14, dy / 0.04);
    pts.push({ s: sU - half - L, y: 'g' }, { s: sU - half, y: yM }, { s: sU + half, y: yM }, { s: sU + half + L, y: 'g' });
  }
  U.profile = new Profile(U.align, pts.filter(p => p.s > -1e6), { groundAt: heightAt, off: 0 });
}
