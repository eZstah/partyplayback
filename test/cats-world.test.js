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
      hidden: false, inert: false, dataset: {}, style: {}, textContent: '', closest: () => null,
      classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)),
        contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) },
      addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type),
      emit: (type, event = {}) => listeners.get(type)?.(event),
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: name => attributes.get(name) ?? null,
      removeAttribute: name => attributes.delete(name), append() {}, replaceChildren() {},
      focus() { document.activeElement = this; }, contains(el) { return el === this; },
      querySelector: selector => { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); },
      querySelectorAll: () => [], getContext: canvasContext,
      getBoundingClientRect: () => ({ left: 200, top: 100, right: 1000, bottom: 550, width: 800, height: 450 }),
    };
  };
  const nodes = new Map(), surfaces = [], perches = [], get = id => { if (!nodes.has(id)) nodes.set(id, { ...node(), id }); return nodes.get(id); };
  get('cat-universe').hidden = true;
  get('cat-panel').hidden = true;
  const menu = get('cat-panel'), menuButtons = ['cat-hello-btn', 'cat-treat-btn', 'cat-laser-btn', 'cat-calm-dock'].map(get);
  menu.querySelectorAll = sel => sel === '[role^="menuitem"]' ? menuButtons : [];
  menu.contains = el => el === menu || menuButtons.includes(el);
  menu.getBoundingClientRect = () => ({ left: 0, top: 0, width: 196, height: 164, right: 196, bottom: 164 });
  get('cat-panel-btn').getBoundingClientRect = () => ({ left: 1388, top: 848, width: 36, height: 36, right: 1424, bottom: 884 });
  let memory = JSON.stringify(saved);
  const globals = {
    document: { ...node(), body: node(), documentElement: node(), getElementById: get,
      createElement: node, contains: el => !el?.removed,
      querySelectorAll: sel => sel === '.home-main,.site-footer' ? [get('home'), get('footer')]
        : sel === '.room-launcher,#stage,.playlist-panel,.member-rooms' ? surfaces.filter(el => el.solid && !el.removed)
        : sel === '.step-symbol,#q-list > li' ? surfaces.filter(el => !el.solid && !el.removed)
        : sel === '#cat-universe [data-perch]' ? perches : [],
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
    ledge(id, left, top, width, height = 100, solid = false) {
      const el = get(id); el.solid = solid; el.layout = { left, top, width, height };
      el.getBoundingClientRect = () => ({ ...el.layout, right: el.layout.left + el.layout.width, bottom: el.layout.top + el.layout.height });
      surfaces.push(el); return el;
    },
    // Aquarium furniture: an element with data-perch="solid" or "shelf".
    perch(id, kind, left, top, width, height) {
      const el = get(id); el.dataset.perch = kind; el.layout = { left, top, width, height };
      el.getBoundingClientRect = () => ({ ...el.layout, right: el.layout.left + el.layout.width, bottom: el.layout.top + el.layout.height });
      perches.push(el); return el;
    },
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
    assert.equal(fixture.get('cat-calm-dock').textContent, 'Wake Bean');
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

test('Aquarium furniture becomes surfaces to climb, perch on and hide behind', t => {
  const fixture = habitat(t, { visits: 3 });
  fixture.ledge('card', 400, 300, 500, 200, true);
  const shelf = fixture.perch('bookshelf', 'solid', 1200, 180, 160, 650);
  const sill = fixture.perch('sill', 'shelf', 540, 270, 320, 22);
  const world = bootCats({ seed: 3 });
  try {
    assert.ok(world.world.solids.some(l => l.el.id === 'card'), 'the page card is a surface on the normal page');
    assert.ok(!world.world.ledges.some(l => l.el === shelf), 'furniture stays out of the normal page');
    world.aquarium(true); fixture.advance(500);
    assert.deepEqual(world.world.solids.map(l => l.el.id), ['bookshelf'], 'only the room furniture counts in Aquarium');
    assert.deepEqual(world.world.ledges.map(l => [l.el.id, l.kind]), [['bookshelf', 'solid'], ['sill', 'box']]);
    for (let i = 0; i < 400; i++) fixture.advance(50);
    world.aquarium(false); fixture.advance(500);
    assert.ok(world.world.solids.some(l => l.el.id === 'card'), 'leaving Aquarium restores the page surfaces');
  } finally { world.destroy(); }
});

test('a big leap sizes up the jump, winds up and lands on furniture', t => {
  const fixture = habitat(t, { visits: 3 });
  fixture.perch('cabinet', 'solid', 700, 620, 260, 230);
  fixture.perch('deck', 'shelf', 300, 560, 150, 20);
  location.search = '?catdebug';
  const world = bootCats({ seed: 5 }), bean = world.cats[0];
  try {
    bean.mind.choose = () => ({ type: 'sit' }); world.world.nextCritter = Infinity;
    world.aquarium(true); fixture.advance(500);
    bean.at = { kind: 'floor' }; bean.body.x = 560; bean.body.z = 0;
    assert.ok(world.play('Bean', 'leap'));
    let wiggled = false, flew = false;
    for (let i = 0; i < 300 && bean.mind.activity === 'leap'; i++) {
      fixture.advance(50);
      wiggled ||= bean.body.goal.wiggle === 1; flew ||= bean.at.kind === 'air';
      if (bean.at.kind === 'ledge') break;
    }
    assert.ok(wiggled, 'he wiggles before a big jump');
    assert.ok(flew, 'and leaps');
    assert.equal(bean.at.kind, 'ledge', `he lands on furniture, not ${bean.at.kind}`);
    assert.equal(bean.body.goal.wiggle, 0, 'the wiggle is released');
    assert.ok(world.play('Bean', 'highjump'));
    let rose = false;
    for (let i = 0; i < 300 && bean.mind.activity === 'highjump'; i++) { fixture.advance(50); rose ||= bean.at.kind === 'air'; }
    assert.ok(rose, 'a high jump leaves the perch');
    assert.equal(bean.at.kind, 'ledge', 'and comes back down onto it');
  } finally { world.destroy(); }
});

test('in Aquarium Bean lives around the room while a video plays, quietly and on screen', t => {
  const fixture = habitat(t, { visits: 3 });
  fixture.perch('sofa', 'solid', 300, 640, 380, 140).dataset.view = '';
  fixture.perch('box', 'solid', 760, 700, 140, 150).dataset.nap = '';
  fixture.perch('console', 'shelf', 950, 690, 400, 90).dataset.view = '';
  location.search = '?catdebug';
  const world = bootCats({ seed: 11 }), bean = world.cats[0];
  try {
    world.aquarium(true); fixture.advance(500);
    bean.at = { kind: 'floor' }; bean.body.x = 200; bean.body.z = 0;
    document.body.dataset.playback = 'playing'; world.observe({ title: 'lofi beats', users: 1 });
    const places = new Set();
    for (let i = 0; i < 24000; i++) {
      fixture.advance(50);
      assert.ok(['sleep', 'watch', 'sit', 'loaf'].includes(bean.mind.activity), bean.mind.activity);
      assert.notEqual(bean.at.kind, 'away', 'he stays in the room');
      assert.equal(world.world.particles.length, 0, 'no dust or sparkles over the video');
      assert.equal(bean.bubble, null, 'and no speech');
      if (bean.at.kind === 'ledge') places.add(bean.at.ledge.el.id);
    }
    assert.ok(places.size >= 1, 'over twenty minutes he settles somewhere cozy at least once');
    world.aquarium(false); fixture.advance(500);
    const { x } = bean.body;
    for (let i = 0; i < 4000; i++) { fixture.advance(50); assert.equal(bean.body.x, x, 'outside Aquarium playback stays still'); }
  } finally { world.destroy(); }
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
  assert.equal(fixture.get('cat-laser-btn').getAttribute('aria-checked'), 'false');
  assert.equal(window.youpleCats, undefined);
  const mouth = bean.body.goal.mouth;
  fixture.advance(1000);
  assert.equal(bean.body.goal.mouth, mouth, 'destroyed effects never mutate the old rig');
  world.observe({ title: 'stale event' }); world.aquarium(true); world.destroy();
  assert.equal(world.world.title, '');
  assert.equal(fixture.get('home').inert, false);
  const mounted = mountBean({ seed: 7 });
    assert.equal(mounted.version, '1.0.0-rc.2');
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

for (const finish of ['teardown', 'playback']) test(`page-decoration animations pause with Bean and are restored on ${finish}`, t => {
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
    if (finish === 'playback') {
      document.body.dataset.playback = 'playing'; world.observe({ title: 'Music video' });
      assert.ok(animations.every(a => a.playState === 'idle' && a.onfinish === null));
      const count = animations.length;
      for (let i = 0; i < 600; i++) fixture.advance(50);
      assert.equal(animations.length, count, 'late restoration must not start new decoration events');
      assert.equal(world.world.particles.length, 0);
    }
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
    const visibleY = bean.body.screen([0, 0, 0])[1];
    assert.equal(world.greet(), true);
    assert.equal(bean.body.screen([0, 0, 0])[1], visibleY, 'recovery preserves the visible height');
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

test('starting playback settles antics and earlier invitations; fresh direct invitations still work', t => {
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
    assert.notEqual(bean.plan, invited);
    assert.equal(bean.mind.activity, 'watch');
    for (let i = 0; i < 200; i++) fixture.advance(50);
    assert.equal(world.greet(), true);
    assert.equal(bean.mind.activity, 'approach', 'direct interaction is still available during playback');
  } finally { world.destroy(); }
});

test('continuous playback holds position, clears butterflies and suppresses ambient events', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 500; bean.body.z = 0;
    Object.assign(bean.mind.drives, { playful: 100, curious: 100, lonely: 100, sleepy: 90 });
    fixture.advance(0);
    world.world.nextCritter = -1;
    world.world.critter = { x: 300, y: 300, dir: 1, t: 0, flap: 0, life: 30 };
    world.world.particles.push({ glyph: 'z', age: 0, life: 5 });
    world.world.glass.push({ age: 0, life: 5 });
    document.body.dataset.playback = 'playing'; world.observe({ title: 'Official music video', users: 1 });
    assert.equal(world.world.critter, null);
    const { x, z } = bean.body, timer = world.world.nextCritter;
    for (let i = 0; i < 12000; i++) {
      fixture.advance(50);
      assert.ok(['sleep', 'watch', 'sit', 'loaf'].includes(bean.mind.activity), bean.mind.activity);
      assert.equal(bean.body.x, x); assert.equal(bean.body.z, z);
      assert.equal(bean.body.move, null); assert.equal(bean.body.jump, null);
      assert.equal(world.world.critter, null);
      assert.equal(world.world.particles.length, 0); assert.equal(world.world.glass.length, 0);
      assert.equal(bean.bubble, null);
      if (i === 3000) world.observe({ title: 'Gaming battle highlights', users: 2 });
    }
    assert.equal(world.world.nextCritter, timer, 'the spawn clock does not build up during playback');
    document.body.dataset.playback = 'paused'; world.observe({ title: 'Paused' });
    for (let i = 0; i < 10; i++) fixture.advance(50);
    assert.equal(world.world.critter, null, 'pausing does not trigger a queued butterfly immediately');
  } finally { world.destroy(); }
});

test('an offscreen Bean stays offscreen until playback stops', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    bean.at = { kind: 'away', side: 'left' }; bean.body.x = -150; fixture.advance(0);
    // The initial greeting is replaced on playback regardless of its priority.
    bean.at = { kind: 'away', side: 'left' }; bean.body.x = -150;
    document.body.dataset.playback = 'playing'; world.observe({ title: 'Film' });
    for (let i = 0; i < 6000; i++) {
      fixture.advance(50);
      assert.equal(bean.at.kind, 'away'); assert.equal(bean.peek, null);
      assert.equal(bean.body.x, -150); assert.equal(bean.body.jump, null);
    }
    document.body.dataset.playback = 'paused'; world.observe({ title: '' });
    for (let i = 0; i < 200 && bean.at.kind === 'away'; i++) fixture.advance(50);
    assert.notEqual(bean.at.kind, 'away');
  } finally { world.destroy(); }
});

for (const location of ['floor', 'away']) test(`long hidden-tab resume preserves ${location} rest during playback`, t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    bean.at = location === 'away' ? { kind: 'away', side: 'left' } : { kind: 'floor' };
    bean.body.x = location === 'away' ? -150 : 510;
    document.body.dataset.playback = 'playing'; world.observe({ title: 'Film' });
    fixture.advance(50);
    const { x, z } = bean.body;
    fixture.visibility(true); fixture.advance(120000); fixture.visibility(false);
    for (let i = 0; i < 200; i++) {
      fixture.advance(50);
      assert.equal(bean.at.kind, location); assert.equal(bean.peek, null);
      assert.equal(bean.body.x, x); assert.equal(bean.body.z, z);
      assert.equal(bean.body.move, null); assert.equal(bean.body.jump, null);
      assert.equal(bean.bubble, null); assert.equal(world.world.critter, null);
    }
  } finally { world.destroy(); }
});

