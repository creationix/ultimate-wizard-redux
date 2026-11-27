// Tiny chip-style synth on WebAudio. No samples, nothing to download.
let ctx = null, muted = false;
export function setMuted(m) { muted = m; }
export function unlockAudio() {
  if (ctx || typeof AudioContext === 'undefined') { ctx?.resume?.(); return; }
  try { ctx = new AudioContext(); } catch { ctx = null; }
}
function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  jump: () => tone(260, 0.12, { slide: 260 }),
  land: () => tone(90, 0.05, { type: 'triangle', vol: 0.08 }),
  gem: () => { tone(880, 0.07); tone(1320, 0.12, { delay: 0.06 }); },
  key: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.1, { delay: i * 0.07 })),
  scroll: () => { tone(440, 0.1, { type: 'triangle', vol: 0.1 }); tone(660, 0.18, { type: 'triangle', vol: 0.1, delay: 0.09 }); },
  cast: () => tone(900, 0.25, { type: 'sawtooth', slide: -700, vol: 0.05 }),
  kill: () => tone(300, 0.2, { type: 'sawtooth', slide: -250 }),
  teleport: () => tone(200, 0.25, { type: 'triangle', slide: 900, vol: 0.09 }),
  crumble: () => tone(110, 0.18, { type: 'sawtooth', slide: -70, vol: 0.05 }),
  hurt: () => { tone(220, 0.12, { type: 'sawtooth', slide: -120, vol: 0.08 }); tone(160, 0.16, { type: 'square', slide: -80, delay: 0.08 }); },
  die: () => [400, 300, 220, 150].forEach((f, i) => tone(f, 0.14, { type: 'sawtooth', delay: i * 0.09, slide: -60 })),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { delay: i * 0.1 })),
};
export function playEvents(events) { for (const e of events) SFX[e.type]?.(); }
