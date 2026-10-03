// Actual shared refusal choreography and rig; no browser or page execution.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CatBody } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';
import { rng } from '../src/scripts/cats/mind.js';
import { refusePickup } from '../src/scripts/cats/handling.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.BEAN_RENDER_MODULES
  ? path.join(process.env.BEAN_RENDER_MODULES, '@napi-rs/canvas') : '@napi-rs/canvas');
const out = path.resolve(process.argv[2] || 'output/bean-handling');
await mkdir(out, { recursive: true });
const width = 720, height = 440, fps = 30, duration = 4.5;
const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
const sheet = createCanvas(1440, 220), sc = sheet.getContext('2d');
const body = new CatBody(CAST.black.look, rng(42));
body.x = 330; body.gy = 350; body.k = 2.4; body.yaw = Math.PI / 2;
body.reset({ sit: .65, eyes: .9, tailUp: .55 }); Object.assign(body.pose, body.goal);
for (let i = 0; i < 60; i++) body.update(1 / 60);
let gesture = null, dodged = false, label = 'Your hand approaches';
const captures = [.3, .9, 1.2, 1.75];
let shot = 0;
for (let frame = 0; frame < fps * duration; frame++) {
  const time = frame / fps;
  if (frame === 18) { gesture = refusePickup(body); label = 'Paw up, weight back, head says no'; }
  if (gesture && gesture.next(1 / fps).done) { gesture = null; }
  if (time > 1.8 && !dodged) {
    dodged = true; label = 'Then a dodge'; body.reset({ crouch: .5, tailUp: .8 });
    body.leap(500, 350, 0, 45, .4);
  }
  if (time > 2.2) { label = 'Space, then back to normal'; body.faceYaw(Math.PI / 2); body.reset({ sit: 1, eyes: .9 }); }
  body.update(1 / 60); body.update(1 / 60);
  ctx.fillStyle = '#211c2a'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#b5a6c6'; ctx.font = '14px sans-serif'; ctx.fillText('BEAN / PICKUP REFUSAL', 28, 32);
  ctx.fillStyle = '#f5efe6'; ctx.font = '600 22px sans-serif'; ctx.fillText(label, 28, 66);
  ctx.fillStyle = '#302735'; ctx.beginPath(); ctx.ellipse(365, 361, 280, 21, 0, 0, Math.PI * 2); ctx.fill();
  body.draw(ctx);
  const px = 390 - 45 * Math.min(1, time / .6), py = 185;
  ctx.save(); ctx.translate(px, py); ctx.fillStyle = '#f5efe6'; ctx.strokeStyle = '#19141f'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 23); ctx.lineTo(6, 17); ctx.lineTo(11, 28); ctx.lineTo(16, 25); ctx.lineTo(10, 15); ctx.lineTo(20, 15); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#b5a6c6'; ctx.font = '12px sans-serif'; ctx.fillText('Real shared refusal gesture + rig · independent rendering', 28, 414);
  await writeFile(path.join(out, `${String(frame).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (shot < captures.length && time >= captures[shot]) { sc.drawImage(canvas, shot * 360, 0, 360, 220); shot++; }
}
await writeFile(path.join(out, 'contact-sheet.png'), sheet.toBuffer('image/png'));
await writeFile(path.join(out, 'render.json'), JSON.stringify({ fps, frames: fps * duration, width, height, scope: 'Shared refusePickup and CatBody; scripted pointer/dodge, not browser QA' }, null, 2));
console.log(`Rendered ${fps * duration} frames to ${out}`);