for (const scenario of ['calm laser', 'calm treat', 'absent laser pointer']) test(`playback stays settled with ${scenario}`, t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    document.body.dataset.playback = 'playing'; world.observe({ title: 'Music video' });
    if (scenario === 'calm laser') { world.calm(true); world.laser(true); }
    if (scenario === 'calm treat') { world.treat(900, 800); world.calm(true); }
    if (scenario === 'absent laser pointer') { world.laser(true); document.documentElement.emit('pointerleave'); }
    const { x, z } = bean.body;
    for (let i = 0; i < 2400; i++) {
      fixture.advance(50);
      assert.equal(bean.body.x, x); assert.equal(bean.body.z, z);
      assert.equal(bean.body.move, null); assert.equal(bean.body.jump, null);
      // The explicitly dropped treat may bounce before coming to rest.
      if (i > 100) assert.equal(world.world.particles.length, 0);
      assert.equal(world.world.critter, null);
      if (i > 800) assert.ok(['sleep', 'watch', 'sit', 'loaf'].includes(bean.mind.activity));
    }
  } finally { world.destroy(); }
});

test('Bean context menu is targeted, keyboard navigable and dismissible; Aquarium is independent', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  const menu = fixture.get('cat-panel'), trigger = fixture.get('cat-panel-btn');
  try {
    fixture.advance(0);
    let prevented = 0;
    const context = (x, y, ui = false) => document.emit('contextmenu', { clientX: x, clientY: y,
      target: { closest: () => ui ? {} : null }, preventDefault() { prevented++; } });
    context(5, 5); assert.equal(prevented, 0); assert.equal(menu.hidden, true);
    const head = bean.body.headPos;
    context(head[0], head[1], true); assert.equal(prevented, 0, 'video and native control menus remain untouched');
    context(head[0], head[1]);
    assert.equal(prevented, 1); assert.equal(menu.hidden, false);
    assert.ok(parseFloat(menu.style.left) + 196 <= innerWidth - 8);
    assert.ok(parseFloat(menu.style.top) + 164 <= innerHeight - 8);
    assert.equal(document.activeElement, fixture.get('cat-hello-btn'));
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    const key = key => document.emit('keydown', { key, preventDefault() {} });
    key('End'); assert.equal(document.activeElement, fixture.get('cat-calm-dock'));
    key('ArrowDown'); assert.equal(document.activeElement, fixture.get('cat-hello-btn'));
    key('ArrowUp'); assert.equal(document.activeElement, fixture.get('cat-calm-dock'));
    key('Home'); assert.equal(document.activeElement, fixture.get('cat-hello-btn'));
    key('Escape'); assert.equal(menu.hidden, true); assert.equal(document.activeElement, trigger);
    key('ArrowDown'); assert.equal(menu.hidden, false);
    fixture.get('cat-laser-btn').emit('click');
    assert.equal(menu.hidden, true); assert.equal(world.world.laser, true);
    assert.equal(fixture.get('cat-laser-btn').getAttribute('aria-checked'), 'true');
    trigger.emit('click'); key('Tab'); assert.equal(menu.hidden, true);
    trigger.emit('click'); document.emit('pointerdown', { button: 0, clientX: 5, clientY: 5, target: { closest: () => null } });
    assert.equal(menu.hidden, true, 'outside click dismisses');
    trigger.emit('click'); window.emit('scroll'); assert.equal(menu.hidden, true);
    trigger.emit('click'); window.emit('resize'); assert.equal(menu.hidden, true);
    trigger.emit('click'); fixture.get('cat-aquarium-btn').emit('click');
    assert.equal(menu.hidden, true); assert.equal(world.world.aquarium, true);
    assert.equal(fixture.get('cat-aquarium-btn').getAttribute('aria-pressed'), 'true');
    assert.equal(fixture.get('cat-aquarium-btn').textContent, 'Back to site');
    fixture.get('cat-aquarium-btn').emit('click');
    assert.equal(world.world.aquarium, false);
    trigger.emit('click'); fixture.visibility(true); assert.equal(menu.hidden, true);
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

test('butterfly pursuit chains reachable surfaces instead of remaining on the floor', t => {
  const fixture = habitat(t, { visits: 1 });
  fixture.ledge('low', 200, 650, 210); fixture.ledge('middle', 520, 450, 210); fixture.ledge('high', 880, 230, 230);
  location.search = '?catdebug';
  const world = bootCats({ seed: 42 }), bean = world.cats[0], reached = new Set();
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 240;
    bean.mind.choose = () => ({ type: 'sit' }); world.world.nextCritter = Infinity;
    fixture.advance(0);
    world.world.critter = { x: 980, y: 175, dir: 0, t: 0, flap: 0, hue: '#fff', life: 60 };
    world.play('Bean', 'hunt');
    for (let i = 0; i < 600; i++) {
      fixture.advance(50);
      if (bean.at.kind === 'ledge') reached.add(bean.at.ledge.el.id);
      assert.notEqual(bean.at.kind, 'away', 'pursuit uses reachable geometry, not offscreen relocation');
    }
    assert.deepEqual([...reached], ['low', 'middle', 'high']);
    assert.equal(bean.body.goal.swat, 0);
    assert.equal(bean.phase, null);
  } finally { world.destroy(); }
});

test('a refused pickup escapes over ledges and can hang, pull up and hide', t => {
  const fixture = habitat(t, { visits: 1 });
  fixture.ledge('low', 200, 650, 210); fixture.ledge('middle', 520, 450, 210); fixture.ledge('cover', 880, 230, 300, 180, true);
  const world = bootCats({ seed: 42 }), bean = world.cats[0], states = new Set();
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 250;
    bean.mind.choose = () => ({ type: 'sit' }); bean.mind.requestGrab = () => 'flee'; world.world.nextCritter = Infinity;
    fixture.advance(0);
    const target = { closest: () => null }, pos = bean.body.headPos;
    document.emit('pointermove', { clientX: pos[0], clientY: pos[1], timeStamp: 0, target });
    document.emit('pointerdown', { button: 0, clientX: pos[0], clientY: pos[1], target, preventDefault() {} });
    assert.ok(world.world.press);
    document.emit('pointermove', { clientX: pos[0] + 20, clientY: pos[1], timeStamp: 50, target });
    assert.equal(world.world.drag, null, 'a declined grab does not start carrying');
    assert.equal(bean.mind.activity, 'evade');
    for (let i = 0; i < 700; i++) {
      fixture.advance(50); states.add(bean.at.kind);
      if (bean.at.kind === 'hang') assert.equal(bean.body.hangPaws?.length, 2);
    }
    assert.ok(states.has('air') && states.has('ledge'), 'escape uses airborne routes');
    assert.ok(states.has('hang'), 'Bean catches an edge with his paws');
    assert.ok(states.has('behind'), 'Bean takes cover after escaping');
    assert.equal(bean.body.hangPaws, null);
    assert.equal(bean.phase, null);
  } finally { world.destroy(); }
});

