// App shell: screens, the 60 Hz game loop, HUD, dialogs, PWA plumbing.
import { parseLevel, createState, step, validateLevel, decodeInputs, SPELLS } from './sim.js';
import { LEVELS } from './levels.js';
import { SOLUTIONS } from './solutions.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Editor, blankLevel, THEMES } from './editor.js';
import { store, encodeLevel, decodeLevel } from './store.js';
import { playEvents, unlockAudio, setMuted } from './audio.js';
import { sprites } from './sprites.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), gameEl = $('game');
const renderer = new Renderer($('view'));
const input = new Input({ pad: $('pad'), jump: $('btnJump'), cast: $('btnCast') });
const editor = new Editor({ renderer, canvas: $('view'), palette: $('palette'), onChange: () => { store.saveCustom(editor.def); $('edStatus').textContent = ''; verified = null; } });

const run = { def: null, level: null, state: null, source: 'builtin', index: -1, deaths: 0, deadT: 0, winT: 0, paused: false, demo: null, takeover: false };
let verified = null;      // last solver result for the level open in the editor
let hud = {};

// ---- screens ---------------------------------------------------------------
function go(screen) {
  app.dataset.screen = screen;
  input.clear();
  if (screen === 'levels') buildLevelSelect();
  if (screen === 'game') requestAnimationFrame(() => renderer.resize());
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

function applyTouch() {
  const mode = store.settings.touch;
  const on = mode === 'on' || (mode === 'auto' && (matchMedia('(pointer: coarse)').matches || input.usedTouch));
  app.classList.toggle('touch', on);
  renderer.resize();
}
addEventListener('pointerdown', (e) => { unlockAudio(); if (e.pointerType === 'touch' && !app.classList.contains('touch') && store.settings.touch === 'auto') { input.usedTouch = true; applyTouch(); } }, true);
addEventListener('keydown', unlockAudio, true);
addEventListener('resize', () => renderer.resize());
addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));
setMuted(store.settings.muted);

