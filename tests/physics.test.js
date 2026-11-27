// Physics and rules of the simulation, exercised on tiny hand-built rooms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { step, cloneState, stateKey, rectSolid, encodeInputs, decodeInputs, parseLevel, createState, IN, C, TILE, W, H } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { level, world, hold, tx, feet, rng } from './helpers.js';

const FLOOR = '#'.repeat(W);

test('the wizard comes to rest exactly on the floor', () => {
  const s = hold(world(['   @', FLOOR]), 0, 30);
  assert.equal(s.p.ground, true);
  assert.equal(feet(s), H - 1);
  assert.equal(s.p.vy, 0);
  assert.equal(s.dead, null);
});

test('walking moves at a constant speed and stops flush against walls', () => {
  const s = hold(world(['   @   #', FLOOR]), 0, 5);
  const x0 = s.p.x;
  hold(s, IN.R, 4);
  assert.equal(s.p.x - x0, 4 * C.WALK);
  hold(s, IN.R, 120);
  assert.equal(s.p.x + C.PW, 7 * TILE, 'right edge touches the wall, no overlap, no gap');
  hold(s, IN.L, 300);
  assert.equal(s.p.x, 0, 'the screen edge is a wall');
});

function jumpPeak(holdFrames) {
  const s = hold(world(['   @', FLOOR]), 0, 5);
  const y0 = s.p.y;
  let peak = 0;
  for (let i = 0; i < 80; i++) { step(s, i < holdFrames ? IN.JUMP : 0); peak = Math.max(peak, y0 - s.p.y); }
  assert.equal(s.p.ground, true, 'lands again');
  return peak / TILE;
}
test('a held jump clears two blocks; a tapped jump is a short hop', () => {
  const full = jumpPeak(60), tap = jumpPeak(1);
  assert.ok(full > 2.05 && full < 2.5, `full jump rises ${full} tiles`);
  assert.ok(tap > 0.3 && tap < 1, `tap jump rises ${tap} tiles`);
});

test('can jump onto a two-high block but not a three-high one', () => {
  const run = (rows) => { const s = hold(world(rows), 0, 5); hold(s, IN.R | IN.JUMP, 40); hold(s, IN.R, 30); return s; };
  const two = run(['    ######', '  @ ######', FLOOR]);
  assert.equal(feet(two), H - 3, 'stands on top of the two-high block');
  const three = run(['    ######', '    ######', '  @ ######', FLOOR]);
  assert.equal(feet(three), H - 1, 'bounces off the three-high wall');
});

test('a running jump clears a three-tile gap but not a six-tile one', () => {
  const run = (gap) => {
    const s = hold(world([' @', '####' + ' '.repeat(gap) + '#'.repeat(W - 4 - gap)]), 0, 5);
    // Walk to the lip, then jump as late as possible.
    while (s.p.x + C.WALK < 4 * TILE - 40) step(s, IN.R);
    hold(s, IN.R | IN.JUMP, 60); hold(s, IN.R, 60);
    return s;
  };
  const ok = run(3);
  assert.equal(ok.dead, null); assert.ok(tx(ok) > 7);
  assert.equal(run(6).dead, 'pit');
});

test('coyote time and jump buffering forgive slightly early or late presses', () => {
  const late = hold(world([' @', '####']), 0, 5);
  while (late.p.ground) step(late, IN.R);          // just walked off the edge
  hold(late, IN.R, C.COYOTE - 2);
  step(late, IN.R | IN.JUMP);
  assert.ok(late.p.vy < 0, 'jump still allowed a few frames after leaving the ledge');

  const early = hold(world(['   @', FLOOR]), 0, 5);
  hold(early, IN.JUMP, 1); hold(early, 0, 1);       // short hop
  while (early.p.vy <= 0) step(early, 0);
  while (!(early.p.y + C.PH > (H - 1) * TILE - 60)) step(early, 0);
  step(early, IN.JUMP); let jumped = false;
  for (let i = 0; i < C.JUMPBUF && !jumped; i++) { step(early, IN.JUMP); jumped = early.p.vy < 0; }
  assert.ok(jumped, 'a press just before landing is remembered');
});

