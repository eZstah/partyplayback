import test from 'node:test';
import assert from 'node:assert/strict';
import { bootCats } from '../src/scripts/cats/world.js';
import { mountBean } from '../src/scripts/cats/index.js';

// Minimal DOM fixture for startup and page events; no rendering or browser needed.
function habitat(t, saved = {}, phone = false, reduced = false) {
  let clock = 0, frameId = 0;
  const frames = new Map();
  const canvasContext = () => new Proxy({ globalAlpha: 1,
    measureText: text => ({ width: text.length * 7 }),
    createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  const node = () => {
    const classes = new Set(), listeners = new Map(), children = new Map(), attributes = new Map();
    return {
      hidden: false, inert: false, dataset: {}, style: {}, textContent: '',
      classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)),
        contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
      addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type),
      emit: (type, event = {}) => listeners.get(type)?.(event),
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: name => attributes.get(name) ?? null,
      removeAttribute: name => attributes.delete(name), append() {}, replaceChildren() {}, focus() {},
      querySelector: selector => { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
      querySelectorAll: () => [], getContext: canvasContext,
      getBoundingClientRect: () => ({ left: 200, top: 100, right: 1000, bottom: 550, width: 800, height: 450 }),
    };
  };
  const nodes = new Map(), get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  get('cat-universe').hidden = true;
  get('cat-panel').hidden = true;
  let memory = JSON.stringify(saved);
  const globals = {
    document: { ...node(), body: node(), documentElement: node(), getElementById: get,
      createElement: node, contains: () => true,
      querySelectorAll: sel => sel === '.home-main,.site-footer' ? [get('home'), get('footer')] : [],
      querySelector: sel => sel === '.create-room-button' ? get('create') : null },
    window: node(), innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    matchMedia: query => ({ matches: phone && query.includes('760px') || reduced && query.includes('reduced-motion') }),
    getComputedStyle: () => ({ fontFamily: 'sans-serif' }),
    localStorage: { getItem: () => memory, setItem: (_, value) => { memory = value; } },
    location: { search: '', href: 'https://example.test/' },
    history: { state: null, replaceState() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    performance: { now: () => clock },
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const epoch = Date.now();
  t.mock.method(Date, 'now', () => epoch + clock);
  return { get, frames, memory: () => JSON.parse(memory),
    advance(ms) { clock += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock)); },
    visibility(hidden) { document.hidden = hidden; document.emit('visibilitychange'); },
  };
}

test('one resident can greet visitors and handle page events without the old cast', t => {
  const fixture = habitat(t);
  const world = bootCats();
  try {
    assert.deepEqual(world.cats.map(cat => cat.name), ['Bean']);
    const bean = world.cats[0];
    assert.equal(bean.mind.activity, 'greet', 'Bean welcomes with a quiet blink');
    assert.equal(bean.closeup, null, 'arrival does not force a giant face over the page');
    bean.at = { kind: 'floor' }; bean.prio = 0;
    fixture.get('create').emit('pointerenter');
    fixture.get('url-in').emit('focus');
    world.linkError('Invalid link');
    assert.equal(bean.bubble.text, 'uh oh.');
    world.inviteCopied();
    assert.equal(bean.bubble.text, 'more friends!');
    world.observe({ users: 1 }); world.observe({ users: 2, title: 'Music video' });
    assert.equal(bean.bubble.text, 'a new friend!!');
    fixture.get('cat-panel-btn').emit('click');
    assert.equal(fixture.get('cat-panel').hidden, false);
    world.calm(true);
    assert.equal(fixture.get('cat-calm-btn').textContent, 'Wake Bean');
    assert.match(fixture.memory().journal.at(-1).text, /Bean noticed/);
  } finally { world.destroy(); }
});

test('returning visitors keep Bean memory without reviving the other cats', t => {
  const fixture = habitat(t, { visits: 3, cats: { black: { trust: 72 }, mint: { trust: 31 }, pink: {}, purple: {} } });
  const world = bootCats();
  try {
    assert.deepEqual(world.cats.map(cat => cat.kind), ['black']);
    assert.equal(world.cats[0].mind.trust, 72);
    world.aquarium(true);
    assert.equal(world.world.aquarium, true);
    assert.equal(world.cats.length, 1);
  } finally { world.destroy(); }
  assert.equal(fixture.memory().cats.black.trust, 72);
  assert.equal(fixture.memory().cats.mint.trust, 31, 'dormant memories are preserved');
});