for (const surface of ['floor', 'ledge']) test(`same-${surface} butterfly pursuit and the following nap journey use walking paws`, t => {
  const fixture = habitat(t, { visits: 1 });
  if (surface === 'ledge') fixture.ledge('long-ledge', 100, 550, 1150);
  location.search = '?catdebug';
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    bean.at = { kind: 'floor' }; bean.body.x = 250; bean.body.yaw = 0;
    if (surface === 'ledge') {
      const ledge = world.world.ledges.find(l => l.el.id === 'long-ledge');
      bean.at = { kind: 'ledge', ledge, dx: 250 - ledge.rect.left };
      bean.body.z = 0; bean.body.gy = ledge.y(250);
    }
    bean.body.reset({ sit: 1 }); Object.assign(bean.body.pose, bean.body.goal);
    bean.mind.choose = () => ({ type: 'sleep' }); world.world.nextCritter = Infinity;
    const bug = world.world.critter = { x: 900, y: bean.body.gy - 90, dir: 0, t: 0, flap: 0, hue: '#fff', life: 60 };
    world.play('Bean', 'hunt');
    const steps = { hunt: [], sleep: [] };
    for (let i = 0; i < 1000; i++) {
      fixture.advance(50);
      if (i === 100) bug.flee = true;
      const mode = bean.mind.activity;
      if (bean.body.move && !bean.body.jump && bean.body.speed > 15 && steps[mode]) {
        assert.equal(bean.body.goal.sit, 0, `${mode} cannot keep a seated walking target`);
        assert.equal(bean.body.goal.curl, 0);
        assert.equal(bean.body.goal.overEdge, 0);
        if (bean.body.pose.sit < .05) steps[mode].push(bean.body.paws[0].w[1]);
      }
      if (steps.sleep.length > 60) break;
    }
    for (const [mode, heights] of Object.entries(steps)) {
      assert.ok(heights.length > 10, `observed ground travel during ${mode}`);
      assert.ok(Math.max(...heights) - Math.min(...heights) > 3, `${mode} has a visible stepping cycle`);
    }
  } finally { world.destroy(); }
});

