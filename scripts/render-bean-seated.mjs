// Independent rig render; no page/browser execution or new runtime dependency.
// node scripts/render-bean-seated.mjs ../output/bean-seated-before
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CatBody, wrap } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';
import { rng } from '../src/scripts/cats/mind.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.BEAN_RENDER_MODULES
  ? path.join(process.env.BEAN_RENDER_MODULES, '@napi-rs/canvas') : '@napi-rs/canvas');
const out = path.resolve(process.argv[2] || 'output/bean-seated');
await mkdir(out, { recursive: true });
const width = 128, height = 144, canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
const worst = [];
for (let degrees = 0; degrees < 360; degrees += 3) {
  const body = new CatBody(CAST.black.look, rng(42));
  body.x = 64; body.gy = 116; body.k = 1; body.yaw = degrees * Math.PI / 180;
  body.reset({ sit: 1, tailWrap: 1, tailWag: .025, eyes: .82,
    headYaw: Math.max(-1.25, Math.min(1.25, wrap(Math.PI / 2 - body.yaw))) });
  Object.assign(body.pose, body.goal);
  for (let i = 0; i < 240; i++) body.update(1 / 60);
  let previous = null, best = null;
  for (let frame = 0; frame < 300; frame++) {
    body.update(1 / 60);
    ctx.fillStyle = '#17151f'; ctx.fillRect(0, 0, width, height);
    body.draw(ctx);
    const data = ctx.getImageData(0, 0, width, height), pixels = data.data;
    // Below the cheeks: blinks must not hide a chest/paw sorting pop.
    let change = 0;
    if (previous) for (let y = 90; y < 130; y++) for (let x = 25; x < 104; x++) {
      const i = (y * width + x) * 4;
      if (Math.max(Math.abs(pixels[i] - previous.data[i]), Math.abs(pixels[i + 1] - previous.data[i + 1]), Math.abs(pixels[i + 2] - previous.data[i + 2])) > 70) change++;
    }
    if (!best || change > best.change) best = { degrees, frame, change,
      before: previous, after: data };
    previous = data;
  }
  worst.push(best);
}
worst.sort((a, b) => b.change - a.change);
const sheet = createCanvas(1024, 3 * 332), sc = sheet.getContext('2d');
sc.fillStyle = '#211c2a'; sc.fillRect(0, 0, sheet.width, sheet.height);
for (let i = 0; i < 6; i++) {
  const item = worst[i], col = i % 2, row = Math.floor(i / 2), x = col * 512, y = row * 332;
  sc.fillStyle = '#f5efe6'; sc.font = '16px sans-serif';
  sc.fillText(`${item.degrees}° / frame ${item.frame} / ${item.change} changed pixels`, x + 12, y + 25);
  for (const [j, key] of ['before', 'after'].entries()) {
    if (!item[key]) continue;
    ctx.putImageData(item[key], 0, 0);
    const file = path.join(out, `${i}-${key}.png`); await writeFile(file, canvas.toBuffer('image/png'));
    sc.drawImage(canvas, x + j * 256, y + 40, 256, 288);
  }
}
await writeFile(path.join(out, 'contact-sheet.png'), sheet.toBuffer('image/png'));
await writeFile(path.join(out, 'changes.json'), JSON.stringify(worst.map(({ before, after, ...stats }) => stats), null, 2));
console.log(JSON.stringify({ out, worst: worst.slice(0, 12).map(({ before, after, ...stats }) => stats) }));
