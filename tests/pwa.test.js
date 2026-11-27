// The app must stay installable and fully available offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const sw = read('sw.js');
const assets = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);

test('manifest has what browsers require for installation', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.ok(m.name && m.short_name && m.start_url && m.scope);
  assert.equal(m.display, 'standalone');
  assert.ok(m.background_color && m.theme_color);
  const sizes = m.icons.filter((i) => i.type === 'image/png').map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of m.icons) {
    assert.ok(existsSync(new URL(icon.src, root)), `${icon.src} exists`);
    if (icon.type !== 'image/png') continue;
    const png = readFileSync(new URL(icon.src, root));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, `${icon.src} really is ${icon.sizes}`);
  }
});

test('index.html wires up the manifest, viewport and app module', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<script type="module" src="src\/main\.js">/);
  assert.doesNotMatch(html, /https?:\/\//, 'no external resources: the app must work offline');
  assert.doesNotMatch(read('style.css'), /url\(|@import/, 'no external resources in the stylesheet');
});

test('service worker precaches every shipped file', () => {
  const shipped = ['index.html', 'style.css', 'manifest.webmanifest',
    ...readdirSync(new URL('src/', root)).map((f) => `src/${f}`),
    ...readdirSync(new URL('icons/', root)).map((f) => `icons/${f}`)];
  for (const f of shipped) assert.ok(assets.includes(f), `${f} is missing from ASSETS in sw.js`);
  for (const a of assets) if (a !== './') assert.ok(existsSync(new URL(a, root)), `sw.js lists ${a}, which does not exist`);
  assert.ok(assets.includes('./'));
});

test('every module import resolves to a precached file, and nothing is fetched from the network', () => {
  for (const f of readdirSync(new URL('src/', root))) {
    const src = read(`src/${f}`);
    for (const m of src.matchAll(/(?:from|import\()\s*'([^']+)'|new URL\('([^']+)'/g)) {
      const spec = m[1] || m[2];
      assert.ok(spec.startsWith('./'), `${f} imports "${spec}" - only local modules are allowed`);
      assert.ok(assets.includes(`src/${spec.slice(2)}`), `${f} imports ${spec}, which is not precached`);
    }
    assert.doesNotMatch(src, /https?:\/\/(?!x\b)/, `${f} must not reference remote URLs`);
  }
});

test('the simulation core stays free of browser APIs', () => {
  for (const f of ['sim.js', 'solver.js', 'levels.js']) assert.doesNotMatch(read(`src/${f}`), /\b(document|window|localStorage|navigator)\b/, f);
});
