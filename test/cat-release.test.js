import test from 'node:test';
import assert from 'node:assert/strict';
import { planRelease } from '../src/scripts/cats/release.js';

const scene = { x: 400, y: 100, vx: 0, vy: 0, width: 1200, floorY: 800, scale: 1, surfaces: [] };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} should equal ${expected}`);
const verifyTrajectory = result => {
  const { startX, startY, x, y, vx, vy, duration, gravity } = result;
  close(x, startX + vx * duration);
  close(y, startY + vy * duration + .5 * gravity * duration ** 2);
  assert.ok(vy + gravity * duration >= 0, 'land while descending');
};

test('a gentle release catches the first ledge crossed, independent of surface order', () => {
  const surfaces = [
    { id: 'low', left: 300, right: 500, y: 650 },
    { id: 'high', left: 300, right: 500, y: 300 },
    { id: 'miss', left: 600, right: 750, y: 180 },
  ];
  const result = planRelease({ ...scene, surfaces });
  assert.equal(result.surfaceId, 'high');
  assert.equal(result.y, 300);
  assert.equal(result.x, scene.x);
  assert.equal(result.thrown, false);
  assert.equal(result.spin, 0);
  verifyTrajectory(result);
});

test('a horizontal throw catches a ledge along its trajectory instead of below the release point', () => {
  const result = planRelease({ ...scene, vx: 650, surfaces: [
    { id: 'behind', left: 300, right: 450, y: 400 },
    { id: 'ahead', left: 650, right: 800, y: 350 },
  ] });
  assert.equal(result.surfaceId, 'ahead');
  assert.ok(result.x >= 650 && result.x <= 800);
  assert.equal(result.thrown, true);
  verifyTrajectory(result);
});

test('an upward throw passes a higher ledge on ascent, then lands on its descending crossing', () => {
  const result = planRelease({ ...scene, y: 500, vy: -950, vx: 200, surfaces: [
    { id: 'shelf', left: 550, right: 700, y: 400 },
  ] });
  assert.equal(result.surfaceId, 'shelf');
  assert.ok(result.duration > -result.vy / result.gravity, 'collision follows the apex');
  assert.equal(result.thrown, true);
  assert.equal(result.spin, 1);
  verifyTrajectory(result);
});

test('a drop cannot catch a ledge above it or one behind its trajectory', () => {
  const result = planRelease({ ...scene, y: 350, vx: 250, surfaces: [
    { id: 'above', left: 0, right: 1000, y: 300 },
    { id: 'behind', left: 250, right: 390, y: 500 },
  ] });
  assert.equal(result.surfaceId, null);
  assert.equal(result.y, scene.floorY);
  verifyTrajectory(result);
});

test('edge and apex bounds preserve a continuous trajectory and still check earlier ledges', () => {
  const result = planRelease({ ...scene, x: 1160, y: 180, vx: 5000, vy: -5000, surfaces: [
    { id: 'edge', left: 1140, right: 1200, y: 450 },
  ] });
  assert.equal(result.surfaceId, 'edge');
  assert.ok(result.x <= 1172);
  for (let step = 0; step <= 100; step++) {
    const t = result.duration * step / 100;
    const x = result.startX + result.vx * t;
    const y = result.startY + result.vy * t + .5 * result.gravity * t * t;
    assert.ok(x >= 28 && x <= 1172, 'the entire horizontal flight stays visible');
    assert.ok(y >= 18 - 1e-7 && y <= result.y + 1e-7, 'the apex and descent stay inside the scene');
  }
  verifyTrajectory(result);
});

test('release timing scales with the character and energetic leftward flights use the opposite roll', () => {
  const plans = [.5, 1, 2].map(scale => planRelease({
    x: 700 * scale, y: 150 * scale, vx: -500 * scale, vy: -200 * scale,
    width: 1200 * scale, floorY: 850 * scale, scale,
  }));
  for (let i = 0; i < plans.length; i++) {
    const result = plans[i], scale = [.5, 1, 2][i];
    close(result.duration, plans[1].duration);
    close(result.x / scale, plans[1].x);
    assert.equal(result.spin, -1);
    verifyTrajectory(result);
  }
});

test('a paw already touching a ledge settles there without skipping it or hopping upwards', () => {
  for (const gap of [0, .1, 2]) {
    const result = planRelease({ ...scene, y: 300 - gap, vy: 900, surfaces: [{ id: 'near', left: 350, right: 450, y: 300 }] });
    assert.equal(result.surfaceId, 'near');
    assert.equal(result.duration, .08);
    assert.ok(result.vy >= 0, 'settling does not introduce an upward launch');
    verifyTrajectory(result);
  }
});

test('short releases settle without nonfinite speed, and huge scenes have bounded flight time', () => {
  for (const input of [
    { ...scene, y: 800, vy: 1200 },
    { ...scene, y: 799.9, vy: 1200 },
    { ...scene, width: 16384, floorY: 16384, y: 500, scale: .25, vy: -300 },
  ]) {
    const result = planRelease(input);
    assert.ok(result.duration >= .08 && result.duration <= 2.4 + 1e-7);
    assert.ok(result.gravity >= 0 && result.gravity < 10000);
    verifyTrajectory(result);
  }
});

test('invalid geometry is ignored and invalid input normalizes to a finite scene without mutation', () => {
  const invalid = { ...scene, x: Infinity, y: NaN, width: -4, floorY: Infinity, scale: 0, vx: NaN, vy: Infinity, surfaces: [null, {}, { id: 'bad', left: 100, right: 20, y: 40 }] };
  for (const input of [undefined, null, invalid, { ...invalid, surfaces: 'bad' }]) {
    const result = planRelease(input);
    assert.equal(result.surfaceId, null);
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} stays finite`);
    }
    verifyTrajectory(result);
  }
  assert.equal(invalid.x, Infinity);
  assert.equal(invalid.surfaces.length, 3);
});
