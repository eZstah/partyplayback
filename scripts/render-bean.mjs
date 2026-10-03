// Independent rig preview: no browser, page, or video player is loaded.
// Supply @napi-rs/canvas through BEAN_RENDER_MODULES (a node_modules folder),
// or install it separately in your development environment. Not a runtime dep.
// node scripts/render-bean.mjs ../output/bean-motion
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CatBody } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';
import { rng } from '../src/scripts/cats/mind.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.BEAN_RENDER_MODULES
  ? path.join(process.env.BEAN_RENDER_MODULES, '@napi-rs/canvas') : '@napi-rs/canvas');
const out = path.resolve(process.argv[2] || 'output/bean-motion');
await mkdir(out, { recursive: true });
const width = 800, height = 430, fps = 30, duration = 18;
const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
const sheet = createCanvas(1200, 430), sc = sheet.getContext('2d');
const body = new CatBody(CAST.black.look, rng(42));
body.x = 180; body.gy = 344; body.k = 2.35; body.yaw = .65;
body.reset({ sit: 1, eyes: .88, pupil: .68, tailWrap: 1 });
Object.assign(body.pose, body.goal);
for (let i = 0; i < 90; i++) body.update(1 / 60);
let label = 'Notice';
const cues = [
  [0, () => { body.look = 'viewer'; body.set({ headRoll: .13, earsBack: 0, eyes: .94 }); }],
  [1.1, () => { body.look = null; body.reset({ tailUp: .8, tailCurl: .6, eyes: .9 }); }],
  [1.7, () => { label = 'Approach'; body.goTo(440, 0, 95); }],
  [6.0, () => { label = 'Sniff'; body.stop(); body.faceYaw(Math.PI / 2); body.reset({ sit: .55, tailUp: .9, tailCurl: .8, eyes: .85 }); }],
  [6.65, () => body.set({ headPitch: -.12, headRoll: -.08 })],
  [7.1, () => body.set({ headPitch: .08, headRoll: .08 })],
  [7.55, () => { label = 'Offer a paw'; body.set({ sit: 1, headRoll: 0, offerPaw: 1 }); }],
  [8.55, () => { label = 'Slow blink'; body.set({ offerPaw: 0 }); body.look = 'viewer'; body.slowBlink(1.4); }],
  [10.05, () => { label = 'Settle'; body.set({ eyes: .7, knead: .3 }); }],
  [11.35, () => body.set({ knead: 0, sit: .3, loaf: 1, tailWrap: .8, tailWag: .05 })],
  [12.3, () => { label = 'Keep you company'; body.set({ headRoll: 0 }); }],
  [15, () => body.slowBlink(1.6)],
];
const captures = [.7, 3.6, 6.9, 8.3, 9.2, 13];
let cue = 0, shot = 0;
for (let frame = 0; frame < fps * duration; frame++) {
  const time = frame / fps;
  while (cue < cues.length && time >= cues[cue][0]) cues[cue++][1]();
  body.update(1 / 60); body.update(1 / 60);
  ctx.fillStyle = '#211c2a'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#302735'; ctx.beginPath(); ctx.ellipse(400, 355, 315, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f5efe6'; ctx.font = '600 23px sans-serif'; ctx.fillText('Bean', 32, 42);
  ctx.font = '13px sans-serif'; ctx.fillStyle = '#b5a6c6'; ctx.fillText('Motion study · direct rig render', 32, 65);
  body.draw(ctx);
  ctx.font = '15px sans-serif'; ctx.fillStyle = '#c3acf0'; ctx.fillText(label, 32, 404);
  await writeFile(path.join(out, `${String(frame).padStart(4, '0')}.png`), canvas.toBuffer('image/png'));
  if (shot < captures.length && time >= captures[shot]) {
    sc.drawImage(canvas, (shot % 3) * 400, Math.floor(shot / 3) * 215, 400, 215); shot++;
  }
}
await writeFile(path.join(out, 'contact-sheet.png'), sheet.toBuffer('image/png'));
await writeFile(path.join(out, 'render.json'), JSON.stringify({ fps, frames: fps * duration, width, height, seed: 42, scope: 'CatBody rig only; not page or choreography QA' }, null, 2));
console.log(`Rendered ${fps * duration} rig frames and contact-sheet.png to ${out}`);