test('a small fast pointer sample starts a normal pickup rather than a false rushed refusal', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    bean.mind.begin('sit'); bean.mind.random = () => .5; bean.mind.drives.sleepy = 20; bean.mind.drives.playful = 35;
    const target = { closest: () => null }, p = bean.body.headPos;
    document.emit('pointermove', { clientX: p[0], clientY: p[1], timeStamp: 0, target });
    document.emit('pointerdown', { button: 0, clientX: p[0], clientY: p[1], timeStamp: 0, target, preventDefault() {} });
    document.emit('pointermove', { clientX: p[0] + 16, clientY: p[1], timeStamp: 8, target });
    assert.equal(world.world.drag?.cat, bean, 'uses the real Mind, without forcing acceptance');
    assert.ok(bean.mind.inspect().handling.decision.context.speed < 150);
    assert.equal(document.documentElement.classList.contains('cat-carrying'), true);
    document.emit('pointerup', { type: 'pointerup' });
    assert.equal(document.documentElement.classList.contains('cat-carrying'), false);
  } finally { world.destroy(); }
});

test('refusal acknowledges the drag immediately and shows paw/head acting before a dodge', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 600; bean.mind.choose = () => ({ type: 'sit' });
    bean.mind.requestGrab = () => 'dodge'; world.world.nextCritter = Infinity; fixture.advance(0);
    const target = { closest: () => null };
    function tryGrab() {
      const p = bean.body.headPos;
      document.emit('pointermove', { clientX: p[0], clientY: p[1], timeStamp: performance.now(), target });
      document.emit('pointerdown', { button: 0, clientX: p[0], clientY: p[1], target, preventDefault() {} });
      document.emit('pointermove', { clientX: p[0] + 16, clientY: p[1], timeStamp: performance.now() + 8, target });
    }
    world.world.speechAt = 1000; tryGrab();
    assert.equal(world.world.drag, null);
    assert.ok(bean.bubble?.pickup, 'explicit input feedback bypasses ambient speech throttling');
    assert.match(bean.bubble.text, /uppies|paws here/);
    assert.equal(document.documentElement.classList.contains('cat-carrying'), false);
    const x = bean.body.x, turns = new Set();
    for (let i = 0; i < 13; i++) {
      fixture.advance(50); turns.add(Math.sign(bean.body.goal.headYaw));
      assert.equal(bean.body.x, x, 'the refusal gesture precedes the escape');
      assert.equal(bean.body.goal.offerPaw, 1);
    }
    assert.ok(turns.has(-1) && turns.has(1), 'a readable no gesture turns both ways');
    const plan = bean.plan, pressure = bean.mind.handling.pressure;
    bean.bubble = null; tryGrab();
    assert.equal(bean.plan, plan, 'retrying does not restart the refusal');
    assert.equal(bean.mind.handling.pressure, pressure);
    assert.equal(bean.bubble.text, 'a little space, please.', 'busy input is acknowledged too');
    for (let i = 0; i < 100; i++) fixture.advance(50);
    assert.ok(Math.abs(bean.body.x - x) > 60, 'Bean dodges after showing his intention');
    assert.equal(bean.body.goal.recoil, 0);
    assert.equal(bean.body.goal.offerPaw, 0);
    assert.equal(bean.phase, null);
    tryGrab(); fixture.advance(50);
    assert.equal(bean.body.goal.offerPaw, 1);
    world.calm(true);
    assert.equal(bean.body.goal.recoil, 0, 'interrupting the gesture releases its weight shift');
    assert.equal(bean.body.goal.offerPaw, 0, 'interrupting the gesture releases the raised paw');
    assert.equal(bean.body.goal.headYaw, 0);
  } finally { world.destroy(); }
});