test('a returning visitor finds Bean resting where it was, not walking across the page', t => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const fixture = habitat(t, { visits: 3, lastSeen: Date.now() - 60e3 });
    const world = bootCats({ seed }), bean = world.cats[0];
    try {
      assert.ok(['sleep', 'loaf'].includes(bean.mind.activity), `seed ${seed}: ${bean.mind.activity}`);
      const x = bean.body.x, gy = bean.body.gy;
      for (let i = 0; i < 200; i++) fixture.advance(50);
      assert.ok(['sleep', 'loaf'].includes(bean.mind.activity), `seed ${seed}: still resting after 10 s`);
      assert.ok(Math.hypot(bean.body.x - x, bean.body.gy - gy) < 2, `seed ${seed}: Bean did not move`);
    } finally { world.destroy(); }
  }
});

test('phones use the static fallback without starting a second cat world', t => {
  const fixture = habitat(t, {}, true);
  assert.deepEqual(bootCats().cats, []);
  assert.equal(fixture.get('cat-universe').hidden, true);
});

test('the integrated world freezes hidden effects, resumes once and releases its page changes', t => {
  const fixture = habitat(t, { visits: 1 });
  location.search = '?catdebug&catseed=42';
  const world = bootCats();
  const bean = world.cats[0];
  try {
    assert.equal(world.snapshot().seed, 42);
    fixture.advance(0);
    world.inviteCopied();
    assert.equal(bean.body.goal.mouth, .5);
    const before = world.snapshot().time;
    fixture.visibility(true);
    assert.equal(fixture.frames.size, 0);
    fixture.advance(10000);
    assert.equal(world.snapshot().time, before);
    assert.equal(bean.body.goal.mouth, .5, 'hidden time cannot complete a face effect');
    fixture.visibility(false); fixture.visibility(false);
    assert.equal(fixture.frames.size, 1);
    fixture.advance(0);
    for (let i = 0; i < 5; i++) fixture.advance(50);
    assert.equal(bean.body.goal.mouth, 0);
    world.aquarium(true); world.laser(true);
    fixture.get('cat-panel-btn').emit('click');
    assert.equal(fixture.get('home').inert, true);
    world.inviteCopied();
  } finally { world.destroy(); }
  assert.equal(fixture.frames.size, 0);
  assert.equal(fixture.get('home').inert, false);
  assert.equal(document.documentElement.classList.contains('cat-laser'), false);
  assert.equal(fixture.get('cat-panel-btn').getAttribute('aria-expanded'), 'false');
  assert.equal(fixture.get('cat-laser-btn').getAttribute('aria-pressed'), 'false');
  assert.equal(window.youpleCats, undefined);
  const mouth = bean.body.goal.mouth;
  fixture.advance(1000);
  assert.equal(bean.body.goal.mouth, mouth, 'destroyed effects never mutate the old rig');
  world.observe({ title: 'stale event' }); world.aquarium(true); world.destroy();
  assert.equal(world.world.title, '');
  assert.equal(fixture.get('home').inert, false);
  const mounted = mountBean({ seed: 7 });
    assert.equal(mounted.version, '1.0.0-rc.1');
  assert.equal(mounted.snapshot().cats.length, 1);
  assert.equal(fixture.frames.size, 1);
  mounted.destroy();
});

test('interrupted and disposed actions run their cleanup, and snapshots cannot alter Bean', t => {
  habitat(t, { visits: 1 });
  const world = bootCats({ seed: 10 }), bean = world.cats[0];
  let closed = 0;
  function* action() { try { yield; } finally { closed++; } }
  try {
    bean.plan = action(); bean.plan.next();
    world.calm(true);
    assert.equal(closed, 1);
    const snapshot = world.snapshot();
    snapshot.cats[0].drives.sleepy = 999;
    assert.notEqual(bean.mind.drives.sleepy, 999);
    bean.plan = action(); bean.plan.next();
  } finally { world.destroy(); }
  assert.equal(closed, 2);
});

