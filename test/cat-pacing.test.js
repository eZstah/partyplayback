import test from 'node:test';
import assert from 'node:assert/strict';
import { CAST } from '../src/scripts/cats/cast.js';
import { Mind, rng } from '../src/scripts/cats/mind.js';

const quiet = new Set(['sleep', 'watch', 'loaf', 'sit']);
const durations = { sleep: 35, watch: 35, loaf: 22, sit: 15, groom: 12, stretch: 5,
  explore: 14, wander: 12, leave: 40, glass: 16, dance: 12, approach: 12, stalk: 14 };

// A decision simulation, not a rendered choreography/performance measurement.
function session(context, seed, seconds = 1800) {
  const mind = new Mind('black', {}, rng(seed));
  const ctx = { shelves: true, hideouts: true, toys: true, aquarium: true, ...context };
  const events = [], totals = { quiet: 0, elapsed: 0 };
  while (totals.elapsed < seconds) {
    const { type } = mind.choose(ctx);
    events.push({ type, at: totals.elapsed });
    mind.begin(type);
    const dt = durations[type] || 15;
    mind.tick(dt, ctx);
    if (quiet.has(type)) totals.quiet += dt;
    totals.elapsed += dt;
  }
  return { mind, events, ...totals };
}

test('long playback sessions choose only quiet rest regardless of title, cursor or recent invitations', () => {
  for (const vibe of ['music', 'action', 'talk', 'chill', 'unknown']) {
    for (const seed of [2, 7, 23, 41]) for (const invitedPlay of [false, true]) {
      const film = session({ playing: true, vibe, invitedPlay, cursor: true, cursorDwell: 4, critter: true }, seed, 3600);
      assert.equal(film.quiet, film.elapsed, `${vibe}, seed ${seed}, invited ${invitedPlay}: ${JSON.stringify(film.events)}`);
      assert.ok(film.events.every(event => quiet.has(event.type)));
      assert.ok(film.events.some(event => event.type === 'watch'));
    }
  }
});

test('playback blocks all ambient starts even with maximum drives and active toys', () => {
  const mind = new Mind('black', {}, rng(29));
  Object.assign(mind.drives, { sleepy: 0, playful: 100, curious: 100, lonely: 100, hungry: 100 });
  const ctx = { playing: true, vibe: 'music', invitedPlay: true, cursor: true, cursorDwell: 10,
    critter: true, shelves: true, hideouts: true, toys: true, aquarium: true };
  const ambient = ['dance', 'hunt', 'wander', 'explore', 'zoomies', 'stalk', 'approach', 'glass', 'hide', 'leave',
    'knock', 'groom', 'stretch', 'stare', 'chase', 'cuddle', 'visit', 'follow'];
  for (const type of ambient) {
    assert.equal(mind.canStart(type, ctx), false, type);
    assert.equal(mind.canStart(type, { ...ctx, treat: true, laser: true }), false, `${type} during an explicit toy`);
  }
  for (let i = 0; i < 100; i++) assert.ok(quiet.has(mind.choose(ctx).type));
  for (const type of quiet) assert.equal(mind.canStart(type, ctx), true, type);
});

test('action cooldowns create real elapsed intervals during a long unprompted session', () => {
  const { events } = session({}, 7, 3600);
  for (const [type, seconds] of Object.entries(CAST.black.pacing.cooldowns)) {
    const starts = events.filter(event => event.type === type);
    for (let i = 1; i < starts.length; i++) {
      assert.ok(starts[i].at - starts[i - 1].at >= seconds, `${type} repeated too soon`);
    }
  }
  assert.ok(events.some(event => event.type === 'glass'), 'close-ups remain part of Bean’s range');
  assert.ok(events.some(event => event.type === 'explore'), 'curiosity remains active');
});

test('cooldowns and attention recover without reopening ambient motion during playback', () => {
  const mind = new Mind('black', {}, rng(5));
  mind.begin('glass');
  assert.equal(mind.canStart('glass'), false);
  assert.equal(mind.canStart('dance', { playing: true }), false);
  assert.equal(mind.canStart('dance', { playing: true, invitedPlay: true }), false);
  // Calling choose alone cannot rush time or regenerate attention.
  for (let i = 0; i < 30; i++) mind.choose({ playing: true, vibe: 'music' });
  assert.equal(mind.inspect().time, 0);
  assert.equal(mind.inspect().attention, 0);
  mind.begin('watch');
  mind.tick(120, { playing: true });
  assert.equal(mind.inspect().attention, 1);
  assert.equal(mind.canStart('dance', { playing: true }), false);
  assert.equal(mind.canStart('dance', { playing: false }), true);
  assert.equal(mind.canStart('glass'), false, 'a replenished budget does not erase an action cooldown');
  mind.tick(90, { playing: true });
  assert.equal(mind.canStart('glass'), true);
  assert.equal(mind.canStart('glass', { playing: true }), false);
});