for (const end of ['leave', 'outside release', 'cancel']) test(`${end} clears held input without a stale carry or accidental boop`, t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0); bean.mind.requestGrab = () => 'accept';
    const target = { closest: () => null }, p = bean.body.headPos;
    const down = () => document.emit('pointerdown', { button: 0, clientX: p[0], clientY: p[1], target, preventDefault() {} });
    document.emit('pointermove', { clientX: p[0], clientY: p[1], buttons: 0, target });
    down();
    const boops = bean.mind.stats.boops;
    document.emit('pointercancel', { type: 'pointercancel' });
    assert.equal(world.world.press, null);
    assert.equal(bean.mind.stats.boops, boops, 'cancelling a pending click is not a boop');
    down();
    document.emit('pointermove', { clientX: p[0] + 16, clientY: p[1], buttons: 1, target });
    fixture.advance(50);
    assert.equal(world.world.drag?.cat, bean);
    if (end === 'leave') document.documentElement.emit('pointerleave');
    else if (end === 'cancel') document.emit('pointercancel', { type: 'pointercancel' });
    else document.emit('pointermove', { clientX: 1000, clientY: 200, buttons: 0, target });
    assert.equal(world.world.drag, null);
    assert.equal(bean.mind.handling.held, false);
    assert.equal(document.documentElement.classList.contains('cat-carrying'), false);
    assert.equal(bean.body.jump.type, 'fall', 'lost input settles gently rather than flinging');
    assert.ok(bean.body.jump.x1 < 900, 'an outside release never snaps to the returning pointer');
  } finally { world.destroy(); }
});

