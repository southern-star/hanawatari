// Frame-by-frame capture for a video: node tools/capture.mjs "x,y,z,yaw,pitch" seconds fps outdir [t0] [w h]
// then e.g.  ffmpeg -framerate 15 -i outdir/f%04d.png -pix_fmt yuv420p -crf 23 clip.mp4
import fs from 'node:fs';
import { serve, launch, openCity } from './lib/headless.mjs';

const [cam, secs, fps, outdir, t0 = '60', W = '960', H = '540'] = process.argv.slice(2);
if (!cam || !secs || !fps || !outdir) { console.log('usage: node tools/capture.mjs "x,y,z,yaw,pitch" seconds fps outdir [t0] [w h]'); process.exit(1); }
fs.mkdirSync(outdir, { recursive: true });
const { server, port } = await serve();
const browser = await launch({ width: +W, height: +H });
try {
  const { page } = await openCity(browser, port, cam, { w: +W, h: +H, t: t0 });
  const n = Math.round(secs * fps);
  for (let i = 0; i < n; i++) {
    await page.evaluate((dt) => window.__step(dt, 2), 1 / fps / 2);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: `${outdir}/f${String(i).padStart(4, '0')}.png` });
  }
  console.log('frames', n);
} finally { await browser.close(); server.close(); }