test('ledges are one-way: jump up through them, stand on them, drop through with Down', () => {
  const s = hold(world(['  ===', '   @', FLOOR]), 0, 5);
  hold(s, IN.JUMP, 40); hold(s, 0, 20);
  assert.equal(feet(s), H - 3, 'landed on the ledge from below');
  hold(s, IN.D, 3); hold(s, 0, 30);
  assert.equal(feet(s), H - 1, 'dropped back through');
});

test('ladders: climb up, stand on the top rung, climb back down', () => {
  const s = hold(world(['###H####', '   H', '   H', '   H@', FLOOR]), 0, 5);
  hold(s, IN.L, 13);
  hold(s, IN.U, 120);
  assert.equal(s.p.climb, false);
  assert.equal(s.p.ground, true);
  assert.equal(feet(s), H - 5, 'standing level with the upper floor');
  hold(s, IN.R, 26);
  assert.equal(feet(s), H - 5, 'can walk off the ladder onto the floor');
  hold(s, IN.L, 26); hold(s, IN.D, 4);
  assert.equal(s.p.climb, true, 'Down on the top rung starts climbing');
  hold(s, IN.D, 120);
  assert.equal(feet(s), H - 1);
  assert.equal(s.p.climb, false);
});

test('climbing ignores gravity, and stepping sideways lets go', () => {
  const s = hold(world(['   H', '   H', '   H', '   H', '   H@', FLOOR]), 0, 5);
  hold(s, IN.L, 13); hold(s, IN.U, 30);
  const y = s.p.y;
  hold(s, 0, 60);
  assert.equal(s.p.y, y, 'hangs on without input');
  hold(s, IN.R, 40);
  assert.equal(s.p.climb, false);
  assert.equal(feet(s), H - 1, 'fell back to the floor');
});

test('ropes can be caught in mid-air and hopped off', () => {
  const s = hold(world(['#####', '    |', '    |', '    |', '', ' @', FLOOR]), 0, 5);
  hold(s, IN.R, 20);
  hold(s, IN.R | IN.JUMP | IN.U, 40);
  assert.equal(s.p.climb, true, 'caught the rope while jumping past it');
  hold(s, IN.U, 200);
  assert.equal(s.p.climb, true);
  assert.equal(s.p.y, (H - 6) * TILE, 'stops under the ceiling the rope hangs from');
  hold(s, 0, 2); hold(s, IN.JUMP | IN.R, 10);
  assert.equal(s.p.climb, false, 'jump hops off');
});

test('long falls are fatal, short ones are not, and a feather makes any fall safe', () => {
  const drop = (tiles, feather) => {
    const rows = ['@', '#'];
    for (let i = 0; i < tiles - 1; i++) rows.push('');
    rows.push(FLOOR);
    const s = hold(world(rows), 0, 3);
    if (feather) { s.spell = 'feather'; s.charges = 1; step(s, IN.CAST); }
    hold(s, IN.R, 12); hold(s, 0, 400);
    return s;
  };
  assert.equal(drop(4).dead, null);
  assert.equal(drop(5).dead, 'fall');
  const safe = drop(10, true);
  assert.equal(safe.dead, null);
  assert.equal(safe.p.ground, true);
});

test('spikes kill on contact but can be jumped', () => {
  assert.equal(hold(hold(world([' @  ^', FLOOR]), 0, 5), IN.R, 60).dead, 'spikes');
  const s = hold(world([' @  ^', FLOOR]), 0, 5);
  hold(s, IN.R, 22); hold(s, IN.R | IN.JUMP, 30); hold(s, IN.R, 20);
  assert.equal(s.dead, null);
  assert.ok(tx(s) > 5);
});

