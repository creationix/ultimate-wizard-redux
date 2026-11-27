// Automatic level solver. Searches the *real* simulation (not an abstraction of
// it) with weighted A*, so any solution it finds is a frame-exact input
// recording that can be replayed in the game and in the test-suite.
import { parseLevel, createState, cloneState, step, encodeInputs, IN, T, C, W, H, TILE } from './sim.js';

const ACTIONS = [IN.R, IN.L, IN.JUMP | IN.R, IN.JUMP | IN.L, IN.U, IN.D, IN.JUMP, 0, IN.CAST, IN.CAST | IN.R, IN.CAST | IN.L];

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = k; V[i] = v;
  }
  pop() {
    const K = this.k, V = this.v, top = V[0], k = K.pop(), v = V.pop(), n = K.length;
    if (n) {
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= k) break; K[i] = K[c]; V[i] = V[c]; i = c; }
      K[i] = k; V[i] = v;
    }
    return top;
  }
}

/** Rough "how many tiles of travel to the goal" map that respects gravity, ladders and portals. */
export function distanceMap(level, targets) {
  const t = level.tiles, N = W * H;
  const solid = (x, y) => x < 0 || x >= W || y < 0 || (y < H && (t[y * W + x] === T.STONE || t[y * W + x] === T.CRUMBLE));
  const climb = (x, y) => y >= 0 && y < H && x >= 0 && x < W && (t[y * W + x] === T.LADDER || t[y * W + x] === T.ROPE);
  const support = (x, y) => y + 1 >= H ? false : solid(x, y + 1) || t[(y + 1) * W + x] === T.LEDGE || t[(y + 1) * W + x] === T.LADDER;
  const rev = Array.from({ length: N }, () => []);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid(x, y)) continue;
    const i = y * W + x;
    for (const dx of [-1, 1]) if (!solid(x + dx, y)) rev[y * W + x + dx].push(i);
    if (y + 1 < H && !solid(x, y + 1)) rev[(y + 1) * W + x].push(i);
    if (y > 0 && !solid(x, y - 1) && (climb(x, y) || climb(x, y - 1) || support(x, y) || (y + 1 < H && !solid(x, y + 1) && support(x, y + 1)))) rev[(y - 1) * W + x].push(i);
  }
  for (const a of level.teleports) for (const b of level.teleports) if (a !== b && a.id === b.id) rev[b.ty * W + b.tx].push(a.ty * W + a.tx);
  const dist = new Int16Array(N).fill(-1);
  let q = [];
  for (const { tx, ty } of targets) { dist[ty * W + tx] = 0; q.push(ty * W + tx); }
  while (q.length) {
    const nq = [];
    for (const i of q) for (const j of rev[i]) if (dist[j] < 0) { dist[j] = dist[i] + 1; nq.push(j); }
    q = nq;
  }
  return dist;
}

// Search states are de-duplicated on a coarse fingerprint. Creatures and flame
// timing only count while they are close enough to matter: otherwise every
// far-away patrol phase would make each position look like a brand new state.
function hashState(s) {
  const p = s.p, L = s.level;
  let k = `${p.x >> 5},${p.y >> 5},${p.vy >> 3},${p.climb ? 1 : 0}${p.ground ? 1 : 0}${p.jmp ? 1 : 0}${s.hasKey ? 1 : 0},${s.taken.join('')},${s.spell}${s.charges},${(s.frost + 15) >> 4},${(s.ward + 15) >> 4},${(s.feather + 15) >> 4}`;
  for (const e of s.enemies) {
    if (!e.alive) k += ';x';
    else if (Math.abs(e.x - p.x) < 7 * TILE && Math.abs(e.y - p.y) < 4 * TILE) k += `;${e.x >> 6},${e.y >> 6},${e.dir}`;
    else k += ';-';
  }
  for (const b of s.bolts) k += `;b${b.x >> 7},${b.y >> 7}`;
  if (L.crumbleCount) k += ';' + s.ct.join('.');
  if (L.hasFlame) {
    const tx = p.x >> 8, ty = p.y >> 8;
    let near = false;
    for (let y = Math.max(0, ty - 2); y <= Math.min(H - 1, ty + 2) && !near; y++) for (let x = Math.max(0, tx - 6); x <= Math.min(W - 1, tx + 6); x++) if (L.tiles[y * W + x] === T.FLAME) { near = true; break; }
    if (near) k += ';f' + ((s.tick % C.FLAME_PERIOD) >> 3);
  }
  return k;
}

function searchStage(start, goal, targets, opts) {
  if (opts.macro) return searchOnce(start, goal, targets, opts);
  // No single search granularity suits every situation, so try a small portfolio.
  let nodes = 0;
  for (const cfg of PORTFOLIO) {
    const r = searchOnce(start, goal, targets, { ...opts, ...cfg });
    nodes += r.nodes;
    if (r.frames) return { ...r, nodes };
    if (opts.shouldStop && opts.shouldStop()) break;
  }
  return { state: null, frames: null, nodes };
}
const PORTFOLIO = [{ macro: 4, weight: 2 }, { macro: 6, weight: 4 }, { macro: 3, weight: 3 }, { macro: 5, weight: 8 }];

