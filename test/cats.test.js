import test from 'node:test';
import assert from 'node:assert/strict';
import { CAST, KINDS, traitWords } from '../src/scripts/cats/cast.js';
import { Mind, awaySummary, dayRhythm, defaultBonds, rng, videoVibe } from '../src/scripts/cats/mind.js';
import { CatBody, headBasis, tint, visibility, wrap } from '../src/scripts/cats/body.js';

// Fresh cats start drowsy; awake: true asks what a rested cat would do.
const count = (kind, ctx, runs = 300, seed = 7, { awake = true } = {}) => {
  const tally = {};
  const random = rng(seed);
  for (let i = 0; i < runs; i++) {
    const mind = new Mind(kind, {}, random);
    if (awake) mind.drives.sleepy = 10;
    const { type } = mind.choose(ctx);
    tally[type] = (tally[type] || 0) + 1;
  }
  return tally;
};

test('video cues are conservative title hints and explicit overrides take precedence', () => {
  assert.deepEqual(videoVibe('a day in my life'), { kind: 'unknown', source: 'Video title hint' });
  assert.equal(videoVibe('Live DJ set | official music video').kind, 'music');
  assert.equal(videoVibe('Lofi music for sleep').kind, 'chill');
  assert.equal(videoVibe('An interview about science').kind, 'talk');
  assert.equal(videoVibe('Gameplay highlights').kind, 'action');
  assert.equal(videoVibe('DJ set', 'chill').kind, 'chill');
  assert.equal(videoVibe().kind, 'unknown');
});

test('every cat has a distinct name, look and voice lines short enough for a bubble', () => {
  assert.equal(new Set(KINDS.map(k => CAST[k].name)).size, KINDS.length);
  assert.equal(new Set(KINDS.map(k => CAST[k].look.fur)).size, KINDS.length);
  for (const kind of KINDS) for (const [key, lines] of Object.entries(CAST[kind].voice)) {
    for (const line of lines) assert.ok(line.length <= 34, `${kind}.${key}: "${line}" is too long`);
  }
  assert.deepEqual(traitWords(CAST.purple.traits, 2), ['grumpy', 'lazy']);
});

test('personality shapes choices: the instigator plays, the critic naps', () => {
  const ctx = { cursor: true, shelves: true, others: [{ kind: 'mint', activity: 'sit', playful: 50 }] };
  const mochi = count('pink', ctx), pixel = count('purple', ctx);
  const playful = t => (t.stalk || 0) + (t.chase || 0) + (t.zoomies || 0);
  const lazy = t => (t.sleep || 0) + (t.loaf || 0) + (t.sit || 0);
  assert.ok(playful(mochi) > playful(pixel) * 2, JSON.stringify({ mochi, pixel }));
  assert.ok(lazy(pixel) > lazy(mochi), JSON.stringify({ mochi, pixel }));
});

test('playing video draws cats to watch, music makes Mochi dance, a treat beats everything', () => {
  const watching = count('purple', { playing: true, vibe: 'talk' });
  assert.ok(watching.watch > 150, JSON.stringify(watching));
  const party = count('pink', { playing: true, vibe: 'music' });
  assert.ok(party.dance > 150, JSON.stringify(party));
  const hungry = count('mint', { treat: true, cursor: true, playing: true });
  assert.equal(hungry.treat, 300);
});

test('calm mode puts everyone to sleep and reduced motion rules out zoomies and pounces', () => {
  for (const kind of KINDS) assert.equal(count(kind, { calm: true }, 50).sleep, 50);
  const still = count('pink', { reduced: true, cursor: true, laser: false, others: [{ kind: 'black', activity: 'sit', playful: 90 }] });
  assert.ok(!still.zoomies && !still.stalk && !still.chase, JSON.stringify(still));
});

test('drives follow activity and the time of day', () => {
  const mind = new Mind('mint', {}, rng(3));
  mind.begin('zoomies');
  const before = mind.drives.sleepy;
  for (let i = 0; i < 30; i++) mind.tick(1, { day: dayRhythm(12) });
  assert.ok(mind.drives.sleepy > before);
  mind.begin('sleep');
  for (let i = 0; i < 240; i++) mind.tick(1, { day: dayRhythm(12) });
  assert.ok(mind.drives.sleepy < 5);
  assert.equal(dayRhythm(2).label, 'night');
  assert.ok(dayRhythm(2).sleepy > dayRhythm(7).sleepy);
});

test('petting builds trust until a grumpy cat has had enough', () => {
  const pixel = new Mind('purple', { trust: 20 }, rng(1));
  const results = Array.from({ length: 8 }, () => pixel.pet());
  assert.equal(results[0], 'purr');
  assert.ok(results.includes('enough'));
  assert.ok(pixel.trust > 20);
  const miso = new Mind('mint', {}, rng(1));
  assert.ok(Array.from({ length: 6 }, () => miso.pet()).every(r => r === 'purr'));
});

test('memory survives a round trip and lines never repeat back to back', () => {
  const mind = new Mind('black', {}, rng(9));
  mind.pet(); mind.ate(); mind.bond('purple', .3);
  const restored = new Mind('black', JSON.parse(JSON.stringify(mind.memory())), rng(9));
  assert.equal(restored.stats.pets, 1); assert.equal(restored.stats.treats, 1);
  assert.equal(restored.bonds.purple, mind.bonds.purple);
  let last = '';
  for (let i = 0; i < 20; i++) { const line = mind.line('greet'); assert.notEqual(line, last); last = line; }
  assert.equal(mind.line('no-such-key'), null);
});

