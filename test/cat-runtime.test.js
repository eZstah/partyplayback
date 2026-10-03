import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/scripts/cats/runtime.js';

function session(seed = 42) {
  let clock = 0, nextId = 1;
  const frames = new Map();
  const runtime = createRuntime({ seed, now: () => clock,
    requestFrame: callback => { const id = nextId++; frames.set(id, callback); return id; },
    cancelFrame: id => frames.delete(id),
  });
  return { runtime, frames, advance(milliseconds) {
    clock += milliseconds;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(clock));
  } };
}

test('one runtime owns one frame loop with bounded simulation time and a fresh resume', () => {
  const { runtime, frames, advance } = session(), ticks = [];
  runtime.resume();
  assert.equal(frames.size, 0, 'resume cannot start a session');
  runtime.start((dt, time) => ticks.push([dt, time]));
  runtime.start(() => assert.fail('start must not replace an active callback'));
  assert.equal(frames.size, 1);
  advance(1000);
  advance(20);
  advance(1000);
  assert.deepEqual(ticks, [[0, 0], [.02, .02], [.05, .07]]);
  assert.equal(frames.size, 1);
  runtime.pause();
  assert.equal(runtime.paused, true);
  assert.equal(frames.size, 0);
  advance(60000);
  assert.equal(runtime.time, .07);
  runtime.resume(); runtime.resume();
  assert.equal(frames.size, 1);
  advance(60000);
  assert.deepEqual(ticks.at(-1), [0, .07]);
  advance(20);
  assert.ok(Math.abs(runtime.time - .09) < 1e-10);
  runtime.destroy();
  runtime.resume(); runtime.start(() => assert.fail());
  assert.equal(frames.size, 0);
});

test('effects use simulation deadlines, support cancellation and survive pause without aging', () => {
  const { runtime, advance } = session(), calls = [];
  runtime.start(() => {});
  runtime.delay(() => calls.push('due'), 100);
  const cancel = runtime.delay(() => calls.push('cancelled'), 50);
  cancel(); cancel();
  advance(0); advance(50);
  assert.deepEqual(calls, []);
  runtime.pause(); advance(10000); runtime.resume(); advance(10000);
  assert.deepEqual(calls, []);
  advance(50);
  assert.deepEqual(calls, ['due']);
  runtime.delay(() => { calls.push('parent'); runtime.delay(() => calls.push('child'), 0); }, 0);
  advance(0);
  assert.deepEqual(calls, ['due', 'parent']);
  advance(0);
  assert.deepEqual(calls, ['due', 'parent', 'child']);
  runtime.delay(() => calls.push('discarded'), 10);
  runtime.destroy(); advance(50);
  runtime.delay(() => assert.fail('post-destroy effect'), 0);
  assert.deepEqual(calls, ['due', 'parent', 'child']);
});

test('destroying during a delayed callback prevents all later callbacks in that frame', () => {
  const { runtime, advance } = session();
  runtime.start(() => assert.fail('destroyed frame callback'));
  runtime.delay(() => runtime.destroy(), 0);
  runtime.delay(() => assert.fail('destroyed delayed callback'), 0);
  advance(0);
  assert.equal(runtime.disposed, true);
});

test('the same seed reproduces a session random stream independently of other sessions', () => {
  const a = session(123).runtime, b = session(123).runtime, c = session(124).runtime;
  const sample = runtime => Array.from({ length: 20 }, () => runtime.random());
  const first = sample(a);
  assert.equal(a.seed, 123);
  assert.deepEqual(first, sample(b));
  assert.notDeepEqual(first, sample(c));
});

test('listeners unsubscribe and all owned cleanup runs even when another cleanup fails', () => {
  const { runtime, frames } = session(), target = new EventTarget(), calls = [];
  const unregister = runtime.own(() => calls.push('unregistered'));
  unregister();
  runtime.own(() => { calls.push('failed'); throw new Error('cleanup failed'); });
  runtime.own(() => { target.dispatchEvent(new Event('pet')); calls.push('finished'); });
  runtime.listen(target, 'pet', () => calls.push('pet'));
  const unsubscribe = runtime.listen(target, 'pet', () => calls.push('removed'));
  unsubscribe(); unsubscribe();
  target.dispatchEvent(new Event('pet'));
  assert.deepEqual(calls, ['pet']);
  runtime.start(() => {});
  assert.throws(() => runtime.destroy(), error => error instanceof AggregateError && error.errors.length === 1);
  assert.equal(frames.size, 0);
  assert.deepEqual(calls, ['pet', 'failed', 'finished']);
  target.dispatchEvent(new Event('pet'));
  runtime.listen(target, 'pet', () => assert.fail('late listener'));
  target.dispatchEvent(new Event('pet'));
  runtime.destroy();
  runtime.own(() => calls.push('immediate'));
  assert.deepEqual(calls, ['pet', 'failed', 'finished', 'immediate']);
});
