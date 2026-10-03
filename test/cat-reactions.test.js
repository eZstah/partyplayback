import test from 'node:test';
import assert from 'node:assert/strict';
import { faceFor, showCatFace } from '../src/scripts/cat-reactions.js';

function mascot(kind) {
  const names = new Set();
  return { dataset: { kind }, classList: { contains: name => names.has(name), add: name => names.add(name), remove: (...removed) => removed.forEach(name => names.delete(name)) } };
}

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
