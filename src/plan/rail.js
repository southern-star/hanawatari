// 花渡市（仮）— rail network skeleton. Seven systems meet or pass through the city; the hub 花渡 stacks five of
// them (like 北千住 / 秋葉原): 東和本線 on a 2F viaduct (N–S), 汐見線 ⇄ 見晴線 through-running on the 4F level
// crossing over it (E–W), 澪川線 at B3 (N–S), the 花渡ライナー terminal (4F, north side) and the tram at street
// level. Heights are rail top (m, same datum as terrain.heightAt; the plain near the hub is ≈ 0).
import { Alignment, Profile } from './geom.js';
import { heightAt } from './terrain.js';

const A = (name, pts) => new Alignment(pts, { name });
const P = (align, pts, off = 0.5) => new Profile(align, pts, { groundAt: heightAt, off });

/**
 * kind: 'jr' (national-type trunk line), 'private', 'metro', 'tram', 'agt' (automated guideway transit).
 * car: vehicle length (m) × count; vmax m/s. through: id of the line its trains continue onto at the hub.
 */
export const LINES = [];
function line(def, pts, prof, off) { const align = A(def.id, pts); const L = { ...def, align, profile: P(align, prof, off) }; LINES.push(L); return L; }

// ---- 東和本線 (national-type trunk line; 4 tracks = rapid + local). Viaduct through the hub, at grade in the south.
line({ id: 'tr', name: '東和本線', operator: '東和旅客鉄道', short: 'TR', kind: 'jr', color: '#2f9e44', tracks: 4, car: { len: 20, n: 10 }, vmax: 33 },
  [[-560, -1800], [-500, -1000, 1400], [-452, -320, 1600], [-450, 420, 900], [-560, 1100, 700], [-760, 1800]],
  [{ p: [-560, -1800], y: 11 }, { p: [-495, -800], y: 11 }, { p: [-458, -420], y: 7.5 }, { p: [-482, 620], y: 7.5 }, { p: [-544, 1000], y: 'g' }, { p: [-760, 1800], y: 'g' }]);

// ---- 汐見電鉄 汐見線 (private; elevated). Its trains run through onto 見晴線 at 花渡 (4F level over 東和本線).
line({ id: 'shiomi', name: '汐見線', operator: '汐見電鉄', short: 'SM', kind: 'private', color: '#1c7ed6', tracks: 2, car: { len: 20, n: 8 }, vmax: 28, through: 'miharashi' },
  [[-570, -152], [120, -150, 1200], [700, -80, 1200], [1300, 30, 1200], [1800, 60]],
  [{ p: [-570, -152], y: 16 }, { p: [-330, -151], y: 16 }, { p: [100, -150], y: 10 }, { p: [1800, 60], y: 10 }]);

// ---- 見晴線 (subway). Under the plateau, out of a portal in the scarp onto a viaduct, into 花渡 at the 4F level.
line({ id: 'miharashi', name: '見晴線', operator: '花渡市交通局', short: 'M', kind: 'metro', color: '#ae3ec9', tracks: 2, car: { len: 20, n: 8 }, vmax: 22, through: 'shiomi' },
  [[-1800, -262], [-1320, -225, 900], [-900, -165, 900], [-570, -152]],
  [{ p: [-1800, -262], y: -1 }, { p: [-1320, -225], y: -1 }, { p: [-570, -152], y: 16 }]);

// ---- 澪川線 (subway, deep: under the river and the hub at B3)
line({ id: 'mio', name: '澪川線', operator: '花渡市交通局', short: 'R', kind: 'metro', color: '#f08c00', tracks: 2, car: { len: 20, n: 10 }, vmax: 22 },
  [[-420, -1800], [-385, -1250, 1500], [-362, -150, 1500], [-290, 1000, 1200], [-230, 1800]],
  [{ p: [-420, -1800], y: -20 }, { p: [-385, -1250], y: -20 }, { p: [-383, -1000], y: -27 }, { p: [-362, -150], y: -18 }, { p: [-290, 1000], y: -15 }, { p: [-230, 1800], y: -15 }]);

