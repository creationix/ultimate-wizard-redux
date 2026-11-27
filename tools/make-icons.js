// Renders the app icons from the wizard sprite: writes icons/icon.svg and uses
// headless Chromium (Playwright) to rasterise the PNG sizes the manifest needs.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { WIZARD, PAL } from '../src/sprites.js';

function svg(pad) {
  const cell = (512 - pad * 2) / 16;
  let rects = '';
  WIZARD.idle.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '.') rects += `<rect x="${(pad + x * cell).toFixed(2)}" y="${(pad + y * cell).toFixed(2)}" width="${(cell + 0.5).toFixed(2)}" height="${(cell + 0.5).toFixed(2)}" fill="${PAL[parseInt(ch, 16)]}"/>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges"><rect width="512" height="512" fill="#16144a"/>${rects}</svg>`;
}
const out = (name) => new URL(`../icons/${name}`, import.meta.url);
writeFileSync(out('icon.svg'), svg(64));
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
for (const [name, size, pad] of [['icon-192.png', 192, 64], ['icon-512.png', 512, 64], ['maskable-512.png', 512, 112]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg(pad).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  writeFileSync(out(name), await page.screenshot());
  await page.close();
}
await browser.close();
console.log('icons written');
