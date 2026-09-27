// Captioned two-column contact sheets from screenshots:
// node tools/sheet.mjs '[["title", [["shots/a.png", "caption"], …], "shots/out.png"], …]'   (paths from the project root)
import fs from 'node:fs';
import path from 'node:path';
import { root, launch } from './lib/headless.mjs';

const sheets = JSON.parse(process.argv[2] || '[]');
const browser = await launch({ width: 1920, height: 600, gpu: false });
try {
  const page = await browser.newPage();
  for (const [title, items, out] of sheets) {
    const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.resolve(root, f)).toString('base64');
    const cells = items.map(([f, cap]) => `<div class="c"><img src="${img(f)}"><div class="l">${cap}</div></div>`).join('');
    await page.setContent(`<html><head><style>body{margin:0;background:#1f2328;font-family:'Noto Sans JP',sans-serif;color:#fff}
      .t{padding:10px 16px;font-size:26px;font-weight:700}.g{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 8px 8px}.c{position:relative}
      .c img{width:100%;display:block;border-radius:6px}.l{position:absolute;left:10px;top:10px;background:rgba(0,0,0,.62);padding:4px 10px;border-radius:4px;font-size:20px}</style></head>
      <body><div class="t">${title}</div><div class="g">${cells}</div></body></html>`, { waitUntil: 'load' });
    await page.setViewport({ width: 1920, height: 100 }); const h = await page.evaluate(() => document.body.scrollHeight); await page.setViewport({ width: 1920, height: h });
    await page.screenshot({ path: path.resolve(root, out) }); console.log('ok', out);
  }
} finally { await browser.close(); }
