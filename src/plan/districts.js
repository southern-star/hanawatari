// 花渡市（仮）— districts (character of each part of the city) and landmarks. Polygons are rough outlines for the
// skeleton; blocks and lots are generated inside them later.
import { RIVER, VALLEY, riverOffset } from './terrain.js';

const strip = (align, d0, d1, step = 40) => {
  const S = align.sample(step);
  return [...S.map(p => [p.x - p.hz * d0, p.z + p.hx * d0]), ...S.reverse().map(p => [p.x - p.hz * d1, p.z + p.hx * d1])];
};

/** kind drives the generators later: density, building mix, street pattern. label: where the map writes the name. */
export const DISTRICTS = [
  { id: 'hub', name: '花渡駅前', kind: 'downtown', label: [-640, -330], desc: '5路線の駅ビル、アーケード「花渡銀座」、高架下の飲み屋横丁、バスターミナル、ペデストリアンデッキ',
    poly: [[-770, -420], [-60, -420], [-60, 60], [-770, 60]] },
  { id: 'kitaguchi', name: '花渡北口', kind: 'redevelopment', label: [-170, -640], desc: 'タワーマンション、大学、ショッピングモール、ライナーの始発駅、桜堤への並木道',
    poly: [[-790, -770], [-60, -770], [-60, -420], [-770, -420], [-790, -350], [-930, -700]] },
  { id: 'shuku', name: '宿場町', kind: 'oldtown', label: [-150, 700], desc: '旧街道の宿場町。蔵造りの商家、寺、銭湯、老舗。旧 花渡の渡し跡',
    poly: [[-470, 60], [-60, 60], [-60, 900], [-470, 900]] },
  { id: 'gaketa', name: '崖下・西口', kind: 'hillfoot', label: [-720, 720], desc: '崖と線路に挟まれた細長い町。石段、見晴坂、路面電車、古い長屋',
    poly: [[-770, 60], [-470, 60], [-470, 900], [-1030, 900], [-960, 650], [-850, 400], [-790, 250]] },
  { id: 'shitamachi', name: '本町・柳原', kind: 'shitamachi', label: [520, 470], desc: '木造密集の下町。路地、町工場、商店街、湊線の踏切、ダイヤモンドクロス',
    poly: [[-60, -800], [300, -800], [930, -690], [930, 900], [-60, 900]] },
  { id: 'canal', name: '汐見運河', kind: 'canal', label: [1290, 420], desc: '運河と倉庫街。倉庫を改装した店、屋形船、運河の上を走る都市高速',
    poly: [[930, -690], [1250, -640], [1500, -590], [1500, 900], [930, 900]] },
  { id: 'minami', name: '南花渡・柳町', kind: 'residential', label: [520, 1300], desc: '住宅地と学校。南花渡駅前の商店街、東和本線の開かずの踏切',
    poly: [[-1030, 900], [1500, 900], [1500, 1500], [-1140, 1500], [-1080, 1000]] },
  { id: 'teramachi', name: '見晴台（寺町）', kind: 'plateau', label: [-1060, -470], desc: '台地の上。寺町、桜並木の見晴霊園、崖の上の見晴台公園（展望と桜）',
    poly: [[-1500, -850], [-1010, -850], [-930, -700], [-790, -350], [-775, 0], [-800, 200], [-1100, 255], [-1500, 330]] },
  { id: 'miharashi-s', name: '見晴台（南）', kind: 'plateau', label: [-1180, 1260], desc: '台地の上の住宅地と大学。坂と石段の多い山の手',
    poly: [[-1500, 440], [-1100, 350], [-830, 330], [-960, 650], [-1080, 1000], [-1140, 1500], [-1500, 1500]] },
  { id: 'valley', name: '鈴音川の谷', kind: 'valley', label: [-1400, 250], desc: '台地を刻む谷。小川の両岸に桜のトンネル、谷底を路面電車が走る',
    poly: strip(VALLEY.align, -52, 52) },
  { id: 'river', name: '澪川', kind: 'river', label: [-1250, -1030], desc: '河川敷のグラウンド、南岸の桜堤、水上バス、橋の見本市（トラス・アーチ・高速）',
    poly: strip(RIVER.align, riverOffset('N', 'foot'), riverOffset('S', 'foot')) },
  { id: 'kita', name: '北花渡', kind: 'estate', label: [-1000, -1400], desc: '川向こう。団地群と新交通、北岸の公園、高速のインターチェンジ',
    poly: [...RIVER.align.sample(80).map(p => [p.x - p.hz * riverOffset('N', 'foot'), p.z + p.hx * riverOffset('N', 'foot')]), [6000, -6000], [-6000, -6000]] },
];

/** Notable places (numbered on the plan map). */
export const LANDMARKS = [
  { id: 'hub', name: '花渡駅（5路線の立体交差駅）', p: [-450, -150] },
  { id: 'koen', name: '見晴台公園（崖の上の桜と展望）', p: [-860, 150] },
  { id: 'reien', name: '見晴霊園の桜並木', p: [-1150, -250] },
  { id: 'teramachi', name: '寺町', p: [-1300, -620] },
  { id: 'dandan', name: '見晴坂と花渡だんだん（石段）', p: [-850, 20] },
  { id: 'portal', name: '見晴線の崖のトンネル', p: [-782, -160] },
  { id: 'suzune', name: '鈴音川の桜並木', p: [-1060, 300] },
  { id: 'suzunebashi', name: '鈴音橋（谷をまたぐ橋）', p: [-1266, 330] },
  { id: 'ginza', name: '花渡銀座（アーケード）', p: [-240, -60] },
  { id: 'yokocho', name: '高架下の飲み屋横丁', p: [-452, 150] },
  { id: 'kura', name: '宿場町の蔵造り', p: [-240, 420] },
  { id: 'watashi', name: '旧 花渡の渡し跡', p: [-255, -800] },
  { id: 'ohashi', name: '花渡大橋（国道）', p: [-50, -1000] },
  { id: 'kyoryo', name: '東和本線 澪川橋梁（トラス）', p: [-500, -1000] },
  { id: 'sakurazutsumi', name: '桜堤（南岸の桜並木）', p: [-150, -814] },
  { id: 'ground', name: '河川敷グラウンド', p: [300, -880] },
  { id: 'waterbus', name: '水上バス乗り場', p: [80, -915] },
  { id: 'suimon', name: '汐見水門', p: [1080, -730] },
  { id: 'soko', name: '倉庫街', p: [1280, -250] },
  { id: 'yakata', name: '屋形船の船溜まり', p: [1075, 250] },
  { id: 'danchi', name: '北花渡団地', p: [300, -1440] },
  { id: 'univ', name: '花渡大学', p: [-400, -620] },
  { id: 'akazu', name: '開かずの踏切（東和本線4線）', p: [-610, 1195] },
  { id: 'minato-fumikiri', name: '南花渡通りの踏切（湊線）', p: [30, 1180] },
  { id: 'diamond', name: 'ダイヤモンドクロス（湊線×路面電車）', p: [330, 55] },
  { id: 'bus', name: 'バスターミナル（東口）', p: [-350, -80] },
  { id: 'jct', name: '都市高速 汐見JCT', p: [820, -1030] },
];