// ---- dialogs ---------------------------------------------------------------
function dialog(title, html, buttons) {
  $('dlgTitle').textContent = title;
  $('dlgBody').innerHTML = html;
  const box = $('dlgButtons'); box.innerHTML = '';
  buttons.forEach(([label, fn, cls], i) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (cls ?? (i === 0 ? 'primary' : '')); b.textContent = label;
    b.addEventListener('click', () => { closeDialog(); fn?.(); });
    box.append(b);
  });
  $('dialog').hidden = false; input.enabled = false; input.clear();
  box.querySelector('button')?.focus();
}
function closeDialog() { $('dialog').hidden = true; input.enabled = true; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (frames) => `${(frames / 60).toFixed(1)}s`;

// ---- level select ----------------------------------------------------------
const unlocked = (i) => i === 0 || !!store.progress(LEVELS[i - 1].id) || !!store.progress(LEVELS[i].id);
function buildLevelSelect() {
  const grid = $('levelGrid'); grid.innerHTML = '';
  LEVELS.forEach((def, i) => {
    const p = store.progress(def.id), open = unlocked(i);
    const b = document.createElement('button');
    b.className = 'card' + (p ? ' done' : '') + (p?.perfect ? ' perfect' : '') + (open ? '' : ' locked');
    b.disabled = !open;
    b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${esc(def.name)}</span><span class="m">${!open ? 'Locked' : p ? `${p.perfect ? '◆ Perfect' : '✓ Cleared'} · ${fmtTime(p.best)}` : 'New'}</span>`;
    b.addEventListener('click', () => startLevel(def, 'builtin', i));
    grid.append(b);
  });
  const list = $('customList'); list.innerHTML = '';
  if (!store.custom.length) list.innerHTML = '<div class="empty">Nothing here yet. Build a chamber in the editor, or import one from a friend.</div>';
  for (const def of store.custom) {
    const row = document.createElement('div'); row.className = 'item';
    const p = store.progress(def.id);
    row.innerHTML = `<span class="grow">${esc(def.name)}${p ? ' ✓' : ''}</span>`;
    const mk = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn small ' + cls; b.textContent = label; b.addEventListener('click', fn); row.append(b); };
    mk('Play', () => { const errs = validateLevel(def); errs.length ? dialog('Not playable yet', `<p>${errs.map(esc).join('<br>')}</p>`, [['Open editor', () => openEditor(def)], ['Close']]) : startLevel(def, 'custom'); }, 'primary');
    mk('Edit', () => openEditor(def));
    mk('Delete', () => dialog('Delete level?', `<p>"${esc(def.name)}" will be removed from this device.</p>`, [['Delete', () => { store.deleteCustom(def.id); buildLevelSelect(); }], ['Keep it']]), 'ghost');
    list.append(row);
  }
}
$('btnPlay').addEventListener('click', () => go('levels'));
$('btnHelp').addEventListener('click', () => go('help'));
$('btnEditor').addEventListener('click', () => openEditor(store.custom[store.custom.length - 1] || newCustom()));
$('btnNewLevel').addEventListener('click', () => openEditor(newCustom()));
$('btnImport').addEventListener('click', importDialog);
function newCustom() { const def = blankLevel(); store.saveCustom(def); return def; }
function importDialog() {
  dialog('Import level', '<p>Paste a level code or share link.</p><textarea id="impText" spellcheck="false"></textarea>', [['Import', () => {
    try { const def = decodeLevel($('impText').value); store.saveCustom(def); openEditor(def); }
    catch { dialog('Could not read that', '<p>That does not look like a Runekeep level code.</p>', [['OK']]); }
  }], ['Cancel']]);
}

// ---- playing ---------------------------------------------------------------
function startLevel(def, source, index = -1, demo = null) {
  Object.assign(run, { def, source, index, level: parseLevel(def), deaths: 0, paused: false, demo, takeover: false });
  editor.active = false;
  gameEl.dataset.mode = 'play';
  go('game');
  restart();
  banner(demo ? '<b>Watching the solution</b>Press any key or tap to take over' : `<b>${esc(def.name)}</b>${esc(def.hint || '')}`, demo ? 0 : 3500);
}
function restart() {
  run.state = createState(run.level);
  run.deadT = 0; run.winT = 0; acc = 0; hud = {};
  renderer.setLevel(run.level);
}
let bannerTimer = 0;
function banner(html, ms) {
  const b = $('banner'); b.innerHTML = html; b.hidden = !html;
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => { b.hidden = true; }, ms);
}
function setText(id, text) { if (hud[id] !== text) { hud[id] = text; $(id).textContent = text; } }
function updateHud() {
  const s = run.state, L = run.level;
  setText('hudName', (run.index >= 0 ? `${run.index + 1}. ` : '') + L.name);
  setText('hudGems', `◆ ${s.gems}/${L.gemCount}`);
  setText('hudKey', s.hasKey ? '⚷ Key' : '');
  setText('hudSpell', s.spell ? `${SPELLS[s.spell].label}${s.charges > 1 ? ' ×' + s.charges : ''}` : '');
  const left = Math.max(0, Math.ceil((L.time * 60 - s.tick) / 60));
  setText('hudTime', `${left}s`);
  $('hudTime').classList.toggle('low', left <= 15);
  $('hudSpell').style.color = s.spell ? { bolt: '#edf171', frost: '#75cec8', feather: '#a9ff9f', ward: '#c46c71' }[s.spell] : '';
}
const DEATHS = { fall: 'That fall was too far.', pit: 'Lost to the depths.', spikes: 'Spiked.', flame: 'Burned.', ghoul: 'Caught by a ghoul.', bat: 'Bitten by a bat.', time: 'Out of time.' };

function tick() {
  const s = run.state;
  if (s.dead) {
    if (++run.deadT === 1) { run.deaths++; banner(`<b>${DEATHS[s.dead] || 'Defeated'}</b>`, 1100); }
    if (run.deadT > 70) { if (run.demo) run.demo = null; restart(); }
    return;
  }
  if (s.won) {
    if (++run.winT === 45) onWin();
    return;
  }
  let inp;
  if (run.demo) {
    if (input.read() || run.takeover) { run.demo = null; banner('', 0); restart(); return; }
    inp = run.demo[s.tick] ?? 0;
  } else inp = input.read();
  step(s, inp);
  renderer.onEvents(s.events);
  playEvents(s.events);
}
function onWin() {
  const s = run.state, L = run.level, perfect = s.gems === L.gemCount;
  if (run.demo) return dialog('Solution complete', '<p>Now try it yourself.</p>', [['Play', () => startLevel(run.def, run.source, run.index)], ['Back', leaveGame, '']]);
  if (run.source === 'test') return dialog('It can be done!', `<dl><dt>Time</dt><dd>${fmtTime(s.tick)}</dd><dt>Gems</dt><dd>${s.gems}/${L.gemCount}</dd></dl>`, [['Back to editor', () => openEditor(run.def)], ['Play again', restart, '']]);
  const prev = store.progress(run.def.id);
  store.recordWin(run.def.id, s.tick, perfect);
  const best = !prev || s.tick < prev.best;
  const next = run.source === 'builtin' ? LEVELS[run.index + 1] : null;
  const body = `<dl><dt>Time</dt><dd>${fmtTime(s.tick)}${best ? ' <span class="good">best</span>' : ''}</dd>
    <dt>Gems</dt><dd class="${perfect ? 'good' : ''}">${s.gems}/${L.gemCount}${perfect ? ' ◆ perfect' : ''}</dd>
    <dt>Attempts</dt><dd>${run.deaths + 1}</dd></dl>`;
  const buttons = [];
  if (next) buttons.push(['Next chamber', () => startLevel(next, 'builtin', run.index + 1)]);
  buttons.push(['Play again', restart, next ? '' : 'primary'], ['Chambers', () => go('levels'), 'ghost']);
  dialog(run.source === 'builtin' && !next ? 'The keep is yours!' : 'Chamber cleared', body, buttons);
}
function leaveGame() {
  run.demo = null; banner('', 0);
  if (run.source === 'test') openEditor(run.def); else go('levels');
}
function pause() {
  if (app.dataset.screen !== 'game' || gameEl.dataset.mode !== 'play' || !$('dialog').hidden) return;
  run.paused = true;
  const solution = run.source === 'builtin' ? SOLUTIONS[run.def.id]?.win : (verified?.id === run.def.id ? verified.inputs : null);
  const buttons = [['Resume', () => { run.paused = false; }], ['Restart', () => { run.paused = false; run.demo = null; banner('', 0); restart(); }, '']];
  if (solution) buttons.push(['Watch solution', () => startLevel(run.def, run.source, run.index, decodeInputs(solution)), '']);
  buttons.push([store.settings.muted ? 'Sound: off' : 'Sound: on', () => { store.setSetting('muted', !store.settings.muted); setMuted(store.settings.muted); pause(); }, 'ghost']);
  const t = store.settings.touch;
  buttons.push([`Touch controls: ${t}`, () => { store.setSetting('touch', t === 'auto' ? 'on' : t === 'on' ? 'off' : 'auto'); applyTouch(); pause(); }, 'ghost']);
  buttons.push([run.source === 'test' ? 'Back to editor' : 'Quit to chambers', () => { run.paused = false; leaveGame(); }, 'ghost']);
  dialog('Paused', `<p>${esc(run.def.hint || '')}</p>`, buttons);
}
$('btnPause').addEventListener('click', pause);
$('view').addEventListener('pointerdown', () => { if (run.demo) run.takeover = true; });
addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, textarea, select')) return;
  if (app.dataset.screen !== 'game' || gameEl.dataset.mode !== 'play') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if ($('dialog').hidden) pause(); else if ($('dlgTitle').textContent === 'Paused') { closeDialog(); run.paused = false; } }
  else if (e.code === 'KeyR' && $('dialog').hidden) { run.demo = null; banner('', 0); restart(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && !run.state?.won) pause(); });

// ---- editor ----------------------------------------------------------------
THEMES.forEach((t, i) => $('edTheme').append(new Option(t.name, i)));
function openEditor(def) {
  if (!store.custom.includes(def)) store.saveCustom(def);
  run.demo = null; banner('', 0);
  gameEl.dataset.mode = 'edit';
  editor.active = true;
  $('edName').value = def.name; $('edTime').value = def.time; $('edTheme').value = def.theme;
  $('edStatus').textContent = 'Tap the grid to paint. Right-click or the Erase tool removes.';
  go('game');
  editor.open(def);
}
$('edBack').addEventListener('click', () => { editor.active = false; go('levels'); });
$('edName').addEventListener('input', (e) => { editor.def.name = e.target.value || 'Untitled'; store.saveCustom(editor.def); });
$('edTime').addEventListener('change', (e) => { editor.def.time = Math.min(600, Math.max(10, e.target.value | 0)); e.target.value = editor.def.time; store.saveCustom(editor.def); verified = null; });
$('edTheme').addEventListener('change', (e) => { editor.def.theme = e.target.value | 0; store.saveCustom(editor.def); editor.rebuild(); });
$('edClear').addEventListener('click', () => dialog('Clear the level?', '<p>Everything in this chamber will be erased.</p>', [['Clear', () => editor.clear()], ['Cancel']]));
function checkValid() {
  const errs = editor.problems();
  if (errs.length) dialog('Not playable yet', `<p>${errs.map(esc).join('<br>')}</p>`, [['OK']]);
  return !errs.length;
}
$('edTest').addEventListener('click', () => { if (checkValid()) startLevel(editor.def, 'test'); });
$('edVerify').addEventListener('click', () => {
  if (!checkValid()) return;
  const def = editor.def, status = $('edStatus'), btn = $('edVerify');
  status.textContent = 'Searching for a way through…'; btn.disabled = true;
  let worker;
  try { worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' }); }
  catch { status.textContent = 'This browser cannot run the solver in the background.'; btn.disabled = false; return; }
  worker.onerror = () => { status.textContent = 'The solver could not start.'; btn.disabled = false; };
  worker.onmessage = (e) => {
    const r = e.data;
    if (r.stage === 'win') {
      if (!r.ok) { status.textContent = '✗ No winning route found. The level may be impossible (or just very hard).'; btn.disabled = false; worker.terminate(); return; }
      verified = { id: def.id, inputs: r.inputs };
      status.textContent = `✓ Winnable in ${fmtTime(r.frames)}. Checking the gems…`;
    } else {
      status.textContent = `✓ Winnable. ${r.ok ? `✓ Every gem can be collected (${fmtTime(r.frames)}).` : 'No full-gem route found.'} Pause during a test to watch the solution.`;
      btn.disabled = false; worker.terminate();
    }
  };
  worker.postMessage({ def: { ...def, map: [...def.map] } });
});
$('edShare').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#l=${encodeLevel(editor.def)}`;
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch { /* show it instead */ }
  dialog('Share this level', `<p>${copied ? 'Link copied to the clipboard.' : 'Copy this link:'}</p><textarea readonly>${esc(url)}</textarea>`,
    navigator.share ? [['Share…', () => navigator.share({ title: editor.def.name, url }).catch(() => {})], ['Done']] : [['Done']]);
});

// ---- main loop -------------------------------------------------------------
let last = 0, acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (app.dataset.screen !== 'game') return;
  if (gameEl.dataset.mode === 'edit') { editor.draw(); return; }
  if (!run.state) return;
  if (!run.paused && $('dialog').hidden) {
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n++ < 5) { tick(); acc -= 1 / 60; }
    if (acc > 0.1) acc = 0;
  }
  renderer.draw(run.state);
  updateHud();
}
requestAnimationFrame(frame);

// ---- boot ------------------------------------------------------------------
(function menuArt() {
  const g = $('menuArt').getContext('2d'), S = sprites();
  g.drawImage(S.ghoul[0].l, 72, 8); g.drawImage(S.wizard[0].r, 8, 8); g.drawImage(S.gem, 30, 10); g.drawImage(S.key, 50, 8);
})();
applyTouch();

if (location.hash.startsWith('#l=')) {
  try {
    const def = decodeLevel(location.hash);
    history.replaceState(null, '', location.pathname);
    store.saveCustom(def);
    validateLevel(def).length ? openEditor(def) : startLevel(def, 'custom');
  } catch { /* ignore a broken link */ }
}

let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('btnInstall').hidden = false; });
$('btnInstall').addEventListener('click', async () => { if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('btnInstall').hidden = true; } });
addEventListener('appinstalled', () => { $('btnInstall').hidden = true; });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => { $('offlineNote').textContent = 'Ready to play offline.'; }).catch(() => {});
}

// Test hook: lets the browser tests drive and inspect the running game.
window.__runekeep = { run, store, input, startLevel, LEVELS, SOLUTIONS, decodeInputs, editor, openEditor };
