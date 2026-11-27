// Runekeep simulation core.
// Pure, deterministic, DOM-free. All positions are integers in "units"
// (16 units = 1 pixel, 256 units = 1 tile) so that a replay of the same inputs
// produces bit-identical results on every platform. The game, the level
// solver and the test-suite all drive this exact same code.

export const PX = 16, TILE = 256, W = 24, H = 15;
export const T = { EMPTY: 0, STONE: 1, LEDGE: 2, LADDER: 3, ROPE: 4, SPIKES: 5, CRUMBLE: 6, FLAME: 7 };
export const IN = { L: 1, R: 2, U: 4, D: 8, JUMP: 16, CAST: 32 };

export const C = {
  PW: 160, PH: 224,            // player hit box (10 x 14 px)
  WALK: 20, CLIMB: 14,
  G: 4, JUMP: 68, JUMP_CUT: 24, HOP: 40, MAXFALL: 96, FEATHER_FALL: 12,
  FALL_LIMIT: 1152,            // 4.5 tiles: longer drops are fatal
  COYOTE: 5, JUMPBUF: 6,
  CRUMBLE_T: 24,
  FLAME_PERIOD: 180, FLAME_ON: 90,
  FROST_T: 300, WARD_T: 240, FEATHER_T: 360,
  BOLT_SPEED: 40, BOLT_W: 128, BOLT_H: 64,
  GHOUL_SPEED: 8, GW: 192, GH: 224,
  BAT_SPEED: 12, BW: 192, BH: 160,
  GEM_SCORE: 100, KILL_SCORE: 50,
};

export const SPELLS = {
  bolt: { charges: 3, label: 'Bolt' },
  frost: { charges: 1, label: 'Frost' },
  feather: { charges: 1, label: 'Feather' },
  ward: { charges: 1, label: 'Ward' },
};

const TILE_CHARS = { ' ': T.EMPTY, '#': T.STONE, '=': T.LEDGE, 'H': T.LADDER, '|': T.ROPE, '^': T.SPIKES, '~': T.CRUMBLE, 'F': T.FLAME };
const ITEM_CHARS = { K: 'key', D: 'door', $: 'gem', b: 'bolt', f: 'frost', e: 'feather', w: 'ward' };
const ENEMY_CHARS = { g: 'ghoul', s: 'bat', S: 'vbat' };
const TELE_CHARS = '123';
export const LEGAL_CHARS = Object.keys(TILE_CHARS).join('') + Object.keys(ITEM_CHARS).join('') + Object.keys(ENEMY_CHARS).join('') + TELE_CHARS + '@';

const solidT = (t) => t === T.STONE || t === T.CRUMBLE;
const climbT = (t) => t === T.LADDER || t === T.ROPE;

/** Returns a list of human readable problems with a level definition (empty = valid). */
export function validateLevel(def) {
  const errs = [];
  if (!def || !Array.isArray(def.map)) return ['level has no map'];
  if (def.map.length !== H) errs.push(`map must have ${H} rows, has ${def.map.length}`);
  const count = {};
  def.map.forEach((row, y) => {
    if (typeof row !== 'string' || row.length !== W) errs.push(`row ${y} must be ${W} chars, is ${row?.length}`);
    for (const ch of String(row)) {
      if (!LEGAL_CHARS.includes(ch)) errs.push(`row ${y}: illegal character "${ch}"`);
      count[ch] = (count[ch] || 0) + 1;
    }
  });
  if (count['@'] !== 1) errs.push(`needs exactly one start (@), has ${count['@'] || 0}`);
  if (count.K !== 1) errs.push(`needs exactly one key (K), has ${count.K || 0}`);
  if (count.D !== 1) errs.push(`needs exactly one door (D), has ${count.D || 0}`);
  for (const ch of TELE_CHARS) if (count[ch] && count[ch] !== 2) errs.push(`portal ${ch} must appear exactly twice, appears ${count[ch]}`);
  if (!(def.time > 0)) errs.push('time limit must be positive');
  return errs;
}

