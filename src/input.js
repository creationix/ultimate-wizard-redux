// Keyboard, touch and gamepad all collapse into one input bitmask per frame.
import { IN } from './sim.js';

const KEYS = {
  ArrowLeft: IN.L, KeyA: IN.L, ArrowRight: IN.R, KeyD: IN.R, ArrowUp: IN.U, KeyW: IN.U, ArrowDown: IN.D, KeyS: IN.D,
  Space: IN.JUMP, KeyZ: IN.JUMP, KeyK: IN.JUMP, KeyX: IN.CAST, KeyJ: IN.CAST, ShiftLeft: IN.CAST, ShiftRight: IN.CAST, Enter: IN.CAST,
};

export class Input {
  constructor({ pad, jump, cast }) {
    this.keys = 0; this.touchDir = 0; this.touchBtn = 0; this.usedTouch = false;
    this.padMask = 0; this.padActive = false;
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
  /**
   * Reads every connected gamepad once per frame. Understands the standard
   * layout and the common non-standard ones phones report (d-pad on a hat
   * axis or on axes 6/7), so most Bluetooth and USB pads work unconfigured.
   * Returns { mask, start, back, any }.
   */
  pollPad() {
    let mask = 0, start = false, back = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || gp.connected === false) continue;
      const b = (i) => { const x = gp.buttons[i]; return !!x && (x.pressed || x.value > 0.5); };
      const ax = (i) => gp.axes[i] || 0;
      if (ax(0) < -0.4) mask |= IN.L; if (ax(0) > 0.4) mask |= IN.R;
      if (ax(1) < -0.55) mask |= IN.U; if (ax(1) > 0.55) mask |= IN.D;
      if (gp.mapping === 'standard') {
        if (b(14)) mask |= IN.L; if (b(15)) mask |= IN.R; if (b(12)) mask |= IN.U; if (b(13)) mask |= IN.D;
      } else {
        // D-pad as a pair of axes...
        const n = gp.axes.length;
        if (n >= 8) { if (ax(6) < -0.5) mask |= IN.L; if (ax(6) > 0.5) mask |= IN.R; if (ax(7) < -0.5) mask |= IN.U; if (ax(7) > 0.5) mask |= IN.D; }
        // ...or as a single 8-way "hat" axis (-1 = up, stepping clockwise by 2/7; idle is outside -1..1).
        if (n === 10 && ax(9) >= -1.01 && ax(9) <= 1.01) {
          const dir = Math.round((ax(9) + 1) * 3.5);
          if (dir === 7 || dir <= 1) mask |= IN.U; if (dir >= 1 && dir <= 3) mask |= IN.R;
          if (dir >= 3 && dir <= 5) mask |= IN.D; if (dir >= 5 && dir <= 7) mask |= IN.L;
        }
        if (b(12) && gp.buttons.length > 15) mask |= IN.U; if (b(13) && gp.buttons.length > 15) mask |= IN.D;
        if (b(14) && gp.buttons.length > 15) mask |= IN.L; if (b(15) && gp.buttons.length > 15) mask |= IN.R;
      }
      if (b(0)) mask |= IN.JUMP;                 // A / Cross
      if (b(2) || b(3) || b(5) || b(7)) mask |= IN.CAST;   // X, Y, right shoulder, right trigger
      if (b(1)) back = true;                     // B / Circle
      if (b(9)) start = true;                    // Start / Menu
    }
    const any = mask !== 0 || start || back;
    if (any) this.padActive = true;
    this.padMask = mask;
    return { mask, start, back, any };
  }
  /** Current input bitmask. */
  read() { return this.enabled ? (this.keys | this.touchDir | this.touchBtn | this.padMask) : 0; }
  clear() { this.keys = 0; this.touchDir = 0; this.touchBtn = 0; }
}
