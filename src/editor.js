// Level editor: paint tiles on the same canvas the game uses, test-play
// instantly, and have the solver prove the level can be won.
import { W, H, parseLevel, createState, validateLevel } from './sim.js';
import { sprites, THEMES } from './sprites.js';

export const TOOLS = [
  [' ', 'Erase'], ['#', 'Stone'], ['=', 'Ledge'], ['H', 'Ladder'], ['|', 'Rope'], ['~', 'Cracked'], ['^', 'Spikes'], ['F', 'Flame'],
  ['@', 'Start'], ['K', 'Key'], ['D', 'Door'], ['$', 'Gem'],
  ['b', 'Bolt'], ['f', 'Frost'], ['e', 'Feather'], ['w', 'Ward'],
  ['g', 'Ghoul'], ['s', 'Bat ↔'], ['S', 'Bat ↕'], ['1', 'Portal A'], ['2', 'Portal B'], ['3', 'Portal C'],
];
const UNIQUE = '@KD', PAIRS = '123';

export function blankLevel() {
  const map = [];
  for (let y = 0; y < H; y++) map.push(y === 0 || y === H - 1 ? '#'.repeat(W) : '#' + ' '.repeat(W - 2) + '#');
  const put = (x, y, ch) => { map[y] = map[y].slice(0, x) + ch + map[y].slice(x + 1); };
  put(2, H - 2, '@'); put(W / 2, H - 2, 'K'); put(W - 3, H - 2, 'D');
  return { id: 'custom-' + Date.now().toString(36), name: 'My chamber', theme: 0, time: 120, map };
}

function toolIcon(ch) {
  const S = sprites(), c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const img = {
    '=': S.ledge, H: S.ladder, '|': S.rope, '~': S.crumble, '^': S.spikes, F: S.flame[0], '@': S.wizard[0].r, K: S.key, D: S.door, $: S.gem,
    b: S.scroll.bolt, f: S.scroll.frost, e: S.scroll.feather, w: S.scroll.ward, g: S.ghoul[0].r, s: S.bat[0], S: S.bat[1], 1: S.portal[1], 2: S.portal[2], 3: S.portal[3],
  }[ch];
  if (ch === '#') { g.fillStyle = '#2e2c9b'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#706deb'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1); g.fillStyle = '#1c1b63'; g.fillRect(7, 0, 1, 8); g.fillRect(3, 8, 1, 8); g.fillRect(0, 7, 16, 1); }
  else if (ch === ' ') { g.strokeStyle = '#c46c71'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 4); g.lineTo(12, 12); g.moveTo(12, 4); g.lineTo(4, 12); g.stroke(); }
  else if (img) g.drawImage(img, 0, ch === 's' || ch === 'S' ? 3 : 0);
  if (ch === 'S') { g.fillStyle = '#edf171'; g.fillRect(14, 2, 1, 12); }
  return c;
}

export class Editor {
  constructor({ renderer, canvas, palette, onChange }) {
    this.renderer = renderer; this.canvas = canvas; this.onChange = onChange;
    this.def = null; this.state = null; this.tool = '#'; this.cursor = null; this.active = false;
    for (const [ch, label] of TOOLS) {
      const b = document.createElement('button');
      b.className = 'tool'; b.type = 'button'; b.dataset.ch = ch; b.setAttribute('aria-pressed', ch === this.tool);
      b.append(toolIcon(ch), label);
      b.addEventListener('click', () => { this.tool = ch; palette.querySelectorAll('.tool').forEach((t) => t.setAttribute('aria-pressed', t === b)); });
      palette.append(b);
    }
    let painting = false, eraseStroke = false;
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return { tx: Math.floor((e.clientX - r.left) / r.width * W), ty: Math.floor((e.clientY - r.top) / r.height * H) };
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      painting = true; eraseStroke = e.button === 2; canvas.setPointerCapture(e.pointerId);
      const c = at(e); this.cursor = c; this.paint(c.tx, c.ty, eraseStroke ? ' ' : this.tool); e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      const c = at(e); this.cursor = c;
      if (painting) this.paint(c.tx, c.ty, eraseStroke ? ' ' : this.tool);
    });
    const end = () => { painting = false; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { if (!painting) this.cursor = null; });
    canvas.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
  }
  open(def) { this.def = def; this.rebuild(); }
  rebuild() {
    const level = parseLevel(this.def);
    this.state = createState(level);
    this.renderer.setLevel(level);
  }
  paint(tx, ty, ch) {
    if (tx < 0 || tx >= W || ty < 0 || ty >= H) return;
    const map = this.def.map;
    if (map[ty][tx] === ch) return;
    const set = (x, y, c) => { map[y] = map[y].slice(0, x) + c + map[y].slice(x + 1); };
    if (UNIQUE.includes(ch)) map.forEach((row, y) => { const x = row.indexOf(ch); if (x >= 0) set(x, y, ' '); });
    if (PAIRS.includes(ch)) {
      const found = [];
      map.forEach((row, y) => { for (let x = 0; x < W; x++) if (row[x] === ch) found.push([x, y]); });
      if (found.length >= 2) set(found[0][0], found[0][1], ' ');
    }
    set(tx, ty, ch);
    this.rebuild();
    this.onChange?.();
  }
  clear() { const fresh = blankLevel(); this.def.map = fresh.map; this.rebuild(); this.onChange?.(); }
  problems() { return validateLevel(this.def); }
  draw() { if (this.state) this.renderer.draw(this.state, { grid: true, cursor: this.cursor }); }
}
export { THEMES };