test('accepted dragging carries release momentum, while a paused hand places Bean gently', t => {
  const fixture = habitat(t, { visits: 1 });
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  const target = { closest: () => null };
  const move = (x, y) => document.emit('pointermove', { clientX: x, clientY: y, timeStamp: performance.now(), target });
  function pickUp() {
    const p = bean.body.headPos;
    move(p[0], p[1]);
    document.emit('pointerdown', { button: 0, clientX: p[0], clientY: p[1], target, preventDefault() {} });
    fixture.advance(50); move(p[0] + 15, p[1]); fixture.advance(50);
    assert.ok(world.world.drag);
  }
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 350;
    bean.mind.choose = () => ({ type: 'sit' }); bean.mind.requestGrab = () => 'accept'; world.world.nextCritter = Infinity;
    fixture.advance(0); pickUp();
    move(400, 320); fixture.advance(50); move(450, 250); fixture.advance(50); move(510, 180);
    document.emit('pointerup', { type: 'pointerup' });
    assert.equal(world.world.drag, null);
    assert.equal(bean.body.jump.type, 'throw');
    assert.ok(bean.body.jump.x1 > bean.body.x + 100, 'the release keeps horizontal momentum');
    assert.ok(bean.body.jump.velocityY < 0, 'an upward fling initially rises');
    for (let i = 0; i < 140; i++) fixture.advance(50);
    assert.equal(bean.at.kind, 'floor');
    assert.equal(bean.body.jump, null);
    assert.equal(bean.mind.inspect().handling.held, false);
    pickUp(); move(600, 350);
    for (let i = 0; i < 6; i++) fixture.advance(50);
    document.emit('pointerup', { type: 'pointerup' });
    assert.equal(bean.body.jump.type, 'fall');
    assert.equal(bean.body.jump.x1, bean.body.x, 'a held-still hand does not launch stale velocity');
  } finally { world.destroy(); }
});

for (const change of ['remove', 'move']) test(`a pursuit landing recovers when its target ${change}s during flight`, t => {
  const fixture = habitat(t, { visits: 1 });
  const low = fixture.ledge('low', 200, 650, 210);
  location.search = '?catdebug';
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 240; bean.mind.choose = () => ({ type: 'sit' });
    fixture.advance(0); world.world.nextCritter = Infinity;
    world.world.critter = { x: 300, y: 530, dir: 0, t: 0, flap: 0, hue: '#fff', life: 60 };
    world.play('Bean', 'hunt');
    for (let i = 0; i < 200 && bean.at.then?.el !== low; i++) fixture.advance(50);
    assert.equal(bean.at.then?.el, low, 'the jump owns its intended landing');
    if (change === 'remove') low.removed = true; else low.layout.left += 500;
    world.world.critter.gone = true;
    for (let i = 0; i < 90; i++) fixture.advance(50);
    assert.equal(bean.at.kind, 'floor', 'recovery must not snap onto the stale ledge');
    assert.equal(bean.body.jump, null);
    assert.ok(bean.body.gy > 800);
  } finally { world.destroy(); }
});

