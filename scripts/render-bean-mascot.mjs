// Renders the pictures the page mascot uses where Bean's world does not run
// (phones, touch-first screens, the 404 page): Bean's own rig, sitting and facing
// you, once per expression. No engine runs on those pages; they only show these.
// Supply @napi-rs/canvas through BEAN_RENDER_MODULES (a node_modules folder),
// or install it separately in your development environment. Not a runtime dep.
// node scripts/render-bean-mascot.mjs   (writes public/bean/mascot-*.png)
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CatBody } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';
import { rng } from '../src/scripts/cats/mind.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.BEAN_RENDER_MODULES
  ? path.join(process.env.BEAN_RENDER_MODULES, '@napi-rs/canvas') : '@napi-rs/canvas');
const out = path.resolve('public/bean');
await mkdir(out, { recursive: true });
// Three times the mascot's 180×210 viewBox, so it stays sharp on phone screens.
const width = 540, height = 630;
const faces = { open: { face: 'open' }, happy: { face: 'happy', headRoll: .1 } };

function settle(look) {
  const body = new CatBody(CAST.black.look, rng(7));
  body.noShadow = true; body.yaw = Math.PI / 2 - .38; body.look = 'viewer';
  body.reset({ sit: 1, eyes: .92, pupil: .75, tailWrap: 1, ...look });
  Object.assign(body.pose, body.goal);
  body.face = look.face;
  for (let i = 0; i < 120; i++) body.update(1 / 60);
  body.blink = 0; body.blinkCycle = null;
  return body;
}

// Size and place every expression from the same measured pose so they line up.
const probe = settle(faces.open), scratch = createCanvas(width, height).getContext('2d');
probe.x = 0; probe.gy = 0; probe.k = 1; probe.draw(scratch);
const { left, top, right, bottom } = probe.bounds;
const k = Math.min(width * .74 / (right - left), height * .7 / (bottom - top));
for (const [name, look] of Object.entries(faces)) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  const body = settle(look);
  body.k = k; body.x = width / 2 - (left + right) / 2 * k; body.gy = height - bottom * k - height * .1;
  body.blink = 0; body.draw(ctx);
  await writeFile(path.join(out, `mascot-${name}.png`), canvas.toBuffer('image/png'));
}
console.log(`Rendered ${Object.keys(faces).length} mascot expressions to ${out}`);
