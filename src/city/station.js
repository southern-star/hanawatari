// 花渡駅 station front (built once). The east exit, between the station building and 宿場町通り:
//   • the forecourt along the station face under a long canopy, the name board over the deck entrance and big
//     channel letters high on the station building, the crowns of the department store and the hotel;
//   • the bus terminal — a one-way ring round an island of berths (shelters over the queues, benches, berth poles with
//     their routes and timetables, the alighting berth) — its drive a fourth arm of the lights at 駅前通り, and the taxi
//     pool with its stand and shelter (the layout: plan/station-layout.js; buses and taxis at work: city/rotary.js);
//   • the pedestrian deck (2F) out of the concourse over the ring, a round deck plaza above the island with stairs
//     down to the berths, and stairs down to the street at its east end;
//   • the plazas: trees (from plan/trees.js), benches, the clock tower, the 交番, the area map, bicycle parking.
// And the small west exit square. Walkable where it should be: deck, stairs and kerbs are colliders.
import * as THREE from 'three';
import { groundAt } from '../plan/ground.js';
import { MB, rgb, shade } from './mb.js';
import { crownSign, fasciaSign, sticker } from './signs/atlas.js';
import { PASSAGE } from '../plan/urban.js';
import { buildVision } from './vision.js';
import { WEST, buildWestExit } from './westexit.js';

import { EAST, FORE, RING, ISLE, TAXI, DRIVES, DECK, RING_ZEBRAS, BERTHS, TAXI_HEAD, TAXI_STAND } from '../plan/station-layout.js';
export { EAST };

const TILE = rgb('#d6d0c3'), TILE2 = rgb('#cbc4b6'), GRAN = rgb('#bfbab0'), GRAN2 = rgb('#b3aea4'), ASPH = rgb('#6a6c71'), KERB = rgb('#b3aea4'), ISL = rgb('#d3cdc0');
const WHITE = rgb('#ecebe5'), YELLOW = rgb('#e0b53c'), STEEL = rgb('#9aa3aa'), STEEL_D = rgb('#737c83'), GLASS = rgb('#a9c4d6'), ROOF = rgb('#eceeec'), ROOF_U = rgb('#c9ccca');
const DECKC = rgb('#dad5ca'), DECK_U = rgb('#b6b1a6'), CONC = rgb('#c6c1b6'), BENCH = rgb('#8a6446'), WOOD = rgb('#9a7452'), RED = rgb('#d9463b'), DARK = rgb('#2d2b33');
const inR = (x, z, r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];
const DECK_COLS = [[DECK.hub[0] - 6, DECK.hub[1] - 6], [DECK.hub[0] + 6, DECK.hub[1] - 6], [DECK.hub[0] - 6, DECK.hub[1] + 6], [DECK.hub[0] + 6, DECK.hub[1] + 6], [-268, -153]];
/** Where a viaduct pier may not stand in the east square: the bus ring's lanes, the drives, the taxi pool, the deck's columns. */
export function stationBlocked(x, z) {
  if (inR(x, z, RING) && !inR(x, z, ISLE)) return true;
  if (inR(x, z, TAXI) || DRIVES.some(r => inR(x, z, r))) return true;
  return DECK_COLS.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 1.8);
}

/** Textured quads (sign atlas) for the boards. */
class SBuf {
  constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; }
  quad(a, b, c, d, uv) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0]; const l = Math.hypot(nx, ny, nz) || 1;
    const k = this.P.length / 3, U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    [a, b, c, d].forEach((p, i) => { this.P.push(...p); this.N.push(nx / l, ny / l, nz / l); this.U.push(...U[i]); this.C.push(1, 1, 1); });
    this.I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  /** A board facing direction (fx, fz), centred at (cx, cz), width w (horizontal), y0..y1. */
  board(cx, cz, fx, fz, w, y0, y1, uv, off = 0) {
    const rx = fz, rz = -fx, x = cx + fx * off, z = cz + fz * off;                        // right as seen from the front
    this.quad([x - rx * w / 2, y0, z - rz * w / 2], [x + rx * w / 2, y0, z + rz * w / 2], [x + rx * w / 2, y1, z + rz * w / 2], [x - rx * w / 2, y1, z - rz * w / 2], uv);
  }
  mesh(mat) {
    if (!this.I.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setIndex(this.I); g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

// ------------------------------------------------------------------ custom sign cells
function stationBoard(ctx, A) {
  const f = ctx.tex.FONTS;
  return A.cell('station-board', 768, 112, (g, w, h) => {
    g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f9e44'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#1f2a44'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, '花渡駅', w * 0.36, 44, w * 0.5, 70, f.sans, 900);
    g.fillStyle = '#55606f'; ctx.tex.fitText(g, 'HANAWATARI STATION', w * 0.36, 90, w * 0.5, 17, f.en, 700);
    const lines = [['TR', '#2f9e44'], ['SM', '#1c7ed6'], ['M', '#ae3ec9'], ['R', '#f08c00'], ['T', '#e64980'], ['L', '#0c8599']];
    lines.forEach(([t, c], i) => { const x = w * 0.66 + i * 42, y = 50; g.fillStyle = c; g.beginPath(); g.arc(x, y, 17, 0, 7); g.fill(); g.fillStyle = '#ffffff'; ctx.tex.fitText(g, t, x, y + 1, 26, 17, f.en, 900); });
    g.fillStyle = '#55606f'; ctx.tex.fitText(g, '東口  East Exit', w * 0.84, 92, w * 0.3, 16, f.sans, 700);
  });
}
function clockFace(ctx, A) {
  return A.cell('clock-face', 128, 128, (g, w, h) => {
    g.fillStyle = '#2d2b33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f7f6f2'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.44, 0, 7); g.fill();
    g.strokeStyle = '#2d2b33'; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.lineWidth = k % 3 ? 2 : 5; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.36, h / 2 + Math.sin(a) * h * 0.36); g.lineTo(w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * h * 0.42); g.stroke(); }
    const hand = (a, l, lw) => { g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.sin(a) * l, h / 2 - Math.cos(a) * l); g.stroke(); };
    hand((4 + 2 / 60) / 12 * Math.PI * 2, w * 0.22, 6); hand(2 / 60 * Math.PI * 2, w * 0.33, 4);
  });
}
function areaMap(ctx, A) {
  const f = ctx.tex.FONTS;
  return A.cell('area-map', 256, 176, (g, w, h) => {
    g.fillStyle = '#1f3a68'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f1ea'; g.fillRect(8, 30, w - 16, h - 38);
    g.fillStyle = '#ffffff'; ctx.tex.fitText(g, '花渡駅周辺案内図', w / 2, 16, w - 20, 16, f.sans, 900);
    g.fillStyle = '#cfd8c4'; g.fillRect(14, 36, w - 28, h - 50);
    g.fillStyle = '#ffffff'; g.fillRect(14, 100, w - 28, 10); g.fillRect(120, 36, 10, h - 50);         // streets
    g.fillStyle = '#2f9e44'; g.fillRect(70, 36, 6, h - 50); g.fillStyle = '#1c7ed6'; g.fillRect(14, 80, w - 28, 5);
    g.fillStyle = '#d9463b'; g.beginPath(); g.arc(150, 118, 6, 0, 7); g.fill();
    g.fillStyle = '#d9463b'; ctx.tex.fitText(g, '現在地', 178, 118, 60, 12, f.sans, 900);
  });
}

