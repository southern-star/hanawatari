// What people wear and carry: a role (a salaryman, an office worker, students in uniform, children going home with
// their randoseru, the elderly, people in casual clothes, someone out for a drink) → the body kind, eight colours,
// the parts (hairstyle, glasses, a face mask, a phone, a parasol, a bag…), height and walking pace. Colours are the
// muted ones of a Japanese street, with the occasional bright top.
import { PART } from './body.js';
import { pack } from './render.js';

const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const SKIN = ['#f3d5c0', '#eecbb4', '#e9c2a9', '#f6dccb', '#e4b99f', '#efcfb6'];
const HAIR_Y = ['#1f1c22', '#1f1c22', '#2a211d', '#33251e', '#4a3326', '#5e402c', '#7a5538'];
const HAIR_O = ['#8f8e8c', '#a9a8a4', '#c9c8c2', '#d9d8d2', '#6d6a66'];
const PARASOL = ['#f3efe6', '#1f2024', '#c7b8d8', '#e8c3cf', '#b8c9dd', '#e9e1c9'];
const bit = (...b) => b.reduce((m, k) => m | (1 << PART[k]), 0);
/** Hair for a woman or a girl: long, a bob, a ponytail (twin tails for the young), or short. */
const herHair = (rng, young = false) => { const x = rng(); return x < 0.38 ? bit('longHair') : x < 0.62 ? bit('bob') : x < 0.84 ? bit('ponytail') : young && x < 0.94 ? bit('twinTails') : 0; };
/** The small things: glasses, a face mask, a phone in hand (instead of whatever was in the right hand). */
const extras = (rng, m, p) => {
  if (rng() < p.glasses) m |= bit('glasses');
  if (rng() < p.mask) m |= bit('faceMask');
  if (rng() < p.phone) m = (m & ~bit('briefcase')) | bit('phone');
  else if (rng() < (p.parasol || 0)) m = (m & ~bit('briefcase')) | bit('parasol');
  if (rng() < (p.headphones || 0)) m |= bit('headphones');
  return m;
};

/** Roles and how common each is on a weekday late afternoon (the weights are scaled by the place). */
export const ROLES = {
  salaryman: 16, officeLady: 12, manCasual: 14, womanCasual: 16, studentBoy: 7, schoolgirl: 8, kid: 5, grandpa: 6, grandma: 7,
};

