// Debug screenshots: one camera, with world layers toggled, to find which layer draws an artifact.
// usage: node tools/debug-shot.mjs --cam "x,z,yaw,pitch" --out shots/debug/x [--hide "massing;structures|near"]
//   --hide  ';'-separated variants; each is a '|'-separated list of world groups to hide (names: far-terrain, water,
//           structures, massing, near). One screenshot per variant (plus one with nothing hidden).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; } }
const out = args.out || 'shots/debug/d'; fs.mkdirSync(path.dirname(path.resolve(root, out)), { recursive: true });
const server = http.createServer((req, res) => { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(root, p), (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' }); res.end(d); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const exe = ['/usr/bin/google-chrome', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const GPU = process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'];
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: [...GPU, '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 300000 });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?shot=1&w=1280&h=720&t=${args.t || 0}&cam=${args.cam}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 280000, polling: 250 });
  const variants = [''].concat((args.hide || '').split(';').filter(Boolean));
  for (let i = 0; i < variants.length; i++) {
    await page.evaluate((hide) => {
      const names = hide ? hide.split('|') : [];
      window.__world.root.traverse(o => { if (o.userData.__vis === undefined) o.userData.__vis = o.visible; o.visible = o.userData.__vis; });
      for (const c of window.__world.root.children) if (names.includes(c.name)) c.visible = false;
      for (const c of window.__ctx.scene.children) { if (c.userData.__vis === undefined) c.userData.__vis = c.visible; c.visible = names.includes(c.name) ? false : c.userData.__vis; }
      for (const ch of window.__world.chunks.values()) for (const c of ch.group.children) { if (c.userData.__vis === undefined) c.userData.__vis = c.visible; c.visible = names.includes('chunk:' + c.name) || names.includes('chunk:' + (c.type)) ? false : c.userData.__vis; }
    }, variants[i]);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.resolve(root, `${out}_${i}.png`) });
    console.log(`${out}_${i}.png hide=[${variants[i]}]`);
  }
} finally { await browser.close(); server.close(); }