/** Parses a level definition into the immutable structure the simulation uses. */
export function parseLevel(def) {
  const tiles = new Uint8Array(W * H);
  const crumbleSlot = new Int16Array(W * H).fill(-1);
  const items = [], enemies = [], teleports = [];
  let start = { tx: 1, ty: 1 }, crumbleCount = 0, hasFlame = false;
  for (let y = 0; y < H; y++) {
    const row = (def.map[y] || '').padEnd(W, ' ');
    for (let x = 0; x < W; x++) {
      const ch = row[x], i = y * W + x;
      if (ch in TILE_CHARS) {
        tiles[i] = TILE_CHARS[ch];
        if (tiles[i] === T.CRUMBLE) crumbleSlot[i] = crumbleCount++;
        if (tiles[i] === T.FLAME) hasFlame = true;
      } else if (ch === '@') start = { tx: x, ty: y };
      else if (ch in ITEM_CHARS) items.push({ kind: ITEM_CHARS[ch], tx: x, ty: y });
      else if (ch in ENEMY_CHARS) enemies.push({ kind: ENEMY_CHARS[ch], tx: x, ty: y });
      else if (TELE_CHARS.includes(ch)) teleports.push({ id: ch, tx: x, ty: y });
    }
  }
  return {
    id: def.id || '', name: def.name || 'Untitled', hint: def.hint || '', theme: def.theme | 0,
    time: def.time || 120, tiles, crumbleSlot, crumbleCount, hasFlame, start, items, enemies, teleports,
    gemCount: items.filter((i) => i.kind === 'gem').length,
  };
}

/** Stable content hash of a level's gameplay-relevant data (used to pin stored solutions). */
export function levelHash(def) {
  const str = def.map.join('\n') + '|' + def.time;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function createState(level, { events = true } = {}) {
  return {
    level, tick: 0, prevInp: 0,
    p: {
      x: level.start.tx * TILE + (TILE - C.PW) / 2, y: level.start.ty * TILE + TILE - C.PH,
      vx: 0, vy: 0, face: 1, ground: false, climb: false,
      peakY: level.start.ty * TILE + TILE - C.PH, coyote: 0, jumpBuf: 0, grabCd: 0, jmp: false,
    },
    ct: new Uint8Array(level.crumbleCount),   // 0 intact, 1..N counting down, 255 gone
    taken: new Uint8Array(level.items.length),
    hasKey: false, gems: 0, score: 0, kills: 0,
    spell: '', charges: 0, frost: 0, ward: 0, feather: 0,
    enemies: level.enemies.map((e) => e.kind === 'ghoul'
      ? { kind: e.kind, x: e.tx * TILE + 32, y: e.ty * TILE + TILE - C.GH, dir: 1, alive: true }
      : { kind: e.kind, x: e.tx * TILE + 32, y: e.ty * TILE + 48, dir: 1, alive: true }),
    bolts: [],
    dead: null, won: false,
    events: events ? [] : null,
  };
}

export function cloneState(s) {
  const p = s.p;
  return {
    level: s.level, tick: s.tick, prevInp: s.prevInp,
    p: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, face: p.face, ground: p.ground, climb: p.climb, peakY: p.peakY, coyote: p.coyote, jumpBuf: p.jumpBuf, grabCd: p.grabCd, jmp: p.jmp },
    ct: s.ct.length ? s.ct.slice() : s.ct,
    taken: s.taken.slice(),
    hasKey: s.hasKey, gems: s.gems, score: s.score, kills: s.kills,
    spell: s.spell, charges: s.charges, frost: s.frost, ward: s.ward, feather: s.feather,
    enemies: s.enemies.map((e) => ({ kind: e.kind, x: e.x, y: e.y, dir: e.dir, alive: e.alive })),
    bolts: s.bolts.map((b) => ({ x: b.x, y: b.y, dir: b.dir })),
    dead: s.dead, won: s.won,
    events: s.events ? [] : null,
  };
}

