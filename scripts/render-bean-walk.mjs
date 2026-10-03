// Exercise the real rest-to-walk rig transition without a browser or page.
// node scripts/render-bean-walk.mjs ../output/bean-walk
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CatBody } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';
import { rng } from '../src/scripts/cats/mind.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.BEAN_RENDER_MODULES
  ? path.join(process.env.BEAN_RENDER_MODULES, '@napi-rs/canvas') : '@napi-rs/canvas');
const out = path.resolve(process.argv[2] || 'output/bean-walk');
await mkdir(out, { recursive: true });
const poses = [{ sit: 1 }, { loaf: 1 }, { curl: 1 }, { sit: .85, overEdge: 1, tailHang: 1 }];
const names = ['Sit', 'Loaf', 'Sleep', 'Perch'];
const captures = [0, .3, 1, 1.2, 1.4], width = 230, height = 230;
const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
const sheet = createCanvas(width * captures.length, height * poses.length), sc = sheet.getContext('2d');
const samples = [];
for (const [row, pose] of poses.entries()) {
  const body = new CatBody(CAST.black.look, rng(42));
  body.x = 0; body.gy = 194; body.k = 1.7; body.yaw = 0;
  body.reset(pose); Object.assign(body.pose, body.goal);
  if (pose.curl) { body.face = 'sleep'; body.set({ eyes: 0 }); }
  for (let i = 0; i < 240; i++) body.update(1 / 60);
  let shot = 0;
  for (let frame = 0; frame <= 90; frame++) {
    if (frame === 1) body.goTo(1000, 0, 100);
    if (frame) body.update(1 / 60);
    if (shot === captures.length || frame / 60 < captures[shot]) continue;
    ctx.fillStyle = '#211c2a'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#342d3a'; ctx.fillRect(0, 201, width, 29);
    ctx.save(); ctx.translate(105 - body.x, 0); body.draw(ctx); ctx.restore();
    ctx.fillStyle = '#f5efe6'; ctx.font = '14px sans-serif';
    ctx.fillText(`${names[row]} → walk / ${captures[shot].toFixed(1)}s`, 12, 24);
    ctx.fillStyle = '#b5a6c6'; ctx.font = '12px sans-serif';
    ctx.fillText(`${body.x.toFixed(1)}px travelled`, 12, 222);
    sc.drawImage(canvas, shot * width, row * height);
    samples.push({ pose: names[row], seconds: captures[shot], x: body.x,
      pawHeights: body.paws.map(p => p.w[1]) });
    shot++;
  }
}
await writeFile(path.join(out, 'contact-sheet.png'), sheet.toBuffer('image/png'));
await writeFile(path.join(out, 'samples.json'), JSON.stringify(samples, null, 2));
console.log(`Rendered four rest-to-walk transitions to ${out}`);