/** A look for a role: { role, kind, cols (8 packed), mask, scale, pace (m/s), accentCol }. */
export function makeLook(role, rng) {
  const skin = pick(rng, SKIN);
  let kind = 'trousers', hair = pick(rng, HAIR_Y), top, bottom, shoes, accent, forearm, legs, mask = 0, scale = 0.97 + rng() * 0.08, pace = 1.3 + rng() * 0.2;
  switch (role) {
    case 'salaryman': case 'drinker': {
      top = pick(rng, ['#25304a', '#3a3d44', '#1e1f24', '#4b4f57', '#2d3340']); bottom = top; forearm = top;
      shoes = '#1b1b1d'; accent = pick(rng, ['#232e4a', '#1a1a1e', '#5e1f28', '#1e3558', '#2b2b30', '#6b1f2a']);
      mask = bit('suit', 'tie') | (rng() < 0.7 ? bit('briefcase') : bit('backpack'));
      if (mask & bit('backpack')) accent = '#1d1d21';
      mask = extras(rng, mask, { glasses: 0.28, mask: 0.1, phone: role === 'drinker' ? 0 : 0.12 });
      hair = pick(rng, ['#1f1c22', '#1f1c22', '#2a211d', '#33251e']); pace = 1.4 + rng() * 0.15; scale = 1.0 + rng() * 0.07;
      if (role === 'drinker') { mask = (mask & ~(bit('briefcase') | bit('backpack') | bit('phone'))) | bit('mug'); if (rng() < 0.4) mask &= ~bit('tie'); }
      break;
    }
    case 'officeLady': {
      kind = 'skirt';
      top = rng() < 0.6 ? pick(rng, ['#f2f0ea', '#f3e9dc', '#e7eef5', '#f2e3e6', '#e9e4d6']) : pick(rng, ['#2d3448', '#5b5f66', '#b9a78a', '#1f2026']);
      bottom = pick(rng, ['#2d3448', '#5b5f66', '#1f2026', '#9c8c74', '#7a6f66']); forearm = rng() < 0.7 ? top : skin;
      legs = rng() < 0.6 ? '#d9bba8' : '#2a2729'; shoes = pick(rng, ['#1d1c1f', '#6b5444', '#c9b397']);
      accent = pick(rng, ['#c9b397', '#1d1c1f', '#6b4a36', '#efe9df', '#8a3b3b']);
      mask = extras(rng, bit('shoulderBag') | herHair(rng), { glasses: 0.15, mask: 0.12, phone: 0.12, parasol: 0.1 });
      if (mask & bit('parasol')) accent = pick(rng, PARASOL);
      scale = 0.93 + rng() * 0.06; pace = 1.3 + rng() * 0.15;
      break;
    }
    case 'manCasual': {
      top = pick(rng, ['#f1f0ec', '#1f2024', '#7c8087', '#2b3a55', '#4d6b4a', '#a83a36', '#c9a44a', '#6a4c7a', '#e2d7c3']);
      bottom = pick(rng, ['#3b4f73', '#34405c', '#1f2024', '#b9a07a', '#6f6d58', '#56595f']); forearm = rng() < 0.6 ? skin : top;
      shoes = pick(rng, ['#efefea', '#efefea', '#1d1d20', '#6b4e3a', '#9aa0a8']);
      accent = pick(rng, ['#1d1d21', '#2b3a55', '#5f646b', '#6d6a4c', '#8c3b36']);
      mask = rng() < 0.45 ? bit('backpack') : rng() < 0.3 ? bit('shoulderBag') : 0;
      if (rng() < 0.14) mask |= bit('hat');
      mask = extras(rng, mask, { glasses: 0.15, mask: 0.08, phone: 0.16, headphones: 0.14 });
      if (rng() < 0.15) hair = pick(rng, ['#7a5538', '#8a6238', '#a0703f']);
      break;
    }
    case 'womanCasual': {
      top = pick(rng, ['#f4f1ea', '#e6d9c7', '#d9b7c4', '#b8c9dd', '#c7d6c0', '#f0d79a', '#2b2d33', '#8aa2c8', '#e8b9a0']);
      bottom = pick(rng, ['#3b4f73', '#1f2024', '#e9e3d6', '#b9a07a', '#6f7584', '#7b5d4a']); forearm = rng() < 0.5 ? skin : top;
      shoes = pick(rng, ['#efefea', '#1d1c1f', '#c9b397', '#8a6a52']); accent = pick(rng, ['#d8c7a8', '#1d1c1f', '#2b3a55', '#efe9df', '#8a3b3b', '#6b4a36']);
      mask = (rng() < 0.5 ? bit('shoulderBag') : rng() < 0.45 ? bit('ecoBag') : 0) | herHair(rng, true);
      mask = extras(rng, mask, { glasses: 0.1, mask: 0.1, phone: 0.14, parasol: 0.14, headphones: 0.05 });
      if (mask & bit('parasol')) accent = pick(rng, PARASOL);
      if (rng() < 0.4) { kind = 'skirt'; legs = rng() < 0.5 ? skin : '#2a2729'; }
      if (rng() < 0.2) hair = pick(rng, ['#7a5538', '#8a6238', '#a0703f', '#5e402c']);
      scale = 0.92 + rng() * 0.07;
      break;
    }
    case 'studentBoy': {
      const gakuran = rng() < 0.55;
      top = gakuran ? '#1c1d24' : '#2a3552'; bottom = gakuran ? '#1c1d24' : '#4f535a'; forearm = top;
      shoes = rng() < 0.5 ? '#1b1b1d' : '#efefea'; accent = pick(rng, ['#1d1d21', '#23304f', '#3a3d44']);
      mask = (rng() < 0.5 ? bit('backpack') : bit('shoulderBag')) | (gakuran ? bit('buttons') : bit('suit', 'tie'));
      if (!gakuran) accent = '#23304f';
      mask = extras(rng, mask, { glasses: 0.18, mask: 0.08, phone: 0.14, headphones: 0.1 });
      hair = pick(rng, ['#1f1c22', '#1f1c22', '#2a211d']); scale = 0.95 + rng() * 0.08; pace = 1.35 + rng() * 0.2;
      break;
    }
    case 'schoolgirl': {
      kind = 'skirt';
      const sailor = rng() < 0.55;
      top = sailor ? '#232b45' : pick(rng, ['#2a3552', '#3d4255', '#5a3d45']); bottom = sailor ? '#232b45' : pick(rng, ['#4a4f6a', '#6b4a55', '#3f4a5e']); forearm = top;
      const bare = rng() < 0.5; legs = bare ? skin : '#232b45'; shoes = pick(rng, ['#3b2a22', '#1b1b1d']);
      accent = sailor ? pick(rng, ['#b8323a', '#1f2a4a', '#1d1d21']) : '#8a2a36';
      mask = (sailor ? bit('collar') : bit('suit', 'tie')) | bit('pleats') | (bare ? bit('socks') : 0) | (rng() < 0.5 ? bit('shoulderBag') : bit('backpack')) | herHair(rng, true);
      mask = extras(rng, mask, { glasses: 0.12, mask: 0.08, phone: 0.14 });
      hair = pick(rng, ['#1f1c22', '#1f1c22', '#2a211d', '#33251e']); scale = 0.92 + rng() * 0.06; pace = 1.3 + rng() * 0.2;
      break;
    }
    case 'kid': {
      kind = 'child';
      top = pick(rng, ['#e85a5a', '#4a90d9', '#f2c14e', '#6cc08b', '#f08fb0', '#f4f2ec', '#8e7cc3']); bottom = pick(rng, ['#2b3a55', '#7a7056', '#56595f', '#3b4f73', '#d98fa8']);
      forearm = rng() < 0.7 ? skin : top; shoes = pick(rng, ['#e85a5a', '#4a90d9', '#efefea', '#f2c14e', '#1d1d20']);
      accent = pick(rng, ['#c9302c', '#1e1e22', '#6b3e2e', '#d97fa3', '#3b5f9e', '#8a3a5f']);
      legs = '#f5d13a'; mask = bit('backpack') | (rng() < 0.6 ? bit('hat') : 0) | (rng() < 0.5 ? bit('socks') : 0) | (rng() < 0.35 ? (rng() < 0.5 ? bit('twinTails') : bit('ponytail')) : 0);
      scale = 0.62 + rng() * 0.16; pace = 1.2 + rng() * 0.3;
      break;
    }
    case 'grandpa': {
      kind = 'elder';
      top = pick(rng, ['#bca98a', '#8d8f93', '#7d5f48', '#3a4258', '#5d6b5a']); bottom = pick(rng, ['#6d6f73', '#9c9282', '#4a4d52']); forearm = top;
      shoes = pick(rng, ['#3b2a22', '#1b1b1d', '#6b5444']); accent = pick(rng, ['#bca98a', '#6d6f73', '#3a4258', '#e9e4d6']);
      hair = pick(rng, HAIR_O); mask = rng() < 0.45 ? bit('hat') : rng() < 0.6 ? bit('bald', 'sideHair') : 0;
      mask = extras(rng, mask, { glasses: 0.5, mask: 0.2, phone: 0.02 });
      scale = 0.92 + rng() * 0.06; pace = 0.85 + rng() * 0.2;
      break;
    }
    case 'grandma': {
      kind = 'elder';
      top = pick(rng, ['#d9b7c4', '#b8c9dd', '#e6d7b8', '#c7d6c0', '#8e7aa6', '#9d7c9a', '#c7b299']); bottom = pick(rng, ['#6d6f73', '#3a4258', '#6b5444', '#8a8174']); forearm = top;
      shoes = pick(rng, ['#3b2a22', '#6b5444', '#1b1b1d']); accent = pick(rng, ['#8e7aa6', '#b8a07a', '#6b7c8f', '#c96a6a', '#e9e4d6']);
      hair = pick(rng, HAIR_O); mask = (rng() < 0.5 ? bit('ecoBag') : rng() < 0.4 ? bit('hat') : 0) | (rng() < 0.5 ? bit('bob') : 0);
      mask = extras(rng, mask, { glasses: 0.35, mask: 0.25, phone: 0.02, parasol: 0.22 });
      if (mask & bit('parasol')) accent = pick(rng, PARASOL);
      scale = 0.86 + rng() * 0.06; pace = 0.8 + rng() * 0.2;
      break;
    }
    default: return makeLook('manCasual', rng);
  }
  legs = legs ?? bottom;
  const cols = [skin, hair, top, bottom, shoes, accent, forearm, legs].map(pack);
  return { role, kind, cols, mask, scale, pace };
}