// ---- 湊電鉄 湊線 (private; at grade through the 下町 with many level crossings, elevated over the river)
line({ id: 'minato', name: '湊線', operator: '湊電鉄', short: 'MN', kind: 'private', color: '#e03131', tracks: 2, car: { len: 18, n: 6 }, vmax: 25 },
  [[860, -1800], [770, -960, 900], [560, -480, 700], [190, 240, 600], [40, 640, 500], [30, 1100, 800], [35, 1800]],   // stays east of the 国道
  [{ p: [860, -1800], y: 16.5 }, { p: [806, -1300], y: 16.5 }, { p: [788, -1110], y: 11 }, { p: [678, -750], y: 11 }, { p: [535, -430], y: 'g' }, { p: [35, 1800], y: 'g' }]);

// ---- 花渡電軌 (tram): plateau terminus 寺町 → down into the 鈴音川 valley → along the stream → 花渡駅 → street
// running along 本町通り (diamond crossing with 湊線 at 本町) → 汐見運河.
line({ id: 'tram', name: '花渡電軌', operator: '花渡電気軌道', short: 'T', kind: 'tram', color: '#e64980', tracks: 2, car: { len: 13, n: 1 }, vmax: 11, runsOn: ['honcho'] },
  [[-1425, 800], [-1432, 580, 80], [-1330, 385, 120], [-1250, 346, 120], [-1050, 301, 250], [-820, 266, 150], [-690, 170, 80], [-620, 40, 60], [-520, 20, 60], [330, 20, 250], [700, 40, 300], [1010, 45]],
  [{ p: [-1425, 800], y: 'g' }, { p: [-1405, 520], y: 'g' }, { p: [-1200, 334], y: 'r' }, { p: [-1150, 322], y: 'g' }, { p: [1010, 45], y: 'g' }], 0);

// ---- 花渡ライナー (AGT; elevated over 花渡北通り, across the river, east along 北岸通り to the housing estates)
line({ id: 'liner', name: '花渡ライナー', operator: '花渡新交通', short: 'L', kind: 'agt', color: '#0c8599', tracks: 2, car: { len: 9, n: 5 }, vmax: 17 },
  [[-317.3, -420], [-290, -600, 600], [-275, -779.5, 400], [-262, -1180, 400], [-262, -1340.5, 150], [300, -1358, 1500], [900, -1340, 400], [1150, -1300]],   // over the medians of 花渡北通り and 北岸通り
  [{ p: [-320, -420], y: 14 }, { p: [100, -1352], y: 14 }, { p: [320, -1355], y: 10 }, { p: [1150, -1300], y: 10 }]);

export const LINE = Object.fromEntries(LINES.map(l => [l.id, l]));

// ------------------------------------------------------------------ stations
/**
 * group: station complex (lines sharing a name/concourse). platform: 'island' | 'island2' (two islands, 4 tracks)
 * | 'side' | 'terminal' | 'stop' (tram). len: platform length (m). shared: through-running lines that use the same
 * platforms. s / y / level are filled in below.
 */
