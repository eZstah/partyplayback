import test from 'node:test';
import assert from 'node:assert/strict';
import { CatBody, TILT } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';
import { rng } from '../src/scripts/cats/mind.js';

const makeBody = () => new CatBody(CAST.black.look, rng(84));
const near = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} should be near ${b}`);
const step = (body, duration, draw) => {
  for (let t = 0; t < duration - 1e-9; t += 1 / 120) { body.update(Math.min(1 / 120, duration - t)); if (draw) body.draw(draw); }
};

// Tracks the actual drawing transform, independent of the rig's hit geometry.
function recordingCanvas() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [], shapes = [];
  const apply = (x, y) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
  const transform = (a, b, c, d, e, f) => {
    const m = matrix;
    matrix = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d,
      m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
  };
  const check = args => args.forEach(value => { if (typeof value === 'number') assert.ok(Number.isFinite(value)); });
  const ctx = new Proxy({ globalAlpha: 1, save: () => stack.push([...matrix]), restore: () => { matrix = stack.pop(); },
    transform, translate: (x, y) => transform(1, 0, 0, 1, x, y), rotate: angle => transform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0),
    arc(x, y, radius, ...args) { check([x, y, radius, ...args]); shapes.push({ kind: 'arc', center: apply(x, y), radius, matrix: [...matrix] }); },
    ellipse(x, y, rx, ry, ...args) { check([x, y, rx, ry, ...args]); shapes.push({ kind: 'ellipse', center: apply(x, y), rx, ry, matrix: [...matrix] }); },
    createRadialGradient: (...args) => { check(args); return { addColorStop() {} }; },
  }, { get: (target, key) => key in target ? target[key] : (...args) => check(args) });
  return { ctx, shapes };
}

test('legacy leaps preserve their endpoint and arc while drops accelerate under gravity', () => {
  const jumping = makeBody(); jumping.leap(180, 40, 15, 80, .8);
  step(jumping, .4);
  near(jumping.h, 80); near(jumping.x, 90);
  step(jumping, .4);
  assert.equal(jumping.jump, null); near(jumping.x, 180); near(jumping.gy, 40); near(jumping.z, 15);

  const falling = makeBody(); falling.leap(100, 300, 0, 0, null, { type: 'fall', gravity: 1500 });
  const duration = falling.jump.dur;
  step(falling, duration / 4); const first = falling.gy;
  step(falling, duration / 4); const second = falling.gy - first;
  assert.ok(second > first * 2, 'a drop accelerates instead of descending at a constant speed');
  step(falling, duration / 2 + .01);
  assert.equal(falling.jump, null); near(falling.gy, 300); near(falling.x, 100);
});

test('an upward throw keeps release momentum, tucks, rights itself and reaches for landing', () => {
  const body = makeBody(); body.gy = 80;
  body.leap(200, 400, 0, 0, null, { type: 'throw', velocityY: -400, gravity: 1400, spin: -1 });
  const duration = body.jump.dur;
  step(body, .1);
  assert.ok(body.gy < 80 && body.flight.velocityY < 0, 'the throw initially continues upward');
  step(body, duration * .4 - .1);
  assert.ok(body.flight.tuck > .85 && body.flight.roll < -2, 'compact body rolls in mid-air');
  step(body, duration * .5);
  near(body.flight.roll, -Math.PI * 2);
  assert.ok(body.flight.reach > .99 && body.flight.tuck < .01, 'paws extend after righting, before contact');
  step(body, duration * .1 + .01);
  near(body.x, 200); near(body.gy, 400); assert.equal(body.flight.roll, 0);
});

test('landing compresses the rig then relaxes without changing the resting pose goals', () => {
  const body = makeBody(); body.reset({ sit: .25 });
  body.leap(0, 450, 0, 0, null, { type: 'fall' });
  const duration = body.jump.dur;
  step(body, duration + .08);
  assert.ok(body.landing > .4, 'impact produces a readable absorption');
  assert.equal(body.goal.sit, .25); assert.equal(body.goal.crouch, 0);
  step(body, 2.5);
  assert.ok(body.landing < .001 && Math.abs(body.squash) < .001, 'impact does not leave a permanent crouch or wobble');
});

test('zero-gravity settling and ledge catches can finish without a floor impact', () => {
  const body = makeBody();
  body.leap(0, 30, 0, 0, null, { type: 'fall', gravity: 0, velocityY: 100, landing: false });
  near(body.jump.dur, .3); near(body.jump.accelerationY, 0);
  step(body, .31);
  assert.equal(body.jump, null); near(body.gy, 30);
  assert.equal(body.landing, 0); assert.equal(body.landingTarget, 0);
});

test('air rolls transform the drawn head and paws with their hit geometry, leaving shadow level', () => {
  const body = makeBody(); body.x = 160; body.gy = 120; body.k = 1.7;
  body.leap(350, 480, 0, 0, .9, { type: 'fall', spin: 1 }); step(body, .27);
  const { ctx, shapes } = recordingCanvas(); body.draw(ctx);
  const shadow = shapes[0];
  assert.equal(shadow.kind, 'ellipse'); assert.deepEqual(shadow.matrix.slice(0, 4), [1, 0, 0, 1]);
  const skull = shapes.find(shape => shape.kind === 'arc' && Math.abs(shape.radius - (body.L.headR * body.k + 2.1 * body.k)) < 1e-6);
  assert.ok(skull);
  near(skull.center[0], body.headPos[0]); near(skull.center[1], body.headPos[1]);
  assert.ok(body.contains(...body.headPos), 'the visible rolling head remains interactive');
  for (const paw of body.paws) {
    const rendered = shapes.find(shape => shape.kind === 'ellipse' && Math.hypot(shape.center[0] - paw.s[0], shape.center[1] - paw.s[1]) < 1e-5);
    assert.ok(rendered, 'paw screen anchors follow the rendered roll');
  }
  assert.ok(Object.values(body.bounds).every(Number.isFinite));
});

test('cancelling a flight removes its roll immediately and restarting a fall preserves visible height', () => {
  const body = makeBody(); body.k = 1.5;
  body.leap(100, 0, 0, 90, .8, { spin: 1 }); step(body, .35);
  const visibleGround = body.gy - body.h * body.k * Math.cos(TILT);
  body.leap(150, 300, 0, 0, null, { type: 'fall', spin: 0 });
  near(body.gy, visibleGround); assert.equal(body.h, 0); assert.equal(body.flight.roll, 0);
  step(body, .1); body.jump = null;
  const { ctx, shapes } = recordingCanvas(); body.draw(ctx);
  const skull = shapes.find(shape => shape.kind === 'arc' && Math.abs(shape.radius - (body.L.headR + 2.1) * body.k) < 1e-6);
  assert.deepEqual(skull.matrix.slice(0, 4), [1, 0, 0, 1]);
  body.update(1 / 60); assert.equal(body.flight.tuck, 0); assert.equal(body.flight.reach, 0);
});

test('hanging pins front paws to the ledge while the body and loose rear feet can sway', () => {
  const body = makeBody(); body.x = 300; body.gy = 264; body.yaw = Math.PI / 2;
  body.reset({ hang: 1, tailHang: 1 }); body.hangPaws = [{ x: 288, y: 200 }, { x: 312, y: 200 }];
  step(body, 2);
  let { ctx } = recordingCanvas(); body.draw(ctx);
  for (let i = 0; i < 2; i++) { near(body.paws[i].s[0], body.hangPaws[i].x, .001); near(body.paws[i].s[1], 200, .001); }
  body.x += 4; body.gy += 3; step(body, .3);
  ({ ctx } = recordingCanvas()); body.draw(ctx);
  for (let i = 0; i < 2; i++) { near(body.paws[i].s[0], body.hangPaws[i].x, .001); near(body.paws[i].s[1], 200, .001); }
  assert.ok(body.headPos.every(Number.isFinite)); assert.ok(body.paws.every(paw => !paw.planted));
  body.hangPaws = null; body.reset(); step(body, 2);
  assert.ok(body.pose.hang < .001, 'releasing the edge leaves no held-paw pose');
});
