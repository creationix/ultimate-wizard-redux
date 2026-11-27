// Runs the level solver off the main thread for the editor's "Verify" button.
import { solve } from './solver.js';
self.onmessage = (e) => {
  const { def } = e.data;
  const started = Date.now(), budget = 20000;
  const shouldStop = () => Date.now() - started > budget;
  const win = solve(def, { maxNodes: 120000, shouldStop });
  self.postMessage({ stage: 'win', ok: win.ok, inputs: win.inputs, frames: win.frames });
  if (!win.ok) return;
  const perfect = shouldStop() ? { ok: false, timedOut: true } : solve(def, { perfect: true, maxNodes: 120000, shouldStop });
  self.postMessage({ stage: 'perfect', ok: perfect.ok, inputs: perfect.inputs, frames: perfect.frames });
};
