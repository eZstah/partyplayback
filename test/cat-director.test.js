import test from 'node:test';
import assert from 'node:assert/strict';
import { CAST, CatDirector, StoryClock, videoVibe } from '../src/scripts/cat-director.js';

test('video cues are conservative title hints and explicit overrides take precedence', () => {
  assert.deepEqual(videoVibe('a day in my life'), { kind: 'unknown', source: 'Video title hint' });
  assert.equal(videoVibe('Live DJ set | official music video').kind, 'music');
  assert.equal(videoVibe('Lofi music for sleep').kind, 'chill');
  assert.equal(videoVibe('An interview about science').kind, 'talk');
  assert.equal(videoVibe('Gameplay highlights').kind, 'action');
  assert.equal(videoVibe('DJ set', 'chill').source, 'Your choice');
  assert.equal(videoVibe('DJ set', 'chill').kind, 'chill');
  assert.equal(videoVibe('DJ set', 'invented').kind, 'music');
  assert.equal(videoVibe().kind, 'unknown');
});
test('roles have different starting needs and affection changes trust', () => {
  const d = new CatDirector();
  assert.ok(d.cats.pink.energy > d.cats.mint.energy && d.cats.mint.energy > d.cats.purple.energy);
  assert.equal(new Set(Object.values(CAST).map(c => c.role)).size, 3);
  for (let i = 0; i < 15; i++) d.pet('mint');
  assert.equal(d.cats.mint.trust, 100); assert.equal(d.cats.pink.trust, 50);
});
test('music invites performance; a talking video bores the critic gradually', () => {
  const d = new CatDirector(); d.context.playing = true; d.context.vibe = 'music';
  assert.equal(d.choose(), 'dance');
  d.context.vibe = 'talk';
  for (let i = 0; i < 65; i++) d.advance(1);
  assert.ok(d.cats.purple.boredom > d.cats.mint.boredom * 3);
  assert.equal(d.choose(), 'leave');
});
test('watch mode never schedules destructive antics or fourth-wall interruptions', () => {
  const d = new CatDirector(); d.context.intensity = 'watch'; d.tension = 100;
  for (let i = 0; i < 40; i++) {
    const story = d.choose();
    assert.ok(!['mischief', 'peek', 'squabble'].includes(story));
    if (story) d.record(story);
    for (let s = 0; s < 20; s++) d.advance(1);
  }
});
test('stories have consequences, cooldowns and never immediately repeat', () => {
  const d = new CatDirector(); d.context.playing = true; d.context.vibe = 'music';
  const before = d.cats.pink.energy; d.record('dance');
  assert.ok(d.cats.pink.energy < before); assert.notEqual(d.choose(), 'dance');
  d.record('snack'); assert.ok(d.tension > 0);
  d.record('squabble'); assert.equal(d.tension, 0);
  d.cats.purple.status = 'Napping'; const energy = d.cats.purple.energy;
  d.advance(1); assert.ok(d.cats.purple.energy > energy);
});
test('story cancellation drops future beats and priority protects direct interaction', () => {
  const clock = new StoryClock(), events = [];
  clock.start('peek', 0, [{ at: 0, run: () => events.push('start') }, { at: 2000, run: () => events.push('stale') }], 3000, 70);
  clock.tick(10); assert.deepEqual(events, ['start']);
  assert.equal(clock.start('idle', 100, [], 1000, 30), false);
  clock.clear(); clock.tick(10000); assert.deepEqual(events, ['start']);
  assert.equal(clock.current, null);
});
test('exhaustion matters for the caretaker as well as the critic', () => {
  const d = new CatDirector(); d.cats.mint.energy = 4; d.cats.purple.energy = 90;
  assert.equal(d.choose(), 'nap');
});
test('a beat which interrupts its own story cannot fire remaining old beats', () => {
  const clock = new StoryClock(), events = [];
  clock.start('first', 0, [{ at: 0, run: () => { events.push('first'); clock.start('second', 0, [], 10); } }, { at: 1, run: () => events.push('wrong') }], 100);
  clock.tick(5); assert.deepEqual(events, ['first']); assert.equal(clock.current.name, 'second');
});