test('leaving the page while carrying Bean releases stale pointer input and safely resumes', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    world.world.drag = { cat: bean };
    world.world.press = { cat: bean };
    world.world.pointer = { x: 300, y: 300 };
    world.world.hovered = bean;
    fixture.visibility(true);
    assert.equal(world.world.drag, null);
    assert.equal(world.world.press, null);
    assert.equal(world.world.pointer, null);
    assert.equal(world.world.hovered, null);
    fixture.advance(60000);
    fixture.visibility(false);
    fixture.advance(0);
    assert.equal(fixture.frames.size, 1);
    assert.equal(world.snapshot().paused, false);
    assert.ok(Number.isFinite(bean.body.x) && Number.isFinite(bean.body.gy));
    assert.equal(world.world.drag, null);
  } finally { world.destroy(); }
});

test('page-decoration animations pause with Bean and are restored on teardown', t => {
  const fixture = habitat(t, { visits: 1 });
  location.search = '?catdebug';
  const world = bootCats({ seed: 42 }), animations = [], toy = fixture.get('toy');
  toy.getBoundingClientRect = () => ({ left: 400, top: 795, right: 430, bottom: 825, width: 30, height: 30 });
  toy.matches = () => false;
  toy.animate = () => {
    const animation = new EventTarget();
    animation.playState = 'running';
    animation.pause = () => { animation.playState = 'paused'; };
    animation.play = () => { animation.playState = 'running'; };
    animation.cancel = () => { animation.playState = 'idle'; animation.dispatchEvent(new Event('cancel')); };
    animations.push(animation);
    return animation;
  };
  try {
    world.world.toys = [{ el: toy, rect: toy.getBoundingClientRect() }];
    assert.equal(world.play('Bean', 'knock'), true);
    for (let i = 0; i < 1200 && !animations.length; i++) fixture.advance(50);
    assert.ok(animations.length, 'Bean reaches and swats the decoration');
    assert.equal(toy.dataset.catKnocked, '1');
    fixture.visibility(true);
    assert.ok(animations.every(a => a.playState === 'paused'));
    fixture.visibility(false);
    assert.ok(animations.every(a => a.playState === 'running'));
  } finally { world.destroy(); }
  assert.ok(animations.every(a => a.playState === 'idle' && a.onfinish === null));
  assert.equal(toy.dataset.catKnocked, undefined);
});

test('an invitation wakes Bean and completes notice, approach, sniff, paw and settle', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0], phases = [];
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 400; bean.body.face = 'sleep';
    world.world.nextCritter = Infinity;
    bean.mind.choose = () => ({ type: 'sit', partner: null });
    fixture.advance(0);
    fixture.get('cat-panel-btn').emit('click');
    fixture.get('cat-hello-btn').emit('click');
    assert.equal(fixture.get('cat-panel').hidden, true);
    assert.equal(world.greet(), false, 'repeat invitations do not restart the action');
    const invited = bean.plan;
    for (let i = 0; i < 1200 && (bean.plan === invited || !phases.length); i++) {
      fixture.advance(50);
      if (bean.phase && phases.at(-1) !== bean.phase) phases.push(bean.phase);
      assert.notEqual(bean.body.face, 'sleep');
      if (bean.phase === 'keeping you company') assert.equal(world.greet(), false);
    }
    assert.deepEqual(phases, ['noticing', 'approaching', 'sniffing', 'offering a paw', 'settling', 'keeping you company']);
    assert.notEqual(bean.plan, invited, 'the whole sequence finishes');
    assert.equal(bean.phase, null);
    assert.equal(bean.at.kind, 'floor');
    assert.equal(bean.body.goal.swat, 0);
    assert.equal(bean.body.goal.offerPaw, 0);
    assert.equal(bean.body.goal.knead, 0);
    const sitting = bean.plan;
    for (let i = 0; i < 100; i++) fixture.advance(50);
    assert.equal(bean.plan, sitting, 'selected sit uses its default rest duration');
    assert.equal(bean.mind.activity, 'sit');
  } finally { world.destroy(); }
});

