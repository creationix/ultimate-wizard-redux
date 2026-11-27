// All art is generated at load time from tiny pixel maps and a 16-colour palette
// in the spirit of 1980s home computers - no image files to download.
export const PAL = ['#000000', '#ffffff', '#813338', '#75cec8', '#8e3c97', '#56ac4d', '#2e2c9b', '#edf171',
  '#8e5029', '#553800', '#c46c71', '#4a4a4a', '#7b7b7b', '#a9ff9f', '#706deb', '#b2b2b2'];

export const THEMES = [
  { name: 'Azure Keep', bg0: '#0b0d2e', bg1: '#1a1650', lo: '#1c1b63', mid: '#2e2c9b', hi: '#706deb', cap: '#75cec8' },
  { name: 'Moss Cellar', bg0: '#07140f', bg1: '#12301f', lo: '#1f4a24', mid: '#3a7a35', hi: '#56ac4d', cap: '#a9ff9f' },
  { name: 'Ember Vault', bg0: '#1a0808', bg1: '#3a1512', lo: '#4a1c1f', mid: '#813338', hi: '#c46c71', cap: '#edf171' },
  { name: 'Amethyst Hall', bg0: '#12071a', bg1: '#2a1238', lo: '#4a1f50', mid: '#8e3c97', hi: '#c07fc8', cap: '#edf171' },
  { name: 'Old Stone', bg0: '#0c0c10', bg1: '#22222c', lo: '#333338', mid: '#4a4a4a', hi: '#7b7b7b', cap: '#b2b2b2' },
];

export const WIZARD = {
  idle: [
    '......44........',
    '.....4444.......',
    '.....4444....7..',
    '....444444..717.',
    '...eeeeeeee..7..',
    '....aaaaaa...9..',
    '....a0aa0a...9..',
    '....11aa11..a9..',
    '....111111.669..',
    '...6611116666...',
    '...66e11e66.9...',
    '...666ee666.9...',
    '...66666666.9...',
    '...66666666.9...',
    '..6666666666....',
    '...99....99.....',
  ],
  feetA: ['..6666666666....', '..99......99....'],
  feetB: ['...66666666.....', '....99..99......'],
};
export const GHOUL = [
  [
    '................',
    '....555555......',
    '...55555555.....',
    '..5555555555....',
    '..5215555215....',
    '..5225555225....',
    '..5555555555....',
    '..5550000555....',
    '..5501010055....',
    '..5555555555....',
    '.555555555555...',
    '.5d5555555d5....',
    '.5.55555555.5...',
    '...555..555.....',
    '...555..555.....',
    '..5555..5555....',
  ],
  null,
];
GHOUL[1] = GHOUL[0].slice(0, 13).concat(['...555..555.....', '..555....555....', '.5555....5555...']);
export const BAT = [
  [
    '4......44......4',
    '44....4444....44',
    '444..427724..444',
    '4444444444444444',
    '.44444444444444.',
    '..444.4444.444..',
    '...4...44...4...',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '......4..4......',
    '......4444......',
    '..44.427724.44..',
    '.44444444444444.',
    '4444444444444444',
    '444..444444..444',
    '44....4..4....44',
    '4..............4',
    '................',
  ],
];
const KEY = [
  '................',
  '................',
  '................',
  '....7777........',
  '...778877.......',
  '...78..87.......',
  '...78..8777777..',
  '...78..8788787..',
  '...778877.7..7..',
  '....7777..7..7..',
  '................',
];

function mk(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return [c, c.getContext('2d')];
}
function fromRows(rows, recolor) {
  const [c, g] = mk(16, rows.length);
  rows.forEach((r, y) => {
    for (let x = 0; x < 16; x++) {
      const ch = r[x];
      if (ch && ch !== '.') { g.fillStyle = recolor?.[ch] || PAL[parseInt(ch, 16)]; g.fillRect(x, y, 1, 1); }
    }
  });
  return c;
}
function flipped(src) {
  const [c, g] = mk(src.width, src.height);
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}
function draw(fn, w = 16, h = 16) { const [c, g] = mk(w, h); fn(g); return c; }
const R = (g, color, x, y, w, h) => { g.fillStyle = color; g.fillRect(x, y, w, h); };