/** Exact, full-precision fingerprint of everything that affects future simulation. */
export function stateKey(s) {
  const p = s.p;
  return [s.tick, s.prevInp, p.x, p.y, p.vx, p.vy, p.face, +p.ground, +p.climb, p.peakY, p.coyote, p.jumpBuf, p.grabCd, +p.jmp,
    s.ct.join('.'), s.taken.join(''), +s.hasKey, s.gems, s.score, s.spell, s.charges, s.frost, s.ward, s.feather,
    s.enemies.map((e) => `${e.x},${e.y},${e.dir},${+e.alive}`).join(';'),
    s.bolts.map((b) => `${b.x},${b.y},${b.dir}`).join(';'), s.dead, +s.won].join('|');
}

export function tileAt(s, tx, ty) {
  if (tx < 0 || tx >= W || ty < 0) return T.STONE;
  if (ty >= H) return T.EMPTY;
  const i = ty * W + tx, t = s.level.tiles[i];
  if (t === T.CRUMBLE && s.ct[s.level.crumbleSlot[i]] === 255) return T.EMPTY;
  return t;
}
export const isSolid = (s, tx, ty) => solidT(tileAt(s, tx, ty));
/** One-way surfaces: ledges, and the top rung of a ladder. */
export function isOneWay(s, tx, ty) {
  const t = tileAt(s, tx, ty);
  return t === T.LEDGE || (t === T.LADDER && tileAt(s, tx, ty - 1) !== T.LADDER);
}
export function rectSolid(s, x, y, w, h) {
  const x0 = x >> 8, x1 = (x + w - 1) >> 8, y0 = y >> 8, y1 = (y + h - 1) >> 8;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolid(s, tx, ty)) return true;
  return false;
}
export const flameOn = (s) => (s.tick % C.FLAME_PERIOD) < C.FLAME_ON;
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

function ev(s, type, x, y, extra) { if (s.events) s.events.push({ type, x, y, extra }); }
function die(s, why) { if (!s.dead) { s.dead = why; ev(s, 'die', s.p.x + C.PW / 2, s.p.y + C.PH / 2, why); } }

/** Advance the world by exactly one 60 Hz frame with the given input bitmask. */
export function step(s, inp) {
  if (s.dead || s.won) return s;
  if (s.events) s.events.length = 0;
  s.tick++;
  const pressed = inp & ~s.prevInp;
  s.prevInp = inp;
  if (s.frost > 0) s.frost--;
  if (s.ward > 0) s.ward--;
  if (s.feather > 0) s.feather--;

  if ((pressed & IN.CAST) && s.spell && s.charges > 0) cast(s);
  stepPlayer(s, inp, pressed);
  if (!s.dead) {
    stepCrumble(s);
    stepHazards(s);
    stepPickups(s);
  }
  stepEnemies(s);
  stepBolts(s);
  if (!s.won && !s.dead && s.tick >= s.level.time * 60) die(s, 'time');
  return s;
}

function cast(s) {
  const p = s.p, cx = p.x + C.PW / 2, cy = p.y + C.PH / 2;
  if (s.spell === 'bolt') s.bolts.push({ x: p.face > 0 ? p.x + C.PW : p.x - C.BOLT_W, y: p.y + 64, dir: p.face });
  else if (s.spell === 'frost') s.frost = C.FROST_T;
  else if (s.spell === 'ward') s.ward = C.WARD_T;
  else if (s.spell === 'feather') s.feather = C.FEATHER_T;
  ev(s, 'cast', cx, cy, s.spell);
  if (--s.charges <= 0) { s.spell = ''; s.charges = 0; }
}

