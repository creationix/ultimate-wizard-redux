// Canvas renderer: chunky 8-bit sprites, lit with modern soft glows and particles.
import { W, H, T, C, tileAt, flameOn } from './sim.js';
import { sprites, buildStatic, SPELL_COLORS, PORTAL_COLORS, PAL } from './sprites.js';

export const VIEW_W = W * 16, VIEW_H = H * 16;
const MIN_VISIBLE_TILES = 12;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.scale = 1;
    this.level = null; this.staticLayer = null;
    this.particles = [];
    this.shake = 0; this.flash = 0; this.time = 0;
    this.viewW = VIEW_W; this.follow = false; this.camX = null;
  }
  /**
   * Fits the canvas to its parent. On narrow (portrait) screens in follow mode the
   * view zooms in to the full level height and scrolls sideways with the wizard,
   * so tiles stay big enough to see instead of shrinking the whole room to fit.
   */
  resize() {
    const parent = this.canvas.parentElement;
    const availW = parent.clientWidth, availH = parent.clientHeight;
    if (!availW || !availH) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let css = Math.min(availW / VIEW_W, availH / VIEW_H);
    if (this.follow) {
      const zoomed = Math.min(availH / VIEW_H, availW / (MIN_VISIBLE_TILES * 16));
      if (zoomed > css * 1.2) css = zoomed;
    }
    // Whole-number scaling keeps pixels perfectly even on low-density displays;
    // dense phone screens hide the difference, so there we use every pixel.
    let fine = css * dpr;
    if (dpr < 2 && fine >= 2) fine = Math.floor(fine);
    css = fine / dpr;
    this.viewW = Math.min(VIEW_W, Math.floor(availW / css));
    this.scale = fine;
    this.canvas.width = Math.round(this.viewW * fine); this.canvas.height = Math.round(VIEW_H * fine);
    this.canvas.style.width = `${this.viewW * css}px`; this.canvas.style.height = `${VIEW_H * css}px`;
    this.camX = null;
  }
  setLevel(level) { this.level = level; this.staticLayer = buildStatic(level); this.particles.length = 0; this.shake = 0; this.flash = 0; this.camX = null; }

  burst(x, y, color, n, speed = 1.4, life = 30, gravity = 0.06) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: life * (0.6 + Math.random() * 0.4), max: life, color, gravity });
    }
  }
  /** Turns simulation events into particles, flashes and screen shake. */
  onEvents(events) {
    for (const e of events) {
      const x = e.x / 16, y = e.y / 16;
      if (e.type === 'gem') this.burst(x, y, '#75cec8', 10);
      else if (e.type === 'key') this.burst(x, y, '#edf171', 16);
      else if (e.type === 'scroll') this.burst(x, y, SPELL_COLORS[e.extra], 12);
      else if (e.type === 'land') this.burst(x, y, '#b2b2b2', 5, 0.8, 14, 0.02);
      else if (e.type === 'jump') this.burst(x, y, '#b2b2b2', 3, 0.6, 10, 0.02);
      else if (e.type === 'kill') { this.burst(x, y, e.extra === 'ghoul' ? '#56ac4d' : '#8e3c97', 18, 2); this.shake = 6; }
      else if (e.type === 'fizzle') this.burst(x, y, '#edf171', 6, 1);
      else if (e.type === 'cast') { this.burst(x, y, SPELL_COLORS[e.extra], 14, 1.8); this.flash = e.extra === 'frost' ? 10 : 4; }
      else if (e.type === 'teleport') this.burst(x, y, '#ffffff', 16, 1.6);
      else if (e.type === 'crumble') { this.burst(x, y, '#7b7b7b', 10, 1.2, 30, 0.12); this.shake = 3; }
      else if (e.type === 'crack') this.burst(x, y, '#b2b2b2', 3, 0.5, 12);
      else if (e.type === 'hurt') { this.burst(x, y, '#c46c71', 14, 2, 28); this.shake = 7; this.flash = 5; }
      else if (e.type === 'respawn') this.burst(x, y, '#ffffff', 14, 1.4, 26, 0);
      else if (e.type === 'die') { this.burst(x, y, '#706deb', 22, 2.4, 45); this.burst(x, y, '#ffffff', 10, 1.5, 30); this.shake = 10; this.flash = 6; }
      else if (e.type === 'win') this.burst(x, y, '#edf171', 30, 2.2, 50, 0.02);
    }
  }
  glow(x, y, r, color, alpha = 1) {
    const g = this.g, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1;
  }

  draw(s, opts = {}) {
    const g = this.g, S = sprites(), L = s.level, t = ++this.time;
    if (L !== this.level) this.setLevel(L);
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    g.imageSmoothingEnabled = false;
    if (this.shake > 0) { g.translate((Math.random() - 0.5) * this.shake * 0.5, (Math.random() - 0.5) * this.shake * 0.5); this.shake--; }
    // Camera: only scrolls when the view is narrower than the room.
    const vw = this.viewW;
    let cam = 0;
    if (vw < VIEW_W) {
      const target = Math.max(0, Math.min(VIEW_W - vw, s.p.x / 16 + 5 - vw / 2));
      this.camX = this.camX == null ? target : this.camX + (target - this.camX) * 0.14;
      cam = Math.round(this.camX * this.scale) / this.scale;
    }
    g.translate(-cam, 0);
    g.drawImage(this.staticLayer, 0, 0);
    const lights = [];

    // Dynamic tiles.
    const flame = flameOn(s), warn = !flame && (s.tick % C.FLAME_PERIOD) > C.FLAME_PERIOD - 24;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const raw = L.tiles[y * W + x];
      if (raw === T.CRUMBLE) {
        const ct = s.ct[L.crumbleSlot[y * W + x]];
        if (ct === 255) continue;
        const j = ct > 0 ? ((t >> 1) % 2) * 2 - 1 : 0;
        g.drawImage(S.crumble, x * 16 + j, y * 16 + (ct > 0 ? 1 : 0));
      } else if (raw === T.FLAME) {
        if (flame) { g.drawImage(S.flame[(t >> 2) % 3], x * 16, y * 16); lights.push([x * 16 + 8, y * 16 + 8, 34, 'rgba(240,138,46,0.55)']); }
        else if (warn && (t >> 2) % 2) { g.fillStyle = '#f08a2e'; g.fillRect(x * 16 + 7, y * 16 + 10, 2, 2); }
      }
    }
    for (const p of L.teleports) {
      g.drawImage(S.portal[p.id], p.tx * 16, p.ty * 16);
      g.fillStyle = PORTAL_COLORS[p.id]; g.globalAlpha = 0.35 + 0.25 * Math.sin(t / 9 + p.tx);
      g.fillRect(p.tx * 16 + 5, p.ty * 16 + 4, 6, 12); g.globalAlpha = 1;
      g.fillStyle = '#ffffff'; g.fillRect(p.tx * 16 + 5 + ((t >> 3) + p.tx) % 6, p.ty * 16 + 14 - ((t >> 1) + p.tx * 5) % 11, 1, 1);
      lights.push([p.tx * 16 + 8, p.ty * 16 + 9, 22, PORTAL_COLORS[p.id], 0.35]);
    }
    // Items.
    L.items.forEach((it, i) => {
      const X = it.tx * 16, Y = it.ty * 16;
      if (it.kind === 'door') {
        g.drawImage(s.hasKey ? S.doorOpen : S.door, X, Y);
        if (s.hasKey) lights.push([X + 8, Y + 9, 30, 'rgba(237,241,113,0.6)']);
        return;
      }
      if (s.taken[i]) return;
      const bob = Math.round(Math.sin(t / 14 + it.tx) * 1.5);
      if (it.kind === 'key') { g.drawImage(S.key, X, Y + bob - 1); lights.push([X + 8, Y + 8, 24, 'rgba(237,241,113,0.5)']); }
      else if (it.kind === 'gem') {
        g.drawImage(S.gem, X, Y + bob);
        if ((t + it.tx * 17) % 70 < 6) { g.fillStyle = '#fff'; g.fillRect(X + 4, Y + 3 + bob, 1, 3); g.fillRect(X + 3, Y + 4 + bob, 3, 1); }
        lights.push([X + 8, Y + 8, 16, 'rgba(117,206,200,0.4)']);
      } else { g.drawImage(S.scroll[it.kind], X, Y + bob); lights.push([X + 8, Y + 8, 20, SPELL_COLORS[it.kind], 0.3]); }
    });
    // Creatures.
    const frozen = s.frost > 0, thaw = frozen && s.frost < 60 && (t >> 2) % 2;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const x = Math.round(e.x / 16), y = Math.round(e.y / 16);
      if (e.kind === 'ghoul') g.drawImage(frozen && !thaw ? S.ghoulFrozen : S.ghoul[(s.tick >> 4) % 2][e.dir > 0 ? 'r' : 'l'], x - 2 + (e.dir > 0 ? 0 : 1), y - 2);
      else g.drawImage(frozen && !thaw ? S.batFrozen : S.bat[(s.tick >> 3) % 2], x - 2, y - 1);
    }
    // Wizard.
    const p = s.p, px = Math.round(p.x / 16), py = Math.round(p.y / 16);
    if (!s.dead && !opts.hidePlayer && !(s.invuln > 0 && (t >> 2) % 2)) {
      let f = 0;
      if (p.climb) f = 1 + ((p.y >> 7) & 1);
      else if (!p.ground) f = 1;
      else if (p.vx) f = 1 + ((s.tick >> 3) & 1);
      if (s.feather > 0 && !p.ground && t % 3 === 0) this.particles.push({ x: px + 5, y: py + 14, vx: (Math.random() - 0.5) * 0.4, vy: -0.2, life: 22, max: 22, color: '#a9ff9f', gravity: 0 });
      g.drawImage(S.wizard[f][p.face > 0 ? 'r' : 'l'], px - 3 + (p.face > 0 ? 0 : 0), py - 2);
      lights.push([px + 5, py + 6, 30, 'rgba(160,170,255,0.25)']);
      if (s.ward > 0 && (s.ward > 60 || (t >> 2) % 2)) {
        g.strokeStyle = SPELL_COLORS.ward; g.lineWidth = 1; g.globalAlpha = 0.9;
        g.beginPath(); g.arc(px + 5, py + 7, 11 + Math.sin(t / 5), 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
        lights.push([px + 5, py + 7, 26, 'rgba(196,108,113,0.5)']);
      }
    }
    for (const b of s.bolts) {
      const bx = Math.round(b.x / 16), by = Math.round(b.y / 16);
      g.save(); if (b.dir < 0) { g.translate(bx * 2 + 8, 0); g.scale(-1, 1); }
      g.drawImage(S.bolt, bx, by); g.restore();
      lights.push([bx + 4, by + 2, 22, 'rgba(237,241,113,0.7)']);
      if (t % 2 === 0) this.particles.push({ x: bx + 4, y: by + 2, vx: -b.dir * 0.5, vy: (Math.random() - 0.5) * 0.6, life: 12, max: 12, color: '#f08a2e', gravity: 0 });
    }
    // Particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.x += q.vx; q.y += q.vy; q.vy += q.gravity;
      if (--q.life <= 0) { this.particles.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, q.life / q.max * 1.6); g.fillStyle = q.color;
      g.fillRect(Math.round(q.x), Math.round(q.y), q.life > q.max / 2 ? 2 : 1, q.life > q.max / 2 ? 2 : 1);
    }
    g.globalAlpha = 1;
    // Lighting pass: additive glows, then a vignette to pull the eye inward.
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r, c, a] of lights) this.glow(x, y, r, c, a ?? 1);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);     // screen space from here on
    if (frozen) { g.fillStyle = `rgba(117,206,200,${thaw ? 0.05 : 0.12})`; g.fillRect(0, 0, vw, VIEW_H); }
    const vr = Math.max(vw, VIEW_H);
    const v = g.createRadialGradient(vw / 2, VIEW_H / 2, vr * 0.3, vw / 2, VIEW_H / 2, vr * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, vw, VIEW_H);
    if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${this.flash * 0.03})`; g.fillRect(0, 0, vw, VIEW_H); this.flash--; }

    if (opts.grid) {
      g.fillStyle = 'rgba(255,255,255,0.10)';
      for (let x = 1; x < W; x++) g.fillRect(x * 16, 0, 1 / this.scale, VIEW_H);
      for (let y = 1; y < H; y++) g.fillRect(0, y * 16, VIEW_W, 1 / this.scale);
      // Start marker.
      g.strokeStyle = PAL[13]; g.lineWidth = 1 / this.scale * 2;
      g.strokeRect(L.start.tx * 16 + 1, L.start.ty * 16 + 1, 14, 14);
      if (opts.cursor) { g.strokeStyle = '#fff'; g.strokeRect(opts.cursor.tx * 16 + 0.5, opts.cursor.ty * 16 + 0.5, 15, 15); }
    }
  }
}
export { tileAt };
