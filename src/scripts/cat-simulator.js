import { CatScene } from './mascot-scene.js';
import { CAST, CatDirector, StoryClock, videoVibe } from './cat-director.js';
import { clamp, spring } from './mascot-motion.js';

let active;
export function bootCatSimulator() {
  if (active && !active.scene.destroyed) return active;
  const universe = document.getElementById('cat-universe');
  if (!universe) return null;
  universe.hidden = false;
  document.body.classList.add('cat-simulation');
  // Retain the original layout as anchor geometry without duplicate tab stops.
  const legacyCats = [...document.querySelectorAll('.mascot-cast .mascot,.room-pal .mascot')];
  legacyCats.forEach(el => { el.tabIndex = -1; el.setAttribute('aria-hidden', 'true'); });
  const world = document.getElementById('cat-world');
  const scene = new CatScene(world, { travel: true, world: true });
  const brain = new CatDirector(), clock = new StoryClock();
  const cats = Object.fromEntries([...world.querySelectorAll('.sim-actor')].map(root => {
    const a = scene.add(root.querySelector('.mascot'), root);
    a.depth = root.querySelector('.sim-depth'); a.bubble = root.querySelector('.sim-bubble');
    a.zoom = { value: 1, velocity: 0 }; a.angle = { value: 0, velocity: 0 }; a.camera = { zoom: 1, angle: 0 };
    return [a.kind, a];
  }));
  const $ = id => document.getElementById(id), listen = (...args) => scene.listen(...args);
  const animations = new Set(), scuffs = $('cat-scratch-lines'), toy = $('cat-toy'), impact = $('cat-impact');
  let wallpaper = false, toyMode = false, drag = null, noClick = null, lastPointer = null, pointerAt = 0, lastScare = 0;
  let nextStory = 5, statusAt = 0, seen = null, title = '', override = 'auto', chase = null, peekCount = 0, idleSince = performance.now();
  let panelOpen = false, watchingDialog = false, suppressPointerUntil = 0;
  const room = document.body.classList.contains('room-page');

  function say(a, text, seconds = 3.5) {
    a.bubble.textContent = text; a.bubble.dataset.visible = 'true'; a.speakingUntil = brain.time + seconds;
    clearTimeout(a.speechTimer); scene.timers.delete(a.speechTimer);
    if (!scene.motion) a.speechTimer = scene.after(() => { a.bubble.dataset.visible = 'false'; }, seconds * 1000);
  }
  function act(kind, move, text, options = {}) {
    const a = cats[kind];
    if (a.play(move, { priority: 45, force: true, ...options }) && text) say(a, text);
    return a;
  }
  function status(kind, text) { brain.cats[kind].status = text; }
  function camera(a, zoom = 1, angle = 0) { a.camera = { zoom, angle }; }
  function place(a, x, y, speed = 3.5) { a.travelSpeed = speed; a.moveTo(x, y); }
  function floor() { return innerHeight - (innerWidth <= 600 ? 180 : 225); }
  function baseHomes() {
    const w = innerWidth, h = innerHeight, small = w <= 600;
    if (!wallpaper && !room && scrollY < 450) {
      const homes = {};
      for (const [kind, a] of Object.entries(cats)) {
        const anchor = document.querySelector(`.cast-${kind} .mascot`)?.getBoundingClientRect();
        homes[kind] = anchor ? { x: clamp(anchor.x + (anchor.width - a.origin.right) / 2, 4, w - a.origin.right - 4), y: clamp(anchor.bottom - a.origin.bottom, 60, h - a.origin.bottom - 66) } : { x: w * .2, y: floor() };
      }
      return homes;
    }
    return { mint: { x: w * .1 - (small ? 0 : 30), y: floor() }, pink: { x: w * .72 - (small ? 20 : 0), y: floor() - 12 }, purple: { x: w * .42, y: floor() + 10 } };
  }
  function home(snap = false) {
    const homes = baseHomes();
    for (const [kind, a] of Object.entries(cats)) {
      a.cinematic = false; a.root.dataset.cinematic = 'false'; camera(a);
      // Re-enter the viewport before releasing cinematic bounds; otherwise the
      // next collision clamp would replace the journey home with the edge.
      if (!snap) a.position = a.constrain(a.position);
      const point = homes[kind];
      a.target = a.constrain(point);
      if (snap) { a.position = { ...a.target }; a.velocity = { x: 0, y: 0 }; a.root.style.translate = `${a.position.x}px ${a.position.y}px`; a.zoom = { value: 1, velocity: 0 }; a.angle = { value: 0, velocity: 0 }; a.depth.style.transform = ''; }
    }
  }
  function clearEffects() {
    animations.forEach(a => a.cancel()); animations.clear(); scuffs.replaceChildren(); impact.style.opacity = '0';
    scene.effects.forEach(e => { e.animation.cancel(); e.el.remove(); }); scene.effects.clear();
  }
  function releaseDrag() {
    if (!drag) return;
    const { a, id } = drag; drag = null;
    a.el.classList.remove('is-carried'); if (a.el.hasPointerCapture(id)) a.el.releasePointerCapture(id);
  }
  function cancel({ reset = false } = {}) {
    clock.clear(); chase = null; releaseDrag(); clearEffects();
    for (const a of Object.values(cats)) { a.stop(); a.bubble.dataset.visible = 'false'; a.setBase(document.body.dataset.playback || 'idle'); status(a.kind, 'Watching the room'); }
    home(reset); nextStory = brain.time + 9; world.dataset.story = 'rest';
  }
  function animate(el, frames, options) {
    if (!scene.motion || !el) return;
    const animation = el.animate(frames, options); animations.add(animation);
    animation.finished.then(() => {}, () => {}).finally(() => { animations.delete(animation); animation.cancel(); });
  }
  function burst(x, y) {
    impact.style.left = `${x - 35}px`; impact.style.top = `${y - 35}px`;
    animate(impact, [{ opacity: 0, transform: 'scale(.2) rotate(-30deg)' }, { opacity: .95, transform: 'scale(1) rotate(25deg)', offset: .25 }, { opacity: 0, transform: 'scale(1.4) rotate(75deg)' }], { duration: 800 });
  }
  function sequence(name, beats, duration, user = false) {
    if (!scene.motion || drag || (!user && clock.current)) return false;
    cancel(); brain.record(name); world.dataset.story = name;
    clock.start(name, brain.time * 1000, beats.map(([at, run]) => ({ at, run })), duration, user ? 70 : 30);
    nextStory = brain.time + duration / 1000 + (brain.context.intensity === 'chaos' ? 4 : brain.context.intensity === 'watch' ? 22 : 10);
    $('cat-story-label').textContent = {
      peek: 'Pixel has noticed the other side of the glass.', squabble: 'Mochi started it. Miso will finish it.',
      mischief: 'Mochi tests gravity. Miso repairs the damage.', dance: 'Mochi takes the stage. Pixel pretends not to care.',
      leave: 'The critic has left the room. Temporarily.', snack: 'One snack. Three conflicting priorities.',
      nap: 'Pixel clocks out. Miso stands guard.', patrol: 'Miso inspects. Mochi follows. Pixel supervises.',
    }[name] || 'Make yourself at home.';
    clock.tick(brain.time * 1000); return true;
  }
  function story(name, user = false) {
    if (!scene.motion) { say(cats.purple, 'on my union break.'); return false; }
    const w = innerWidth, y = floor(), small = w <= 600;
    const mid = w * .46 - cats.pink.origin.right / 2;
    const m = cats.mint, p = cats.pink, v = cats.purple;
    if (name === 'snack') return sequence(name, [
      [0, () => { place(p, w * .64, y); place(v, w * .35, y); act('pink', 'snack', 'i brought exactly one.'); status('pink', 'Negotiating snack custody'); status('purple', 'Expecting table service'); }],
      [2200, () => { act('pink', 'toss', 'fine. catch.', { mirror: true }); v.lookAt(p.el, 2500); }],
      [2850, () => scene.throwSnack(p, v, () => { act('purple', 'catch', 'as it should be.'); burst(v.position.x + 50, v.position.y + 30); })],
      [4300, () => { act('purple', 'snack', 'five stars.'); act('mint', 'reach', 'sharing is a process.'); }],
      [7100, () => { act('pink', 'sulk', 'i regret everything.'); home(); }],
    ], 10000, user);
    if (name === 'dance') return sequence(name, [
      [0, () => { place(p, mid, y, 4); status('pink', 'Performing for an audience of two'); status('purple', 'Definitely not enjoying this'); act('pink', 'flex', 'this is my part.'); }],
      [1600, () => { act('pink', 'dance', 'watch the footwork.'); camera(p, 1.25); act('mint', 'greet', 'you have an audience.'); }],
      [4000, () => { act('pink', 'dance'); place(p, mid + 45, y, 5); act('purple', 'sulk', 'technically off-beat.'); }],
      [6800, () => { act('purple', 'dance', 'this proves nothing.'); act('pink', 'flex'); place(p, mid - 40, y, 5); }],
      [9600, () => { act('mint', 'dance'); act('pink', 'dance'); }],
      [12500, () => { act('pink', 'greet', 'thank you, tiny people.'); home(); }],
    ], 15000, user);
    if (name === 'squabble') return sequence(name, [
      [0, () => { place(p, mid - 75, y); place(v, mid + 75, y); act('pink', 'swat', 'boop.'); act('purple', 'sulk', 'choose your next move.'); status('pink', 'Testing Pixel’s patience'); status('purple', 'Patience has expired'); }],
      [2200, () => { place(p, mid + 15, y, 7); act('pink', 'pounce'); act('purple', 'startle', 'you chose poorly.'); }],
      [3100, () => { burst(mid + 80, y + 45); chase = { until: brain.time + 4.7, start: brain.time, nextBump: brain.time + 1.3, kind: 'squabble' }; }],
      [8000, () => { chase = null; place(m, mid, y - 10, 5); place(p, mid - 120, y); place(v, mid + 115, y); act('mint', 'flex', 'paws. to yourselves.'); status('mint', 'Restoring diplomatic relations'); }],
      [10500, () => { act('pink', 'groom', 'wasn’t me.'); act('purple', 'sulk', 'there are witnesses.'); home(); }],
    ], 14000, user);
    if (name === 'peek') {
      const edge = ['bottom', 'left', 'top', 'right'][peekCount++ % 4];
      return sequence(name, [
        [0, () => { v.cinematic = true; v.root.dataset.cinematic = 'true'; status('purple', 'Investigating the fourth wall'); act('purple', 'sulk', 'who is watching whom?'); place(v, w + 260, y, 4); }],
        [2400, () => {
          camera(v, small ? 2.3 : 3.6, edge === 'top' ? 180 : edge === 'left' ? 80 : edge === 'right' ? -80 : 0);
          const positions = { bottom: [w * .48 - 66, innerHeight + 330], top: [w * .53 - 66, -480], left: [-480, innerHeight * .38], right: [w + 380, innerHeight * .38] };
          const [x, yy] = positions[edge]; v.position = { x, y: yy }; v.target = { x, y: yy }; v.velocity = { x: 0, y: 0 };
        }],
        [2800, () => {
          const positions = { bottom: [w * .48 - 66, innerHeight + (small ? 12 : 65)], top: [w * .53 - 66, small ? -195 : -275], left: [small ? -120 : -220, innerHeight * .38], right: [w - (small ? 5 : -50), innerHeight * .38] };
          place(v, ...positions[edge], 2.2); act('purple', 'reach'); m.lookAt(v.el, 9000); p.lookAt(v.el, 9000); act('mint', 'startle', 'pixel. personal space.');
        }],
        [5800, () => { act('purple', 'swat'); burst(w * .52, innerHeight * .8); }],
        [8200, () => { place(v, edge === 'left' ? -600 : w + 550, y, 3); }],
        [10400, () => { camera(v); v.position = { x: w + 150, y }; v.velocity = { x: 0, y: 0 }; v.cinematic = false; v.root.dataset.cinematic = 'false'; home(); say(v, 'your side is weird.'); }],
      ], 13500, user);
    }
    if (name === 'mischief') {
      const target = document.querySelector(wallpaper ? '.habitat-sign' : room ? '.playlist-heading h2' : '.hangout-heading');
      const box = target?.getBoundingClientRect();
      const tx = box ? clamp(box.left + box.width * .7, 50, w - 170) : mid;
      const ty = box ? clamp(box.bottom - 55, 100, y) : y;
      return sequence(name, [
        [0, () => { status('pink', 'Testing the structural integrity of this website'); act('pink', 'flex', 'load-bearing? let’s see.'); place(p, tx, ty, 3.8); }],
        [2400, () => {
          act('pink', 'swat'); burst(tx + 50, ty + 40);
          animate(target, [{ transform: 'rotate(0)' }, { transform: 'rotate(9deg) translateY(22px)', offset: .1 }, { transform: 'rotate(7deg) translateY(18px)', offset: .7 }, { transform: 'rotate(-2deg)', offset: .87 }, { transform: 'rotate(0)' }], { duration: 6400, easing: 'ease-in-out' });
          for (let i = 0; i < 3; i++) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); const x = tx + 10 + i * 16; path.setAttribute('d', `M${x},${ty + 5}l-13,21 5,3 -15,21`); scuffs.append(path); }
          say(p, 'it was like that.');
        }],
        [4100, () => { place(m, tx - 90, ty + 10, 5); act('mint', 'startle', 'we LIVE here, mochi.'); status('mint', 'Repairing Mochi’s latest decision'); act('purple', 'sulk', 'deduct it from his snacks.'); }],
        [6100, () => { act('mint', 'groom', 'a little paw polish…'); place(p, w * .75, y, 4); }],
        [8700, () => { scuffs.replaceChildren(); act('mint', 'greet', 'good as new.'); home(); }],
      ], 11500, user);
    }
    if (name === 'leave') return sequence(name, [
      [0, () => { status('purple', 'Taking a very pointed intermission'); act('purple', 'sulk', 'i’ll be in a better video.'); v.cinematic = true; }],
      [2000, () => { place(v, w + 240, y, 2.5); act('mint', 'reach', 'we saved your spot.'); }],
      [11000, () => { camera(v, .58); v.position = { x: -200, y: y - 75 }; place(v, w * .25, y - 75, 2.8); say(p, 'dramatic entrance in 3…'); status('purple', 'Returning as if nothing happened'); }],
      [15000, () => { camera(v); v.cinematic = false; home(); act('purple', 'groom', 'i forgot my snacks.'); }],
    ], 18500, user);
    if (name === 'nap') {
      const tired = Object.keys(cats).sort((a, b) => brain.cats[a].energy - brain.cats[b].energy)[0];
      const sleeper = brain.cats[tired].energy < 30 ? tired : 'purple';
      const guard = sleeper === 'mint' ? 'purple' : 'mint', sneak = sleeper === 'pink' ? 'purple' : 'pink';
      return sequence(name, [
        [0, () => { place(cats[sleeper], w * .36, y + 10); act(sleeper, 'stretch', brain.context.vibe === 'talk' ? 'wake me for the conclusion.' : 'reviewing my eyelids.'); status(sleeper, 'Napping'); }],
        [2700, () => { act(sleeper, 'sleep', null, { hold: true }); camera(cats[sleeper], .9, -8); place(cats[guard], w * .24, y); act(guard, 'groom', 'quiet. friend recharging.'); status(guard, 'Keeping watch'); }],
        [6500, () => { act(sneak, 'tiptoe', 'i can be subtle.'); place(cats[sneak], w * .52, y, 1); status(sneak, 'Attempting to be subtle'); }],
        [15000, () => { act(sleeper, 'stretch', 'i heard that.'); home(); }],
      ], 18500, user);
    }
    return sequence('patrol', [
      [0, () => { place(m, w * .36, y, 2); status('mint', 'Checking on everyone'); act('mint', 'greet', 'all paws accounted for?'); }],
      [2100, () => { place(p, w * .5, y, 2.8); camera(p, .8); status('pink', 'Following suspiciously'); act('pink', 'tiptoe', 'nothing suspicious here.'); }],
      [5100, () => { place(m, w * .24, y, 3); act('mint', 'groom'); act('purple', 'sulk', 'i supervise. from here.'); }],
      [8500, () => home()],
    ], 10500, user);
  }

  function updateContext() {
    const hint = videoVibe(title, override);
    brain.context.playing = document.body.dataset.playback === 'playing'; brain.context.vibe = hint.kind;
    scene.ambient = brain.context.intensity !== 'watch' || !brain.context.playing;
    $('cat-context-note').textContent = `${hint.source}${hint.kind !== 'unknown' ? ': ' + hint.kind : ''}. Reactions use titles and playback, not audio analysis.`;
    if (brain.context.playing && ['music', 'action', 'chill'].includes(hint.kind)) nextStory = Math.min(nextStory, brain.time + 1.5);
    for (const a of Object.values(cats)) a.setBase(document.body.dataset.playback || 'idle');
  }
  function setWallpaper(value) {
    cancel(); wallpaper = value; brain.context.wallpaper = value;
    document.body.classList.toggle('cat-wallpaper', value); $('cat-wallpaper-btn').setAttribute('aria-pressed', String(value)); $('cat-wallpaper-btn').textContent = value ? (room ? 'Back to room' : 'Back to site') : 'Wallpaper';
    const url = new URL(location.href); if (value) url.searchParams.set('wallpaper', '1'); else url.searchParams.delete('wallpaper'); history.replaceState(history.state, '', url);
    for (const el of document.querySelectorAll(room ? '.room-nav,.playlist-column' : '.home-main,.site-footer')) el.inert = value;
    scene.measure(); home(true); nextStory = brain.time + 1.5;
  }
  function setPanel(value) { panelOpen = value; $('cat-studio').hidden = !value; $('cat-studio-btn').setAttribute('aria-expanded', String(value)); idleSince = performance.now(); }
  function setToy(value) { toyMode = value; $('cat-toy-btn').setAttribute('aria-pressed', String(value)); toy.dataset.visible = String(value && !!scene.pointer); if (!value) home(); }
  function pause() { scene.setCalm(!scene.calm); if (!scene.calm) { home(true); nextStory = brain.time + 2; } }
  const updatePause = () => { $('cat-pause-btn').textContent = scene.calm ? 'Wake cats' : 'Pause cats'; $('cat-pause-btn').setAttribute('aria-pressed', String(scene.calm)); if ($('cat-calm-btn')) { $('cat-calm-btn').textContent = scene.calm ? 'Wake cats' : 'Calm cats'; $('cat-calm-btn').setAttribute('aria-pressed', String(scene.calm)); } };
  listen($('cat-studio-btn'), 'click', () => setPanel(!panelOpen)); listen($('cat-studio-close'), 'click', () => { setPanel(false); $('cat-studio-btn').focus(); });
  listen($('cat-wallpaper-btn'), 'click', () => setWallpaper(!wallpaper));
  listen($('cat-pause-btn'), 'click', pause); listen($('cat-calm-btn'), 'click', pause);
  listen($('cat-reset'), 'click', () => { cancel(); setToy(false); });
  listen($('cat-toy-btn'), 'click', () => { cancel(); setToy(!toyMode); });
  listen($('cat-snack-btn'), 'click', () => story('snack', true));
  universe.querySelectorAll('[data-cat-scene]').forEach(el => listen(el, 'click', () => { setToy(false); story(el.dataset.catScene, true); }));
  listen($('cat-intensity'), 'change', e => { brain.context.intensity = e.target.value; cancel(); updateContext(); nextStory = brain.time + 1; try { localStorage.setItem('youple-cat-intensity', e.target.value); } catch {} });
  listen($('cat-vibe'), 'change', e => { override = e.target.value; cancel(); updateContext(); if (override !== 'auto') story(({ music: 'dance', chill: 'nap', talk: 'leave', action: 'squabble' })[override], true); });
  try { const saved = localStorage.getItem('youple-cat-intensity'); if (['watch', 'play', 'chaos'].includes(saved)) { brain.context.intensity = saved; $('cat-intensity').value = saved; } } catch {}

  for (const a of Object.values(cats)) {
    a.el.title = `${CAST[a.kind].name} · ${CAST[a.kind].role}. Pet or drag.`;
    listen(a.el, 'click', () => {
      if (noClick === a) { noClick = null; return; }
      cancel(); brain.pet(a.kind); status(a.kind, 'Accepting affection');
      act(a.kind, a.kind === 'pink' ? 'flex' : 'pet', { mint: 'you’re one of us now.', pink: 'yes. admire the talent.', purple: 'this changes nothing.' }[a.kind], { priority: 75 });
    });
    listen(a.el, 'pointerdown', e => {
      if (e.button !== 0 || !scene.motion) return;
      cancel(); noClick = null; a.target = { ...a.position };
      drag = { a, id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...a.position }, moved: false };
      a.el.setPointerCapture(e.pointerId);
    });
    listen(a.el, 'pointermove', e => {
      if (drag?.a !== a || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 7) { drag.moved = true; noClick = a; act(a.kind, 'carry', 'this was not in my contract.', { priority: 90, hold: true }); a.el.classList.add('is-carried'); status(a.kind, 'Being abducted by the viewer'); }
      if (drag.moved) place(a, drag.start.x + dx, drag.start.y + dy);
    });
    const drop = e => {
      if (drag?.a !== a || e.pointerId !== drag.id) return;
      const moved = drag.moved; releaseDrag();
      if (moved) { a.stop(); act(a.kind, 'land', 'i meant to do that.', { priority: 75 }); nextStory = brain.time + 9; suppressPointerUntil = brain.time + 1; scene.after(() => { if (noClick === a) noClick = null; }, 150); }
    };
    listen(a.el, 'pointerup', drop); listen(a.el, 'pointercancel', drop); listen(a.el, 'lostpointercapture', drop);
  }
  listen(document, 'pointermove', e => {
    idleSince = performance.now(); if (e.pointerType === 'touch') return;
    const now = performance.now(), p = { x: e.clientX, y: e.clientY };
    scene.pointer = p; pointerAt = brain.time;
    const ui = e.target.closest?.('.cat-dock,button,input,select,a,dialog');
    if (!ui && !drag && scene.motion && brain.time > suppressPointerUntil && now - lastScare > 6000 && lastPointer) {
      const speed = Math.hypot(p.x - lastPointer.x, p.y - lastPointer.y) / Math.max(8, now - lastPointer.t);
      const m = cats.mint, near = Math.hypot(p.x - m.position.x - 65, p.y - m.position.y - 65) < 180;
      if (speed > 1.8 && near && brain.cats.mint.trust < 74) { cancel(); act('mint', 'startle', 'gentle cursor, please.'); place(m, m.position.x + (p.x > m.position.x + 65 ? -170 : 170), floor(), 7); status('mint', 'Evading a very large cursor'); lastScare = now; }
      else if (!clock.current && brain.context.intensity !== 'watch' && Math.hypot(p.x - cats.pink.position.x - 65, p.y - cats.pink.position.y - 65) < 140) {
        act('pink', 'pounce', 'a wild cursor appeared.'); place(cats.pink, p.x - 60, p.y - 85, 6); status('pink', 'Stalking the cursor'); lastScare = now; nextStory = brain.time + 7;
      }
    }
    lastPointer = { ...p, t: now };
  }, { passive: true });
  listen(document.documentElement, 'pointerleave', () => { scene.pointer = null; toy.dataset.visible = 'false'; });
  listen(document, 'keydown', e => { idleSince = performance.now(); if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { cancel(); setToy(false); if (panelOpen) { setPanel(false); $('cat-studio-btn').focus(); } else if (wallpaper) setWallpaper(false); } });
  listen(window, 'resize', () => { cancel({ reset: true }); });
  listen(window, 'scroll', () => { if (!clock.current && !drag) home(); }, { passive: true });
  listen(document.querySelector('.create-room-button'), 'focus', () => { if (!clock.current) { act('mint', 'reach', 'there. our next adventure.'); cats.mint.lookAt(document.querySelector('.create-room-button'), 3500); } });
  listen($('url-in'), 'focus', () => { if (!clock.current) act('pink', 'reach', 'bring me something good.'); });
  const playbackWatch = new MutationObserver(() => {
    const before = brain.context.playing; updateContext();
    if (before && !brain.context.playing) {
      if (clock.current?.name === 'dance') cancel();
      if (!clock.current) act('purple', 'sulk', 'who paused my cinema?');
    }
  });
  playbackWatch.observe(document.body, { attributes: true, attributeFilter: ['data-playback'] });
  scene.disposers.add(() => playbackWatch.disconnect());
  // Native dialogs suspend antics, including pending choreography and captures.
  const modalWatch = new MutationObserver(() => {
    const open = !!document.querySelector('dialog[open]');
    if (open && !watchingDialog) { cancel({ reset: true }); }
    watchingDialog = open;
  });
  document.querySelectorAll('dialog').forEach(el => modalWatch.observe(el, { attributes: true, attributeFilter: ['open'] }));
  scene.disposers.add(() => modalWatch.disconnect());
  scene.onMotionChange = updatePause;
  scene.onSuspend = () => { cancel({ reset: true }); setToy(false); };
  scene.onTick = (now, dt) => {
    brain.advance(dt);
    const previousStory = clock.current;
    if (!watchingDialog) clock.tick(brain.time * 1000);
    if (previousStory && !clock.current) { world.dataset.story = 'rest'; for (const kind of Object.keys(cats)) status(kind, 'Watching the room'); }
    if (!clock.current && !drag && !toyMode && !watchingDialog && brain.time > nextStory) {
      const next = brain.choose(); if (next) story(next); else nextStory = brain.time + 5;
    }
    if (chase) {
      const t = brain.time - chase.start, span = Math.min(210, innerWidth * .25), x = innerWidth * .5 - 65;
      place(cats.pink, x + Math.sin(t * 2.3) * span, floor() + Math.cos(t * 2.3) * 22, 9);
      place(cats.purple, x + Math.sin(t * 2.3 - .8) * span, floor() + Math.cos(t * 2.3 - .8) * 22, 9);
      camera(cats.pink, .95 + Math.cos(t * 2.3) * .12); camera(cats.purple, .95 + Math.cos(t * 2.3 - .8) * .12);
      if (brain.time > chase.nextBump) { chase.nextBump = brain.time + 1.5; act('pink', 'swat'); act('purple', 'dizzy'); burst(cats.purple.position.x + 50, cats.purple.position.y + 40); }
      if (brain.time >= chase.until) chase = null;
    }
    if (toyMode && scene.pointer && !drag && !watchingDialog) {
      toy.dataset.visible = 'true'; toy.style.translate = `${scene.pointer.x - 21}px ${scene.pointer.y - 15}px`;
      const p = cats.pink, point = scene.pointer;
      place(p, point.x - p.origin.right / 2, clamp(point.y - p.origin.bottom + 10, 35, floor()), 4.7);
      p.lookAt(point, 500); status('pink', 'Hunting your toy mouse');
      if (Math.hypot(p.position.x + 66 - point.x, p.position.y + p.origin.bottom - point.y) < 65 && brain.time > (p.nextSwat || 0)) { act('pink', 'swat', 'i have caught the internet.'); p.nextSwat = brain.time + 2.8; }
    }
    for (const a of Object.values(cats)) {
      a.zoom = spring(a.zoom, a.camera.zoom, dt, 4); a.angle = spring(a.angle, a.camera.angle, dt, 4);
      a.depth.style.transform = `scale(${a.zoom.value.toFixed(3)}) rotate(${a.angle.value.toFixed(2)}deg)`;
      a.root.style.zIndex = String(Math.round(a.position.y + (a.cinematic ? 2000 : 0)));
      if (brain.time > (a.speakingUntil || 0)) a.bubble.dataset.visible = 'false';
    }
    if (wallpaper && scene.pointer) { universe.style.setProperty('--sky-x', `${(scene.pointer.x / innerWidth - .5) * -9}px`); universe.style.setProperty('--sky-y', `${(scene.pointer.y / innerHeight - .5) * -7}px`); }
    if (now > statusAt) {
      statusAt = now + 750;
      universe.querySelectorAll('[data-cat-status]').forEach(el => { const c = brain.cats[el.dataset.catStatus]; el.textContent = `${c.status} · ${Math.round(c.energy)}% energy`; });
      universe.querySelector('.cat-dock').dataset.awake = String(panelOpen || now - idleSince < 5000);
      if (scene.pointer && brain.time - pointerAt > 8) scene.pointer = null;
    }
  };
  scene.disposers.add(() => { clock.clear(); clearEffects(); releaseDrag(); document.body.classList.remove('cat-simulation', 'cat-wallpaper'); for (const el of document.querySelectorAll('.room-nav,.playlist-column,.home-main,.site-footer')) el.inert = false; legacyCats.forEach(el => { el.removeAttribute('tabindex'); el.removeAttribute('aria-hidden'); }); universe.hidden = true; active = null; });
  scene.measure(); home(true); updateContext(); scene.refresh(); updatePause();
  if (new URLSearchParams(location.search).get('wallpaper') === '1') setWallpaper(true);
  active = {
    scene,
    observe(data) {
      if (scene.destroyed) return;
      if (data.title !== undefined && data.title !== title) { title = data.title; cancel(); updateContext(); nextStory = brain.time + 2; }
      if (seen && data.users > seen.users && !clock.current) act('mint', 'greet', 'we saved you a spot.');
      seen = { ...seen, ...data };
    },
    linkError(message) { if (message) { cancel(); act('mint', 'startle', 'that link needs a little help.', { priority: 100 }); } },
    inviteCopied() { if (!clock.current) act('mint', 'greet', 'summon the group chat.'); },
    destroy() { scene.destroy(); },
  };
  return active;
}
