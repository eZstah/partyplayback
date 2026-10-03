import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionTrack, REST, safeTravel, samplePose, spring } from '../src/scripts/mascot-motion.js';
import { CAT_MOVES } from '../src/scripts/mascot-moves.js';
import { CatActor } from '../src/scripts/mascot-scene.js';

const origin = { left: 10, right: 30, top: 10, bottom: 30 };
const bounds = { minX: -10, maxX: 180, minY: -10, maxY: 80 };

test('walking and dragging cannot pass through a control to a clear destination', () => {
  const wall = { left: 55, right: 100, top: 0, bottom: 60 };
  const result = safeTravel(origin, { x: 0, y: 0 }, { x: 150, y: 0 }, bounds, [wall]);
  assert.ok(result.x <= 25 && result.x > 20);
  assert.equal(result.y, 0);
});
test('travel stays in its responsive bounds and can return home', () => {
  const out = safeTravel(origin, { x: 0, y: 0 }, { x: -1000, y: 500 }, bounds);
  assert.deepEqual(out, { x: -10, y: 80 });
  assert.deepEqual(safeTravel(origin, out, { x: 0, y: 0 }, bounds), { x: 0, y: 0 });
});
test('an existing overlap can be escaped but cannot become deeper', () => {
  const neighbor = { left: 28, right: 60, top: 0, bottom: 50 };
  assert.equal(safeTravel(origin, { x: 0, y: 0 }, { x: 40, y: 0 }, bounds, [neighbor]).x, 0);
  assert.equal(safeTravel(origin, { x: 0, y: 0 }, { x: -8, y: 0 }, bounds, [neighbor]).x, -8);
});
test('springs are frame-rate independent and settle without an overshoot', () => {
  function run(hz) { let s = { value: 0, velocity: 0 }; for (let i = 0; i < hz; i++) s = spring(s, 90, 1 / hz); return s; }
  assert.ok(Math.abs(run(30).value - run(144).value) < .00001);
  assert.ok(run(60).value <= 90 && run(60).value > 89.9);
});
test('a mid-gesture interruption retains velocity and settles to the new pose', () => {
  let s = spring({ value: 0, velocity: 0 }, 100, .08);
  const interrupted = spring(s, -30, 0);
  assert.deepEqual(interrupted, s);
  for (let i = 0; i < 120; i++) s = spring(s, -30, 1 / 60);
  assert.ok(Math.abs(s.value + 30) < .001);
});
test('direct interaction preempts idle; ambient actions cannot interrupt a drag or error', () => {
  const t = new ActionTrack();
  t.start('groom', 0, { priority: 10 });
  const drag = t.start('carry', 100, { priority: 90, hold: true });
  assert.ok(drag);
  assert.equal(t.start('dance', 10000, { priority: 10 }), null);
  const error = t.start('startle', 10001, { priority: 100 });
  assert.ok(error); assert.equal(t.finish(drag.id), false);
  assert.equal(t.current, error);
});
test('cooldowns suppress repeated input, while explicit repeated petting can restart', () => {
  const t = new ActionTrack();
  const first = t.start('reach', 0, { duration: 500, cooldown: 2000 });
  assert.equal(t.start('reach', 200), null);
  t.finish(first.id);
  assert.equal(t.start('reach', 600), null);
  assert.ok(t.start('reach', 601, { force: true }));
});
test('all gestures have bounded, finite articulated poses and finish in rest unless held', () => {
  for (const [name, clip] of Object.entries(CAT_MOVES)) {
    for (const progress of [0, .1, .25, .5, .9, 1]) {
      const pose = samplePose(clip.frames, progress);
      assert.equal(Object.keys(pose).length, Object.keys(REST).length);
      for (const value of Object.values(pose)) assert.ok(Number.isFinite(value), name);
      assert.ok(pose.sy > .7 && pose.sy < 1.2, name);
    }
    if (!['carry', 'sleep'].includes(name)) assert.deepEqual(samplePose(clip.frames, 1), REST, name);
  }
});

function actorFixture(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document; });
  const classes = new Set(), style = { removeProperty() {} };
  const el = { dataset: { kind: 'pink' }, style, querySelector: () => null, querySelectorAll: () => [], classList: { add: n => classes.add(n), remove: (...ns) => ns.forEach(n => classes.delete(n)), contains: n => classes.has(n) } };
  const root = { style, getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 120, height: 120 }) };
  return new CatActor({ travel: false, motion: false, destroyed: false }, el, root, 0);
}
test('static/reduced-motion actions still expire to the latest playback state', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = actorFixture(t);
  a.setBase('playing'); a.play('dance', { duration: 1800 }); a.setBase('paused');
  assert.equal(a.el.dataset.face, 'joy');
  t.mock.timers.tick(1800);
  assert.equal(a.el.dataset.face, 'pleading'); assert.equal(a.track.current, null);
});
test('reset cancels delayed reactions and restores travel and joints', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const a = actorFixture(t);
  a.play('greet'); a.position.x = 80; a.reset();
  t.mock.timers.tick(10000);
  assert.deepEqual(a.position, { x: 0, y: 0 });
  assert.equal(a.el.dataset.action, undefined); assert.equal(a.el.dataset.face, 'watching');
});