/** A weighted role, with the place's leanings: w = { role: factor }. */
export function pickRole(rng, w = {}) {
  let tot = 0; for (const [r, v] of Object.entries(ROLES)) tot += v * (w[r] ?? 1);
  let x = rng() * tot;
  for (const [r, v] of Object.entries(ROLES)) { x -= v * (w[r] ?? 1); if (x <= 0) return r; }
  return 'manCasual';
}
/** Who comes along with someone of this role (friends from school, a mother with her child, colleagues). */
export function companionRole(role, rng) {
  if (role === 'schoolgirl') return rng() < 0.85 ? 'schoolgirl' : 'studentBoy';
  if (role === 'studentBoy') return rng() < 0.8 ? 'studentBoy' : 'schoolgirl';
  if (role === 'kid') return rng() < 0.6 ? 'kid' : 'womanCasual';
  if (role === 'womanCasual') return rng() < 0.35 ? 'kid' : rng() < 0.6 ? 'womanCasual' : 'manCasual';
  if (role === 'salaryman') return rng() < 0.7 ? 'salaryman' : 'officeLady';
  if (role === 'officeLady') return rng() < 0.6 ? 'officeLady' : 'salaryman';
  if (role === 'grandpa') return 'grandma';
  if (role === 'grandma') return rng() < 0.5 ? 'grandpa' : 'grandma';
  return role;
}
/** The same person sitting on a bike or at a wheel: nothing in their hands. */
export function seated(L) { return { ...L, mask: L.mask & ~bit('briefcase', 'phone', 'parasol', 'mug', 'ecoBag') }; }
