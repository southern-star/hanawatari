// Plan map: draws the city plan (src/plan) as an SVG and a PNG (headless Chrome / Edge) for reviewing the skeleton.
// usage: node tools/plan-map.mjs [--out shots/plan/map] [--view x0,z0,x1,z1] [--scale 0.5] [--no-png]
//   --view  area to draw in world metres (default: the whole map + a margin); a smaller view draws a close-up
//   --scale pixels per metre (default 0.5 for the whole map)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = await import(pathToFileURL(path.join(root, 'src/plan/index.js')).href);
const { computeCrossings } = await import(pathToFileURL(path.join(root, 'src/plan/crossings.js')).href);
const { planSVG } = await import(pathToFileURL(path.join(root, 'src/plan/mapsvg.js')).href);
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; args[k] = v; } }
const { svg, W, H } = planSVG(plan, computeCrossings(), { view: args.view ? args.view.split(',').map(Number) : null, scale: args.scale, urban: args['no-urban'] ? null : plan.generateUrban() });

// ------------------------------------------------------------------ write SVG + PNG
const outBase = path.resolve(root, args.out || 'shots/plan/map');
fs.mkdirSync(path.dirname(outBase), { recursive: true });
fs.writeFileSync(outBase + '.svg', svg);
console.log(`svg: ${path.relative(root, outBase + '.svg')} (${W}×${H})`);
if (!args['no-png']) {
  const { default: puppeteer } = await import('puppeteer-core');
  const exe = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-first-run', '--disable-extensions'], defaultViewport: { width: W, height: H, deviceScaleFactor: Number(args.dpr || 1) } });
  try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fbf8f1">${svg}</body></html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: outBase + '.png', clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`png: ${path.relative(root, outBase + '.png')}`);
  } finally { await browser.close(); }
}