function stepPlayer(s, inp, pressed) {
  const p = s.p, L = s.level;
  const dir = ((inp & IN.R) ? 1 : 0) - ((inp & IN.L) ? 1 : 0);
  if (dir) p.face = dir;
  if (p.grabCd > 0) p.grabCd--;
  const ctx = (p.x + C.PW / 2) >> 8;
  const snapX = ctx * TILE + (TILE - C.PW) / 2;

  // Portals: tap Up while standing in one.
  if ((pressed & IN.U) && L.teleports.length) {
    const cty = (p.y + C.PH / 2) >> 8;
    const a = L.teleports.find((t) => t.tx === ctx && t.ty === cty);
    const b = a && L.teleports.find((t) => t.id === a.id && t !== a);
    if (b) {
      ev(s, 'teleport', p.x + C.PW / 2, p.y + C.PH / 2);
      p.x = b.tx * TILE + (TILE - C.PW) / 2; p.y = b.ty * TILE + TILE - C.PH;
      p.vx = p.vy = 0; p.climb = false; p.peakY = p.y; p.ground = false;
      ev(s, 'teleport', p.x + C.PW / 2, p.y + C.PH / 2);
      return;
    }
  }

  // Grabbing ladders and ropes.
  if (!p.climb && p.grabCd === 0) {
    let grab = false;
    if (inp & IN.U) grab = climbT(tileAt(s, ctx, (p.y + C.PH / 2) >> 8));
    else if ((inp & IN.D) && p.ground) {
      const fy = (p.y + C.PH) >> 8;
      grab = fy * TILE === p.y + C.PH && tileAt(s, ctx, fy) === T.LADDER;
    }
    if (grab && !rectSolid(s, snapX, p.y, C.PW, C.PH)) {
      p.climb = true; p.x = snapX; p.vx = p.vy = 0; p.ground = false; p.jumpBuf = 0; p.jmp = false;
    }
  }

  if (p.climb) {
    p.peakY = p.y;
    if (pressed & IN.JUMP) {                       // hop off
      p.climb = false; p.vy = -C.HOP; p.grabCd = 14; pressed &= ~IN.JUMP;
      ev(s, 'jump', p.x + C.PW / 2, p.y + C.PH);
    } else if (dir && !(inp & (IN.U | IN.D))) {    // step off sideways
      p.climb = false; p.grabCd = 8;
    } else {
      if (inp & IN.U) {
        let ny = p.y - C.CLIMB;
        if (rectSolid(s, p.x, ny, C.PW, C.PH)) ny = ((ny >> 8) + 1) * TILE;
        const fRow = (ny + C.PH - 1) >> 8;
        if (climbT(tileAt(s, ctx, (ny + C.PH / 2) >> 8)) || climbT(tileAt(s, ctx, fRow))) p.y = ny;
        else if (tileAt(s, ctx, fRow + 1) === T.LADDER) {   // stepped onto the top rung
          p.y = (fRow + 1) * TILE - C.PH; p.climb = false; p.ground = true;
        }
      } else if (inp & IN.D) {
        let ny = p.y + C.CLIMB;
        if (rectSolid(s, p.x, ny, C.PW, C.PH)) {
          p.y = ((ny + C.PH - 1) >> 8) * TILE - C.PH; p.climb = false; p.ground = true;
        } else {
          p.y = ny;
          if (!climbT(tileAt(s, ctx, (ny + C.PH / 2) >> 8)) && !climbT(tileAt(s, ctx, (ny + C.PH - 1) >> 8))) p.climb = false;
        }
      }
      p.peakY = p.y;
      return;
    }
  }

  // Walking, jumping, falling.
  p.vx = dir * C.WALK;
  if (pressed & IN.JUMP) p.jumpBuf = C.JUMPBUF; else if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.ground) p.coyote = C.COYOTE; else if (p.coyote > 0) p.coyote--;
  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = -C.JUMP; p.jumpBuf = 0; p.coyote = 0; p.ground = false; p.jmp = true;
    ev(s, 'jump', p.x + C.PW / 2, p.y + C.PH);
  }
  // Variable jump height: letting go of Jump early cuts the rise short.
  if (p.jmp) {
    if (p.vy >= 0) p.jmp = false;
    else if (!(inp & IN.JUMP)) { p.jmp = false; if (p.vy < -C.JUMP_CUT) p.vy = -C.JUMP_CUT; }
  }
  p.vy += C.G;
  const maxFall = s.feather > 0 ? C.FEATHER_FALL : C.MAXFALL;
  if (p.vy > maxFall) p.vy = maxFall;
  // Holding Down on a ledge drops through it.
  const drop = (inp & IN.D) && p.ground && !rectSolid(s, p.x, p.y + 1, C.PW, C.PH);

  if (p.vx) {
    let nx = p.x + p.vx;
    if (rectSolid(s, nx, p.y, C.PW, C.PH)) nx = p.vx > 0 ? ((nx + C.PW - 1) >> 8) * TILE - C.PW : ((nx >> 8) + 1) * TILE;
    p.x = nx;
  }

  const oldBottom = p.y + C.PH;
  let ny = p.y + p.vy, landed = false;
  if (p.vy > 0) {
    if (rectSolid(s, p.x, ny, C.PW, C.PH)) { ny = ((ny + C.PH - 1) >> 8) * TILE - C.PH; landed = true; }
    else if (!drop) {
      const row = (ny + C.PH - 1) >> 8, top = row * TILE;
      if (oldBottom <= top) {
        for (let tx = p.x >> 8; tx <= (p.x + C.PW - 1) >> 8; tx++) {
          if (isOneWay(s, tx, row)) { ny = top - C.PH; landed = true; break; }
        }
      }
    }
  } else if (p.vy < 0 && rectSolid(s, p.x, ny, C.PW, C.PH)) { ny = ((ny >> 8) + 1) * TILE; p.vy = 0; }

  if (s.feather > 0) p.peakY = ny;
  if (landed) {
    if (!p.ground) {
      const fell = ny - p.peakY;
      if (fell > C.FALL_LIMIT) die(s, 'fall');
      else if (fell > 96) ev(s, 'land', p.x + C.PW / 2, ny + C.PH);
    }
    p.vy = 0; p.ground = true; p.peakY = ny;
  } else {
    p.ground = false;
    if (ny < p.peakY) p.peakY = ny;
  }
  p.y = ny;
  if (p.y > H * TILE) die(s, 'pit');
}