test('relationships give the cast its dynamics', () => {
  assert.ok(defaultBonds('black').pink > .5, 'Bean idolises Mochi');
  assert.ok(defaultBonds('purple').pink < 0, 'Pixel is wary of Mochi');
  assert.deepEqual(Object.keys(defaultBonds('mint')).sort(), ['black', 'pink', 'purple']);
});

test('a long absence gets a diary entry, a short one does not', () => {
  const minds = KINDS.map(k => new Mind(k, {}, rng(4)));
  assert.equal(awaySummary(minds, 20), null);
  assert.match(awaySummary(minds, 600, rng(2)), /^You were away 10 minutes\. .+, and .+\.$/);
});

test('cats are mostly asleep or loafing, and a fresh page finds them drowsy', () => {
  for (const kind of KINDS) {
    const first = count(kind, { shelves: true, hideouts: true, toys: true, cursor: true }, 200, 7, { awake: false });
    assert.ok((first.sleep || 0) + (first.loaf || 0) > 150, `${kind}: ${JSON.stringify(first)}`);
  }
  // Over an hour, rest and time off screen dominate; busy outings are occasional.
  const busy = new Set(['wander', 'explore', 'knock', 'zoomies', 'stalk', 'approach', 'visit', 'chase', 'follow', 'glass']);
  const ctx = { shelves: true, hideouts: true, toys: true, cursor: true };
  for (const kind of KINDS) {
    const mind = new Mind(kind, {}, rng(5)); let busyTime = 0, total = 0;
    while (total < 3600) {
      const { type, partner } = mind.choose(ctx); mind.begin(type, partner);
      const seconds = { sleep: 150, loaf: 60, leave: 120, hide: 40, sit: 20 }[type] || 10;
      for (let i = 0; i < seconds; i++) mind.tick(1, ctx);
      total += seconds; if (busy.has(type)) busyTime += seconds;
    }
    assert.ok(busyTime / total < .15, `${kind} is busy ${Math.round(busyTime / total * 100)}% of the time`);
  }
});

test('the rig shows a face from the front and the back of the head from behind', () => {
  const [front] = headBasis(Math.PI / 2, 0, 0), [back] = headBasis(-Math.PI / 2, 0, 0), [side] = headBasis(0, 0, 0);
  assert.ok(visibility(front) > .9);
  assert.ok(visibility(back) < -.9);
  assert.ok(Math.abs(visibility(side)) < 1e-9);
  assert.ok(Math.abs(wrap(Math.PI * 3) - Math.PI) < 1e-9);
});

test('a walking cat turns toward where it is going and arrives', () => {
  const body = new CatBody(CAST.pink.look);
  body.yaw = Math.PI / 2; body.goTo(200, 0, 120);
  for (let i = 0; i < 400 && body.move; i++) body.update(1 / 60);
  assert.equal(body.move, null);
  assert.ok(Math.abs(body.x - 200) < 4);
  assert.ok(Math.abs(wrap(body.yaw)) < .3, 'faces right after walking right');
  body.goTo(200, -100, 80);
  for (let i = 0; i < 120; i++) body.update(1 / 60);
  assert.ok(Math.sin(body.yaw) < -.5, 'walking away shows its back');
});

test('the v2 world gives every cat ways to hide, leave and press up to the glass, and only mischief knocks things over', () => {
  // Live an afternoon: each choice runs for a while, so drives and the repeat penalty shape the next one.
  const day = (kind, ctx, steps = 600) => {
    const mind = new Mind(kind, {}, rng(11)), tally = {};
    for (let i = 0; i < steps; i++) {
      const { type, partner } = mind.choose(ctx);
      mind.begin(type, partner); mind.tick(12, ctx);
      tally[type] = (tally[type] || 0) + 1;
    }
    return tally;
  };
  const ctx = { shelves: true, hideouts: true, toys: true, aquarium: true };
  const all = Object.fromEntries(KINDS.map(k => [k, day(k, ctx)]));
  const seen = new Set(Object.values(all).flatMap(t => Object.keys(t)));
  for (const type of ['hide', 'leave', 'glass', 'explore', 'knock']) assert.ok(seen.has(type), `${type} never chosen: ${JSON.stringify(all)}`);
  assert.ok((all.pink.knock || 0) > (all.mint.knock || 0) && (all.pink.knock || 0) > (all.purple.knock || 0), JSON.stringify(all));
  const bare = day('pink', { shelves: true }, 200);
  assert.ok(!bare.knock && !bare.hide, 'nothing to knock over and nowhere to hide');
});

test('a cat hanging off a ledge drops its paws and lets the tail hang', () => {
  const body = new CatBody(CAST.mint.look);
  body.set({ overEdge: 1, tailHang: 1 });
  for (let i = 0; i < 90; i++) body.update(1 / 60);
  assert.ok(body.pose.overEdge > .9 && body.pose.tailHang > .9, JSON.stringify(body.pose));
  assert.match(tint('#000000', .5), /^#[0-9a-f]{6}$/i);
  assert.equal(tint('#ffffff', .5).toLowerCase(), '#ffffff');
});