test('flame jets only burn while lit, and a ward walks through them', () => {
  const mk = () => hold(world([' @ F', FLOOR]), 0, 1);
  const lit = mk(); hold(lit, IN.R, 60);
  assert.equal(lit.dead, 'flame');
  const unlit = mk(); hold(unlit, 0, C.FLAME_ON); hold(unlit, IN.R, 60);
  assert.equal(unlit.dead, null, 'crossed during the dark half of the cycle');
  const warded = mk(); warded.spell = 'ward'; warded.charges = 1; step(warded, IN.CAST); hold(warded, IN.R, 60);
  assert.equal(warded.dead, null);
});

test('cracked stone holds briefly, then collapses for good', () => {
  const s = hold(world(['@', '~~~', '', '', FLOOR]), 0, 5);
  assert.equal(feet(s), H - 4);
  hold(s, 0, C.CRUMBLE_T + 30);
  assert.equal(feet(s), H - 1, 'fell through once it collapsed');
  assert.equal(s.ct[0], 255);
  assert.equal(s.ct[2], 0, 'untouched tiles stay intact');
});

test('ghouls patrol their platform without ever leaving it', () => {
  const s = world(['   g', '  ######', '', '@', FLOOR]);
  const e = s.enemies[0];
  let min = Infinity, max = -Infinity, turns = 0, dir = e.dir;
  for (let i = 0; i < 1200; i++) {
    step(s, 0);
    min = Math.min(min, e.x); max = Math.max(max, e.x + C.GW);
    if (e.dir !== dir) { turns++; dir = e.dir; }
    assert.equal(e.y, (H - 4) * TILE - C.GH);
  }
  assert.ok(min >= 2 * TILE && max <= 8 * TILE, `stayed within the platform (${min / TILE}..${max / TILE})`);
  assert.ok(turns >= 4);
});

test('touching a creature is fatal', () => {
  assert.equal(hold(world([' @     g', FLOOR]), IN.R, 200).dead, 'ghoul');
  assert.equal(hold(world([' @     s', FLOOR]), 0, 1500).dead, 'bat');
});

test('bats bounce between walls forever', () => {
  const s = world(['#  s   #', '', '', '@', FLOOR]);
  const e = s.enemies[0];
  for (let i = 0; i < 600; i++) { step(s, 0); assert.ok(e.x >= TILE && e.x + C.BW <= 7 * TILE); }
  const v = world(['  #', '', '  S', '', '', '', 'FLOOR'.replace('FLOOR', FLOOR)]);
  const b = v.enemies[0];
  for (let i = 0; i < 600; i++) { step(v, 0); assert.ok(b.y >= (H - 6) * TILE && b.y + C.BH <= (H - 1) * TILE); }
});

test('bolt: three shots, each destroys the first creature it meets', () => {
  const s = hold(world([' @  b    g', FLOOR]), IN.R, 45);
  assert.equal(s.spell, 'bolt'); assert.equal(s.charges, 3);
  hold(s, 0, 1); step(s, IN.CAST); hold(s, 0, 40);
  assert.equal(s.enemies[0].alive, false);
  assert.equal(s.charges, 2);
  assert.equal(s.bolts.length, 0, 'the bolt is spent');
  step(s, IN.CAST); hold(s, 0, 1); step(s, IN.CAST); hold(s, 0, 200);
  assert.equal(s.spell, '', 'scroll is used up');
  assert.equal(s.bolts.length, 0, 'stray bolts fizzle on walls');
  assert.equal(s.dead, null);
});

test('frost stops creatures and makes them harmless until it wears off', () => {
  const s = hold(world([' @      g', FLOOR]), 0, 2);
  s.spell = 'frost'; s.charges = 1; step(s, IN.CAST);
  const x = s.enemies[0].x;
  hold(s, IN.R, 150);
  assert.equal(s.enemies[0].x, x, 'frozen in place');
  assert.equal(s.dead, null, 'walked straight through it');
  hold(s, 0, C.FROST_T);
  assert.notEqual(s.enemies[0].x, x, 'thawed and moving again');
});