export const SPELL_COLORS = { bolt: '#edf171', frost: '#75cec8', feather: '#a9ff9f', ward: '#c46c71' };
export const PORTAL_COLORS = { 1: '#75cec8', 2: '#edf171', 3: '#c46c71' };

let cache = null;
export function sprites() {
  if (cache) return cache;
  const S = {};
  const wz = WIZARD.idle, a = wz.slice(0, 14).concat(WIZARD.feetA), b = wz.slice(0, 14).concat(WIZARD.feetB);
  S.wizard = [wz, a, b].map((rows) => { const r = fromRows(rows); return { r, l: flipped(r) }; });
  S.ghoul = GHOUL.map((rows) => { const r = fromRows(rows); return { r, l: flipped(r) }; });
  S.ghoulFrozen = fromRows(GHOUL[0], { 5: '#75cec8', d: '#ffffff', 2: '#706deb' });
  S.bat = BAT.map((rows) => fromRows(rows));
  S.batFrozen = fromRows(BAT[1], { 4: '#75cec8', 2: '#706deb', 7: '#ffffff' });
  S.key = fromRows(KEY);

  S.gem = draw((g) => {
    for (let y = 0; y < 10; y++) {
      const half = y < 4 ? 2 + y : 9 - y;
      for (let x = -half; x < half; x++) {
        const c = x < -1 && y < 5 ? '#ffffff' : x > 1 || y > 6 ? '#2e2c9b' : y < 4 ? '#75cec8' : '#706deb';
        R(g, c, 8 + x, 3 + y, 1, 1);
      }
    }
    R(g, '#ffffff', 6, 5, 1, 2);
  });
  S.scroll = {};
  for (const [kind, color] of Object.entries(SPELL_COLORS)) {
    S.scroll[kind] = draw((g) => {
      R(g, '#553800', 3, 3, 10, 2); R(g, '#553800', 3, 11, 10, 2);
      R(g, '#8e5029', 2, 3, 1, 2); R(g, '#8e5029', 13, 3, 1, 2); R(g, '#8e5029', 2, 11, 1, 2); R(g, '#8e5029', 13, 11, 1, 2);
      R(g, '#edf1c1', 4, 5, 8, 6); R(g, '#b2b2b2', 4, 10, 8, 1);
      g.fillStyle = color;
      if (kind === 'bolt') { g.fillRect(8, 5, 2, 2); g.fillRect(7, 7, 2, 1); g.fillRect(6, 8, 3, 1); g.fillRect(7, 9, 1, 1); g.fillStyle = '#8e5029'; g.fillRect(9, 6, 1, 1); }
      else if (kind === 'frost') { g.fillRect(7, 5, 1, 5); g.fillRect(5, 7, 5, 1); g.fillRect(6, 6, 1, 1); g.fillRect(8, 6, 1, 1); g.fillRect(6, 8, 1, 1); g.fillRect(8, 8, 1, 1); }
      else if (kind === 'feather') { g.fillStyle = '#56ac4d'; g.fillRect(9, 5, 2, 2); g.fillRect(7, 6, 3, 2); g.fillRect(6, 8, 2, 1); g.fillRect(5, 9, 1, 1); }
      else { g.fillRect(5, 6, 6, 3); g.fillRect(6, 9, 4, 1); g.fillRect(7, 5, 2, 1); g.fillStyle = '#edf1c1'; g.fillRect(7, 7, 2, 1); }
    });
  }
  const door = (open) => draw((g) => {
    R(g, '#4a4a4a', 2, 0, 12, 16); R(g, '#7b7b7b', 2, 0, 12, 1); R(g, '#7b7b7b', 2, 0, 1, 16); R(g, '#333338', 13, 0, 1, 16);
    if (open) {
      R(g, '#0b0d2e', 4, 2, 8, 14); R(g, '#edf171', 5, 3, 6, 13); R(g, '#ffffff', 6, 5, 4, 11);
    } else {
      R(g, '#553800', 4, 2, 8, 14); R(g, '#8e5029', 4, 2, 2, 14); R(g, '#8e5029', 8, 2, 2, 14);
      R(g, '#333338', 4, 5, 8, 1); R(g, '#333338', 4, 12, 8, 1);
      R(g, '#edf171', 9, 8, 2, 2); R(g, '#000000', 10, 9, 1, 2);
    }
  });
  S.door = door(false); S.doorOpen = door(true);

  S.ledge = draw((g) => {
    R(g, '#8e5029', 0, 0, 16, 4); R(g, '#c8884a', 0, 0, 16, 1); R(g, '#553800', 0, 4, 16, 1);
    R(g, '#553800', 7, 1, 1, 3); R(g, '#553800', 15, 1, 1, 3);
    R(g, '#553800', 2, 5, 2, 2); R(g, '#553800', 11, 5, 2, 2);
  });
  S.ladder = draw((g) => {
    R(g, '#8e5029', 3, 0, 2, 16); R(g, '#8e5029', 11, 0, 2, 16);
    R(g, '#553800', 4, 0, 1, 16); R(g, '#553800', 12, 0, 1, 16);
    for (let y = 2; y < 16; y += 4) { R(g, '#c8884a', 5, y, 6, 1); R(g, '#553800', 5, y + 1, 6, 1); }
  });
  S.rope = draw((g) => {
    for (let y = 0; y < 16; y++) { R(g, y % 4 < 2 ? '#c8a25a' : '#8e5029', 7, y, 2, 1); R(g, '#553800', y % 4 < 2 ? 8 : 7, y, 1, 1); }
  });
  S.spikes = draw((g) => {
    for (let i = 0; i < 4; i++) {
      for (let y = 0; y < 8; y++) {
        const w = Math.ceil((y + 1) / 2);
        R(g, '#7b7b7b', i * 4 + 2 - Math.ceil(w / 2), 8 + y, w, 1);
        R(g, '#ffffff', i * 4 + 2 - Math.ceil(w / 2), 8 + y, 1, 1);
      }
    }
    R(g, '#4a4a4a', 0, 15, 16, 1);
  });
  S.crumble = draw((g) => {
    R(g, '#7b7b7b', 0, 0, 16, 16); R(g, '#b2b2b2', 0, 0, 16, 2); R(g, '#4a4a4a', 0, 14, 16, 2);
    g.fillStyle = '#2a2a2e';
    for (const [x, y, w, h] of [[3, 2, 1, 4], [4, 5, 2, 1], [5, 6, 1, 4], [10, 2, 1, 3], [11, 4, 1, 5], [12, 8, 2, 1], [7, 10, 1, 4], [2, 9, 2, 1], [13, 11, 1, 3]]) g.fillRect(x, y, w, h);
  });
  S.nozzle = draw((g) => { R(g, '#4a4a4a', 3, 12, 10, 4); R(g, '#7b7b7b', 3, 12, 10, 1); R(g, '#000000', 5, 13, 6, 2); R(g, '#813338', 6, 14, 4, 1); });
  S.flame = [0, 1, 2].map((f) => draw((g) => {
    const shape = [[6, 4, '#813338'], [5, 6, '#c8501e'], [4, 8, '#f08a2e'], [5, 6, '#edf171'], [6, 4, '#ffffff']];
    const tall = [13, 11, 12][f];
    R(g, '#c8501e', 5, 13 - tall, 6, tall);
    R(g, '#813338', 4 + (f === 1), 14 - tall + 3, 8 - (f === 1), tall - 4);
    R(g, '#f08a2e', 5, 16 - tall, 6, tall - 4);
    R(g, '#edf171', 6, 19 - tall, 4, tall - 7);
    R(g, '#ffffff', 7, 9, 2, 4);
    R(g, '#f08a2e', 6 + f, 12 - tall, 2, 2); R(g, '#c8501e', 9 - f, 11 - tall, 1, 2);
    void shape;
  }));
  S.portal = {};
  for (const [id, color] of Object.entries(PORTAL_COLORS)) {
    S.portal[id] = draw((g) => {
      R(g, '#4a4a4a', 2, 2, 12, 14); R(g, '#7b7b7b', 3, 1, 10, 1); R(g, '#7b7b7b', 2, 2, 1, 14); R(g, '#333338', 13, 2, 1, 14);
      R(g, '#0b0d2e', 4, 3, 8, 13);
      R(g, color, 4, 3, 8, 1); R(g, color, 4, 3, 1, 13); R(g, color, 11, 3, 1, 13);
    });
  }
  S.bolt = draw((g) => { R(g, '#f08a2e', 0, 1, 8, 2); R(g, '#edf171', 2, 1, 6, 2); R(g, '#ffffff', 5, 1, 3, 2); R(g, '#edf171', 6, 0, 2, 4); }, 8, 4);
  cache = S;
  return S;
}

