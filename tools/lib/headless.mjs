// Shared by the headless tools: a static server for the project (three from node_modules when installed) and a
// GPU-enabled headless Chrome / Edge (CHROME_PATH overrides the search).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(root, 'package.json'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };

/** Serve the project folder on a free port; resolves to { server, port }. */
export async function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

/** Launch a headless browser with the GPU on. */
export async function launch({ width = 1280, height = 720, gpu = true } = {}) {
  const puppeteer = require('puppeteer-core');
  const found = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
  if (!found) throw new Error('no Chrome / Edge found: set CHROME_PATH');
  const GPU = process.platform === 'win32' ? ['--use-angle=d3d11'] : process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface'];
  return puppeteer.launch({ executablePath: found, headless: true, args: [...(gpu ? [...GPU, '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] : []), '--no-first-run', '--disable-extensions'],
    defaultViewport: { width, height, deviceScaleFactor: 1 }, protocolTimeout: 600000 });
}

/** Open the city at a camera (x,z,yaw,pitch or x,y,z,yaw,pitch) in shot mode and wait until it is built. */
export async function openCity(browser, port, cam, { w = 640, h = 400, t = null } = {}) {
  const page = await browser.newPage();
  const logs = [];
  page.on('pageerror', e => logs.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) logs.push('console.error ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html?shot=1&w=${w}&h=${h}${t !== null ? `&t=${t}` : ''}&cam=${cam}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 300000, polling: 250 });
  return { page, logs };
}