function stepCrumble(s) {
  const L = s.level;
  if (!L.crumbleCount) return;
  const p = s.p;
  if (p.ground) {
    const row = (p.y + C.PH) >> 8;
    for (let tx = p.x >> 8; tx <= (p.x + C.PW - 1) >> 8; tx++) {
      if (tx < 0 || tx >= W || row < 0 || row >= H) continue;
      const slot = L.crumbleSlot[row * W + tx];
      if (slot >= 0 && s.ct[slot] === 0) { s.ct[slot] = C.CRUMBLE_T; ev(s, 'crack', tx * TILE + 128, row * TILE); }
    }
  }
  for (let i = 0; i < W * H; i++) {
    const slot = L.crumbleSlot[i];
    if (slot < 0) continue;
    const t = s.ct[slot];
    if (t > 0 && t < 255) {
      if (t === 1) { s.ct[slot] = 255; ev(s, 'crumble', (i % W) * TILE + 128, ((i / W) | 0) * TILE + 128); }
      else s.ct[slot] = t - 1;
    }
  }
}

function stepHazards(s) {
  const p = s.p;
  const x = p.x + 32, y = p.y + 32, w = C.PW - 64, h = C.PH - 32;
  for (let ty = y >> 8; ty <= (y + h - 1) >> 8; ty++) {
    for (let tx = x >> 8; tx <= (x + w - 1) >> 8; tx++) {
      const t = tileAt(s, tx, ty);
      if (t === T.SPIKES && p.y + C.PH > ty * TILE + 128) return die(s, 'spikes');
      if (t === T.FLAME && s.ward === 0 && flameOn(s)) return die(s, 'flame');
    }
  }
}

