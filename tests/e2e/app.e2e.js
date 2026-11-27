// Browser tests (headless Chromium via Playwright): the real app, real input,
// desktop and phone layouts, installability and offline behaviour.
//   npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from '../../tools/serve.js';

const { chromium } = createRequire(import.meta.url)('playwright');
let server, url, browser;
before(async () => { ({ server, url } = await startServer()); browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

async function open(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 }, ...options });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__runekeep);
  return { ctx, page, errors };
}
const player = (page) => page.evaluate(() => { const s = window.__runekeep.run.state; return { x: s.p.x, y: s.p.y, ground: s.p.ground, tick: s.tick, won: s.won, dead: s.dead }; });

test('desktop: menu, level select and keyboard play', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#btnPlay');
  const cards = page.locator('#levelGrid .card');
  assert.equal(await cards.count(), 10);
  assert.equal(await cards.nth(0).isDisabled(), false);
  assert.equal(await cards.nth(1).isDisabled(), true, 'later levels start locked');
  await cards.nth(0).click();
  await page.waitForFunction(() => window.__runekeep.run.state?.tick > 5);
  assert.equal(await page.locator('#touch').isVisible(), false, 'no touch controls with a mouse');
  const a = await player(page);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
  const b = await player(page);
  assert.ok(b.x > a.x + 200, 'ArrowRight walks right');
  await page.keyboard.down('Space'); await page.waitForTimeout(120);
  assert.ok((await player(page)).y < b.y, 'Space jumps'); await page.keyboard.up('Space');
  // The canvas is actually drawing something.
  const colours = await page.evaluate(() => { const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return set.size; });
  assert.ok(colours > 20, `canvas shows a rendered scene (${colours} colours sampled)`);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dlgTitle').textContent(), 'Paused');
  const t = (await player(page)).tick; await page.waitForTimeout(200);
  assert.equal((await player(page)).tick, t, 'the world is frozen while paused');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('watching a stored solution wins the level in the real app, then progress unlocks', async () => {
  const { ctx, page, errors } = await open();
  // Level 8 has the shortest solution (under four seconds).
  await page.evaluate(() => { const r = window.__runekeep; r.startLevel(r.LEVELS[7], 'builtin', 7, r.decodeInputs(r.SOLUTIONS['gate-hopping'].win)); });
  await page.waitForFunction(() => document.getElementById('dlgTitle').textContent === 'Solution complete', null, { timeout: 30000 });
  assert.equal((await player(page)).won, true);
  // Now win it "for real" by feeding the same inputs through the live input path.
  await page.evaluate(() => {
    const r = window.__runekeep; document.querySelector('#dlgButtons .btn').click();
    const inputs = r.decodeInputs(r.SOLUTIONS['gate-hopping'].win);
    r.input.read = () => inputs[r.run.state.tick] ?? 0;
  });
  await page.waitForFunction(() => document.getElementById('dlgTitle').textContent === 'Chamber cleared', null, { timeout: 30000 });
  assert.ok(await page.evaluate(() => window.__runekeep.store.progress('gate-hopping')), 'the win was saved');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phone: touch controls appear and drive the game in both orientations', async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const { ctx, page, errors } = await open({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await page.tap('#btnPlay');
    await page.locator('#levelGrid .card').first().tap();
    await page.waitForFunction(() => window.__runekeep.run.state?.p.ground);
    for (const id of ['#pad', '#btnJump', '#btnCast', '#view', '#btnPause']) {
      const box = await page.locator(id).boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${id} is fully on screen at ${viewport.width}x${viewport.height}`);
    }
    const canvas = await page.locator('#view').boundingBox();
    assert.ok(canvas.width >= Math.min(viewport.width, viewport.height * 1.6) * 0.6, 'the playfield uses the available space');
    const a = await player(page);
    const pad = await page.locator('#pad').boundingBox();
    const client = await ctx.newCDPSession(page);
    const touch = (type, x, y) => client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', pad.x + pad.width * 0.9, pad.y + pad.height / 2);
    await page.waitForTimeout(300);
    await touch('touchEnd');
    const b = await player(page);
    assert.ok(b.x > a.x + 100, 'the d-pad walks right');
    const jump = await page.locator('#btnJump').boundingBox();
    await touch('touchStart', jump.x + jump.width / 2, jump.y + jump.height / 2);
    await page.waitForTimeout(150);
    assert.ok((await player(page)).y < b.y, 'the jump button jumps');
    await touch('touchEnd');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true, 'no page scrolling');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('editor: paint, validate, verify with the solver, test-play, share and re-import', async () => {
  const { ctx, page, errors } = await open();
  await page.click('#btnEditor');
  await page.waitForFunction(() => window.__runekeep.editor.def);
  const cell = async (tx, ty) => { const b = await page.locator('#view').boundingBox(); return [b.x + (tx + 0.5) * b.width / 24, b.y + (ty + 0.5) * b.height / 15]; };
  await page.click('.tool[data-ch="$"]');
  await page.mouse.click(...await cell(6, 13));
  await page.click('.tool[data-ch="#"]');
  const [x0, y0] = await cell(9, 13), [x1, y1] = await cell(9, 12);
  await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 4 }); await page.mouse.up();
  const map = await page.evaluate(() => window.__runekeep.editor.def.map);
  assert.equal(map[13][6], '$'); assert.equal(map[13][9], '#'); assert.equal(map[12][9], '#', 'dragging paints');
  // Moving a unique item removes the old one.
  await page.click('.tool[data-ch="K"]'); await page.mouse.click(...await cell(15, 13));
  assert.equal((await page.evaluate(() => window.__runekeep.editor.def.map.join(''))).split('K').length - 1, 1);
  await page.click('#edVerify');
  await page.waitForFunction(() => /Every gem|No full-gem|No winning/.test(document.getElementById('edStatus').textContent), null, { timeout: 60000 });
  assert.match(await page.locator('#edStatus').textContent(), /Winnable.*Every gem can be collected/);
  // A level that cannot be won is reported as such.
  await page.click('.tool[data-ch="#"]');
  for (const ty of [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) await page.mouse.click(...await cell(18, ty));
  await page.click('#edVerify');
  await page.waitForFunction(() => /Every gem|No full-gem|No winning/.test(document.getElementById('edStatus').textContent), null, { timeout: 120000 });
  assert.match(await page.locator('#edStatus').textContent(), /No winning route/);
  // Removing the door makes it invalid; test-play refuses.
  await page.click('.tool[data-ch=" "]'); await page.mouse.click(...await cell(21, 13));
  await page.click('#edTest');
  assert.equal(await page.locator('#dlgTitle').textContent(), 'Not playable yet');
  await page.click('#dlgButtons .btn');
  await page.click('.tool[data-ch="D"]'); await page.mouse.click(...await cell(16, 13));
  await page.click('#edTest');
  await page.waitForFunction(() => window.__runekeep.run.state?.tick > 3 && document.getElementById('game').dataset.mode === 'play');
  // The level persists and round-trips through a share link.
  const code = await page.evaluate(async () => { const { encodeLevel } = await import('./src/store.js'); return encodeLevel(window.__runekeep.editor.def); });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('runekeep.v1')).custom.length);
  assert.equal(saved, 1);
  const page2 = await ctx.newPage();
  await page2.goto(`${url}#l=${code}`);
  await page2.waitForFunction(() => window.__runekeep?.run.state?.tick > 3);
  assert.deepEqual(await page2.evaluate(() => window.__runekeep.run.def.map), await page.evaluate(() => window.__runekeep.editor.def.map));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('installable: manifest and icons are served and a service worker takes control', async () => {
  const { ctx, page, errors } = await open();
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.equal(await page.evaluate(async (src) => (await fetch(src)).status, icon.src), 200);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => document.getElementById('offlineNote').textContent.includes('offline'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('offline: after one visit the whole game loads and plays with no network', async () => {
  const { ctx, page } = await open();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length >= 20);
  await ctx.setOffline(true);
  server.close(); server.closeAllConnections?.();     // the origin is really gone
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await page.waitForFunction(() => window.__runekeep);
  await page.click('#btnPlay');
  await page.locator('#levelGrid .card').first().click();
  await page.waitForFunction(() => window.__runekeep.run.state?.tick > 10);
  await page.click('#btnPause'); await page.click('#dlgButtons .btn:last-child');
  await page.click('[data-go="menu"]'); await page.click('#btnEditor');
  await page.click('#edVerify');
  await page.waitForFunction(() => /Winnable\./.test(document.getElementById('edStatus').textContent), null, { timeout: 60000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});
