import test from 'node:test';
import assert from 'node:assert/strict';
import { Mind, rng } from '../src/scripts/cats/mind.js';

function bean(random = rng(17), trust = 85) {
  const mind = new Mind('black', { trust }, random);
  Object.assign(mind.drives, { sleepy: 25, playful: 40 });
  return mind;
}

test('gentle familiar invitations are usually welcome while rushed grabs are usually declined', () => {
  let gentle = 0, rushed = 0, wary = 0;
  for (let seed = 1; seed <= 240; seed++) {
    const invitation = { speed: 60, invitedPlay: true, approaching: true };
    gentle += bean(rng(seed)).requestGrab(invitation) === 'accept';
    rushed += bean(rng(seed)).requestGrab({ speed: 1800 }) === 'accept';
    const nervous = bean(rng(seed), 20);
    nervous.mood.fear = .65; nervous.mood.annoyance = .5;
    wary += nervous.requestGrab(invitation) === 'accept';
  }
  assert.ok(gentle >= 200 && gentle < 240, `${gentle} gentle acceptances; Bean should be friendly but free to decline`);
  assert.ok(rushed < 100, `${rushed} rushed acceptances`);
  assert.ok(wary < gentle / 2, `${wary} wary acceptances versus ${gentle} familiar ones`);
});

test('rapid rushed grab attempts ask for space, then quiet time restores willingness', () => {
  const mind = bean(() => .2);
  const attempts = [];
  for (let i = 0; i < 8; i++) {
    const result = mind.requestGrab({ speed: i ? 1200 : 80, invitedPlay: true });
    attempts.push(result);
    if (result === 'accept') { mind.carried(); mind.recordRelease(); }
    mind.tick(.2);
  }
  assert.equal(attempts[0], 'accept');
  assert.ok(attempts.slice(-4).every(result => result !== 'accept'));
  assert.match(mind.inspect().handling.decision.reason, /attempts close together/);
  const pressure = mind.inspect().handling.pressure;
  mind.tick(90);
  assert.ok(mind.inspect().handling.pressure < pressure / 20);
  assert.equal(mind.requestGrab({ speed: 80, invitedPlay: true }), 'accept');
});

test('sleep and playful energy change the same gentle pickup choice', () => {
  const alert = bean(() => .7), sleeping = bean(() => .7);
  sleeping.begin('sleep');
  assert.equal(alert.requestGrab({ speed: 50 }), 'accept');
  assert.equal(sleeping.requestGrab({ speed: 50 }), 'dodge');
  assert.match(sleeping.inspect().handling.decision.reason, /Resting/);

  const settled = bean(() => .94), bouncy = bean(() => .94);
  bouncy.drives.playful = 100;
  assert.equal(settled.requestGrab({ speed: 50 }), 'accept');
  assert.equal(bouncy.requestGrab({ speed: 50 }), 'dodge');
  assert.match(bouncy.inspect().handling.decision.reason, /Playful paws/);
});

test('a worried cat can flee, but calm and reduced motion always keep refusal quiet', () => {
  for (const flags of [{}, { calm: true }, { reduced: true }]) {
    const mind = bean(() => .7, 10);
    mind.mood.fear = .8;
    const outcome = mind.requestGrab({ speed: 2100, ...flags });
    assert.equal(outcome, flags.calm || flags.reduced ? 'dodge' : 'flee');
  }
});

test('a recent toss changes handling briefly without permanently locking out affection', () => {
  const mind = bean(() => .2);
  assert.equal(mind.requestGrab({ speed: 50, invitedPlay: true }), 'accept');
  const comfortable = mind.inspect().handling.decision.willingness;
  mind.carried();
  const trust = mind.trust;
  assert.equal(mind.recordRelease({ thrown: true }), true);
  assert.equal(mind.trust, trust - 2);
  assert.notEqual(mind.requestGrab({ speed: 50, invitedPlay: true }), 'accept');
  assert.match(mind.inspect().handling.decision.reason, /last toss/);
  assert.equal(mind.inspect().handling.decision.willingness, 0);
  mind.tick(12);
  mind.requestGrab({ speed: 50, invitedPlay: true });
  assert.ok(mind.inspect().handling.decision.willingness < comfortable);
  mind.tick(90);
  assert.equal(mind.requestGrab({ speed: 50, invitedPlay: true }), 'accept');
  assert.ok(mind.inspect().handling.decision.willingness > .85);
});

test('actual carrying and release are distinct from a request and duplicate release is harmless', () => {
  const mind = bean(() => .2);
  assert.equal(mind.requestGrab({ approaching: true }), 'accept');
  assert.equal(mind.stats.carried, 0);
  assert.equal(mind.recordRelease({ thrown: true }), false);
  mind.carried();
  assert.equal(mind.stats.carried, 1);
  const pressure = mind.inspect().handling.pressure;
  assert.equal(mind.requestGrab({ speed: 3000 }), 'accept', 'an already held pointer is not a new attempt');
  assert.equal(mind.inspect().handling.pressure, pressure);
  assert.equal(mind.recordRelease(), true);
  const trust = mind.trust;
  assert.equal(mind.recordRelease({ thrown: true }), false);
  assert.equal(mind.trust, trust);
  assert.equal(mind.inspect().handling.held, false);
  assert.notEqual(mind.requestGrab({ invitedPlay: true }), 'accept');
  assert.match(mind.inspect().handling.decision.reason, /Just put down/);
});

test('handling follows injected randomness and simulation time', () => {
  const a = bean(rng(77)), b = bean(rng(77));
  const play = mind => {
    const outcomes = [];
    for (const [seconds, speed] of [[0, 80], [2, 1100], [10, 300], [50, 90], [4, 2000], [80, 70]]) {
      mind.tick(seconds);
      const result = mind.requestGrab({ speed, invitedPlay: speed < 100 });
      outcomes.push(result);
      if (result === 'accept') { mind.carried(); mind.recordRelease({ thrown: speed > 1000 }); }
    }
    return outcomes;
  };
  assert.deepEqual(play(a), play(b));
  assert.deepEqual(a.inspect().handling, b.inspect().handling);
});

test('handling diagnostics are detached and recent roughness is not added to saved memory', () => {
  const mind = bean(() => .2);
  mind.requestGrab({ speed: 40 }); mind.carried(); mind.recordRelease({ thrown: true });
  mind.requestGrab({ speed: 1200 });
  const snapshot = mind.inspect();
  snapshot.handling.pressure = 0;
  snapshot.handling.decision.context.speed = -100;
  assert.ok(mind.inspect().handling.pressure > 0);
  assert.equal(mind.inspect().handling.decision.context.speed, 1200);
  const memory = JSON.parse(JSON.stringify(mind.memory()));
  assert.deepEqual(Object.keys(memory).sort(), ['bonds', 'stats', 'trust']);
  const restored = new Mind('black', memory, rng(4));
  assert.equal(restored.inspect().handling.pressure, 0);
  assert.equal(restored.inspect().handling.lastThrown, null);
  assert.equal(restored.inspect().handling.held, false);
});

test('ordinary gentle pickup and placement cycles do not accumulate a long lockout', () => {
  const mind = bean(() => .5, 55);
  for (let i = 0; i < 10; i++) {
    assert.equal(mind.requestGrab({ speed: 125 }), 'accept', `gentle pickup ${i + 1}`);
    mind.carried(); mind.tick(1); mind.recordRelease(); mind.tick(4);
  }
  assert.ok(mind.handling.pressure < .4);
});