/** Pre-renders everything in a level that never changes into one bitmap. */
export function buildStatic(level) {
  const W = 24, H = 15, th = THEMES[level.theme % THEMES.length], S = sprites();
  const [c, g] = mk(W * 16, H * 16);
  const t = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 1 : level.tiles[y * W + x]);
  const grad = g.createLinearGradient(0, 0, 0, H * 16);
  grad.addColorStop(0, th.bg0); grad.addColorStop(1, th.bg1);
  g.fillStyle = grad; g.fillRect(0, 0, W * 16, H * 16);
  // Faint masonry on the back wall, plus a few arched windows with a night sky.
  let seed = 7; for (const ch of level.name) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.globalAlpha = 0.16; g.fillStyle = th.mid;
  for (let y = 0; y < H * 2; y++) for (let x = -1; x < W; x++) if (rnd() < 0.5) g.fillRect(x * 16 + (y % 2) * 8 + 1, y * 8 + 1, 14, 6);
  g.globalAlpha = 1;
  for (let n = 0; n < 3; n++) {
    const wx = 2 + Math.floor(rnd() * (W - 5)), wy = 1 + Math.floor(rnd() * (H - 6));
    let clear = true;
    for (let y = wy; y < wy + 3; y++) for (let x = wx; x < wx + 2; x++) if (t(x, y) !== 0) clear = false;
    if (!clear) continue;
    const px = wx * 16 + 6, py = wy * 16 + 4;
    R(g, th.lo, px - 2, py, 24, 40); R(g, th.lo, px, py - 2, 20, 2);
    R(g, '#05061a', px, py + 2, 20, 38); R(g, '#05061a', px + 2, py, 16, 2);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) g.fillRect(px + 2 + Math.floor(rnd() * 16), py + 3 + Math.floor(rnd() * 32), 1, 1);
    R(g, '#edf1c1', px + 11, py + 6, 4, 4); R(g, '#05061a', px + 13, py + 5, 3, 3);
    R(g, th.lo, px + 9, py, 2, 40); R(g, th.lo, px, py + 18, 20, 2);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tile = t(x, y), X = x * 16, Y = y * 16;
    if (tile === 1) {
      R(g, th.mid, X, Y, 16, 16);
      R(g, th.hi, X, Y, 16, 1); R(g, th.hi, X, Y + 8, 16, 1);
      R(g, th.lo, X, Y + 7, 16, 1); R(g, th.lo, X, Y + 15, 16, 1);
      R(g, th.lo, X + 7, Y, 1, 8); R(g, th.lo, X + 15, Y, 1, 8); R(g, th.lo, X + 3, Y + 8, 1, 8); R(g, th.lo, X + 11, Y + 8, 1, 8);
      if ((x * 7 + y * 13) % 5 === 0) R(g, th.lo, X + 10, Y + 3, 2, 2);
      if (t(x, y - 1) !== 1 && t(x, y - 1) !== 6) { R(g, th.cap, X, Y, 16, 2); R(g, th.hi, X, Y + 2, 16, 1); if ((x + y) % 3 === 0) R(g, th.cap, X + 5, Y + 2, 3, 2); }
    } else if (tile === 2) g.drawImage(S.ledge, X, Y);
    else if (tile === 3) g.drawImage(S.ladder, X, Y);
    else if (tile === 4) g.drawImage(S.rope, X, Y);
    else if (tile === 5) g.drawImage(S.spikes, X, Y);
    else if (tile === 7) g.drawImage(S.nozzle, X, Y);
    // Soft contact shadow under ceilings and overhangs.
    if (tile !== 1 && tile !== 6 && (t(x, y - 1) === 1 || t(x, y - 1) === 6) && y > 0) {
      const sh = g.createLinearGradient(0, Y, 0, Y + 9);
      sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh; g.fillRect(X, Y, 16, 9);
    }
  }
  return c;
}