test('inviting an airborne Bean recovers a landing before approaching', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    bean.at = { kind: 'air' }; bean.body.x = 500; bean.body.gy = 300;
    bean.body.leap(800, 200, 0, 80, 1);
    bean.body.h = 55;
    const visibleY = bean.body.gy - bean.body.h;
    assert.equal(world.greet(), true);
    assert.equal(bean.body.gy - bean.body.h, visibleY, 'recovery preserves the visible height');
    assert.ok(bean.at.then, 'recovery owns a landing after the old generator closes');
    for (let i = 0; i < 30; i++) fixture.advance(50);
    assert.equal(bean.at.kind, 'floor');
    assert.equal(bean.body.jump, null);
    assert.ok(bean.body.gy > 700, 'Bean lands on the floor rather than a phantom ledge');
    assert.ok(Number.isFinite(bean.body.x));
  } finally { world.destroy(); }
});

test('Calm cancels an invitation cleanly and keeps Bean asleep through a long session', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0); world.greet(); fixture.advance(50);
    assert.equal(bean.phase, 'noticing');
    world.calm(true);
    assert.equal(bean.phase, null);
    assert.equal(bean.body.goal.headRoll, 0);
    for (let i = 0; i < 1000 && bean.body.face !== 'sleep'; i++) fixture.advance(50);
    assert.equal(bean.body.face, 'sleep');
    const rest = { x: bean.body.x, gy: bean.body.gy, plan: bean.plan };
    for (let i = 0; i < 3600; i++) fixture.advance(50);
    assert.equal(bean.plan, rest.plan, 'Calm does not expire into a wake/stretch/travel cycle');
    assert.equal(bean.body.x, rest.x);
    assert.equal(bean.body.gy, rest.gy);
    assert.equal(bean.body.face, 'sleep');
    assert.equal(bean.body.move, null);
    world.calm(false);
    assert.equal(bean.body.face, 'open', 'Wake Bean releases the sleeping expression immediately');
  } finally { world.destroy(); }
});

test('reduced-motion laser watches from rest and Calm switches the toy off', t => {
  const fixture = habitat(t, { visits: 1 }, false, true);
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    bean.at = { kind: 'floor' }; bean.body.face = 'sleep';
    world.world.pointer = { x: 1100, y: 600, t: 0 };
    const start = bean.body.x;
    world.laser(true);
    for (let i = 0; i < 200; i++) {
      fixture.advance(50);
      assert.equal(bean.body.move, null);
      assert.equal(bean.body.jump, null);
      assert.equal(bean.body.x, start);
    }
    assert.equal(bean.body.face, 'open');
    world.calm(true);
    assert.equal(world.world.laser, false);
    assert.equal(document.documentElement.classList.contains('cat-laser'), false);
  } finally { world.destroy(); }
});

test('starting playback settles uninvited antics but preserves invited play', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    bean.at = { kind: 'floor' }; bean.prio = 10; bean.mind.begin('zoomies');
    document.body.dataset.playback = 'playing';
    world.observe({ title: 'A quiet evening' });
    assert.equal(bean.mind.activity, 'watch');
    document.body.dataset.playback = 'paused';
    world.observe({ title: 'Paused evening' });
    world.greet(); fixture.advance(50);
    const invited = bean.plan;
    document.body.dataset.playback = 'playing';
    world.observe({ title: 'Another evening' });
    assert.equal(bean.plan, invited);
    assert.equal(bean.mind.activity, 'approach');
  } finally { world.destroy(); }
});

test('nearby cursor curiosity requires a deliberate pause outside real controls', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 400;
    world.world.nextCritter = Infinity;
    bean.mind.choose = () => ({ type: 'sit', partner: null });
    bean.plan = null; // skip the opening nap so the mocked choice runs
    fixture.advance(0);
    for (let i = 0; i < 200; i++) fixture.advance(50);
    const move = (x, ui) => document.emit('pointermove', {
      clientX: x, clientY: bean.body.gy - 55 * bean.body.k, timeStamp: performance.now(),
      target: { closest: () => ui ? {} : null },
    });
    move(bean.body.x + 120, true);
    for (let i = 0; i < 60; i++) fixture.advance(50);
    assert.equal(bean.mind.activity, 'sit', 'hovering a real control is not a cat invitation');
    for (let i = 0; i < 60; i++) { move(bean.body.x + 120 + (i % 2) * 25, false); fixture.advance(50); }
    assert.equal(bean.mind.activity, 'sit', 'a passing pointer does not continually interrupt rest');
    for (let i = 0; i < 35; i++) fixture.advance(50);
    assert.equal(bean.mind.activity, 'approach');
    assert.equal(bean.phase, 'noticing');
  } finally { world.destroy(); }
});