/** The routes from each berth (all fictional). */
const DEST = { '花01': '花渡台団地', '花02': '市民病院', '花11': '汐見ふ頭', '花12': '寺町・丘の上公園', '花21': '桜台車庫', '深夜': '花渡台団地 深夜バス' };
/** A berth's board: its number, the routes from it and the timetable. */
function berthBoard(ctx, A, n, routes) {
  const f = ctx.tex.FONTS;
  return A.cell('berth-board-' + n, 192, 256, (g, w, h) => {
    g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f3a68'; g.fillRect(0, 0, w, 56);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ctx.tex.fitText(g, n + '番のりば', w / 2, 29, w - 20, 34, f.sans, 900);
    routes.forEach((r, i) => {
      const y = 82 + i * 42;
      g.fillStyle = ['#2f9e44', '#e8590c'][i % 2]; g.fillRect(10, y - 15, 58, 30);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; ctx.tex.fitText(g, r, 39, y + 1, 52, 19, f.sans, 900);
      g.fillStyle = '#1f2a44'; g.textAlign = 'left'; ctx.tex.fitText(g, DEST[r] || '', 76, y + 1, w - 84, 19, f.sans, 900);
    });
    g.textAlign = 'center';
    for (let k = 0; k < 6; k++) {                                              // the timetable: an hour a row
      const y = 164 + k * 15;
      g.fillStyle = '#c9ccd2'; g.fillRect(8, y + 14, w - 16, 1);
      g.fillStyle = '#1f2a44'; ctx.tex.fitText(g, String(15 + k), 22, y + 7, 22, 11, f.en, 900);
      g.fillStyle = '#55606f'; for (let m = 0; m < 5 + (k * 7 + n) % 3; m++) ctx.tex.fitText(g, String((m * 12 + n * 5 + k * 3) % 60).padStart(2, '0'), 46 + m * 24, y + 7, 20, 10, f.en, 700);
    }
  });
}

