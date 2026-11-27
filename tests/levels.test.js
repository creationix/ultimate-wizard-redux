// Every built-in level must be valid and provably winnable.
//  1. A stored, frame-exact input recording wins it (and another collects every gem).
//  2. The solver can rediscover a winning route from scratch.
// Recordings are pinned to a hash of the level, so editing a level without
// re-running `npm run solve` fails here rather than shipping an untested level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLevel, levelHash, replay, parseLevel, decodeInputs, W, H, T, C } from '../src/sim.js';
import { LEVELS } from '../src/levels.js';
import { SOLUTIONS } from '../src/solutions.js';
import { solve, distanceMap } from '../src/solver.js';

test('level ids are unique', () => {
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
});

for (const [n, def] of LEVELS.entries()) {
  test(`level ${n + 1} "${def.name}"`, async (t) => {
    await t.test('is well formed', () => {
      assert.deepEqual(validateLevel(def), []);
      assert.ok(def.name && def.hint, 'has a name and a hint');
      const L = parseLevel(def);
      const below = L.tiles[(L.start.ty + 1) * W + L.start.tx];
      assert.ok([T.STONE, T.LEDGE, T.LADDER].includes(below), 'the wizard starts on solid footing');
      for (const e of L.enemies.filter((e) => e.kind === 'ghoul')) {
        assert.ok(e.ty + 1 < H && [T.STONE, T.LEDGE, T.LADDER, T.CRUMBLE].includes(L.tiles[(e.ty + 1) * W + e.tx]), 'ghouls start on a floor');
      }
    });

    const sol = SOLUTIONS[def.id];
    await t.test('has an up-to-date stored solution', () => {
      assert.ok(sol, 'missing - run `npm run solve`');
      assert.equal(sol.hash, levelHash(def), 'level changed since it was solved - run `npm run solve`');
    });

    await t.test('stored solution wins without losing a heart', () => {
      const s = replay(def, sol.win);
      assert.equal(s.dead, null);
      assert.equal(s.won, true);
      assert.equal(s.hp, C.HP, 'the proof run never takes a hit');
      assert.equal(decodeInputs(sol.win).length, s.tick, 'recording ends exactly at the win');
    });

    await t.test('every gem can be collected in one winning run', () => {
      const s = replay(def, sol.perfect);
      assert.equal(s.won, true);
      assert.equal(s.gems, parseLevel(def).gemCount);
      assert.equal(s.hp, C.HP, 'without taking a hit');
    });

    await t.test('the solver finds a winning route from scratch', () => {
      const r = solve(def);
      assert.equal(r.ok, true, r.reason);
      const s = replay(def, r.inputs);
      assert.equal(s.won, true); assert.equal(s.hp, C.HP);
    });
  });
}

test('the solver reports impossible levels as unsolved', () => {
  const walled = { ...LEVELS[0], map: LEVELS[0].map.map((row, y) => (y === 13 ? ' @       $         #H#D ' : row)) };
  walled.map[12] = '                   ###  ';
  walled.map[11] = '  ##########       # #  ';
  assert.deepEqual(validateLevel(walled), []);
  const r = solve(walled, { maxNodes: 20000 });
  assert.equal(r.ok, false);
});

test('the solver refuses malformed levels and the validator explains why', () => {
  const broken = { name: 'x', time: 60, map: LEVELS[0].map.map((r) => r.replace('K', ' ')) };
  assert.match(validateLevel(broken).join(' '), /key/);
  assert.equal(solve(broken).ok, false);
  assert.match(validateLevel({ ...LEVELS[0], map: LEVELS[0].map.slice(1) }).join(' '), /rows/);
  assert.match(validateLevel({ ...LEVELS[0], map: LEVELS[0].map.map((r, i) => (i ? r : r.replace(' ', '?'))) }).join(' '), /illegal/);
  assert.match(validateLevel({ ...LEVELS[0], map: LEVELS[0].map.map((r, i) => (i ? r : r.replace(' ', '1'))) }).join(' '), /portal/);
});

test('distance map respects gravity and ladders', () => {
  const L = parseLevel(LEVELS[0]);
  const key = L.items.find((i) => i.kind === 'key');
  const d = distanceMap(L, [key]);
  assert.equal(d[key.ty * W + key.tx], 0);
  assert.ok(d[L.start.ty * W + L.start.tx] > 5, 'the start can reach the key');
  assert.equal(d[14 * W + 3], -1, 'solid stone is not part of the map');
});