function searchOnce(start, goal, targets, opts) {
  const { macro, weight, maxNodes } = opts;
  const dist = distanceMap(start.level, targets);
  const perTile = TILE / (C.WALK * macro);
  const h = (s) => {
    const tx = Math.min(W - 1, Math.max(0, (s.p.x + C.PW / 2) >> 8)), ty = Math.min(H - 1, Math.max(0, (s.p.y + C.PH / 2) >> 8));
    const d = dist[ty * W + tx];
    return (d < 0 ? 80 : d) * perTile;
  };
  const open = new Heap(), seen = new Set();
  open.push(0, { s: start, parent: null, mask: 0, frames: 0, g: 0 });
  seen.add(hashState(start));
  let nodes = 0;
  while (open.size && nodes < maxNodes) {
    const node = open.pop();
    const base = node.s;
    node.s = null;               // free memory: closed nodes only need their path link
    nodes++;
    for (const mask of ACTIONS) {
      if ((mask & IN.CAST) && !(base.spell && base.charges > 0)) continue;
      const s = cloneState(base);
      let f = 0, done = false;
      // A proof of winnability should be clean: routes that take a hit are discarded.
      while (f < macro && !s.dead && s.hp === C.HP) { step(s, mask); f++; if (goal(s)) { done = true; break; } }
      if (s.dead || s.hp < C.HP) continue;
      const child = { s, parent: node, mask, frames: f, g: node.g + 1 };
      if (done) {
        const path = [];
        for (let n = child; n.parent; n = n.parent) path.push(n);
        path.reverse();
        const frames = [];
        for (const n of path) for (let i = 0; i < n.frames; i++) frames.push(n.mask);
        return { state: s, frames, nodes };
      }
      const key = hashState(s);
      if (seen.has(key)) continue;
      seen.add(key);
      open.push(child.g + weight * h(s), child);
    }
  }
  return { state: null, frames: null, nodes };
}

/**
 * Finds an input recording that wins the level.
 *  perfect: also collect every gem before leaving.
 * Returns { ok, inputs (RLE), frames, nodes, reason }.
 */
export function solve(def, options = {}) {
  const opts = { maxNodes: 120000, perfect: false, maxStages: 40, ...options };
  const level = parseLevel(def);
  const items = level.items;
  const keyIdx = items.findIndex((i) => i.kind === 'key'), doorIdx = items.findIndex((i) => i.kind === 'door');
  if (keyIdx < 0 || doorIdx < 0) return { ok: false, reason: 'level needs a key and a door', nodes: 0 };
  let nodes = 0, stages = 0;

  const finish = (s, frames) => {
    const r = searchStage(s, (x) => x.won, [items[doorIdx]], opts);
    nodes += r.nodes;
    if (opts.log) opts.log(`stage door ${r.frames ? 'ok' : 'FAIL'} nodes=${r.nodes} from ${s.p.x >> 8},${s.p.y >> 8}`);
    return r.frames ? frames.concat(r.frames) : null;
  };

  const collect = (s, frames) => {
    const todo = [];
    for (let i = 0; i < items.length; i++) {
      if (s.taken[i]) continue;
      if (i === keyIdx || (opts.perfect && items[i].kind === 'gem')) todo.push(i);
    }
    if (!todo.length) return finish(s, frames);
    // Try the nearest remaining pickup first; back-track if that order strands us.
    const px = Math.min(W - 1, Math.max(0, (s.p.x + C.PW / 2) >> 8)), py = Math.min(H - 1, Math.max(0, (s.p.y + C.PH / 2) >> 8));
    const ranked = todo.map((i) => { const d = distanceMap(level, [items[i]])[py * W + px]; return { i, d: d < 0 ? 999 : d }; }).sort((a, b) => a.d - b.d);
    for (const { i } of ranked) {
      if (++stages > opts.maxStages) return null;
      const r = searchStage(s, (x) => x.taken[i] === 1, [items[i]], opts);
      nodes += r.nodes;
      if (opts.log) opts.log(`stage ${items[i].kind}@${items[i].tx},${items[i].ty} ${r.frames ? 'ok' : 'FAIL'} nodes=${r.nodes}`);
      if (!r.frames) continue;
      const done = collect(r.state, frames.concat(r.frames));
      if (done) return done;
    }
    return null;
  };

  const frames = collect(createState(level, { events: false }), []);
  if (!frames) return { ok: false, reason: 'no solution found within the search budget', nodes };
  return { ok: true, inputs: encodeInputs(frames), frames: frames.length, nodes };
}