test('removing a panel during a wall climb releases the wall transform and lands safely', t => {
  const fixture = habitat(t, { visits: 1 });
  const panel = fixture.ledge('panel', 500, 200, 350, 500, true);
  location.search = '?catdebug';
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 470; bean.mind.choose = () => ({ type: 'sit' });
    fixture.advance(0); world.world.nextCritter = Infinity;
    world.world.critter = { x: 650, y: 140, dir: 0, t: 0, flap: 0, hue: '#fff', life: 60 };
    world.play('Bean', 'hunt');
    for (let i = 0; i < 250 && bean.at.kind !== 'wall'; i++) fixture.advance(50);
    assert.equal(bean.at.kind, 'wall');
    panel.removed = true; world.world.critter.gone = true;
    fixture.advance(50);
    assert.equal(bean.xf, null, 'the fall is no longer drawn sideways');
    assert.equal(bean.body.drive, null);
    for (let i = 0; i < 100; i++) fixture.advance(50);
    assert.equal(bean.at.kind, 'floor');
    assert.equal(bean.body.jump, null);
    assert.equal(bean.body.noShadow, false);
  } finally { world.destroy(); }
});

for (const phase of ['hang', 'behind']) test(`removing cover during ${phase} recovers even at escape priority`, t => {
  const fixture = habitat(t, { visits: 1 });
  fixture.ledge('low', 200, 650, 210); fixture.ledge('middle', 520, 450, 210);
  const cover = fixture.ledge('cover', 880, 230, 300, 180, true);
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    bean.at = { kind: 'floor' }; bean.body.x = 250; bean.mind.choose = () => ({ type: 'sit' });
    bean.mind.requestGrab = () => 'flee'; world.world.nextCritter = Infinity;
    fixture.advance(0);
    const target = { closest: () => null }, p = bean.body.headPos;
    document.emit('pointermove', { clientX: p[0], clientY: p[1], timeStamp: 0, target });
    document.emit('pointerdown', { button: 0, clientX: p[0], clientY: p[1], target, preventDefault() {} });
    document.emit('pointermove', { clientX: p[0] + 20, clientY: p[1], timeStamp: 50, target });
    for (let i = 0; i < 700 && bean.at.kind !== phase; i++) fixture.advance(50);
    assert.equal(bean.at.kind, phase);
    assert.equal(bean.prio, 90);
    cover.removed = true;
    for (let i = 0; i < 250; i++) fixture.advance(50);
    assert.equal(bean.at.kind, 'floor');
    assert.equal(bean.body.jump, null);
    assert.equal(bean.body.hangPaws, null);
    assert.equal(bean.forceMask, false);
    assert.equal(bean.phase, null);
  } finally { world.destroy(); }
});

test('Calm and teardown release real held state; reduced-motion refusal stays still', t => {
  const fixture = habitat(t, { visits: 1 }, false, true);
  const world = bootCats({ seed: 42 }), bean = world.cats[0];
  try {
    fixture.advance(0);
    bean.mind.carried(); bean.mind.begin('carried'); bean.prio = 100;
    world.world.drag = { cat: bean, vx: 900, vy: -300, inputAt: performance.now() };
    world.world.pointer = { x: 500, y: 300 };
    world.calm(true);
    assert.equal(world.world.drag, null);
    assert.equal(bean.mind.inspect().handling.held, false);
    assert.notEqual(bean.body.jump.type, 'throw');
    world.calm(false);
    for (let i = 0; i < 50; i++) fixture.advance(50);
    bean.mind.requestGrab = () => 'dodge'; bean.mind.choose = () => ({ type: 'sit' });
    bean.prio = 0;
    const target = { closest: () => null }, p = bean.body.headPos, x = bean.body.x;
    document.emit('pointermove', { clientX: p[0], clientY: p[1], timeStamp: performance.now(), target });
    document.emit('pointerdown', { button: 0, clientX: p[0], clientY: p[1], target, preventDefault() {} });
    document.emit('pointermove', { clientX: p[0] + 20, clientY: p[1], timeStamp: performance.now() + 50, target });
    for (let i = 0; i < 25; i++) fixture.advance(50);
    assert.equal(bean.body.x, x);
    assert.equal(bean.body.jump, null);
    assert.equal(world.world.drag, null);
    bean.mind.carried(); bean.mind.begin('carried'); world.world.drag = { cat: bean };
    world.destroy();
    assert.equal(world.world.drag, null);
    assert.equal(bean.mind.inspect().handling.held, false);
    assert.equal(fixture.frames.size, 0);
  } finally { world.destroy(); }
});