/** Build the station front; kit = the shop-front kit (sign atlas + materials). Returns a Group. */
export function buildStation(ctx, kit) {
  const mb = new MB(), sb = new SBuf(), phys = ctx.physics, A = kit.A;
  const gy = (x, z) => groundAt(x, z);
  const G0 = gy(-300, -120);
  // ---------------------------------------------------------------- paving (2 m tiles; asphalt ring, taxi pool and
  // driveways; the berth island raised), kerbs where a raised surface meets asphalt
  const kindAt = (x, z) => {
    if (DRIVES.some(r => inR(x, z, r))) return 'asph';
    if (inR(x, z, ISLE)) return 'isle';
    if (inR(x, z, RING) || inR(x, z, TAXI)) return 'asph';
    return x < FORE ? 'gran' : 'tile';
  };
  const DY = { asph: 0.06, tile: 0.15, gran: 0.15, isle: 0.18 };
  const paveRect = (R, kindFn) => {
    for (let x = R[0]; x < R[2] - 0.01; x += 2) for (let z = R[1]; z < R[3] - 0.01; z += 2) {
      const x1 = Math.min(x + 2, R[2]), z1 = Math.min(z + 2, R[3]), cx = (x + x1) / 2, cz = (z + z1) / 2, k = kindFn(cx, cz), dy = DY[k];
      const h = Math.sin(x * 12.99 + z * 78.23) * 43758.55, v = h - Math.floor(h);
      const col = k === 'asph' ? ASPH : k === 'isle' ? shade(ISL, 0.985 + v * 0.03) : k === 'gran' ? shade(v < 0.5 ? GRAN : GRAN2, 0.99 + v * 0.02) : shade(v < 0.5 ? TILE : TILE2, 0.985 + v * 0.03);
      mb.quad([x, gy(x, z1) + dy, z1], [x1, gy(x1, z1) + dy, z1], [x1, gy(x1, z) + dy, z], [x, gy(x, z) + dy, z], col);
      if (k === 'asph') continue;
      // kerb faces toward asphalt neighbours
      const face = (ax, az, bx, bz, nx, nz) => { if (kindFn(cx + nx * 2, cz + nz * 2) !== 'asph') return; const ya = gy(ax, az), yb = gy(bx, bz); mb.quad([ax, ya + 0.06, az], [bx, yb + 0.06, bz], [bx, yb + dy, bz], [ax, ya + dy, az], KERB); };
      face(x1, z1, x, z1, 0, 1); face(x, z, x1, z, 0, -1); face(x1, z, x1, z1, 1, 0); face(x, z1, x, z, -1, 0);
    }
  };
  paveRect(EAST, kindAt);
  // markings: zebra crossings from the forecourt / east strip to the island, berth boxes, the taxi queue line
  const Y = (x, z, dy = 0.075) => gy(x, z) + dy;
  const flat = (x0, z0, x1, z1, col, dy = 0.075) => mb.quad([x0, Y(x0, z1, dy), z1], [x1, Y(x1, z1, dy), z1], [x1, Y(x1, z0, dy), z0], [x0, Y(x0, z0, dy), z0], col);
  for (const [xa, xb, z0, z1] of RING_ZEBRAS) for (let x = xa + 0.6; x + 0.45 < xb - 0.3; x += 0.9) flat(x, z0, x + 0.45, z1, WHITE);
  const box = (x0, z0, x1, z1, col) => { flat(x0, z0, x1, z0 + 0.15, col); flat(x0, z1 - 0.15, x1, z1, col); flat(x0, z0, x0 + 0.15, z1, col); flat(x1 - 0.15, z0, x1, z1, col); };
  for (const B of BERTHS) { const [x0, x1] = B.side < 0 ? [ISLE[0] - 3.3, ISLE[0] - 0.3] : [ISLE[2] + 0.3, ISLE[2] + 3.3]; box(x0, B.box[0], x1, B.box[1], YELLOW); }
  // the taxi queue's lane (a dashed line along it) and the head's box by the stand
  for (let z = -52; z > -80; z -= 4) flat(TAXI_HEAD.x + 2.1, z - 2, TAXI_HEAD.x + 2.25, z, YELLOW);
  box(TAXI_HEAD.x - 1.05, TAXI_HEAD.z - 0.3, TAXI_HEAD.x + 1.05, TAXI_HEAD.z + 4.9, YELLOW);
  { const [x0, z0, x1, z1] = DRIVES[1], zm = (z0 + z1) / 2; flat(x1 - 1.9, z0 + 0.4, x1 - 1.45, zm - 0.3, WHITE); }   // the taxis' stop line (止まれ) out of the pool
  // ---------------------------------------------------------------- the station face: canopy, name board, letters
  const canopy = (x0, x1, z0, z1, y) => { mb.box(x0, x1, y, y + 0.22, z0, z1, ROOF, 'NSEWT'); mb.box(x0, x1, y - 0.01, y, z0, z1, ROOF_U, 'B'); };
  for (const [z0, z1] of [[-249, -166], [-140, -57]]) {
    canopy(-345, -338.5, z0, z1, G0 + 4.4);
    for (let z = z0 + 3; z < z1 - 2; z += 8) { mb.box(-339.2, -338.8, G0, G0 + 4.4, z - 0.2, z + 0.2, STEEL, 'NSEW'); phys.addCylinder(-339, z, 0.25, G0 - 1, G0 + 4.4); }
  }
  sb.board(-341.8, -153, 1, 0, 18, G0 + 9.9, G0 + 9.9 + 18 * 112 / 768, stationBoard(ctx, A));
  { const uv = crownSign(ctx, A, '花渡駅', '#ffffff'), w = 42; sb.board(-344.8, -208, 1, 0, w, G0 + 16.5, G0 + 16.5 + w * 96 / 512, uv); }
  { const uv = crownSign(ctx, A, '花渡百貨店', '#f7d3de'), w = 46; sb.board(-390, 2.1, 0, 1, w, 37.6 + G0 - 1 - w * 96 / 512, 37.6 + G0 - 1, uv); sb.board(-349.9, -26, 1, 0, 34, 37.6 + G0 - 1 - 34 * 96 / 512, 37.6 + G0 - 1, uv); }
  { const uv = crownSign(ctx, A, 'HOTEL HANAWATARI', '#ffffff'), w = 36; sb.board(-314, -259.9, 0, 1, w, 56.9 + G0 - 1 - w * 96 / 512, 56.9 + G0 - 1, uv); }
  // the station building's ground floor: shop glass with interiors and fascia signs behind the canopy; the concourse's
  // glass atrium the deck runs into
  { const tb = { P: [], N: [], U: [], C: [], I: [] };
    const iquad = (a, b, c, d, uv) => { const k = tb.P.length / 3, U = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]; [a, b, c, d].forEach((p, i) => { tb.P.push(...p); tb.N.push(1, 0, 0); tb.U.push(...U[i]); tb.C.push(1, 1, 1); }); tb.I.push(k, k + 1, k + 2, k, k + 2, k + 3); };
    const shops = [['はなまるマート', 'HANAMARU MART', 'konbiniA', 'konbini'], ['はなわたり珈琲', 'HANAWATARI COFFEE', 'pinkChain', 'cafe'], ['花渡書店', 'HANAWATARI SHOTEN', 'white', 'books'],
      ['ベーカリー こむぎ舎', 'bakery komugisha', 'wood', 'bakery'], ['ドラッグ ヒカリ', 'DRUG HIKARI', 'yellowBlue', 'drug'], ['はなモバイル', 'HANA MOBILE', 'pinkChain', 'shop'],
      ['みどりの窓口', 'TICKET OFFICE', 'green', 'bank'], ['駅そば 花渡', '', 'indigo', 'ramen'], ['ブティック リラ', 'boutique lila', 'cream', 'clothes']];
    let si = 0;
    for (const [z0, z1] of [[-248, -168], [-138, -62]]) for (let z = z0; z + 9 <= z1 + 0.01; z += 10) {
      const [name, sub, style, inter] = shops[si++ % shops.length], x = -344.96, y0 = G0 + 0.12, y1 = G0 + 3.2;
      iquad([x, y0, z + 9], [x, y0, z], [x, y1, z], [x, y1, z + 9], kit.INT.uv[inter]);
      sb.board(-344.9, z + 4.5, 1, 0, 8.4, G0 + 3.35, G0 + 3.35 + 8.4 * 64 / 384 * 0.62, fasciaSign(ctx, A, name, sub, style));
      mb.box(-345, -344.8, G0, G0 + 4.3, z + 9, z + 10, rgb('#cfcac0'), 'E');                          // pier between shops
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(tb.P, 3)); g2.setAttribute('normal', new THREE.Float32BufferAttribute(tb.N, 3));
    g2.setAttribute('uv', new THREE.Float32BufferAttribute(tb.U, 2)); g2.setIndex(tb.I); g2.computeBoundingSphere();
    var interiorMesh = new THREE.Mesh(g2, kit.interior); ctx.noOutline(interiorMesh);
    // atrium: glass box out of the concourse (x −348 … −342), two storeys, the deck passing into it
    const ax0 = -348, ax1 = -342, az0 = -165, az1 = -141, ay0 = G0, ay1 = G0 + 9.4, dT = G0 + DECK.h, dB = dT - 0.8;
    const glassWall = (x, za, zb, ya, yb) => { mb.quad([x, ya, zb], [x, ya, za], [x, yb, za], [x, yb, zb], GLASS); };
    glassWall(ax1, az0, DECK.z0, ay0, ay1); glassWall(ax1, DECK.z1, az1, ay0, ay1);
    glassWall(ax1, DECK.z0, DECK.z1, ay0 + 3.3, dB); glassWall(ax1, DECK.z0, DECK.z1, dT + 2.6, ay1);   // over the doors; over the deck
    mb.quad([ax1, ay0, az0], [ax0, ay0, az0], [ax0, ay1, az0], [ax1, ay1, az0], GLASS); mb.quad([ax0, ay0, az1], [ax1, ay0, az1], [ax1, ay1, az1], [ax0, ay1, az1], GLASS);
    mb.box(ax0, ax1 + 0.3, ay1, ay1 + 0.35, az0 - 0.3, az1 + 0.3, ROOF, 'NSEWTB');
    for (const z of [az0, DECK.z0, DECK.z1, az1]) mb.box(ax1 - 0.12, ax1 + 0.12, ay0, ay1, z - 0.12, z + 0.12, STEEL, 'NSEW');
    mb.box(ax1 - 0.1, ax1 + 0.1, ay0 + 3.1, ay0 + 3.3, az0, az1, STEEL, 'NSEWT');                        // transom
    // the main entrance to the free passage under the deck: four pairs of automatic doors, open, their leaves slid aside
    for (let z = DECK.z0 + 2.5; z < DECK.z1 - 0.1; z += 2.5) { mb.box(ax1 - 0.05, ax1 + 0.05, ay0, ay0 + 3.1, z - 0.05, z + 0.05, STEEL, 'NSEW'); phys.addCylinder(ax1, z, 0.08, ay0 - 1, ay0 + 3.1); }
    for (let z = DECK.z0 + 0.12; z < DECK.z1 - 0.2; z += 2.5) mb.quad([ax1 + 0.03, ay0 + 0.2, z + 0.62], [ax1 + 0.03, ay0 + 0.2, z], [ax1 + 0.03, ay0 + 3.0, z], [ax1 + 0.03, ay0 + 3.0, z + 0.62], GLASS);
    mb.quad([ax1 + 1.6, ay0 + 0.16, DECK.z1 - 0.5], [ax1 + 1.6, ay0 + 0.16, DECK.z0 + 0.5], [ax1 - 0.6, ay0 + 0.16, DECK.z0 + 0.5], [ax1 - 0.6, ay0 + 0.16, DECK.z1 - 0.5], rgb('#5d5f66'));   // mat
    phys.addBox(ax1, (az0 + DECK.z0) / 2, 0.3, DECK.z0 - az0, 0, ay0 - 1, ay1); phys.addBox(ax1, (DECK.z1 + az1) / 2, 0.3, az1 - DECK.z1, 0, ay0 - 1, ay1);
    phys.addBox((ax0 + ax1) / 2, az0, ax1 - ax0, 0.3, 0, ay0 - 1, ay1); phys.addBox((ax0 + ax1) / 2, az1, ax1 - ax0, 0.3, 0, ay0 - 1, ay1);
    // over the doors: the way in
    sb.board(ax1 + 0.06, (DECK.z0 + DECK.z1) / 2, 1, 0, 7.2, ay0 + 3.4, ay0 + 3.4 + 7.2 * 96 / 512, (() => { const f = ctx.tex.FONTS; return A.cell('east-entrance', 512, 96, (g, w, h) => {
      g.fillStyle = '#26282d'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
      ctx.tex.fitText(g, '東西自由通路  中央改札・西口', 18, 38, w - 150, 30, f.sans, 900);
      g.fillStyle = '#c8ccd4'; ctx.tex.fitText(g, 'Free Passage  ·  Central Gate  ·  West Exit', 19, 74, w - 150, 15, f.en, 700);
      [['TR', '#2f9e44'], ['SM', '#1c7ed6'], ['T', '#e64980']].forEach(([t, c], i) => { const x = w - 110 + i * 38, y = 48; g.fillStyle = c; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.textAlign = 'center'; ctx.tex.fitText(g, t, x, y + 1, 24, 15, f.en, 900); });
    }); })());
    // the atrium's back: the concourse block's faces, and the gaps beside it closed off
    phys.addBox(ax0 - 0.15, (az0 + PASSAGE.z0) / 2, 0.3, PASSAGE.z0 - az0, 0, ay0 - 1, ay1); phys.addBox(ax0 - 0.15, (PASSAGE.z1 + az1) / 2, 0.3, az1 - PASSAGE.z1, 0, ay0 - 1, ay1);
    mb.quad([ax0, ay0, PASSAGE.z0 + 0.03], [ax0, ay0, PASSAGE.z0 - 2], [ax0, ay0 + 5, PASSAGE.z0 - 2], [ax0, ay0 + 5, PASSAGE.z0 + 0.03], rgb('#efece6'));
  }
  // ---------------------------------------------------------------- the berth island: shelters, benches, berth poles
  const IY = G0 + 0.18;
  for (const B of BERTHS) {
    const xs = B.side < 0 ? ISLE[0] : ISLE[2], dir = -B.side, hz = B.side < 0 ? 1 : -1;
    if (B.shelter) {                                                             // the queue stands under it, by the kerb
      const [z0, z1] = B.shelter, xa = xs + dir * 0.3, xb = xs + dir * 2.6, x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      canopy(x0, x1, z0, z1, IY + 2.9);
      mb.box(Math.min(xb, xb + dir * 0.06), Math.max(xb, xb + dir * 0.06), IY + 0.3, IY + 2.3, z0 + 0.5, z1 - 0.5, GLASS, 'NSEWT');   // back glass
      for (let z = z0 + 0.8; z <= z1 - 0.6; z += 6) { const px = xs + dir * 2.35; mb.box(px - 0.08, px + 0.08, IY, IY + 2.9, z - 0.08, z + 0.08, STEEL, 'NSEW'); phys.addCylinder(px, z, 0.12, IY - 1, IY + 2.9); }
      for (let z = z0 + 3; z < z1 - 2; z += 7) { const bx = xs + dir * 1.7; mb.box(bx - 0.25, bx + 0.25, IY + 0.42, IY + 0.5, z - 1, z + 1, BENCH, 'NSEWT'); mb.box(bx - 0.06, bx + 0.06, IY, IY + 0.42, z - 0.8, z - 0.7, STEEL_D, 'NSEW'); mb.box(bx - 0.06, bx + 0.06, IY, IY + 0.42, z + 0.7, z + 0.8, STEEL_D, 'NSEW'); }
    }
    // the berth pole just ahead of where the bus's front stops: its number (or 降車場) up top, the routes and the
    // timetable facing the queue
    const x = xs + dir * 0.25, z = B.front + hz * 0.6;
    mb.box(x - 0.05, x + 0.05, IY, IY + 2.7, z - 0.05, z + 0.05, STEEL, 'NSEW'); phys.addCylinder(x, z, 0.1, IY - 1, IY + 2.7);
    const uv = B.board ? sticker(ctx, A, B.n + '番', '#2f64b5', '#ffffff') : sticker(ctx, A, '降車場', '#d9463b', '#ffffff');
    sb.board(x, z, -dir, 0, 0.9, IY + 2.25, IY + 2.25 + 0.34, uv, 0.05); sb.board(x, z, dir, 0, 0.9, IY + 2.25, IY + 2.25 + 0.34, uv, 0.05);
    if (B.board) {
      const bb = berthBoard(ctx, A, B.n, B.routes), bz = z - hz * 0.08;
      mb.box(x - 0.34, x + 0.34, IY + 1.02, IY + 1.98, bz - 0.03, bz + 0.03, STEEL_D, 'NSEWT');
      sb.board(x, bz, 0, -hz, 0.64, IY + 1.05, IY + 1.05 + 0.64 * 256 / 192, bb, 0.035);
    } else {
      sb.board(x, z, -dir, 0, 1.6, IY + 1.2, IY + 1.2 + 1.6 * 64 / 384, fasciaSign(ctx, A, '降車専用', 'ARRIVALS', 'navy'), 0.06);
    }
  }
  { const uv = fasciaSign(ctx, A, 'バスのりば', 'BUS TERMINAL', 'navy'); for (const z of [-179.5, -120.5]) { const zz = z < -150 ? z - 0.07 : z + 0.07; sb.board(-299.5, zz, 0, z < -150 ? -1 : 1, 6, IY + 3.3, IY + 3.3 + 1.0, uv); mb.box(-302.6, -296.4, IY + 3.25, IY + 4.35, z - 0.05, z + 0.05, DARK, 'NSEWT'); } }
  // ---------------------------------------------------------------- the pedestrian deck
  const T = G0 + DECK.h, B = T - 0.8, [hx, hz] = DECK.hub, R = DECK.R;
  mb.box(DECK.x0, DECK.x1, B, T, DECK.z0, DECK.z1, DECKC, 'NSEWT'); mb.box(DECK.x0, DECK.x1, B, B, DECK.z0, DECK.z1, DECK_U, 'B');
  phys.addWalkBox((DECK.x0 + DECK.x1) / 2, (DECK.z0 + DECK.z1) / 2, DECK.x1 - DECK.x0, DECK.z1 - DECK.z0, 0, T, B - 0.3);
  // the round deck plaza over the island
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, p0 = [hx + Math.cos(a0) * R, hz + Math.sin(a0) * R], p1 = [hx + Math.cos(a1) * R, hz + Math.sin(a1) * R];
    mb.tri([hx, T, hz], [p1[0], T, p1[1]], [p0[0], T, p0[1]], DECKC);
    mb.tri([hx, B, hz], [p0[0], B, p0[1]], [p1[0], B, p1[1]], DECK_U);
    mb.quad([p1[0], B, p1[1]], [p0[0], B, p0[1]], [p0[0], T, p0[1]], [p1[0], T, p1[1]], shade(DECKC, 0.9));
  }
  for (const [w, d] of [[2 * R, 12], [R * 1.6, 2 * R * 0.8], [R * 1.1, 2 * R * 0.95]]) phys.addWalkBox(hx, hz, w, d, 0, T, B - 0.3);
  // railings: glass panels + handrail along the deck's edges and round the plaza (openings for joins and stairs)
  const rail = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) return;
    const nx = -(z1 - z0) / L * 0.03, nz = (x1 - x0) / L * 0.03;
    mb.quad([x0 - nx, T, z0 - nz], [x1 - nx, T, z1 - nz], [x1 - nx, T + 1.05, z1 - nz], [x0 - nx, T + 1.05, z0 - nz], GLASS);
    mb.quad([x1 + nx, T, z1 + nz], [x0 + nx, T, z0 + nz], [x0 + nx, T + 1.05, z0 + nz], [x1 + nx, T + 1.05, z1 + nz], GLASS);
    mb.quad([x0, T + 1.05, z0], [x1, T + 1.05, z1], [x1, T + 1.13, z1], [x0, T + 1.13, z0], STEEL);
    mb.quad([x1, T + 1.05, z1], [x0, T + 1.05, z0], [x0, T + 1.13, z0], [x1, T + 1.13, z1], STEEL);
    phys.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.12, L, Math.atan2(x1 - x0, z1 - z0), T, T + 1.1);
  };
  const plazaX0 = hx - Math.sqrt(R * R - 25), plazaX1 = hx + Math.sqrt(R * R - 25);     // where the 10 m deck meets the circle
  for (const z of [DECK.z0, DECK.z1]) { rail(-347.5, z, plazaX0, z); rail(plazaX1, z, DECK.x1, z); }
  rail(DECK.x1, DECK.z0, DECK.x1, DECK.z1 - 3.4);                                              // east end (stairs leave south)
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const ex = Math.cos(am), ez = Math.sin(am);
    if (Math.abs(ez) < 0.45) continue;                                                           // the deck joins east and west
    if (Math.abs(ex) < 0.12) continue;                                                           // stair openings north and south
    rail(hx + Math.cos(a0) * R, hz + Math.sin(a0) * R, hx + Math.cos(a1) * R, hz + Math.sin(a1) * R);
  }
  // columns (clear of the ring's lanes)
  for (const [cx, cz] of DECK_COLS) {                                                          // (none in front of the entrance)
    const g0 = gy(cx, cz); mb.box(cx - 0.4, cx + 0.4, g0, B, cz - 0.4, cz + 0.4, CONC, 'NSEW'); phys.addBox(cx, cz, 0.8, 0.8, 0, g0 - 1, B);
  }
  // stairs: plaza → island (north and south), east end → the east strip (south)
  const stairs = (x0, x1, zTop, dir, yTop, yBot) => {       // dir: +1 descending toward +z, −1 toward −z
    const rise = yTop - yBot, nS = Math.round(rise / 0.17), run = rise * 1.8, w = x1 - x0;
    for (let i = 0; i < nS; i++) {
      const za = zTop + dir * run * (i / nS), zb = zTop + dir * run * ((i + 1) / nS), y = yTop - rise * ((i + 1) / nS) + rise / nS;
      mb.box(x0, x1, yBot, y, Math.min(za, zb), Math.max(za, zb), i & 1 ? DECKC : shade(DECKC, 0.95), 'NSEWT');
    }
    const zc = zTop + dir * run / 2;
    phys.addStairs((x0 + x1) / 2, zc, w, run, dir > 0 ? Math.PI : 0, yBot, yTop, nS);
    for (const x of [x0, x1]) { const z2 = zTop + dir * run; mb.quad([x, yTop + 1.0, zTop], [x, yBot + 1.0, z2], [x, yBot + 1.08, z2], [x, yTop + 1.08, zTop], STEEL); mb.quad([x, yBot + 1.0, z2], [x, yTop + 1.0, zTop], [x, yTop + 1.08, zTop], [x, yBot + 1.08, z2], STEEL); }
  };
  stairs(hx - 1.3, hx + 1.3, hz - R + 0.1, -1, T, IY);
  stairs(hx - 1.3, hx + 1.3, hz + R - 0.1, 1, T, IY);
  stairs(DECK.x1 - 3.4, DECK.x1 - 0.2, DECK.z1, 1, T, G0 + 0.15);
  // ---------------------------------------------------------------- taxi pool shelter + sign
  { const x0 = TAXI[0] - 2.6, x1 = TAXI[0] - 0.2;
    canopy(x0, x1, -82, -58, G0 + 3.0);
    for (let z = -81; z <= -59; z += 5.5) { mb.box(x0 + 0.3, x0 + 0.5, G0 + 0.15, G0 + 3.0, z - 0.1, z + 0.1, STEEL, 'NSEW'); phys.addCylinder(x0 + 0.4, z, 0.12, G0 - 1, G0 + 3); }
    sb.board((x0 + x1) / 2, -57.8, 0, 1, 4.2, G0 + 3.3, G0 + 3.3 + 0.7, fasciaSign(ctx, A, 'タクシーのりば', 'TAXI', 'yellowBlue')); }
  // ---------------------------------------------------------------- plazas: clock tower, 交番, benches, area map, bike parking
  { const cx = -296, cz = -14, g0 = gy(cx, cz) + 0.15;
    mb.box(cx - 0.9, cx + 0.9, g0, g0 + 0.5, cz - 0.9, cz + 0.9, CONC, 'NSEWT');
    mb.box(cx - 0.2, cx + 0.2, g0 + 0.5, g0 + 4.6, cz - 0.2, cz + 0.2, STEEL_D, 'NSEW');
    mb.box(cx - 0.75, cx + 0.75, g0 + 4.6, g0 + 6.1, cz - 0.28, cz + 0.28, DARK, 'NSEWT');
    const uv = clockFace(ctx, A); sb.board(cx, cz, 0, 1, 1.3, g0 + 4.7, g0 + 6.0, uv, 0.3); sb.board(cx, cz, 0, -1, 1.3, g0 + 4.7, g0 + 6.0, uv, 0.3);
    phys.addBox(cx, cz, 1.8, 1.8, 0, g0 - 1, g0 + 6.1); }
  { const x0 = -270, x1 = -262, z0 = -8, z1 = -2, g0 = gy(-266, -5) + 0.15;   // 交番
    mb.box(x0, x1, g0, g0 + 3.3, z0, z1, rgb('#efeee8'), 'NSEW'); mb.box(x0 - 0.3, x1 + 0.3, g0 + 3.3, g0 + 3.6, z0 - 0.3, z1 + 0.3, rgb('#5a6570'), 'NSEWT');
    mb.box(x0 + 1, x1 - 1, g0 + 0.1, g0 + 2.3, z1, z1 + 0.05, GLASS, 'S');
    mb.box(-266.2, -265.8, g0 + 3.6, g0 + 4.0, z1 - 0.4, z1, RED, 'NSEWT');
    sb.board(-266, z1 + 0.06, 0, 1, 3.6, g0 + 2.5, g0 + 3.2, fasciaSign(ctx, A, '交番', 'KOBAN', 'white'));
    phys.addBox(-266, -5, 8, 6, 0, g0 - 1, g0 + 3.6); }
  { const cx = -330.5, cz = -30, g0 = gy(cx, cz) + 0.15;                        // area map
    for (const z of [cz - 0.9, cz + 0.9]) mb.box(cx - 0.06, cx + 0.06, g0, g0 + 1.2, z - 0.06, z + 0.06, STEEL_D, 'NSEW');
    mb.box(cx - 0.1, cx + 0.1, g0 + 1.0, g0 + 2.4, cz - 1.1, cz + 1.1, rgb('#1f3a68'), 'NSEWT');
    sb.board(cx, cz, 1, 0, 2.0, g0 + 1.08, g0 + 2.32, areaMap(ctx, A), 0.11); phys.addBox(cx, cz, 0.3, 2.3, 0, g0 - 1, g0 + 2.4); }
  const bench = (x, z, rot) => { const g0 = gy(x, z) + 0.15; mb.obox(x, g0 + 0.4, z, 1.8, 0.08, 0.5, rot, BENCH, 'NSEWT'); mb.obox(x, g0, z, 1.5, 0.4, 0.4, rot, STEEL_D, 'NSEW'); phys.addBox(x, z, 1.8, 0.5, rot, g0 - 1, g0 + 0.45); };
  for (const [x, z] of [[-322, -18], [-322, -6], [-282, -26], [-306, -226], [-292, -226], [-278, -226]]) bench(x, z, 0);
  { const x0 = -331, x1 = -303, z0 = -246, z1 = -242.5, g0 = gy(-317, -244) + 0.15;   // bicycle parking under a roof
    canopy(x0, x1, z0, z1, g0 + 2.4); for (let x = x0 + 0.5; x <= x1; x += 4.5) mb.box(x - 0.06, x + 0.06, g0, g0 + 2.4, z1 - 0.2, z1 - 0.08, STEEL, 'NSEW');
    for (let x = x0 + 0.8; x < x1 - 0.5; x += 0.75) { const c = rgb(['#d9463b', '#2f64b5', '#3f8f5b', '#e8e6df', '#3a3346', '#e8a33c'][Math.floor(Math.abs(Math.sin(x * 9.1)) * 6)]); mb.box(x - 0.03, x + 0.03, g0 + 0.35, g0 + 0.95, z0 + 0.4, z0 + 2.2, c, 'NSEWT'); }
    phys.addBox((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, g0 - 1, g0 + 1.0); }
  // ---------------------------------------------------------------- planters, lamps, the fountain, vending machines, bollards
  const planter = (x0, z0, x1, z1) => { const g0 = gy((x0 + x1) / 2, (z0 + z1) / 2) + 0.15; mb.box(x0, x1, g0, g0 + 0.5, z0, z1, rgb('#b9b3a6'), 'NSEWT'); mb.box(x0 + 0.15, x1 - 0.15, g0 + 0.5, g0 + 0.95, z0 + 0.15, z1 - 0.15, rgb('#5f8f55'), 'NSEWT'); phys.addBox((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, g0 - 1, g0 + 0.5); };
  for (const [z0, z1] of [[-240, -228], [-214, -202], [-100, -92], [-30, -18]]) planter(-321.6, z0, -320.2, z1);
  for (const [x0, x1] of [[-330, -318], [-300, -288], [-276, -266]]) planter(x0, -199.5, x1, -198.2);
  const lamp = (x, z) => { const g0 = gy(x, z) + 0.15; mb.box(x - 0.09, x + 0.09, g0, g0 + 6.4, z - 0.09, z + 0.09, STEEL_D, 'NSEW'); mb.box(x - 0.45, x + 0.45, g0 + 6.3, g0 + 6.5, z - 0.2, z + 0.2, rgb('#e9ebe6'), 'NSEWTB'); phys.addCylinder(x, z, 0.12, g0 - 1, g0 + 6.4); };
  for (const [x, z] of [[-330, -206], [-300, -204], [-270, -206], [-330, -104], [-290, -100], [-330, -36], [-300, -36], [-270, -28], [-306, 4], [-270, -240], [-330, -240]]) lamp(x, z);
  { const cx = -314, cz = -66, r0 = 5, g0 = gy(cx, cz) + 0.15, n2 = 24;      // fountain: a round basin with water and a jet
    for (let i = 0; i < n2; i++) {
      const a0 = (i / n2) * Math.PI * 2, a1 = ((i + 1) / n2) * Math.PI * 2, o0 = [cx + Math.cos(a0) * r0, cz + Math.sin(a0) * r0], o1 = [cx + Math.cos(a1) * r0, cz + Math.sin(a1) * r0];
      const i0 = [cx + Math.cos(a0) * (r0 - 0.5), cz + Math.sin(a0) * (r0 - 0.5)], i1 = [cx + Math.cos(a1) * (r0 - 0.5), cz + Math.sin(a1) * (r0 - 0.5)];
      mb.quad([o1[0], g0, o1[1]], [o0[0], g0, o0[1]], [o0[0], g0 + 0.55, o0[1]], [o1[0], g0 + 0.55, o1[1]], rgb('#c9c3b6'));
      mb.quad([o0[0], g0 + 0.55, o0[1]], [o1[0], g0 + 0.55, o1[1]], [i1[0], g0 + 0.55, i1[1]], [i0[0], g0 + 0.55, i0[1]], rgb('#ddd8cc'));
      mb.tri([cx, g0 + 0.4, cz], [i1[0], g0 + 0.4, i1[1]], [i0[0], g0 + 0.4, i0[1]], rgb('#6fa8c9'));
    }
    mb.box(cx - 0.35, cx + 0.35, g0, g0 + 1.2, cz - 0.35, cz + 0.35, rgb('#c9c3b6'), 'NSEWT');
    mb.box(cx - 0.15, cx + 0.15, g0 + 1.2, g0 + 3.4, cz - 0.15, cz + 0.15, rgb('#e8f3f8'), 'NSEWT');
    phys.addCylinder(cx, cz, r0, g0 - 1, g0 + 0.55); }
  for (let k = 0; k < 3; k++) { const x = TAXI[0] - 3.4, z = -50 - k * 1.1, g0 = gy(x, z) + 0.15;   // vending machines by the taxi shelter
    mb.box(x - 0.4, x + 0.4, g0, g0 + 1.85, z - 0.5, z + 0.5, rgb(['#d9463b', '#2f64b5', '#f2efe6'][k]), 'NSEWT'); mb.box(x + 0.4, x + 0.42, g0 + 0.9, g0 + 1.7, z - 0.4, z + 0.4, rgb('#e8f0f4'), 'E'); phys.addBox(x, z, 0.8, 1.0, 0, g0 - 1, g0 + 1.85); }
  for (const [x0, z0, x1, z1] of DRIVES) for (const z of [z0 - 0.6, z1 + 0.6]) for (let x = x0 + 1; x < x1 - 4.5; x += 2.5) { const g0 = gy(x, z) + 0.15; mb.box(x - 0.1, x + 0.1, g0, g0 + 0.8, z - 0.1, z + 0.1, rgb('#9aa3aa'), 'NSEWT'); }
  // ---------------------------------------------------------------- the west exit square (its furniture: westexit.js)
  paveRect(WEST, (x, z) => (x > WEST[2] - 10 ? 'gran' : 'tile'));
  sb.board(-561.62, -152, -1, 0, 9, G0 + 4.72, G0 + 4.72 + 9 * 112 / 768, (() => { const f = ctx.tex.FONTS; return A.cell('station-west', 768, 112, (g, w, h) => { g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, w, h); g.fillStyle = '#e64980'; g.fillRect(0, h - 10, w, 10); g.fillStyle = '#1f2a44'; g.textAlign = 'center'; g.textBaseline = 'middle'; ctx.tex.fitText(g, '花渡駅 西口', w / 2, 44, w * 0.8, 64, f.sans, 900); g.fillStyle = '#55606f'; ctx.tex.fitText(g, 'HANAWATARI STATION  West Exit  ·  路面電車 花渡駅西口', w / 2, 90, w * 0.9, 17, f.en, 700); }); })());
  // ---------------------------------------------------------------- meshes
  const g = new THREE.Group(); g.name = 'station';
  const m = mb.mesh(ctx.mat.toon('#ffffff', { vertexColors: true, paint: 0.05, name: 'station' })); if (m) g.add(m);
  const s = sb.mesh(kit.sign); if (s) { s.castShadow = false; g.add(s); }
  if (interiorMesh) g.add(interiorMesh);
  g.add(buildWestExit(ctx, kit));
  // 街頭ビジョン on the south block, over the bus terminal
  const vis = buildVision(ctx, { x: -344.85, z0: -122, z1: -108, y0: G0 + 12.8 });
  g.add(vis.group); g.userData.update = vis.update;
  return g;
}