test('explicit food and laser play take precedence without defeating calm or reduced motion', () => {
  const mind = new Mind('black', {}, rng(6));
  mind.begin('glass');
  mind.drives.sleepy = 100;
  const ctx = { playing: true, vibe: 'music', cursor: true, cursorDwell: 3 };
  assert.equal(mind.canStart('treat', ctx), false);
  assert.equal(mind.canStart('laser', { ...ctx, invitedPlay: true }), false);
  assert.equal(mind.canStart('treat', { ...ctx, treat: true }), true);
  assert.equal(mind.canStart('laser', { ...ctx, laser: true }), true);
  assert.equal(mind.choose({ ...ctx, treat: true, laser: true }).type, 'treat');
  assert.equal(mind.choose({ ...ctx, laser: true }).type, 'laser');
  assert.equal(mind.choose({ ...ctx, calm: true, laser: true, treat: true }).type, 'sleep');
  assert.equal(mind.choose({ ...ctx, reduced: true, laser: true }).type, 'laser');
  assert.match(mind.inspect().decision.reason, /quiet paws/);
  assert.equal(mind.canStart('hunt', { reduced: true }), false);
  assert.equal(mind.canStart('hunt', { calm: true }), false);
  assert.equal(mind.canStart('treat', { reduced: true }), true);
  assert.ok(quiet.has(mind.choose({ ...ctx, invitedPlay: true, treat: false, laser: false }).type),
    'ending an explicit toy restores quiet decisions immediately');
});

test('a settled cursor earns curiosity while a passing pointer does not', () => {
  const mind = new Mind('black', {}, rng(12));
  Object.assign(mind.drives, { sleepy: 0, playful: 0, curious: 0, lonely: 90 });
  mind.choose({ cursor: true, cursorDwell: .1 });
  const passing = mind.inspect().decision.candidates;
  assert.equal(passing.find(candidate => candidate.type === 'approach').score, 0);
  assert.equal(passing.find(candidate => candidate.type === 'stalk').score, 0);
  assert.equal(mind.choose({ cursor: true, cursorDwell: 2.5 }).type, 'approach');
  assert.match(mind.inspect().decision.reason, /still cursor/);
  mind.begin('approach');
  assert.equal(mind.canStart('approach'), false, 'a lingering cursor is not an endless restart button');
});

test('quiet watching satisfies companionship rather than making Bean demand attention', () => {
  const mind = new Mind('black', {}, rng(17));
  mind.begin('watch');
  const before = { ...mind.drives };
  mind.tick(30, { playing: true });
  assert.ok(mind.drives.lonely < before.lonely);
  assert.ok(mind.drives.curious < before.curious);
  assert.ok(mind.drives.playful > before.playful, 'quiet company does not remove kitten energy');
});

test('decision inspection explains suppressed actions and cannot mutate the mind', () => {
  const mind = new Mind('black', {}, rng(20));
  mind.begin('glass');
  const selected = mind.choose({ playing: true, vibe: 'music' });
  const view = mind.inspect();
  assert.equal(view.decision.selected, selected.type);
  assert.match(view.decision.candidates.find(candidate => candidate.type === 'glass').reason, /Playback is active/);
  assert.match(view.decision.candidates.find(candidate => candidate.type === 'dance').reason, /Playback is active/);
  view.cooldowns.glass = -1;
  view.decision.context.playing = false;
  view.decision.candidates[0].score = -123;
  const fresh = mind.inspect();
  assert.equal(fresh.cooldowns.glass, CAST.black.pacing.cooldowns.glass);
  assert.equal(fresh.decision.context.playing, true);
  assert.notEqual(fresh.decision.candidates[0].score, -123);
  mind.choose({ playing: false });
  assert.match(mind.inspect().decision.candidates.find(candidate => candidate.type === 'glass').reason, /Recovering/);
});