export const STATIONS = [
  // 花渡 (hub)
  { id: 'hanawatari-tr', group: 'hanawatari', name: '花渡', kana: 'はなわたり', line: 'tr', p: [-451, -150], len: 220, platform: 'island2' },
  { id: 'hanawatari-sm', group: 'hanawatari', name: '花渡', line: 'shiomi', shared: ['miharashi'], p: [-450, -152], len: 200, platform: 'island' },
  { id: 'hanawatari-r', group: 'hanawatari', name: '花渡', line: 'mio', p: [-362, -150], len: 200, platform: 'island' },
  { id: 'hanawatari-l', group: 'hanawatari', name: '花渡', line: 'liner', p: [-318, -440], len: 60, platform: 'terminal' },
  // 東和本線
  { id: 'minamihanawatari', name: '南花渡', kana: 'みなみはなわたり', line: 'tr', p: [-614, 1290], len: 220, platform: 'island2' },   // the 開かずの踏切 is just past its north end
  // 汐見線
  { id: 'honcho-sm', group: 'honcho', name: '本町', kana: 'ほんちょう', line: 'shiomi', p: [380, -119], len: 160, platform: 'side' },
  { id: 'shiomi', name: '汐見', kana: 'しおみ', line: 'shiomi', p: [1160, 4], len: 160, platform: 'side' },
  // 見晴線
  { id: 'miharashidai', name: '見晴台', kana: 'みはらしだい', line: 'miharashi', p: [-1320, -225], len: 200, platform: 'island' },
  // 澪川線
  { id: 'kitahanawatari-r', group: 'kitahanawatari', name: '北花渡', kana: 'きたはなわたり', line: 'mio', p: [-385, -1250], len: 200, platform: 'island' },
  { id: 'yanagicho', name: '柳町', kana: 'やなぎちょう', line: 'mio', p: [-290, 1000], len: 200, platform: 'island' },
  // 湊線
  { id: 'kitagishi', group: 'danchihigashi', name: '北岸', kana: 'きたぎし', line: 'minato', p: [812, -1350], len: 120, platform: 'side' },
  { id: 'honcho3', group: 'honcho', name: '本町三丁目', kana: 'ほんちょうさんちょうめ', line: 'minato', p: [257, 110], len: 120, platform: 'side' },   // just south of the diamond crossing
  { id: 'yanagihara', name: '柳原', kana: 'やなぎはら', line: 'minato', p: [36, 720], len: 120, platform: 'side' },
  { id: 'minamimachi', name: '南町', kana: 'みなみまち', line: 'minato', p: [32, 1350], len: 120, platform: 'side' },
  // 花渡ライナー
  { id: 'kitahanawatari-l', group: 'kitahanawatari', name: '北花渡', line: 'liner', p: [-262, -1170], len: 60, platform: 'island' },
  { id: 'danchi', name: '北花渡団地', kana: 'きたはなわたりだんち', line: 'liner', p: [320, -1355], len: 60, platform: 'island' },
  { id: 'danchihigashi', group: 'danchihigashi', name: '団地東', kana: 'だんちひがし', line: 'liner', p: [880, -1338], len: 60, platform: 'island' },
  // 花渡電軌 (tram stops)
  { id: 't-teramachi', name: '寺町', line: 'tram', p: [-1425, 790], len: 20, platform: 'terminal' },
  { id: 't-suzunegawa', name: '鈴音川', line: 'tram', p: [-1150, 322], len: 16, platform: 'stop' },
  { id: 't-koen', name: '見晴台公園前', line: 'tram', p: [-900, 279], len: 16, platform: 'stop' },
  { id: 't-taniguchi', name: '谷口', line: 'tram', p: [-712, 190], len: 16, platform: 'stop' },
  { id: 't-hanawatari-w', group: 'hanawatari', name: '花渡駅西口', line: 'tram', p: [-570, 24], len: 16, platform: 'stop' },
  { id: 't-hanawatari-e', group: 'hanawatari', name: '花渡駅東口', line: 'tram', p: [-330, 20], len: 16, platform: 'stop' },
  { id: 't-honcho1', name: '本町一丁目', line: 'tram', p: [0, 20], len: 16, platform: 'stop' },
  { id: 't-honcho', group: 'honcho', name: '本町', line: 'tram', p: [350, 21], len: 16, platform: 'stop' },
  { id: 't-shiomi2', name: '汐見二丁目', line: 'tram', p: [680, 38], len: 16, platform: 'stop' },
  { id: 't-unga', name: '汐見運河', line: 'tram', p: [1000, 45], len: 20, platform: 'terminal' },
];
for (const st of STATIONS) {
  const L = LINE[st.line];
  st.s = L.align.sOf(st.p[0], st.p[1]);
  const q = L.align.at(st.s); st.x = q.x; st.z = q.z;
  st.y = L.profile.yAt(st.s);                       // rail top at the platform
  const g = heightAt(st.x, st.z);
  st.level = st.y < g - 4 ? 'underground' : st.y > g + 4 ? 'elevated' : 'grade';
}
