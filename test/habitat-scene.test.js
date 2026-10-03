import test from 'node:test';
import assert from 'node:assert/strict';
import { dayPart, nextWeather, weatherSpell, sceneOverride, mountScene, WEATHERS } from '../src/scripts/habitat-scene.js';

test('the window follows the visitor’s time of day', () => {
  assert.deepEqual([0, 4, 5, 7, 8, 16, 17, 20, 21, 23].map(dayPart),
    ['night', 'night', 'dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night']);
});

test('the weather always changes to something else and rain stays the rarest', () => {
  const counts = { clear: 0, clouds: 0, rain: 0 };
  let s = 7; const random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (const from of WEATHERS) for (let i = 0; i < 300; i++) { const to = nextWeather(from, random); assert.notEqual(to, from); counts[to]++; }
  assert.ok(counts.rain < counts.clear && counts.rain < counts.clouds, JSON.stringify(counts));
  assert.ok(weatherSpell(() => 0) >= 360 && weatherSpell(() => .999) <= 840, 'a spell lasts 6 to 14 minutes');
});

test('?scene pins the look for screenshots', () => {
  assert.deepEqual(sceneOverride('?scene=night,rain'), { daypart: 'night', weather: 'rain' });
  assert.deepEqual(sceneOverride('?scene=dusk'), { daypart: 'dusk', weather: undefined });
  assert.deepEqual(sceneOverride('?catdebug'), {});
});

test('the mounted scene sets data attributes, changes weather on schedule and stops cleanly', () => {
  const el = { dataset: {} }, timers = new Map(); let id = 0, hour = 22;
  const scene = mountScene(el, { now: () => ({ getHours: () => hour }), random: () => .1,
    schedule: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, cancel: key => timers.delete(key), search: '' });
  assert.deepEqual(scene.state, { daypart: 'night', weather: 'clear' });
  const weatherTimer = [...timers].find(([, t]) => t.ms > 60_000);
  assert.ok(weatherTimer, 'a weather change is scheduled');
  timers.delete(weatherTimer[0]); weatherTimer[1].fn();
  assert.notEqual(el.dataset.weather, 'clear');
  hour = 9; const clock = [...timers].find(([, t]) => t.ms === 60_000); timers.delete(clock[0]); clock[1].fn();
  assert.equal(el.dataset.daypart, 'day', 'the clock is checked every minute');
  scene.stop(); assert.equal(timers.size, 0, 'stopping clears every timer');
});

test('a pinned scene keeps its weather', () => {
  const el = { dataset: {} }, timers = [];
  mountScene(el, { now: () => ({ getHours: () => 12 }), schedule: (fn, ms) => timers.push(ms), cancel() {}, search: '?scene=dusk,rain' });
  assert.deepEqual(el.dataset, { daypart: 'dusk', weather: 'rain' });
  assert.deepEqual(timers, [60_000], 'only the clock tick is scheduled');
});
