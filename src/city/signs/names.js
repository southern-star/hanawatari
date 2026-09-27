// Fictional shop / tenant / advertiser names of 花渡市 (no real brands). Each shop entry: [name, sub (small line /
// romaji), style] where style picks the fascia design in atlas.js. USES says which trades each district mix has.
export const SHOP_NAMES = {
  konbini: [['はなまるマート', 'HANAMARU MART', 'konbiniA'], ['みおストア', 'MIO STORE', 'konbiniB'], ['トワイライト24', 'TWILIGHT 24', 'konbiniC']],
  cafe: [['喫茶 わたしば', 'coffee since 1972', 'wood'], ['はなわたり珈琲', 'HANAWATARI COFFEE', 'pinkChain'], ['珈琲 汐騒', 'Shiosai', 'dark'], ['カフェ・リュミエール', 'Café Lumière', 'cream'], ['ハミングバードカフェ', 'HUMMINGBIRD CAFE', 'navy'], ['純喫茶 ポプラ', '', 'dark']],
  izakaya: [['居酒屋 わたし舟', '', 'redLantern'], ['大衆酒場 まるふく', '', 'dark'], ['酒処 鈴音', '', 'indigo'], ['居酒屋 よいどれ', '', 'redLantern'], ['海鮮 汐見港', '朝獲れ鮮魚', 'indigo'], ['炭火焼 鳥ぎん', '', 'dark']],
  ramen: [['らーめん 花道', 'HANAMICHI', 'yellowRed'], ['麺屋 宿場', '', 'dark'], ['中華そば みはらし', '', 'white'], ['豚骨 一番星', '', 'yellowRed'], ['つけ麺 かもめ', '', 'indigo']],
  karaoke: [['カラオケ うたのわ', 'KARAOKE', 'pop'], ['カラオケ ステージ21', 'STAGE 21', 'popBlue']],
  bar: [['BAR Tsukimi', 'bar & dining', 'dark'], ['スナック 夜舟', '', 'purple'], ['ワインバー 蒼', 'WINE BAR', 'dark']],
  game: [['ゲームセンター ギャラクシー', 'GALAXY', 'popBlue'], ['アミューズメント ドリーム', 'DREAM', 'pop']],
  drug: [['ドラッグ ヒカリ', 'DRUG HIKARI', 'yellowBlue'], ['くすりのはなわ', 'KUSURI no HANAWA', 'yellowBlue'], ['ドラッグストア みお', 'DRUG MIO', 'pinkChain']],
  yakitori: [['焼き鳥 とりや', '', 'redLantern'], ['串焼き 灯', '', 'dark'], ['やきとり 大吉', '', 'redLantern']],
  sushi: [['寿司 やまと', '', 'white'], ['回転寿司 汐見丸', 'SUSHI SHIOMIMARU', 'navy']],
  pachinko: [['パーラー キング', 'PARLOR KING', 'pop'], ['PACHINKO MIO', 'パチンコ・スロット', 'popBlue']],
  clothes: [['ブティック リラ', 'boutique lila', 'cream'], ['HANAWATARI STYLE', 'ハナワタリスタイル', 'navy'], ['古着 オリーブ', 'VINTAGE OLIVE', 'dark']],
  bakery: [['ベーカリー こむぎ舎', 'bakery komugisha', 'wood'], ['パン工房 あさひ', 'boulangerie', 'cream']],
  books: [['花渡書店', 'HANAWATARI SHOTEN', 'white'], ['ブックス 汐文堂', 'BOOKS', 'navy']],
  phone: [['はなモバイル', 'HANA MOBILE', 'pinkChain'], ['ミオフォン', 'MIO PHONE', 'popBlue']],
  bank: [['花渡銀行', 'THE HANAWATARI BANK', 'navy'], ['みお信用金庫', 'MIO SHINKIN', 'green']],
  gyudon: [['牛丼 まるとく', '', 'yellowRed'], ['丼の店 はやぶさ', '', 'orange']],
  realestate: [['不動産 はなわたりホーム', 'HANAWATARI HOME', 'green'], ['ハウスプラザ汐見', '賃貸・売買', 'navy']],
  clinic: [['はなわたり内科', '内科・小児科', 'white'], ['本町整形外科', 'リハビリテーション科', 'white']],
  dental: [['みはらし歯科', 'DENTAL CLINIC', 'white'], ['駅前デンタルクリニック', '', 'white']],
  flower: [['花屋 はなわ', 'flower shop', 'green'], ['フラワー 鈴蘭', 'SUZURAN', 'cream']],
  sweets: [['洋菓子 ル・パン', 'pâtisserie', 'cream'], ['たい焼き まるこ', '', 'orange'], ['甘味処 月見', '', 'dark']],
  laundry: [['コインランドリー あわあわ', '24h', 'popBlue']],
  restaurant: [['洋食 グリルはなわ', 'GRILL HANAWA', 'wood'], ['レストラン シリウス', 'SIRIUS', 'navy'], ['定食 みなと食堂', '', 'white'], ['イタリアン ポモドーロ', 'TRATTORIA', 'green']],
  shop: [['雑貨 ひなげし', 'zakka', 'cream'], ['文具 まるやま', 'STATIONERY', 'white'], ['めがね 光明堂', 'OPTICAL', 'navy'], ['靴 あしたや', 'SHOES', 'orange'], ['時計 宝石 はなわ', 'WATCH & JEWELRY', 'dark']],
  // the old post town
  wagashi: [['和菓子 花渡屋', '創業明治元年', 'dark'], ['だんご 茶々', '', 'wood']],
  soba: [['手打ちそば 宿場庵', '', 'indigo'], ['そば処 鈴音', '', 'dark']],
  tea: [['お茶の 花香園', '日本茶', 'green']],
  sake: [['酒の やまぶき', '地酒・焼酎', 'indigo'], ['渡辺酒店', '', 'wood']],
  kimono: [['呉服 はなわた', '', 'dark']],
  tofu: [['豆腐 まるきん', '', 'white']],
  senbei: [['せんべい 宿場堂', '手焼き', 'wood']],
  lobby: [['花渡スクエア', 'HANAWATARI SQUARE', 'lobby'], ['本町ビルディング', 'HONCHO BLDG.', 'lobby'], ['汐見ガーデンタワー', 'SHIOMI GARDEN TOWER', 'lobby'], ['駅前第一ビル', 'EKIMAE No.1 BLDG.', 'lobby'], ['みお総合ビル', 'MIO BLDG.', 'lobby']],
  entrance: [['はなわたりレジデンス', 'HANAWATARI RESIDENCE', 'plate'], ['グランシティ汐見', 'GRAN CITY', 'plate'], ['メゾン鈴音', 'MAISON SUZUNE', 'plate'], ['ハイツ見晴', 'HEIGHTS MIHARASHI', 'plate'], ['コーポ本町', 'CORPO HONCHO', 'plate']],
};
/** Painted interior behind the shop glass, per trade. */
export const INTERIOR_OF = {
  konbini: 'konbini', cafe: 'cafe', izakaya: 'izakaya', ramen: 'ramen', karaoke: 'karaoke', bar: 'bar', game: 'karaoke', drug: 'drug', yakitori: 'izakaya', sushi: 'ramen', pachinko: 'karaoke',
  clothes: 'clothes', bakery: 'bakery', books: 'books', phone: 'shop', bank: 'bank', gyudon: 'ramen', realestate: 'bank', clinic: 'clinic', dental: 'clinic', flower: 'shop', sweets: 'bakery',
  laundry: 'shop', restaurant: 'restaurant', shop: 'shop', wagashi: 'bakery', soba: 'ramen', tea: 'shop', sake: 'shop', kimono: 'clothes', tofu: 'shop', senbei: 'bakery',
};
/** Trades on the ground floors, weighted, by the district's mix (urban.js URBAN[...].mix). */
export const USES = {
  downtown: { konbini: 3, cafe: 3, drug: 3, phone: 2, bank: 1, ramen: 3, gyudon: 2, izakaya: 3, karaoke: 2, game: 1, pachinko: 1, clothes: 2, books: 1, bakery: 1, sushi: 1, restaurant: 2, realestate: 1, clinic: 1, dental: 1, shop: 2 },
  redevelopment: { cafe: 3, konbini: 2, restaurant: 2, clothes: 2, drug: 1, bank: 1, phone: 1, shop: 2 },
  oldtown: { wagashi: 3, soba: 2, tea: 1, sake: 2, kimono: 1, tofu: 1, senbei: 1, cafe: 2, izakaya: 2, restaurant: 1, shop: 2, flower: 1 },
  shitamachi: { yakitori: 3, izakaya: 2, konbini: 2, drug: 1, bakery: 2, sweets: 1, books: 1, clinic: 1, laundry: 1, shop: 2, ramen: 2, restaurant: 1, realestate: 1 },
  residential: { konbini: 2, bakery: 1, cafe: 1, clinic: 2, dental: 1, laundry: 1, flower: 1, shop: 1, realestate: 1, drug: 1 },
  canal: { cafe: 3, restaurant: 3, bar: 2, shop: 2, izakaya: 1, sweets: 1 },
  hillfoot: { izakaya: 2, yakitori: 2, konbini: 1, shop: 2, laundry: 1, ramen: 1, sweets: 1, bar: 1 },
  plateau: { cafe: 2, bakery: 2, flower: 1, clinic: 1, shop: 1, konbini: 1 },
  estate: { konbini: 2, drug: 1, laundry: 1, clinic: 1 },
};
/** Upper-floor tenants: the panels of a sign stack (袖看板). [text, colour] */
export const TENANTS = [
  ['英会話', '#2f64b5'], ['学習塾', '#d9463b'], ['整体院', '#3f8f5b'], ['ネイル', '#d97aa0'], ['麻雀', '#3f8f5b'], ['歯科', '#2f64b5'],
  ['美容室', '#8a5ab5'], ['ヨガ', '#e08a3b'], ['税理士', '#3a3346'], ['カラオケ', '#d9463b'], ['スナック', '#8a5ab5'], ['BAR', '#3a3346'],
  ['漫画喫茶', '#e0a23b'], ['占い', '#6a4aa5'], ['マッサージ', '#3f8f5b'], ['居酒屋', '#c0392b'], ['焼肉', '#c0392b'], ['中華', '#c0392b'],
  ['ダンス', '#2f64b5'], ['写真館', '#3a3346'], ['司法書士', '#3a3346'], ['眼科', '#2f64b5'], ['カフェ', '#8a6446'], ['ピラティス', '#d97aa0'],
];
/** Rooftop billboards / wall ads: [headline, sub, bg, fg, accent] */
export const ADS = [
  ['花渡ビール', '春の限定 はなわたりラガー', '#b8322a', '#fff6e8', '#f2c230'],
  ['はなモバイル', '新生活 学割スタート', '#ef9fbe', '#ffffff', '#d9718f'],
  ['汐見線で海へ。', '花渡 → 汐見 9分', '#3aa0c8', '#ffffff', '#f2e36b'],
  ['はなまるマート', 'いつもの近くに', '#2c9a91', '#ffffff', '#f3c14b'],
  ['鈴音の湯', '日帰り入浴 ¥850', '#5a4032', '#fbf1dc', '#e9a23b'],
  ['FM HANAWATARI 79.6', 'まいにち、花いろ。', '#3a3346', '#ffffff', '#ef9fbe'],
  ['ミオ電機', '新生活家電フェア', '#e9a23b', '#2c2a36', '#ffffff'],
  ['はなわ生命', 'あなたの毎日に寄りそう', '#f7f2ea', '#c24a6a', '#ef9fbe'],
  ['花渡ライナー', '北花渡団地まで 7分', '#0c8599', '#ffffff', '#7fcad6'],
  ['花渡百貨店', '春の大感謝祭', '#1f3a68', '#ffffff', '#ef9fbe'],
  ['湊電鉄', '本町三丁目 ⇄ 北岸 12分', '#e03131', '#ffffff', '#f1ebdf'],
];
/** Tower crown signs (names on top of the high-rises): [text, colour] */
export const CROWNS = [
  ['花渡銀行', '#f4f1ea'], ['HANAWA LIFE', '#f4f1ea'], ['MIO', '#ffffff'], ['SHIOMI', '#f4f1ea'], ['ミオフォン', '#ffffff'],
  ['汐見電鉄', '#f7d3de'], ['はなわ生命', '#f7d3de'], ['TOWA', '#ffffff'], ['HANAWATARI', '#f4f1ea'], ['ミオ電機', '#ffffff'],
];
