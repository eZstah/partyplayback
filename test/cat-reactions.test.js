import test from 'node:test';
import assert from 'node:assert/strict';
import { faceFor, showCatFace } from '../src/scripts/cat-reactions.js';
import { setBaseMood, setMood } from '../src/scripts/mascot-fx.js';

function mascot(kind) {
  const names = new Set();
  return { dataset: { kind }, classList: { contains: name => names.has(name), add: name => names.add(name), remove: (...removed) => removed.forEach(name => names.delete(name)) } };
}

test('an action reaction survives snapshots, then restores the latest playback state', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cat = mascot('purple');
  setBaseMood(cat, 'playing');
  setMood(cat, 'happy', 2800);
  assert.equal(cat.dataset.face, 'joy');
  setBaseMood(cat, 'paused');
  assert.equal(cat.dataset.reaction, 'happy');
  t.mock.timers.tick(2800);
  assert.equal(cat.dataset.reaction, 'paused');
  assert.equal(cat.dataset.face, 'side-eye');
});

test('a newer error reaction cancels an earlier celebration timeout', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const cat = mascot('pink');
  setMood(cat, 'happy', 1000);
  t.mock.timers.tick(500);
  setMood(cat, 'error', 3000);
  t.mock.timers.tick(500);
  assert.equal(cat.dataset.reaction, 'error');
  t.mock.timers.tick(2500);
  assert.equal(cat.dataset.reaction, 'idle');
});

test('unknown character and mood fall back to a visible resting expression', () => {
  assert.equal(faceFor('unknown'), 'pleading');
  assert.equal(faceFor('purple', 'unknown'), 'side-eye');
  assert.equal(faceFor('constructor', '__proto__'), 'pleading');
});

test('identical playback snapshots do not rewrite the expression and restart the rig', () => {
  const cat = mascot('pink');
  let writes = 0;
  cat.dataset = new Proxy(cat.dataset, { set(target, key, value) {
    if (key === 'face') writes++;
    target[key] = value;
    return true;
  } });
  showCatFace(cat, 'playing');
  showCatFace(cat, 'playing');
  showCatFace(cat, 'playing');
  assert.equal(writes, 1);
  showCatFace(cat, 'paused');
  assert.equal(writes, 2);
});
