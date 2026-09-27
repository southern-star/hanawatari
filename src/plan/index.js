// 花渡市（仮）— the whole-city plan as pure data (no three.js): terrain, rail, roads, districts. Everything the
// world generators build is derived from here, deterministically, so any 120 m chunk can be generated on its own.
export * from './geom.js';
export * from './terrain.js';
export * from './rail.js';
export * from './roads.js';
export * from './districts.js';
export { generateUrban, SITES, URBAN, CHUNKS_N, chunkOf, chunkKey } from './urban.js';
export { K, RES, KIND_NAMES } from './raster.js';

export const CITY = { name: '花渡市', kana: 'はなわたりし', provisional: true };
export { CHUNK } from './urban.js';   // streaming chunk size (m): the walkable map is 25 × 25 chunks