function stepPickups(s) {
  const p = s.p, items = s.level.items;
  for (let i = 0; i < items.length; i++) {
    if (s.taken[i]) continue;
    const it = items[i];
    if (it.kind === 'door') {
      if (s.hasKey && overlap(p.x, p.y, C.PW, C.PH, it.tx * TILE + 64, it.ty * TILE, 128, 256)) {
        s.won = true; ev(s, 'win', it.tx * TILE + 128, it.ty * TILE + 128);
      }
      continue;
    }
    if (!overlap(p.x, p.y, C.PW, C.PH, it.tx * TILE + 48, it.ty * TILE + 48, 160, 160)) continue;
    s.taken[i] = 1;
    const x = it.tx * TILE + 128, y = it.ty * TILE + 128;
    if (it.kind === 'key') { s.hasKey = true; ev(s, 'key', x, y); }
    else if (it.kind === 'gem') { s.gems++; s.score += C.GEM_SCORE; ev(s, 'gem', x, y); }
    else { s.spell = it.kind; s.charges = SPELLS[it.kind].charges; ev(s, 'scroll', x, y, it.kind); }
  }
}

function stepEnemies(s) {
  const p = s.p, frozen = s.frost > 0;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    let w, h;
    if (e.kind === 'ghoul') {
      w = C.GW; h = C.GH;
      if (!frozen) {
        const nx = e.x + e.dir * C.GHOUL_SPEED;
        const lead = (e.dir > 0 ? nx + w - 1 : nx) >> 8, fy = (e.y + h) >> 8;
        if (rectSolid(s, nx, e.y, w, h) || !(isSolid(s, lead, fy) || isOneWay(s, lead, fy))) e.dir = -e.dir;
        else e.x = nx;
      }
    } else {
      w = C.BW; h = C.BH;
      if (!frozen) {
        const nx = e.kind === 'bat' ? e.x + e.dir * C.BAT_SPEED : e.x;
        const ny = e.kind === 'vbat' ? e.y + e.dir * C.BAT_SPEED : e.y;
        if (rectSolid(s, nx, ny, w, h) || ny + h > H * TILE) e.dir = -e.dir;
        else { e.x = nx; e.y = ny; }
      }
    }
    if (!frozen && !s.dead && !s.won && s.ward === 0 && overlap(p.x + 16, p.y + 16, C.PW - 32, C.PH - 32, e.x + 16, e.y + 16, w - 32, h - 32)) die(s, e.kind === 'ghoul' ? 'ghoul' : 'bat');
  }
}

function stepBolts(s) {
  if (!s.bolts.length) return;
  for (let i = s.bolts.length - 1; i >= 0; i--) {
    const b = s.bolts[i];
    b.x += b.dir * C.BOLT_SPEED;
    const cx = b.x + C.BOLT_W / 2, cy = b.y + C.BOLT_H / 2;
    let gone = cx < 0 || cx >= W * TILE || isSolid(s, cx >> 8, cy >> 8);
    if (!gone) {
      for (const e of s.enemies) {
        const w = e.kind === 'ghoul' ? C.GW : C.BW, h = e.kind === 'ghoul' ? C.GH : C.BH;
        if (e.alive && overlap(b.x, b.y, C.BOLT_W, C.BOLT_H, e.x, e.y, w, h)) {
          e.alive = false; s.kills++; s.score += C.KILL_SCORE; gone = true;
          ev(s, 'kill', e.x + w / 2, e.y + h / 2, e.kind);
          break;
        }
      }
    }
    if (gone) { ev(s, 'fizzle', cx, cy); s.bolts.splice(i, 1); }
  }
}

// ---- Replays -------------------------------------------------------------

/** Run-length encodes a per-frame list of input masks as [mask, count, mask, count, ...]. */
export function encodeInputs(frames) {
  const out = [];
  for (const m of frames) {
    if (out.length && out[out.length - 2] === m) out[out.length - 1]++;
    else out.push(m, 1);
  }
  return out;
}
export function decodeInputs(rle) {
  const out = [];
  for (let i = 0; i < rle.length; i += 2) for (let n = 0; n < rle[i + 1]; n++) out.push(rle[i]);
  return out;
}
/** Plays a run-length encoded input recording against a level and returns the final state. */
export function replay(def, rle) {
  const s = createState(parseLevel(def), { events: false });
  for (let i = 0; i < rle.length && !s.dead && !s.won; i += 2) {
    for (let n = 0; n < rle[i + 1] && !s.dead && !s.won; n++) step(s, rle[i]);
  }
  return s;
}
