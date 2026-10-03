// Independent rendering of the real rig and release planner; no page/browser.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CatBody } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';
import { rng } from '../src/scripts/cats/mind.js';
import { planRelease } from '../src/scripts/cats/release.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.BEAN_RENDER_MODULES
  ? path.join(process.env.BEAN_RENDER_MODULES, '@napi-rs/canvas') : '@napi-rs/canvas');
const out = path.resolve(process.argv[2] || 'output/bean-acrobatics');
await mkdir(out, { recursive: true });
const width = 1000, height = 600, fps = 30, duration = 12;
const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
const sheet = createCanvas(1500, 600), sc = sheet.getContext('2d');
const body = new CatBody(CAST.black.look, rng(42));
const surfaces = [{ id: 'low', left: 260, right: 455, y: 445 },
  { id: 'middle', left: 535, right: 750, y: 315 }, { id: 'high', left: 805, right: 975, y: 195 }];
body.x = 125; body.gy = 555; body.k = 1.8; body.yaw = 0;
body.reset({ eyes: .95, tailUp: .6 }); Object.assign(body.pose, body.goal);
for (let i = 0; i < 90; i++) body.update(1 / 60);
let label = 'Push off', hanging = false;
const leap = (x, y, seconds, options = {}) => {
  body.reset({ tailUp: .6 }); body.faceYaw(x >= body.x ? 0 : Math.PI);
  body.leap(x, y, 0, 35, seconds, options);
};
const cues = [
  [.35, () => body.set({ crouch: .9 })],
  [.6, () => leap(350, 445, .65)],
  [1.5, () => { label = 'Tuck and roll'; body.set({ crouch: .7 }); }],
  [1.65, () => leap(640, 315, .9, { spin: 1 })],
  [2.9, () => { label = 'Catch the edge'; body.set({ crouch: .7 }); }],
  [3.05, () => leap(865, 195 + 64 * body.k, .65, { landing: false })],
  [3.7, () => { hanging = true; body.faceYaw(Math.PI / 2); body.reset({ hang: 1, tailHang: 1 }); body.noShadow = true; }],
  [5.1, () => {
    label = 'Pull up'; hanging = false; body.hangPaws = null; body.noShadow = false;
    leap(865, 195, .4);
  }],
  [5.9, () => { label = 'Momentum into a ledge landing';
    const p = planRelease({ x: body.x, y: body.screen([0, 0, 0])[1], vx: -850, vy: -200,
      width, floorY: 555, scale: body.k, surfaces });
    body.reset({ tailUp: .5 }); body.faceYaw(Math.PI);
    body.leap(p.x, p.y, 0, 0, p.duration, { type: 'throw', velocityY: p.vy, gravity: p.gravity, spin: p.spin });
  }],
  [7.55, () => { label = 'Reach, absorb, recover'; body.reset({ tailUp: .5 });
    body.leap(330, 555, 0, 0, null, { type: 'fall', velocityY: -100, gravity: 1600 * body.k });
  }],
  [8.5, () => { label = 'Back to Bean'; body.goTo(210, 0, 90); }],
  [10, () => { body.stop(); body.faceYaw(Math.PI / 2); body.reset({ sit: 1, tailWrap: 1, eyes: .85 }); body.look = 'viewer'; }],
  [10.8, () => body.slowBlink(1.1)],
];
const captures = [.95, 2.0, 4.4, 6.5, 8.15, 11];
let cue = 0, shot = 0;
for (let frame = 0; frame < fps * duration; frame++) {
  const time = frame / fps;
  while (cue < cues.length && time >= cues[cue][0]) cues[cue++][1]();
  body.update(1 / 60); body.update(1 / 60);
  if (hanging) {
    body.gy = 195 + 64 * body.k;
    body.hangPaws = [{ x: body.x - 12 * body.k, y: 195 }, { x: body.x + 12 * body.k, y: 195 }];
  }
  ctx.fillStyle = '#211c2a'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#b5a6c6'; ctx.font = '13px sans-serif'; ctx.fillText('BEAN / MOVEMENT STUDY', 32, 34);
  ctx.fillStyle = '#f5efe6'; ctx.font = '600 23px sans-serif'; ctx.fillText(label, 32, 66);
  ctx.fillStyle = '#292230'; ctx.fillRect(0, 555, width, 45);
  for (const s of surfaces) {
    ctx.fillStyle = '#372e42'; ctx.beginPath(); ctx.roundRect(s.left, s.y, s.right - s.left, 22, 6); ctx.fill();
    ctx.strokeStyle = '#776189'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.left + 6, s.y); ctx.lineTo(s.right - 6, s.y); ctx.stroke();
  }
  body.draw(ctx);
  ctx.fillStyle = '#b5a6c6'; ctx.font = '12px sans-serif'; ctx.fillText('Actual CatBody + release planner · scripted rig study, not a browser capture', 32, 582);
  await writeFile(path.join(out, `${String(frame).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (shot < captures.length && time >= captures[shot]) {
    sc.drawImage(canvas, (shot % 3) * 500, Math.floor(shot / 3) * 300, 500, 300); shot++;
  }
}
await writeFile(path.join(out, 'contact-sheet.png'), sheet.toBuffer('image/png'));
await writeFile(path.join(out, 'render.json'), JSON.stringify({ fps, frames: fps * duration, width, height, seed: 42,
  scope: 'Actual CatBody and planRelease on a scripted course; not browser or autonomous choreography QA' }, null, 2));
console.log(`Rendered ${fps * duration} rig frames and contact-sheet.png to ${out}`);