test('ward protects from creatures for a limited time', () => {
  const s = hold(world([' @  g  #', FLOOR]), 0, 2);
  s.spell = 'ward'; s.charges = 1; step(s, IN.CAST);
  hold(s, 0, C.WARD_T - 5);
  assert.equal(s.dead, null);
  hold(s, 0, 400);
  assert.equal(s.dead, 'ghoul');
});

test('portals move the wizard to the matching portal on an Up tap', () => {
  const s = hold(world([' @1          1', FLOOR]), 0, 3);
  hold(s, IN.R, 13);
  assert.ok(tx(s) < 4);
  step(s, IN.U);
  assert.equal(Math.floor(tx(s)), 13);
  hold(s, IN.U, 30);
  assert.equal(Math.floor(tx(s)), 13, 'holding Up does not bounce back and forth');
  hold(s, 0, 1); step(s, IN.U);
  assert.equal(Math.floor(tx(s)), 2, 'a fresh tap returns');
});

test('the door only opens once the key is held; gems are counted', () => {
  const a = hold(world([' @ D   $ K', FLOOR]), IN.R, 60);
  assert.equal(a.won, false, 'walked past the locked door');
  hold(a, IN.R, 80);
  assert.equal(a.hasKey, true); assert.equal(a.gems, 1); assert.equal(a.score, C.GEM_SCORE);
  hold(a, IN.L, 200);
  assert.equal(a.won, true);
  const tickAtWin = a.tick;
  hold(a, IN.L, 10);
  assert.equal(a.tick, tickAtWin, 'the world stops once the level is won');
});

test('running out of time is fatal', () => {
  const s = hold(world([' @', FLOOR], { time: 2 }), 0, 119);
  assert.equal(s.dead, null);
  step(s, 0);
  assert.equal(s.dead, 'time');
});

test('simulation is deterministic and clones continue identically', () => {
  for (const def of LEVELS) {
    const L = parseLevel(def), r = rng(1234);
    const inputs = Array.from({ length: 900 }, () => Math.floor(r() * 64));
    const a = createState(L), b = createState(L);
    let fork = null;
    inputs.forEach((m, i) => { step(a, m); step(b, m); if (i === 300) fork = cloneState(a); });
    assert.equal(stateKey(a), stateKey(b), `${def.id}: same inputs, same world`);
    inputs.slice(301).forEach((m) => step(fork, m));
    assert.equal(stateKey(fork), stateKey(a), `${def.id}: a cloned state replays identically`);
  }
});

test('fuzz: the wizard never ends a frame inside stone or outside the room', () => {
  for (const def of LEVELS) {
    const L = parseLevel(def);
    for (let seed = 1; seed <= 6; seed++) {
      const r = rng(seed * 7919);
      let s = createState(L), mask = 0;
      for (let i = 0; i < 2500; i++) {
        if (i % 6 === 0) mask = Math.floor(r() * 64);
        step(s, mask);
        if (s.dead || s.won) { s = createState(L); continue; }
        const p = s.p;
        assert.ok(!rectSolid(s, p.x, p.y, C.PW, C.PH), `${def.id}: inside stone at ${p.x},${p.y} (seed ${seed}, frame ${i})`);
        assert.ok(p.x >= 0 && p.x + C.PW <= W * TILE && p.y >= 0, `${def.id}: out of bounds at ${p.x},${p.y}`);
        assert.ok(Math.abs(p.vy) <= C.MAXFALL && Math.abs(p.vx) <= C.WALK);
      }
    }
  }
});

test('input recordings survive run-length encoding', () => {
  const r = rng(5), frames = Array.from({ length: 500 }, () => (r() < 0.8 ? 2 : Math.floor(r() * 64)));
  const rle = encodeInputs(frames);
  assert.deepEqual(decodeInputs(rle), frames);
  assert.ok(rle.length < frames.length);
});
