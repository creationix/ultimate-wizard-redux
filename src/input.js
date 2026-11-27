// Keyboard, touch and gamepad all collapse into one input bitmask per frame.
import { IN } from './sim.js';

const KEYS = {
  ArrowLeft: IN.L, KeyA: IN.L, ArrowRight: IN.R, KeyD: IN.R, ArrowUp: IN.U, KeyW: IN.U, ArrowDown: IN.D, KeyS: IN.D,
  Space: IN.JUMP, KeyZ: IN.JUMP, KeyK: IN.JUMP, KeyX: IN.CAST, KeyJ: IN.CAST, ShiftLeft: IN.CAST, ShiftRight: IN.CAST, Enter: IN.CAST,
};

export class Input {
  constructor({ pad, jump, cast }) {
    this.keys = 0; this.touchDir = 0; this.touchBtn = 0; this.usedTouch = false;
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.matches?.('input, textarea, select')) return;
      const m = KEYS[e.code];
      if (m) { this.keys |= m; e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { const m = KEYS[e.code]; if (m) this.keys &= ~m; });
    addEventListener('blur', () => { this.keys = 0; this.touchDir = 0; this.touchBtn = 0; });

    // D-pad: one element; direction comes from where the finger is relative to its centre,
    // so sliding between directions works without lifting.
    const padMove = (e) => {
      const r = pad.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      let m = 0;
      if (dx < -0.14) m |= IN.L; else if (dx > 0.14) m |= IN.R;
      if (dy < -0.18) m |= IN.U; else if (dy > 0.18) m |= IN.D;
      this.touchDir = m;
      pad.dataset.dir = (m & IN.L ? 'l' : '') + (m & IN.R ? 'r' : '') + (m & IN.U ? 'u' : '') + (m & IN.D ? 'd' : '');
    };
    const padEnd = () => { this.touchDir = 0; pad.dataset.dir = ''; };
    pad.addEventListener('pointerdown', (e) => { this.usedTouch = true; pad.setPointerCapture(e.pointerId); padMove(e); e.preventDefault(); });
    pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) padMove(e); });
    pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);
    for (const [el, mask] of [[jump, IN.JUMP], [cast, IN.CAST]]) {
      const up = () => { this.touchBtn &= ~mask; el.classList.remove('down'); };
      el.addEventListener('pointerdown', (e) => { this.usedTouch = true; el.setPointerCapture(e.pointerId); this.touchBtn |= mask; el.classList.add('down'); e.preventDefault(); });
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    }
  }
  gamepad() {
    let m = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const b = (i) => gp.buttons[i]?.pressed;
      if (gp.axes[0] < -0.4 || b(14)) m |= IN.L;
      if (gp.axes[0] > 0.4 || b(15)) m |= IN.R;
      if (gp.axes[1] < -0.5 || b(12)) m |= IN.U;
      if (gp.axes[1] > 0.5 || b(13)) m |= IN.D;
      if (b(0)) m |= IN.JUMP;
      if (b(1) || b(2)) m |= IN.CAST;
    }
    return m;
  }
  /** Current input bitmask. */
  read() { return this.enabled ? (this.keys | this.touchDir | this.touchBtn | this.gamepad()) : 0; }
  clear() { this.keys = 0; this.touchDir = 0; this.touchBtn = 0; }
}