function refuseVisibleScreenPeek(fixture, world, edge = 'bottom') {
  const bean = world.cats[0], target = { closest: () => null };
  bean.mind.choose = () => ({ type: 'sit' }); bean.mind.requestGrab = () => 'dodge';
  world.world.nextCritter = Infinity;
  fixture.advance(0); world.peekIn('Bean'); fixture.advance(50);
  assert.ok(bean.peek);
  // Fix geometry at each edge while retaining the real peek generator/rig.
  Object.assign(bean.peek, { edge, u: edge === 'left' || edge === 'right' ? 450 : 600, amt: .9, goal: .9 });
  fixture.advance(0);
  const pk = bean.peek, p = world.pos('Bean');
  const x = Math.max(5, Math.min(innerWidth - 5, p.x)), y = Math.max(5, Math.min(innerHeight - 5, p.y));
  document.emit('pointermove', { clientX: x, clientY: y, timeStamp: performance.now(), buttons: 0, target });
  document.emit('pointerdown', { button: 0, clientX: x, clientY: y, timeStamp: performance.now(), target, preventDefault() {} });
  assert.ok(world.world.press, 'the visible part of the peeking cat can be grabbed');
  const before = { x: bean.body.x, y: bean.body.gy };
  document.emit('pointermove', { clientX: x + (x > innerWidth - 32 ? -16 : 16), clientY: y,
    timeStamp: performance.now() + 8, buttons: 1, target });
  assert.equal(world.world.drag, null);
  assert.equal(bean.peek, pk, 'refusal retains the same window edge');
  assert.deepEqual({ x: bean.body.x, y: bean.body.gy }, before, 'refusal does not relocate Bean');
  assert.ok(bean.bubble?.pickup, 'the acknowledgment remains visible while Bean is peeking');
  return { bean, pk, plan: bean.plan };
}

for (const edge of ['bottom', 'top', 'left', 'right']) test(`a refused ${edge}-edge pickup stays visible before ducking back out`, t => {
  const fixture = habitat(t, { visits: 1 }); location.search = '?catdebug';
  const world = bootCats({ seed: 42 });
  try {
    const { bean, pk, plan } = refuseVisibleScreenPeek(fixture, world, edge);
    const turns = new Set();
    for (let i = 0; i < 13; i++) {
      fixture.advance(50); turns.add(Math.sign(bean.body.goal.headYaw));
      assert.equal(bean.peek, pk);
      assert.equal(bean.at.kind, 'away');
      assert.ok(pk.amt > .8, 'the face stays out while saying no');
      assert.equal(bean.body.goal.offerPaw, 1);
      assert.equal(bean.body.jump, null);
      assert.ok(bean.bubble?.pickup);
    }
    assert.ok(turns.has(-1) && turns.has(1));
    for (let i = 0; i < 40 && bean.phase !== 'ducking out of reach'; i++) fixture.advance(50);
    assert.equal(bean.phase, 'ducking out of reach');
    const visibleAmount = pk.amt;
    for (let i = 0; i < 4; i++) fixture.advance(50);
    assert.ok(pk.amt < visibleAmount, 'retreat follows the same edge continuously');
    for (let i = 0; i < 40 && bean.peek; i++) fixture.advance(50);
    assert.equal(bean.peek, null);
    assert.equal(bean.at.kind, 'away', 'the retreat finishes offscreen, not on a phantom floor');
    assert.equal(bean.xf, null); assert.equal(bean.edgePaws, null);
    for (let i = 0; i < 80 && bean.plan === plan; i++) fixture.advance(50);
    assert.notEqual(bean.plan, plan, 'the normal return flow resumes after a short pause');
    assert.equal(bean.phase, null);
    assert.equal(bean.body.goal.recoil, 0); assert.equal(bean.body.goal.offerPaw, 0);
  } finally { world.destroy(); }
});

for (const stop of ['calm', 'destroy']) for (const phase of ['immediate', 'acting', 'ducking']) {
  test(`${stop} cleans a screen-peek refusal during ${phase}`, t => {
    const fixture = habitat(t, { visits: 1 }); location.search = '?catdebug';
    const world = bootCats({ seed: 42 });
    try {
      const { bean } = refuseVisibleScreenPeek(fixture, world, 'left');
      if (phase === 'acting') for (let i = 0; i < 6; i++) fixture.advance(50);
      if (phase === 'ducking') {
        for (let i = 0; i < 50 && bean.phase !== 'ducking out of reach'; i++) fixture.advance(50);
        assert.equal(bean.phase, 'ducking out of reach');
      }
      if (stop === 'calm') world.calm(true); else world.destroy();
      assert.equal(bean.peek, null); assert.equal(bean.xf, null); assert.equal(bean.edgePaws, null);
      assert.equal(bean.phase, null); assert.equal(bean.bubble, null);
      for (const channel of ['recoil', 'offerPaw', 'headYaw', 'headPitch', 'headRoll', 'earsBack']) assert.equal(bean.body.goal[channel], 0, channel);
      assert.equal(bean.mind.handling.held, false);
      if (stop === 'destroy') assert.equal(fixture.frames.size, 0);
    } finally { world.destroy(); }
  });
}
