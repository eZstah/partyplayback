import test from 'node:test';
import assert from 'node:assert/strict';
import { windUp, windUpTime, flightTrick, arcFor } from '../src/scripts/cats/moves.js';
import { CatBody, TILT } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';

const body = () => { const b = new CatBody(CAST.black.look, () => .5); b.x = 400; b.gy = 600; return b; };

test('only far or high jumps get a wind-up, and it grows with the effort', () => {
  assert.equal(windUpTime(120, 40), 0, 'a hop needs no sizing up');
  const across = windUpTime(330, 0), high = windUpTime(0, 320), limit = windUpTime(430, 0);
  assert.ok(across > 0 && high > 0, 'a far or a high jump is measured first');
  assert.ok(limit > across, 'a jump near his limit takes longer to size up');
  assert.ok(limit <= 1.2, 'the wind-up stays a beat, not a pause');
  assert.ok(windUpTime(330, 0, 1, { agile: true }) < across, 'a chase keeps the wind-up short');
  assert.equal(windUpTime(430, 330, 1, { reduced: true }), 0, 'reduced motion skips the wiggle');
  assert.equal(windUpTime(330, -300), windUpTime(330, 0), 'dropping down is not harder than going across');
  assert.ok(windUpTime(330, 0, 1.3) < across, 'a bigger scene makes the same pixels a smaller jump');
});

test('arcFor converts a screen height into the rig arc', () => {
  assert.ok(Math.abs(arcFor(200, 1) * Math.cos(TILT) - 200) < 1e-9);
  assert.equal(arcFor(-5, 1), 0);
});

test('the wind-up crouches, wiggles late and always releases the wiggle', () => {
  const b = body(), target = { x: 700, y: 300 };
  const move = windUp(b, target, 1); move.next();
  assert.equal(b.goal.crouch, 1); assert.equal(b.turnTo, 0, 'he turns toward the target');
  assert.deepEqual(b.look, target);
  move.next(.2); assert.equal(b.goal.wiggle, 0, 'he judges the distance before the wiggle');
  move.next(.5); assert.equal(b.goal.wiggle, 1, 'then the rear-end wiggle loads the spring');
  move.return(); assert.equal(b.goal.wiggle, 0, 'interrupting cleans up the wiggle');
  const quiet = windUp(b, target, 1, { reduced: true }); quiet.next(); quiet.next(.8);
  assert.equal(b.goal.wiggle, 0, 'reduced motion keeps still');
});

test('flight tricks twist around once and swipe near the top of the arc', () => {
  const b = body(); b.yaw = 0;
  b.leap(400, 600, 0, 120, .8);
  const step = flightTrick(b, { twist: 1, swipe: true, reach: true });
  const swats = [];
  let maxTurn = 0;
  while (b.jump) { step(); swats.push(b.goal.swat); maxTurn = Math.max(maxTurn, b.yaw); b.update(1 / 60); }
  assert.ok(maxTurn > Math.PI, 'he turns past his back in the air');
  assert.ok(Math.abs(Math.sin(b.yaw)) < .2 && Math.cos(b.yaw) > .9, 'and lands facing the way he started');
  assert.equal(swats[0], 0); assert.ok(swats.includes(1), 'the paw lashes out mid-flight');
});
