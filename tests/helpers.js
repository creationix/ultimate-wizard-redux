import { parseLevel, createState, step, W, H, TILE, C } from '../src/sim.js';

/** Builds a level from just its bottom rows; everything above is open air. */
export function level(rows, extra = {}) {
  const map = [];
  for (let y = 0; y < H - rows.length; y++) map.push(' '.repeat(W));
  for (const r of rows) map.push(r.padEnd(W, ' '));
  return parseLevel({ name: 'test', time: 600, ...extra, map });
}
export const world = (rows, extra) => createState(level(rows, extra));
/** Holds an input mask for n frames. */
export function hold(s, mask, n = 1) { for (let i = 0; i < n; i++) step(s, mask); return s; }
/** Player position in tile units (feet row = tile the player stands in). */
export const tx = (s) => (s.p.x + C.PW / 2) / TILE;
export const feet = (s) => (s.p.y + C.PH) / TILE;
/** Deterministic pseudo-random generator for fuzz tests. */
export function rng(seed) { let a = seed >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); }
