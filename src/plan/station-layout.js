// 花渡駅東口 — the east square as pure data, shared by the station builder (city/station.js), the road network (the two
// drives out to 宿場町通り are streets of it: a fourth arm of the lights at 駅前通り, and a mouth opposite a side
// street), the lane graph (the bus ring and the taxi pool are private lanes, plan/lanes.js), the walks and the rotary
// (city/rotary.js).
//  • the bus terminal: a one-way ring round an island of berths, anticlockwise so that the doors (on the left) face the
//    island. Every berth is a bay beside the through lane, so a bus can pass one standing at a berth. Buses come in off
//    the drive into the alighting bay (4番, 降車場), pull up at their boarding berth (1–3番) and leave by the drive;
//  • the taxi pool: in off its drive, round the back to the queue along the stand, out past the head of the queue.
// x grows east, z south; a lane's points run in its direction of travel; [x, z, r]: a corner rounded to radius r.

export const EAST = [-348, -250, -256.5, 8];                  // x0, z0, x1, z1 (the square, station face .. street)
export const FORE = -333;                                      // forecourt: station face .. here
export const RING = [-321, -192, -278, -108], ISLE = [-311, -182, -288, -118], TAXI = [-296, -84, -262, -46];
export const DRIVES = [[-278, -135, -256.5, -119], [-262, -76, -256.5, -64]];
export const DECK = { x0: -348, x1: -264, z0: -158, z1: -148, h: 6.2, hub: [-299.5, -153], R: 12 };
/** Zebras across the ring, from the forecourt to the island and from the island to the east strip: [x0, x1, z0, z1]. */
export const RING_ZEBRAS = [[RING[0], ISLE[0], -128, -124], [ISLE[2], RING[2], -139, -135]];

const BAY = 1.6, OUT = 6;                                      // lane centres off the island's kerb: bays, through lanes
const XW = ISLE[0] - BAY, XWo = ISLE[0] - OUT, XE = ISLE[2] + BAY, XEo = ISLE[2] + OUT, ZN = ISLE[1] - 5, ZS = ISLE[3] + 5;

/** The berths. side −1: the island's west kerb (buses heading south), +1: its east kerb (heading north). front: where
 *  the bus's front stops (z); box: the yellow box; shelter: the roof over the queue (z0, z1); board: people get on. */
export const BERTHS = [
  { n: 1, bay: 'B1', side: -1, front: -167, box: [-178.5, -166], shelter: [-179, -165], board: true, routes: ['花01', '花02'] },
  { n: 2, bay: 'B2', side: -1, front: -129, box: [-140.5, -128.3], shelter: [-141.5, -128.8], board: true, routes: ['花11', '花12'] },
  { n: 3, bay: 'B3', side: 1, front: -180, box: [-181, -168.5], shelter: [-181.5, -168], board: true, routes: ['花21', '深夜'] },
  { n: 4, bay: 'B4', side: 1, front: -152.5, box: [-153.5, -141], shelter: null, board: false, routes: [] },
];
/** The island's walks: along the west and east rows of berths (x), across its north and south ends and by the foot of
 *  the south stairs (z). */
export const ISLAND_WALK = { w: -307.4, e: -291.6, n: -180.6, s: -119.4, x: -127.6 };
/** Where the queue of taxis stops (the front of the one at the head), and the stand's kerb. */
export const TAXI_HEAD = { x: -294.8, z: -79 }, TAXI_STAND = { x: -296, z0: -82, z1: -58 };

/** The drives: streets of the road network (plan/network.js), each ending in the square where the private lanes go on.
 *  at: the junction on 宿場町通り they join; to: their end in the square. laneD: the lanes' offset from the middle. */
export const STATION_DRIVES = [
  { id: 'drive-bus', road: 'shukuba', at: [-246.8, -126.9], to: [-278, -126.9], w: 16, laneD: 3.4, crosswalk: true, phaseMajor: true, net: 'bus' },
  { id: 'drive-taxi', road: 'shukuba', at: [-248.2, -70.1], to: [-266, -70.1], w: 12, net: 'taxi' },
];

/** The private lanes (plan/lanes.js builds them as links of one lane each). links: name → [points, control at its
 *  end, 'bay' (only to stop there: routes don't pass through)]; joins: [node, from, to] — 'in' is the drive's lane into
 *  the square, 'out' the one back to the street. */
export const BUS_NET = {
  name: 'bus', drive: 'drive-bus', vmax: 5.5, inControl: 'yield',
  links: {
    B4: [[[XE, -135], [XE, -154]], 'yield', 'bay'],                  // 降車場 (alighting)
    E1: [[[XEo, -135], [XEo, -156]], 'priority'],
    E2: [[[XEo, -160.5], [XEo, -163]], 'free'],
    B3: [[[XE, -169], [XE, -181]], 'yield', 'bay'],
    E3: [[[XEo, -167], [XEo, -181]], 'priority'],
    N: [[[-292, ZN], [-307, ZN]], 'free'],
    B1: [[[XW, -181.5], [XW, -165.5]], 'yield', 'bay'],
    W1: [[[XWo, -181.5], [XWo, -162]], 'priority'],
    W2: [[[XWo, -158], [XWo, -155]], 'free'],
    B2: [[[XW, -148.5], [XW, -121.5]], 'yield', 'bay'],
    W3: [[[XWo, -151], [XWo, -121.5]], 'priority'],
    S: [[[-306, ZS], [XEo, ZS, 5.5], [XEo, -124]], 'priority'],
  },
  joins: [
    ['MX', 'in', 'B4'], ['MX', 'S', 'E1'], ['MX', 'S', 'out'],
    ['M4', 'B4', 'E2'], ['M4', 'E1', 'E2'], ['S3', 'E2', 'B3'], ['S3', 'E2', 'E3'], ['NE', 'B3', 'N'], ['NE', 'E3', 'N'],
    ['S1', 'N', 'B1'], ['S1', 'N', 'W1'], ['M1', 'B1', 'W2'], ['M1', 'W1', 'W2'], ['S2', 'W2', 'B2'], ['S2', 'W2', 'W3'],
    ['SW', 'B2', 'S'], ['SW', 'W3', 'S'],
  ],
};
export const TAXI_NET = {
  name: 'taxi', drive: 'drive-taxi', vmax: 4.5, inControl: 'free',
  links: {
    TQ: [[[-267, -67.9], [-279, -67.9, 4], [-279, -50.5, 4], [TAXI_HEAD.x, -50.5, 3.5], [TAXI_HEAD.x, -82, 3.5], [-276, -82, 4], [-271, -72.3, 3], [-266.5, -72.3]], 'free'],
  },
  joins: [['TX', 'in', 'TQ'], ['TX', 'TQ', 'out']],
};
