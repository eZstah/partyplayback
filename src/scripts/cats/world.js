// The habitat: one canvas over the page, four cats with their own minds,
// page elements as shelves, and the viewer's cursor as the most interesting
// thing in the world. The canvas never takes pointer events, so buttons,
// inputs and playback controls under a cat always work.
import { CatBody, wrap } from './body.js';
import { CAST, KINDS, traitWords } from './cast.js';
import { Mind, activityLabel, awaySummary, clamp, dayRhythm, pick, videoVibe } from './mind.js';

const STORE = 'youple-cats-v1';
const UI = 'a,button,input,select,textarea,label,summary,iframe,video,dialog,[role=button],[role=switch],[contenteditable=true],.cat-dock,.cat-playbar,#player-wrap';
// Cats don't settle over these, and fade out while walking across them.
const PROTECT = 'button,a,input,select,textarea,summary,h1,h2,h3,p,li,label,#player-wrap,.player-bottom,#add-form,.room-nav,.cat-dock,.cat-playbar,.room-launcher,.toast,.playlist-add-feedback';
// Cats fade out only while over things you click, so controls stay readable and usable.
const GHOST = 'button,a,input,select,textarea,summary,label,#player-wrap,.player-bottom,#add-form,.room-nav,.cat-dock,.cat-playbar,.toast,.playlist-add-feedback';
// On the home page the cats live on the line above the playbar while it's on screen.
const HOME_FLOOR = '.cat-playbar';
const SHELVES = '.room-launcher,.how-grid article,.faq-column,#stage,.playlist-panel,.member-rooms,.site-footer';
const PRIORITY = { carried: 100, react: 80, treat: 70, laser: 60, social: 50, normal: 10 };
const TAU = Math.PI * 2;

let active = null;

export function bootCats() {
  if (active) return active;
  const universe = document.getElementById('cat-universe');
  if (!universe) return null;
  universe.hidden = false;
  document.body.classList.add('cat-simulation');
  const legacy = [...document.querySelectorAll('.mascot-cast .mascot,.room-pal .mascot')];
  legacy.forEach(el => { el.tabIndex = -1; el.setAttribute('aria-hidden', 'true'); });
  const $ = id => document.getElementById(id);
  const canvas = $('cat-canvas'), ctx = canvas.getContext('2d');
  const room = document.body.classList.contains('room-page');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const disposers = [];
  const listen = (el, type, fn, opts) => { if (!el) return; el.addEventListener(type, fn, opts); disposers.push(() => el.removeEventListener(type, fn, opts)); };

  // ---------- memory ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch {}
  const firstVisit = !saved.visits, sinceLast = saved.lastSeen ? (Date.now() - saved.lastSeen) / 1000 : 0;
  const visits = (saved.visits || 0) + 1;
  const journal = Array.isArray(saved.journal) ? saved.journal.slice(-12) : [];

  // ---------- world state ----------
  const W = { w: innerWidth, h: innerHeight, dpr: 1, aquarium: false, calm: !!saved.calm, laser: false, time: 0,
    pointer: null, overUI: false, idleSince: performance.now(), protect: [], ghosts: [], base: null, shelves: [], rectsAt: 0,
    treat: null, critter: null, nextCritter: 25 + Math.random() * 40, particles: [], speechAt: 0,
    playing: false, title: '', vibe: 'unknown', users: null, hovered: null, press: null, drag: null, petDist: 0 };

  const cats = KINDS.map((kind, i) => {
    const mind = new Mind(kind, saved.cats?.[kind]);
    const body = new CatBody(CAST[kind].look);
    return { kind, i, name: CAST[kind].name, cast: CAST[kind], mind, body, plan: null, prio: 0, surface: null, dx: 0,
      bubble: null, nextGlance: 0, ghost: 0, thought: '' };
  });
  const byKind = Object.fromEntries(cats.map(c => [c.kind, c]));

  // ---------- geometry ----------
  const scaleBase = () => clamp(Math.min(W.w / 1350, W.h / 820) * 1.12, .62, 1.18);
  function floorInfo() {
    if (W.aquarium) return { base: W.h * .95, zMin: -W.h * .45, zMax: 0, depth: .8 };
    return { base: W.base ?? W.h - 6, zMin: W.w < 600 ? -24 : -48, zMax: 0, depth: 1 };
  }
  function groundAt(surface, z) {
    if (surface?.type === 'shelf') return { y: surface.rect.top + 1, k: scaleBase() * .92 };
    const f = floorInfo(), y = f.base + z * f.depth;
    const t = (z - f.zMin) / (f.zMax - f.zMin || 1);
    return { y, k: scaleBase() * (W.aquarium ? .72 + t * .7 : .84 + t * .16) };
  }
  const FLOOR = { type: 'floor' };
  function visible(el) {
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    return !el.closest('#cat-universe .cat-habitat,[hidden],[inert]');
  }
  function measure(force = false) {
    if (!force && W.time - W.rectsAt < .5) return;
    W.rectsAt = W.time;
    W.protect = []; W.ghosts = [];
    for (const el of document.querySelectorAll(GHOST)) {
      if (el.closest('#cat-world')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > W.h || r.right < 0 || r.left > W.w || !visible(el)) continue;
      W.ghosts.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
    for (const el of document.querySelectorAll(PROTECT)) {
      if (el.closest('#cat-world')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > W.h || r.right < 0 || r.left > W.w || !visible(el)) continue;
      W.protect.push({ left: r.left - 4, top: r.top - 4, right: r.right + 4, bottom: r.bottom + 4 });
    }
    W.shelves = W.aquarium ? [] : [...document.querySelectorAll(SHELVES)].filter(visible).map(el => ({ type: 'shelf', el, rect: el.getBoundingClientRect() }))
      .filter(s => s.rect.width > 140 && s.rect.top > 70 && s.rect.top < W.h - 150);
  }
  const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  function catBox(x, gy, k) { const w = 76 * k, h = 96 * k; return { left: x - w / 2, right: x + w / 2, top: gy - h, bottom: gy + 4 }; }
  const blocked = box => W.protect.some(r => hits(box, r));
  function spotOk(spot, self) {
    const g = groundAt(spot.surface, spot.z ?? 0);
    const box = catBox(spot.x, g.y, g.k);
    if (box.left < 2 || box.right > W.w - 2) return false;
    if (blocked(box)) return false;
    return !cats.some(c => c !== self && c.target && Math.abs(c.target.x - spot.x) < 55 * g.k && c.target.surface === spot.surface && Math.abs((c.target.z ?? 0) - (spot.z ?? 0)) < 20);
  }
  // Pick a free place to be. prefer: 'floor' | 'shelf' | 'any'; near: x to stay close to.
  function findSpot(cat, { prefer = 'any', near = null, spread = 400, z = null } = {}) {
    measure();
    const f = floorInfo();
    for (let i = 0; i < 40; i++) {
      const useShelf = W.shelves.length && (prefer === 'shelf' || (prefer === 'any' && Math.random() < .3));
      let spot;
      if (useShelf) {
        const shelf = pick(W.shelves), r = shelf.rect;
        spot = { surface: shelf, x: r.left + 30 + Math.random() * Math.max(10, r.width - 60), z: 0 };
      } else {
        const cx = near ?? Math.random() * W.w;
        spot = { surface: FLOOR, x: clamp(cx + (near !== null ? (Math.random() - .5) * spread : 0), 40, W.w - 40), z: z ?? f.zMin + Math.random() * (f.zMax - f.zMin) };
      }
      if (spotOk(spot, cat)) return spot;
      if (i > 25 && prefer === 'shelf') prefer = 'floor';
    }
    // Everything is busy: peek in from the side of the screen.
    return { surface: FLOOR, x: Math.random() < .5 ? 24 : W.w - 24, z: f.zMax };
  }

  // ---------- plans (generators yield, receive dt) ----------
  function* wait(seconds) { let t = 0; while (t < seconds) t += yield; }
  function* walkFloor(cat, x, z, speed) {
    const b = cat.body; b.goTo(x, z, speed); let t = 0;
    while (b.move) { t += yield; if (t > 14) { b.stop(); break; } }
  }
  function* jump(cat, spot) {
    const b = cat.body, g = groundAt(spot.surface, spot.z ?? 0);
    b.set({ crouch: 1, sit: 0, loaf: 0, curl: 0, tailUp: .2 }); b.faceYaw(spot.x >= b.x ? 0 : Math.PI);
    yield* wait(reduced() ? .1 : .28);
    b.set({ crouch: 0 });
    const rise = b.gy - g.y;
    b.leap(spot.x, g.y, spot.z ?? 0, Math.max(28, rise + 42) * (W.aquarium ? .8 : 1));
    while (b.jump) yield;
    setSurface(cat, spot.surface);
    if (Math.abs(rise) > 120) puff(b.x, b.gy, 4);
  }
  function setSurface(cat, surface) {
    cat.surface = surface?.type === 'shelf' ? surface : FLOOR;
    if (cat.surface.type === 'shelf') { cat.dx = cat.body.x - cat.surface.rect.left; cat.body.z = 0; }
  }
  // Travel to any spot: walk on the current surface, jumping between surfaces.
  function* travel(cat, spot, speed = 70) {
    const b = cat.body; cat.target = spot;
    const here = cat.surface, there = spot.surface;
    if (here === there || (here.type === 'floor' && there.type === 'floor')) {
      if (here.type === 'shelf') {
        const r = here.rect; b.goTo(clamp(spot.x, r.left + 16, r.right - 16), b.z, speed);
        let t = 0; while (b.move && t < 10) { t += yield; b.move && (b.move.x = clamp(spot.x, here.rect.left + 16, here.rect.right - 16)); }
      } else yield* walkFloor(cat, spot.x, spot.z ?? 0, speed);
      return;
    }
    if (here.type === 'shelf' && there.type === 'shelf' && Math.abs(spot.x - b.x) < 420 && Math.abs(here.rect.top - there.rect.top) < 260) { yield* jump(cat, spot); return; }
    if (here.type === 'shelf') {
      // Hop down to the floor near the shelf edge.
      const f = floorInfo();
      yield* jump(cat, { surface: FLOOR, x: clamp(b.x + (Math.random() - .5) * 80, 30, W.w - 30), z: f.zMax - Math.random() * 10 });
    }
    if (there.type === 'shelf') {
      const r = there.rect, launchX = clamp(spot.x + (Math.random() - .5) * 90, 30, W.w - 30);
      yield* walkFloor(cat, launchX, floorInfo().zMax, speed);
      if (!document.contains(there.el)) return;
      there.rect = there.el.getBoundingClientRect();
      const reach = b.gy - there.rect.top;
      if (reach > W.h * .8) return; // too high, stay on the floor
      yield* jump(cat, { surface: there, x: clamp(spot.x, r.left + 20, r.right - 20), z: 0 });
      return;
    }
    yield* walkFloor(cat, spot.x, spot.z ?? 0, speed);
  }
  const reduced = () => reducedQuery.matches;
  const walkSpeed = cat => (reduced() ? 45 : 62) * cat.cast.gait * scaleBase();
  const runSpeed = cat => (reduced() ? 70 : 250) * cat.cast.gait * scaleBase();

  // Ambient life while doing something calm: glance at things, flick ears and tail.
  function fidget(cat, dt) {
    const b = cat.body;
    if (W.time > cat.nextGlance) {
      cat.nextGlance = W.time + 1.4 + Math.random() * 3.5;
      const others = cats.filter(o => o !== cat);
      const r = Math.random();
      if (W.pointer && !W.overUI && r < .35 + cat.mind.t.curiosity * .2) b.look = { x: W.pointer.x, y: W.pointer.y };
      else if (r < .55) { const o = pick(others); b.look = { x: o.body.x, z: o.body.z }; }
      else if (r < .7) b.look = 'viewer';
      else if (r < .8 && room) { const s = stageCenter(); if (s) b.look = { ...s, behind: true }; }
      else b.look = null;
      if (Math.random() < .25) { b.goal.earsBack = .5; setTimeout(() => { b.goal.earsBack = 0; }, 160); }
      if (Math.random() < .2) b.goal.tailWag = .5 + Math.random() * .4;
      else b.goal.tailWag = .1;
    }
  }

  function stageCenter() {
    const el = document.getElementById('stage') || document.getElementById('player-wrap');
    if (!el) return null; const r = el.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r } : null;
  }

  // ----- activities -----
  const A = {
    *sit(cat, seconds = 5 + Math.random() * 8) {
      cat.body.reset({ sit: 1, tailWrap: 1 }); let t = 0;
      if (Math.random() < .25) say(cat, 'idle', .15);
      while (t < seconds) { const dt = yield; t += dt; fidget(cat, dt); if (W.time > cat.nextGlance - .2 && Math.random() < .004) cat.body.set({ knead: cat.body.goal.knead ? 0 : 1 }); }
    },
    *loaf(cat) {
      cat.body.reset({ loaf: 1, eyes: .55, tailWrap: 1 }); let t = 0; const seconds = 10 + Math.random() * 14;
      while (t < seconds) {
        const dt = yield; t += dt; fidget(cat, dt);
        // Slow blink at the viewer: cat for "I trust you".
        if (cat.body.look === 'viewer' && cat.mind.trust > 45 && Math.random() < dt * .4) { cat.body.goal.eyes = 0; yield* wait(.9); cat.body.goal.eyes = .55; think(cat, '♥', 1.4); }
      }
    },
    *sleep(cat) {
      const spot = findSpot(cat, { prefer: Math.random() < .4 ? 'shelf' : 'floor' });
      yield* travel(cat, spot, walkSpeed(cat) * .8);
      yield* settleToSleep(cat);
      let t = 0; const max = 25 + Math.random() * 60;
      while (t < max && (cat.mind.drives.sleepy > 6 || W.calm)) {
        const dt = yield; t += dt;
        if (Math.random() < dt * .35) particle('z', cat.body.top.x + 8, cat.body.top.y + 6, { rise: 18, life: 2.4, size: 12 + Math.random() * 6, color: '#cbbbe8' });
        if (Math.random() < dt * .05) cat.body.goal.tailWag = cat.body.goal.tailWag ? 0 : .2;
      }
      yield* wake(cat);
    },
    *cuddle(cat, partnerKind) {
      const p = byKind[partnerKind];
      if (!p || !['sleep', 'cuddle'].includes(p.mind.activity)) return;
      const side = Math.random() < .5 ? -1 : 1, g = groundAt(p.surface, p.body.z);
      const spot = { surface: p.surface, x: p.body.x + side * 48 * g.k, z: p.body.z };
      yield* travel(cat, spot, walkSpeed(cat) * .8);
      cat.body.look = { x: p.body.x, z: p.body.z }; cat.body.faceYaw(side > 0 ? Math.PI : 0);
      yield* wait(.6);
      yield* settleToSleep(cat);
      cat.mind.bond(partnerKind, .08); p.mind.bond(cat.kind, .05);
      particle('♥', (cat.body.top.x + p.body.top.x) / 2, Math.min(cat.body.top.y, p.body.top.y), { color: '#f29bb0', size: 16 });
      log(`${cat.name} curled up next to ${p.name}.`);
      let t = 0; while (t < 40 && (cat.mind.drives.sleepy > 5 || W.calm)) { const dt = yield; t += dt; if (Math.random() < dt * .3) particle('z', cat.body.top.x, cat.body.top.y, { rise: 18, life: 2.4, size: 12, color: '#cbbbe8' }); }
      yield* wake(cat);
    },
    *groom(cat) {
      const b = cat.body; b.reset({ sit: 1, tailWrap: 1 }); b.look = null;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        b.set({ groom: 1, headPitch: -.25, eyes: .3, headYaw: .35 }); b.face = 'open';
        yield* wait(1.2 + Math.random());
        b.set({ groom: 0, eyes: 1 }); yield* wait(.4 + Math.random() * .6);
      }
      b.face = 'open'; b.set({ groom: 0 });
    },
    *stretch(cat) {
      const b = cat.body; b.reset({ stretch: 1, tailUp: .9, eyes: .2 }); b.look = null;
      yield* wait(1.4); b.set({ mouth: 1, eyes: 0 }); yield* wait(.9); b.set({ mouth: 0, eyes: 1 }); b.reset();
      yield* wait(.4);
    },
    *wander(cat) {
      const b = cat.body; b.reset({ tailUp: .5 + cat.mind.t.bold * .4 }); b.look = null;
      const spot = findSpot(cat, { prefer: 'floor', near: Math.random() < .5 ? b.x : null });
      yield* travel(cat, spot, walkSpeed(cat));
      // Sniff around on arrival.
      b.set({ crouch: .3 }); b.goal.headPitch = -.3; yield* wait(.8 + Math.random()); b.set({ crouch: 0 });
      yield* A.sit(cat, 2 + Math.random() * 4);
    },
    *explore(cat) {
      const b = cat.body; b.reset({ tailUp: .7 });
      const spot = findSpot(cat, { prefer: 'shelf' });
      yield* travel(cat, spot, walkSpeed(cat) * 1.15);
      if (cat.surface.type === 'shelf') { say(cat, 'shelf', .4); cat.mind.drives.curious -= 30; }
      b.reset({ [Math.random() < .5 ? 'loaf' : 'sit']: 1, tailWrap: .4 }); b.look = null;
      let t = 0; const seconds = 8 + Math.random() * 14;
      while (t < seconds) { const dt = yield; t += dt; fidget(cat, dt); }
    },
    *watch(cat) {
      const s = stageCenter(); if (!s) { yield* A.sit(cat); return; }
      const f = floorInfo(), r = s.rect;
      let spot = null;
      for (let i = 0; i < 25 && !spot; i++) {
        const cand = { surface: FLOOR, x: r.left + 40 + Math.random() * Math.max(20, r.width - 80), z: f.zMin + Math.random() * (f.zMax - f.zMin) * .5 };
        if (spotOk(cand, cat)) spot = cand;
      }
      yield* travel(cat, spot || findSpot(cat, { prefer: 'floor' }), walkSpeed(cat));
      cat.body.reset({ sit: 1, tailWrap: 1 }); cat.body.look = { x: s.x, y: s.y, behind: true };
      cat.body.faceYaw(Math.atan2(-220, s.x - cat.body.x));
      if (Math.random() < .3) say(cat, 'watch', .25);
      let t = 0;
      while (W.playing && t < 40 + Math.random() * 40) {
        const dt = yield; t += dt;
        const c = stageCenter(); if (c) cat.body.look = { x: c.x, y: c.y, behind: true };
        cat.body.goal.bob = W.vibe === 'music' ? .5 : 0;
        if (Math.random() < dt * .04) { cat.body.goal.tailWag = .6; } else if (Math.random() < dt * .1) cat.body.goal.tailWag = .12;
        // Now and then, glance back at the viewer.
        if (Math.random() < dt * .03) { cat.body.look = 'viewer'; yield* wait(1.5); }
      }
      cat.body.goal.bob = 0;
    },
    *dance(cat) {
      const b = cat.body, spot = findSpot(cat, { prefer: 'floor' });
      yield* travel(cat, spot, walkSpeed(cat) * 1.2);
      say(cat, 'music', .6); b.look = 'viewer';
      let t = 0; const seconds = 8 + Math.random() * 6;
      while (t < seconds && W.playing) {
        b.reset({ rear: reduced() ? 0 : .9, pawsUp: 1, bob: 1, tailWag: .8, tailUp: .9 }); b.face = 'happy';
        yield* wait(1.3); t += 1.3;
        if (!reduced() && Math.random() < .6) { b.faceYaw(b.yaw + Math.PI * (Math.random() < .5 ? 1 : -1)); particle('♪', b.top.x, b.top.y, { color: '#c3acf0' }); }
        if (!reduced() && Math.random() < .3) { b.reset({ crouch: .5 }); yield* wait(.2); b.leap(b.x, b.gy, b.z, 26, .4); while (b.jump) yield; t += .6; }
      }
      b.face = 'open'; b.reset();
    },
    *zoomies(cat) {
      const b = cat.body; say(cat, 'zoomies', .5);
      b.reset({ earsBack: .6, tailPuff: .5, tailUp: .3, pupil: 1.2 }); b.face = 'wide';
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
        const spot = findSpot(cat, { prefer: Math.random() < .25 ? 'shelf' : 'floor' });
        yield* travel(cat, spot, runSpeed(cat) * 1.25);
        if (Math.random() < .3) { b.set({ crouch: .4 }); yield* wait(.15); b.leap(b.x, b.gy, b.z, 34, .42); while (b.jump) yield; b.set({ crouch: 0 }); }
      }
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 50);
      b.face = 'open'; b.reset({ sit: 1 }); yield* wait(1.5);
      b.set({ mouth: .4 }); yield* wait(.4); b.set({ mouth: 0 });
      log(`${cat.name} had the zoomies.`);
    },
    *stalk(cat) {
      const b = cat.body;
      if (cat.surface.type === 'shelf') yield* travel(cat, findSpot(cat, { prefer: 'floor' }), walkSpeed(cat));
      let t = 0, still = 0;
      b.reset({ crouch: 1, pupil: 1.25, tailUp: -.2, tailWag: .5 }); b.face = 'focus'; think(cat, '!', 1.2);
      while (t < 12) {
        const dt = yield; t += dt;
        const p = W.pointer; if (!p || W.overUI || performance.now() - p.t > 6000) break;
        b.look = { x: p.x, y: p.y };
        const dist = Math.abs(p.x - b.x);
        if (dist > 70 * b.k) { b.goTo(clamp(p.x - Math.sign(p.x - b.x) * 50 * b.k, 30, W.w - 30), b.z, walkSpeed(cat) * .55); still = 0; }
        else { b.stop(); still += dt; }
        if (p.speed > .6) still = 0;
        if (still > .9 && b.gy - p.y < 260) {
          b.set({ wiggle: 1 }); if (Math.random() < .5) say(cat, 'cursorStill', .5); yield* wait(.7); b.set({ wiggle: 0, crouch: .2 });
          const target = W.pointer || p, lift = clamp(b.gy - target.y, 20, 240);
          b.leap(clamp(target.x, 30, W.w - 30), b.gy, b.z, lift + 18, .55); b.goal.swat = 1;
          while (b.jump) yield;
          b.goal.swat = 0; puff(b.x, b.gy, 3);
          const caught = W.pointer && Math.abs(W.pointer.x - b.x) < 60 && W.pointer.speed < .4;
          if (caught) { say(cat, 'caught', 1); particle('✦', b.top.x, b.top.y, { color: '#f2c78d', size: 22 }); log(`${cat.name} pounced on your cursor.`); }
          else say(cat, 'miss', .5);
          cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 35);
          break;
        }
      }
      b.face = 'open'; b.reset({ sit: 1 }); yield* wait(1.2);
    },
    *approach(cat) {
      const b = cat.body, f = floorInfo(), p = W.pointer;
      const x = p && !W.overUI ? p.x : W.w * (.3 + Math.random() * .4);
      const spot = findSpot(cat, { prefer: 'floor', near: x, spread: 200, z: f.zMax - Math.random() * 6 });
      yield* travel(cat, spot, walkSpeed(cat) * 1.1);
      b.reset({ sit: 1, tailUp: .9, tailCurl: .9, tailWrap: 0 }); b.look = 'viewer';
      b.set({ mouth: .6 }); yield* wait(.35); b.set({ mouth: 0 });
      say(cat, cat.mind.trust > 60 ? 'greet' : 'idle', .6);
      let t = 0; while (t < 6) { const dt = yield; t += dt; if (W.pointer && Math.random() < dt) b.look = { x: W.pointer.x, y: W.pointer.y }; }
    },
    *stare(cat) {
      const b = cat.body, f = floorInfo();
      const spot = findSpot(cat, { prefer: 'floor', z: f.zMax });
      yield* travel(cat, spot, walkSpeed(cat));
      b.reset({ sit: 1 }); b.look = 'viewer'; yield* wait(1);
      b.set({ headRoll: (Math.random() < .5 ? -1 : 1) * .3 }); think(cat, '?', 1.5); yield* wait(1.5);
      if (W.aquarium || Math.random() < .5) {
        // Paws on the glass.
        say(cat, 'stare', .5); b.set({ rear: reduced() ? 0 : .75, pawsUp: 1, headRoll: 0 }); yield* wait(1.2);
        b.set({ swat: 1 }); yield* wait(.25); b.set({ swat: 0 }); yield* wait(.3); b.set({ swat: 1 }); yield* wait(.25); b.set({ swat: 0 });
        yield* wait(1); b.set({ rear: 0, pawsUp: 0 });
      }
      yield* wait(2 + Math.random() * 3); b.set({ headRoll: 0 });
    },
    *visit(cat, partnerKind) {
      const p = byKind[partnerKind]; if (!p) return;
      const b = cat.body; b.reset({ tailUp: .9, tailCurl: .7 });
      for (let i = 0; i < 2; i++) {
        const side = p.body.x > b.x ? -1 : 1, g = groundAt(p.surface, p.body.z);
        yield* travel(cat, { surface: p.surface, x: clamp(p.body.x + side * 44 * g.k, 30, W.w - 30), z: p.body.z }, walkSpeed(cat) * 1.15);
        if (Math.abs(p.body.x - b.x) < 90) break;
      }
      if (Math.abs(p.body.x - b.x) > 110 || p.surface !== cat.surface) return;
      b.look = { x: p.body.x, z: p.body.z };
      b.faceYaw(Math.atan2(p.body.z - b.z, p.body.x - b.x));
      say(cat, 'visit', .3);
      const welcome = respond(p, cat);
      yield* wait(.8);
      if (welcome === 'hiss') {
        b.reset({ earsBack: 1, crouch: .3 }); b.face = 'wide'; cat.mind.startle(.4); yield* wait(1);
        cat.mind.bond(p.kind, -.06); log(`${p.name} hissed at ${cat.name}.`);
        yield* travel(cat, findSpot(cat, { prefer: 'floor', near: b.x + (b.x > p.body.x ? 200 : -200), spread: 100 }), walkSpeed(cat) * 1.6);
        b.face = 'open'; b.reset(); return;
      }
      // Nose boop, then a head rub or some grooming.
      b.goTo(p.body.x + (b.x < p.body.x ? -24 : 24) * b.k, p.body.z, 30);
      yield* wait(.7); b.stop();
      particle('♥', (b.top.x + p.body.top.x) / 2, Math.min(b.top.y, p.body.top.y) - 4, { color: '#f29bb0', size: 18 });
      b.face = 'happy'; b.set({ headRoll: .3, eyes: .2 }); yield* wait(1.2);
      if (Math.random() < .5) { b.set({ sit: 1, groom: 1 }); b.face = 'open'; yield* wait(2); b.set({ groom: 0 }); }
      cat.mind.bond(p.kind, .05); p.mind.bond(cat.kind, .03); cat.mind.drives.lonely = 0;
      b.face = 'open'; b.reset({ sit: 1 });
      if (Math.random() < .3) log(`${cat.name} booped noses with ${p.name}.`);
      yield* A.sit(cat, 3 + Math.random() * 4);
    },
    *chase(cat, partnerKind) {
      const p = byKind[partnerKind]; if (!p) return;
      const b = cat.body;
      b.reset({ crouch: .6, pupil: 1.2, tailWag: .7 }); b.face = 'focus';
      b.look = { x: p.body.x, z: p.body.z };
      yield* wait(.6);
      const answer = respond(p, cat, 'chase');
      if (answer === 'hiss') { b.reset({ earsBack: .8 }); b.face = 'open'; yield* wait(1); say(cat, 'annoyed', .4); return; }
      say(cat, 'visit', .3);
      let t = 0;
      while (t < 8 && p.mind.activity === 'flee') {
        const dt = yield; t += dt;
        if (p.surface !== cat.surface) { if (Math.random() < dt) yield* travel(cat, { surface: p.surface, x: p.body.x, z: p.body.z }, runSpeed(cat)); continue; }
        b.goTo(p.body.x, p.body.z, runSpeed(cat) * .95); b.look = { x: p.body.x, z: p.body.z };
        if (Math.abs(p.body.x - b.x) < 40 * b.k && Math.abs(p.body.z - b.z) < 20) break;
      }
      b.stop();
      // Wrestle!
      if (p.mind.activity === 'flee') { interrupt(p, A.wrestle(p, cat.kind), PRIORITY.social); }
      yield* A.wrestle(cat, partnerKind);
    },
    *flee(cat, fromKind) {
      const b = cat.body, from = byKind[fromKind];
      b.reset({ tailUp: .8, earsBack: .4 }); b.face = 'happy';
      for (let i = 0; i < 3; i++) {
        const away = b.x < from.body.x ? -1 : 1;
        const spot = findSpot(cat, { prefer: Math.random() < .3 ? 'any' : 'floor', near: clamp(b.x + away * 300, 50, W.w - 50), spread: 200 });
        yield* travel(cat, spot, runSpeed(cat) * .9);
      }
      b.face = 'open';
    },
    *wrestle(cat, partnerKind) {
      const p = byKind[partnerKind], b = cat.body;
      cat.mind.begin('wrestle', partnerKind);
      for (let i = 0; i < 4; i++) {
        b.look = { x: p.body.x, z: p.body.z }; b.faceYaw(Math.atan2(p.body.z - b.z, p.body.x - b.x));
        b.reset({ crouch: .5, earsBack: .5, tailPuff: .4, tailWag: 1 }); b.face = 'focus';
        yield* wait(.25 + Math.random() * .3);
        b.set({ swat: 1, rear: reduced() ? 0 : .35 }); puff((b.x + p.body.x) / 2, b.gy, 2); yield* wait(.25); b.set({ swat: 0, rear: 0 });
      }
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 45); cat.mind.bond(partnerKind, .03);
      b.face = 'open'; b.reset({ sit: 1 });
      if (cat.i < p.i) log(`${cat.name} and ${p.name} had a play fight.`);
      yield* wait(1 + Math.random());
      yield* A.groom(cat);
    },
    *hunt(cat) {
      const b = cat.body, bug = W.critter; if (!bug) return;
      if (cat.surface.type === 'shelf') yield* travel(cat, findSpot(cat, { prefer: 'floor' }), walkSpeed(cat));
      say(cat, 'hunt', .4); b.reset({ crouch: .8, pupil: 1.3, tailWag: .4 }); b.face = 'focus';
      let t = 0;
      while (t < 15 && W.critter === bug && !bug.gone) {
        const dt = yield; t += dt;
        b.look = { x: bug.x, y: bug.y };
        if (Math.abs(bug.x - b.x) > 60) b.goTo(clamp(bug.x, 30, W.w - 30), b.z, walkSpeed(cat) * (Math.abs(bug.x - b.x) > 250 ? 2.2 : .8));
        else b.stop();
        if (Math.abs(bug.x - b.x) < 80 && b.gy - bug.y < 230 && Math.random() < dt * 1.2) {
          b.set({ wiggle: 1 }); yield* wait(.5); b.set({ wiggle: 0, crouch: .2 });
          b.leap(clamp(bug.x, 30, W.w - 30), b.gy, b.z, clamp(b.gy - bug.y, 30, 240), .55); b.goal.swat = 1; b.goal.rear = .3;
          while (b.jump) yield;
          b.set({ swat: 0, rear: 0 });
          if (Math.random() < .35 + cat.mind.t.bold * .2) { bug.flee = true; say(cat, 'caught', 1); particle('✦', bug.x, bug.y, { color: '#f2c78d', size: 22 }); log(`${cat.name} nearly caught a butterfly.`); }
          else say(cat, 'miss', .4);
          b.reset({ crouch: .7, pupil: 1.2 });
          cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 25);
          if (bug.flee) break;
        }
      }
      b.face = 'open'; b.reset({ sit: 1 }); b.look = null; yield* wait(1);
    },
    *laser(cat) {
      const b = cat.body;
      if (cat.mind.t.grumpy > .7 && Math.random() < .6) { say(cat, 'laser', 1); b.reset({ loaf: 1, eyes: .5 }); b.look = W.pointer; yield* wait(6); return; }
      if (cat.surface.type === 'shelf') yield* travel(cat, findSpot(cat, { prefer: 'floor' }), runSpeed(cat));
      if (Math.random() < .5) say(cat, 'laser', .5);
      b.reset({ crouch: .7, pupil: 1.35, tailWag: .9, tailUp: .1 }); b.face = 'focus';
      let still = 0, t = 0;
      while (W.laser && t < 30) {
        const dt = yield; t += dt;
        const p = W.pointer; if (!p) continue;
        b.look = { x: p.x, y: p.y };
        const near = Math.abs(p.x - b.x) < 50 * b.k;
        if (!near) { b.goTo(clamp(p.x, 20, W.w - 20), clamp(b.z + (Math.random() - .5) * 4, floorInfo().zMin, 0), runSpeed(cat) * (Math.abs(p.x - b.x) > 200 ? 1.1 : .6)); still = 0; b.set({ crouch: .4 }); }
        else { b.stop(); still += dt; b.set({ crouch: 1 }); }
        if (still > .45 + Math.random() * .4 && !b.jump) {
          b.set({ wiggle: 1 }); yield* wait(.35); b.set({ wiggle: 0 });
          const q = W.pointer || p;
          b.leap(clamp(q.x, 20, W.w - 20), b.gy, b.z, clamp(b.gy - q.y, 15, 220) + 10, .45); b.goal.swat = 1;
          while (b.jump) yield;
          b.goal.swat = 0; still = 0; puff(b.x, b.gy, 2);
          if (Math.random() < .2) particle('?', b.top.x, b.top.y, { color: '#f2c78d', size: 18 });
        }
      }
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 40);
      b.face = 'open'; b.reset({ sit: 1 }); yield* wait(1);
    },
    *treat(cat) {
      const tr = W.treat; if (!tr || tr.eaten) return;
      const b = cat.body; b.reset({ tailUp: 1 }); b.face = 'wide'; think(cat, '🐟', 1.5);
      while (tr.falling) yield;
      if (tr.eaten) { b.face = 'open'; return; }
      yield* travel(cat, { surface: tr.surface, x: clamp(tr.x + (tr.x > b.x ? -28 : 28) * b.k, 20, W.w - 20), z: tr.z }, runSpeed(cat) * (.6 + cat.mind.drives.hungry / 200));
      if (tr.eaten && tr.eater !== cat) {
        // Back off a little so nobody stands on the winner.
        const off = (b.x < tr.x ? -1 : 1) * (60 + Math.random() * 50) * b.k;
        if (cat.surface.type === 'floor') { b.goTo(clamp(tr.x + off, 20, W.w - 20), clamp(b.z - 10, floorInfo().zMin, 0), walkSpeed(cat)); let t = 0; while (b.move && t < 2) t += yield; }
        // Too slow. Somebody else got it.
        b.face = 'grumpy'; b.reset({ sit: 1, earsBack: .5 }); b.look = tr.eater ? { x: tr.eater.body.x, z: tr.eater.body.z } : null;
        if (tr.eater) cat.mind.bond(tr.eater.kind, -.04);
        if (Math.random() < .5) say(cat, 'annoyed', .5);
        yield* wait(2.5); b.face = 'open'; return;
      }
      tr.eaten = true; tr.eater = cat;
      b.faceYaw(tr.x > b.x ? 0 : Math.PI); b.reset({ crouch: .6 }); b.goal.headPitch = -.5; b.face = 'happy';
      say(cat, 'treat', 1);
      for (let i = 0; i < 6; i++) { b.set({ mouth: .5 }); yield* wait(.17); b.set({ mouth: 0 }); yield* wait(.17); }
      W.treat = null; cat.mind.ate(); log(`${cat.name} got the treat.`);
      b.reset({ sit: 1 }); b.face = 'happy'; yield* wait(1); b.face = 'open';
      yield* A.groom(cat);
    },
    *follow(cat, partnerKind) {
      const p = byKind[partnerKind]; if (!p) return;
      const b = cat.body; b.reset({ tailUp: 1 });
      let t = 0; const seconds = 10 + Math.random() * 10;
      while (t < seconds) {
        const dt = yield; t += dt;
        const g = groundAt(p.surface, p.body.z), behind = p.body.x - Math.cos(p.body.yaw) * 55 * g.k;
        if (p.surface !== cat.surface && !b.jump) { yield* travel(cat, { surface: p.surface, x: behind, z: p.body.z }, walkSpeed(cat) * 1.6); continue; }
        if (Math.abs(behind - b.x) > 30) { b.goTo(clamp(behind, 20, W.w - 20), p.body.z, Math.max(walkSpeed(cat), p.body.speed * 1.1)); b.reset({ tailUp: 1 }); }
        else if (!b.move) {
          // Copy whatever the hero is doing.
          const pp = p.body.goal; b.set({ sit: pp.sit, loaf: pp.loaf, crouch: pp.crouch * .8, rear: pp.rear, pawsUp: pp.pawsUp });
          b.look = Math.random() < .02 ? 'viewer' : { x: p.body.x, z: p.body.z };
        }
      }
      if (Math.random() < .3) log(`${cat.name} followed ${p.name} around.`);
    },
  };

  function* settleToSleep(cat) {
    const b = cat.body; b.look = null;
    b.reset({ sit: 1 }); yield* wait(.5);
    // Turn around once or twice before lying down, like real cats.
    if (!reduced()) { b.faceYaw(b.yaw + Math.PI); yield* wait(.7); b.faceYaw(b.yaw + Math.PI * .9); yield* wait(.6); }
    b.reset({ loaf: 1, eyes: .4 }); yield* wait(.8);
    b.reset({ curl: 1, eyes: 0, tailWrap: 1 }); b.face = 'sleep';
  }
  function* wake(cat) {
    const b = cat.body; b.face = 'open'; b.reset({ loaf: 1, eyes: .4 }); yield* wait(.7);
    yield* A.stretch(cat); cat.mind.drives.sleepy = Math.min(cat.mind.drives.sleepy, 10);
    if (Math.random() < .3) say(cat, 'wake', .3);
  }

  // A cat responds to another starting something with them.
  function respond(cat, from, kind = 'visit') {
    if (cat.prio >= PRIORITY.social && cat.mind.activity !== 'sit' && cat.mind.activity !== 'loaf') return 'busy';
    const bond = cat.mind.bonds[from.kind] ?? 0, grumpy = cat.mind.t.grumpy;
    if (['sleep', 'cuddle'].includes(cat.mind.activity) && kind === 'chase') return 'hiss';
    if (bond + (1 - grumpy) * .5 + Math.random() * .4 < .45) {
      interrupt(cat, (function* () {
        const b = cat.body; b.look = { x: from.body.x, z: from.body.z };
        b.reset({ earsBack: 1, tailPuff: 1, tailUp: .9, crouch: .3, mouth: .8 }); b.face = 'wide'; say(cat, 'hiss', 1) || say(cat, 'annoyed', 1);
        yield* wait(1.4); b.reset({ sit: 1 }); b.face = 'grumpy'; yield* wait(2); b.face = 'open';
      })(), PRIORITY.social, 'hiss');
      return 'hiss';
    }
    if (kind === 'chase' && cat.mind.drives.playful + cat.mind.t.energy * 40 > 35 && cat.surface === from.surface) {
      interrupt(cat, A.flee(cat, from.kind), PRIORITY.social, 'flee', from.kind); return 'flee';
    }
    interrupt(cat, (function* () {
      const b = cat.body; b.look = { x: from.body.x, z: from.body.z };
      if (cat.mind.activity === 'sleep' || cat.mind.activity === 'cuddle') { b.set({ eyes: .4 }); b.face = 'open'; yield* wait(2); b.set({ eyes: 0 }); b.face = 'sleep'; return; }
      b.reset({ sit: 1, tailUp: .8, tailCurl: .8 }); yield* wait(3.5);
    })(), PRIORITY.social, 'greet');
    return 'ok';
  }

  // ---------- plan control ----------
  function interrupt(cat, gen, prio = PRIORITY.react, type = 'react', partner = null) {
    if (cat.prio > prio) return false;
    cat.plan = gen; cat.prio = prio; cat.body.stop();
    cat.body.set({ rear: 0, pawsUp: 0, swat: 0, wiggle: 0, groom: 0, bob: 0, knead: 0 }); if (cat.body.face !== 'sleep') cat.body.face = 'open';
    if (type !== 'react' || cat.mind.activity === 'carried') cat.mind.begin(type, partner);
    return true;
  }
  function context(cat) {
    const others = cats.filter(o => o !== cat).map(o => ({ kind: o.kind, activity: o.mind.activity, playful: o.mind.drives.playful }));
    const idle = (performance.now() - W.idleSince) / 1000;
    return {
      playing: W.playing, vibe: W.vibe, day: dayRhythm(new Date().getHours()), others, reduced: reduced(), calm: W.calm,
      cursor: !!W.pointer && !W.overUI && performance.now() - W.pointer.t < 4000, laser: W.laser && !!W.pointer,
      treat: !!W.treat && !W.treat.eaten, critter: !!W.critter && !W.critter.flee, shelves: W.shelves.length > 0,
      aquarium: W.aquarium || idle > 60,
    };
  }
  function next(cat) {
    const choice = cat.mind.choose(context(cat));
    let type = choice.type;
    if (!A[type]) type = 'sit';
    cat.mind.begin(type, choice.partner);
    cat.prio = type === 'treat' ? PRIORITY.treat : type === 'laser' ? PRIORITY.laser : PRIORITY.normal;
    if (choice.partner && byKind[choice.partner]) cat.prio = Math.max(cat.prio, PRIORITY.social - 5);
    cat.plan = A[type](cat, choice.partner);
  }
  function step(cat, dt) {
    if (!cat.plan) next(cat);
    let guard = 0;
    while (cat.plan && guard++ < 3) {
      const r = cat.plan.next(dt);
      if (!r.done) break;
      cat.plan = null; cat.prio = 0; cat.body.face = cat.body.face === 'sleep' ? 'open' : cat.body.face;
      next(cat); dt = 0;
    }
  }

  // ---------- speech, thoughts, particles ----------
  function say(cat, key, chance = 1, force = false) {
    if (Math.random() > chance) return false;
    if (!force && W.time < W.speechAt) return false;
    const text = cat.mind.line(key); if (!text) return false;
    cat.bubble = { text, until: W.time + 2.6 + text.length * .05, think: false };
    cat.thought = text; W.speechAt = W.time + 5 + Math.random() * 5;
    cat.body.set({ mouth: .5 }); setTimeout(() => { cat.body.goal.mouth = 0; }, 220);
    return true;
  }
  function think(cat, glyph, seconds = 1.6) { cat.bubble = { text: glyph, until: W.time + seconds, think: true }; }
  function particle(glyph, x, y, { color = '#fff', size = 16, rise = 34, life = 1.4, vx = 0 } = {}) {
    W.particles.push({ glyph, x, y, color, size, rise, life, age: 0, vx: vx || (Math.random() - .5) * 12 });
    if (W.particles.length > 80) W.particles.shift();
  }
  function puff(x, y, n = 3) { for (let i = 0; i < n; i++) W.particles.push({ glyph: 'dust', x: x + (Math.random() - .5) * 30, y: y - 4, color: '#d6c8e6', size: 6 + Math.random() * 6, rise: 8, life: .6, age: 0, vx: (Math.random() - .5) * 60 }); }
  function log(text) {
    const at = new Date(); journal.push({ t: at.getTime(), text }); if (journal.length > 30) journal.shift();
    renderJournal();
  }

  // ---------- interactions ----------
  function catAt(x, y) {
    const order = [...cats].sort((a, b) => b.body.gy - a.body.gy);
    return order.find(c => c.ghost < .8 && c.body.contains(x, y)) || null;
  }
  function onPet(cat) {
    const r = cat.mind.pet(), b = cat.body;
    if (r === 'enough') {
      interrupt(cat, (function* () {
        b.reset({ sit: 1, earsBack: 1, tailWag: 1 }); b.face = 'grumpy'; say(cat, cat.cast.voice.petMax ? 'petMax' : 'annoyed', 1, true);
        b.look = W.pointer ? { x: W.pointer.x, y: W.pointer.y } : null; yield* wait(.4); b.set({ swat: 1 }); yield* wait(.25); b.set({ swat: 0 });
        yield* wait(.6); b.face = 'open'; yield* A.wander(cat);
      })(), PRIORITY.react, 'annoyed');
      return;
    }
    particle('♥', b.top.x + (Math.random() - .5) * 20, b.top.y, { color: '#f29bb0', size: 14 + Math.random() * 6 });
    if (cat.mind.activity === 'sleep' || cat.mind.activity === 'cuddle') { particle('prr', b.top.x, b.top.y + 10, { color: '#e6d8f5', size: 11 }); return; }
    interrupt(cat, (function* () {
      b.reset({ sit: 1, tailUp: 1, tailCurl: .9, eyes: 0, headRoll: (Math.random() < .5 ? -1 : 1) * .25 }); b.face = 'happy'; b.look = null;
      if (cat.mind.stats.pets % 4 === 1) say(cat, 'pet', 1, true);
      let t = 0; while (t < 1.6) { const dt = yield; t += dt; if (Math.random() < dt * 4) particle('prr', b.top.x + (Math.random() - .5) * 30, b.top.y + 14, { color: '#e6d8f5', size: 10, rise: 16, life: 1 }); }
      b.face = 'open'; b.set({ eyes: 1, headRoll: 0 });
    })(), PRIORITY.react, 'react');
    if (cat.mind.stats.pets === 1 || cat.mind.stats.pets % 15 === 0) log(`You petted ${cat.name}${cat.mind.stats.pets > 1 ? ` (${cat.mind.stats.pets} times so far)` : ''}.`);
  }
  function onBoop(cat) {
    const r = cat.mind.boop(), b = cat.body;
    interrupt(cat, (function* () {
      b.look = 'viewer'; b.bounce(.8);
      if (cat.kind === 'black' && Math.random() < .5) {
        // Bean falls over from the sheer force of the boop.
        b.reset({ loaf: 1, curl: .6, eyes: 0 }); b.face = 'happy'; say(cat, 'boop', 1, true); yield* wait(1.2); b.reset({ sit: 1 }); b.face = 'open'; yield* wait(.8); return;
      }
      if (r === 'annoyed') { b.reset({ sit: 1, earsBack: 1, tailWag: 1 }); b.face = 'grumpy'; say(cat, 'boop', 1, true); yield* wait(2); b.face = 'open'; return; }
      if (r === 'playful') { b.reset({ crouch: .8, pupil: 1.3 }); b.face = 'focus'; say(cat, 'boop', 1, true); yield* wait(.5); b.set({ swat: 1 }); yield* wait(.25); b.set({ swat: 0 }); yield* wait(.25); b.set({ swat: 1 }); yield* wait(.25); b.set({ swat: 0 }); b.face = 'open'; return; }
      b.reset({ sit: 1, tailUp: 1 }); b.face = 'happy'; say(cat, 'boop', 1, true); particle('♥', b.top.x, b.top.y, { color: '#f29bb0' });
      yield* wait(1.4); b.face = 'open';
    })(), PRIORITY.react, 'react');
  }
  function startCarry(cat) {
    W.drag = { cat }; cat.mind.carried(); cat.mind.begin('carried');
    cat.plan = (function* () { while (W.drag?.cat === cat) yield; })(); cat.prio = PRIORITY.carried;
    const b = cat.body; b.stop(); b.jump = null; b.reset({ dangle: 1, tailUp: -.8, earsBack: cat.mind.t.grumpy > .5 ? .7 : .2 }); b.face = cat.mind.t.grumpy > .5 ? 'grumpy' : 'wide';
    b.look = 'viewer'; say(cat, 'carried', 1, true);
  }
  function drop(cat) {
    const b = cat.body; W.drag = null;
    // Find the surface under the cat: a shelf below the paws, or the floor.
    measure(true);
    const shelf = W.shelves.find(s => b.x > s.rect.left + 10 && b.x < s.rect.right - 10 && s.rect.top >= b.gy - 6 && s.rect.top - b.gy < 400);
    const f = floorInfo(), z = clamp(b.z, f.zMin, f.zMax);
    const target = shelf ? { surface: shelf, z: 0, y: shelf.rect.top + 1 } : { surface: FLOOR, z, y: groundAt(FLOOR, z).y };
    b.shadowY = null; b.reset({ leap: 1, tailUp: .9, earsBack: .3 }); b.face = 'wide';
    b.leap(b.x, target.y, target.z, 0, clamp(Math.sqrt(Math.max(0, target.y - b.gy) / 1400), .15, .7));
    cat.surface = FLOOR;
    cat.plan = (function* () {
      while (b.jump) yield;
      setSurface(cat, target.surface); puff(b.x, b.gy, 4);
      b.reset({ crouch: .5 }); yield* wait(.25); b.reset({ sit: 1 }); b.face = 'open';
      say(cat, 'landed', .8, true); cat.target = null;
      yield* wait(1);
      if (cat.mind.t.grumpy > .5) yield* A.groom(cat);
    })();
    cat.prio = PRIORITY.react;
  }

  function onPointerMove(e) {
    const now = performance.now(), x = e.clientX, y = e.clientY;
    W.idleSince = now;
    const prev = W.pointer;
    const dist = prev ? Math.hypot(x - prev.x, y - prev.y) : 0, dtm = prev ? Math.max(8, now - prev.t) : 16;
    W.pointer = { x, y, t: now, speed: dist / dtm, touch: e.pointerType === 'touch' };
    W.overUI = !!e.target?.closest?.(UI);
    if (W.drag) { e.preventDefault?.(); return; }
    if (W.press && Math.hypot(x - W.press.x, y - W.press.y) > 8 && W.press.cat) { startCarry(W.press.cat); W.press = null; return; }
    const hovered = !W.overUI && !e.target?.closest?.('dialog') ? catAt(x, y) : null;
    if (hovered !== W.hovered) { W.hovered = hovered; W.petDist = 0; document.documentElement.classList.toggle('cat-hover', !!hovered); }
    if (hovered && e.pointerType !== 'touch') {
      const speed = W.pointer.speed;
      if (speed > .03 && speed < 1.4) { W.petDist += dist; if (W.petDist > 150) { W.petDist = 0; onPet(hovered); } }
    }
    // Fast cursor near a shy cat startles it.
    if (!W.overUI && W.pointer.speed > 2.2 && e.pointerType !== 'touch') {
      for (const c of cats) {
        if (c.mind.t.bold > .4 || c.prio >= PRIORITY.react || Math.hypot(c.body.x - x, c.body.gy - 40 - y) > 140) continue;
        if (W.time < (c.scaredAt || 0) + 8) continue;
        c.scaredAt = W.time; c.mind.startle(); const b = c.body;
        interrupt(c, (function* () {
          b.look = { x, y }; b.reset({ earsBack: 1, tailPuff: 1, tailUp: .6 }); b.face = 'wide'; b.bounce(1.2); say(c, 'cursorFast', 1);
          b.leap(b.x, b.gy, b.z, 22, .32); while (b.jump) yield;
          yield* travel(c, findSpot(c, { prefer: 'floor', near: clamp(b.x + (b.x > x ? 220 : -220), 40, W.w - 40), spread: 80 }), runSpeed(c));
          b.reset({ sit: 1 }); b.face = 'open'; b.look = { x, y }; yield* wait(1.5);
        })(), PRIORITY.react, 'react');
      }
    }
  }
  function onPointerDown(e) {
    if (e.button !== 0 || e.target?.closest?.(UI) || document.querySelector('dialog[open]')) return;
    const cat = catAt(e.clientX, e.clientY);
    if (!cat) return;
    e.preventDefault();
    W.press = { cat, x: e.clientX, y: e.clientY, t: performance.now() };
  }
  function onPointerUp() {
    if (W.drag) { drop(W.drag.cat); return; }
    if (W.press) { const cat = W.press.cat; W.press = null; onBoop(cat); }
  }
  function onTouchStart(e) {
    const t = e.touches[0]; if (!t || e.target?.closest?.(UI)) return;
    if (catAt(t.clientX, t.clientY)) e.preventDefault();
  }
  function onDoubleClick(e) {
    if (e.target?.closest?.(UI) || catAt(e.clientX, e.clientY)) return;
    if (String(getSelection?.() || '').trim()) return;
    dropTreat(e.clientX, e.clientY);
  }
  function dropTreat(x = W.w * (.3 + Math.random() * .4), y = 80) {
    if (W.treat && !W.treat.eaten) return;
    measure(true);
    const shelf = W.shelves.find(s => x > s.rect.left + 10 && x < s.rect.right - 10 && s.rect.top >= y && s.rect.top - y < 500);
    const f = floorInfo(), z = shelf ? 0 : f.zMin * Math.random() * .6;
    W.treat = { x, y, vy: 0, falling: true, surface: shelf || FLOOR, z, ground: shelf ? shelf.rect.top : groundAt(FLOOR, z).y, eaten: false, spin: 0 };
    log('You dropped a treat.');
    for (const c of cats) if (c.prio < PRIORITY.treat && !['sleep', 'cuddle'].includes(c.mind.activity) || c.mind.drives.hungry > 50) {
      if (c.prio >= PRIORITY.treat) continue;
      c.mind.begin('treat'); c.plan = A.treat(c); c.prio = PRIORITY.treat;
    }
  }
  function setLaser(on) {
    W.laser = on; $('cat-laser-btn')?.setAttribute('aria-pressed', String(on));
    document.documentElement.classList.toggle('cat-laser', on);
    if (on) { log('You turned on the laser pointer.'); for (const c of cats) if (c.prio < PRIORITY.laser) { c.mind.begin('laser'); c.plan = A.laser(c); c.prio = PRIORITY.laser; } }
  }
  function setCalm(on) {
    W.calm = on;
    for (const id of ['cat-calm-btn', 'cat-calm-dock']) { const el = $(id); if (el) { el.setAttribute('aria-pressed', String(on)); el.textContent = on ? 'Wake cats' : 'Calm cats'; } }
    for (const c of cats) if (c.prio < PRIORITY.react) { c.plan = null; c.prio = 0; }
    if (!on) for (const c of cats) c.mind.drives.sleepy = Math.min(c.mind.drives.sleepy, 15);
    save();
  }
  function setAquarium(on) {
    W.aquarium = on; document.body.classList.toggle('cat-wallpaper', on);
    const btn = $('cat-aquarium-btn'); if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? (room ? 'Back to room' : 'Back to site') : 'Aquarium'; }
    const url = new URL(location.href); if (on) url.searchParams.set('wallpaper', '1'); else url.searchParams.delete('wallpaper'); history.replaceState(history.state, '', url);
    for (const el of document.querySelectorAll(room ? '.room-nav,.playlist-column' : '.home-main,.site-footer')) el.inert = on;
    resize(); measure(true);
    const f = floorInfo();
    for (const c of cats) {
      c.surface = FLOOR; c.body.jump = null; c.body.stop(); c.body.z = clamp(c.body.z, f.zMin, f.zMax);
      if (on) c.body.z = f.zMin + Math.random() * (f.zMax - f.zMin);
      c.plan = null; c.prio = 0;
    }
  }

  // ---------- panel ----------
  const panel = $('cat-panel'), panelBtn = $('cat-panel-btn');
  function setPanel(open) {
    panel.hidden = !open; panelBtn.setAttribute('aria-expanded', String(open));
    if (open) { renderPanel(true); renderJournal(); }
  }
  function hearts(n) { const full = Math.round(clamp(n, 0, 100) / 20); return '♥'.repeat(full) + '♡'.repeat(5 - full); }
  function renderPanel(force = false) {
    if (panel.hidden && !force) return;
    for (const c of cats) {
      const card = panel.querySelector(`[data-cat-card="${c.kind}"]`); if (!card) continue;
      const set = (sel, text) => { const el = card.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
      set('[data-doing]', c.mind.label);
      set('[data-feels]', c.mind.feelings().join(', '));
      set('[data-trust]', hearts(c.mind.trust));
      set('[data-thought]', c.thought ? `“${c.thought}”` : '');
      const bonds = Object.entries(c.mind.bonds).sort((a, b) => b[1] - a[1]);
      const best = bonds[0], worst = bonds[bonds.length - 1];
      set('[data-bonds]', `Closest to ${CAST[best[0]].name}${worst[1] < 0 ? ` · avoids ${CAST[worst[0]].name}` : ''}`);
    }
  }
  function renderJournal() {
    const list = $('cat-journal'); if (!list || panel.hidden) return;
    const items = journal.slice(-8).reverse();
    list.replaceChildren(...items.map(item => {
      const li = document.createElement('li'), time = document.createElement('time');
      const d = new Date(item.t); time.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); time.dateTime = d.toISOString();
      li.append(time, ' ', item.text); return li;
    }));
    if (!items.length) { const li = document.createElement('li'); li.textContent = 'Nothing yet. Give it a minute.'; list.append(li); }
  }
  for (const card of panel.querySelectorAll('[data-cat-card]')) {
    const traits = card.querySelector('[data-traits]'); if (traits) traits.textContent = traitWords(CAST[card.dataset.catCard].traits).join(' · ');
  }

  // ---------- persistence ----------
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ visits, lastSeen: Date.now(), calm: W.calm, cats: Object.fromEntries(cats.map(c => [c.kind, c.mind.memory()])), journal: journal.slice(-12) }));
    } catch {}
  }

  // ---------- simulation ----------
  function resize() {
    W.w = innerWidth; W.h = innerHeight; W.dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(W.w * W.dpr); canvas.height = Math.round(W.h * W.dpr);
    canvas.style.width = W.w + 'px'; canvas.style.height = W.h + 'px';
    W.base = floorTarget(); measure(true);
    const f = floorInfo();
    for (const c of cats) { c.body.x = clamp(c.body.x, 20, W.w - 20); c.body.z = clamp(c.body.z, f.zMin, f.zMax); c.target = null; }
  }
  function place(c, i) {
    const f = floorInfo(), spot = findSpot(c, { prefer: 'floor', near: W.w * (.15 + i * .23), spread: 120 });
    c.surface = FLOOR; c.body.x = spot.x; c.body.z = spot.z ?? f.zMin * Math.random();
    c.body.yaw = Math.random() < .6 ? Math.PI / 2 + (Math.random() - .5) : Math.random() * TAU;
    const pose = ['sit', 'loaf', 'sit', 'curl'][Math.floor(Math.random() * 4)];
    c.body.reset({ [pose]: 1 }); Object.assign(c.body.pose, c.body.goal);
  }

  function floorTarget() {
    if (W.aquarium) return W.h * .95;
    const el = document.querySelector(HOME_FLOOR);
    if (el && visible(el)) { const r = el.getBoundingClientRect(); if (r.top > 200 && r.top < W.h - 6) return r.top - 2; }
    return W.h - 6;
  }
  // Scrolling carries the cats along; when their floor switches, they hop to the new one.
  function updateFloor() {
    const next = floorTarget(), prev = W.base ?? next;
    W.base = next;
    if (Math.abs(next - prev) < 40) return;
    for (const c of cats) {
      if (c.surface.type !== 'floor' || c.body.jump || W.drag?.cat === c) continue;
      const b = c.body, y = groundAt(FLOOR, b.z).y;
      b.leap(b.x, y, b.z, next > prev ? 10 : 50, clamp(Math.sqrt(Math.abs(next - prev) / 1600), .3, .7));
      b.jump.gy0 = prev + b.z;
      if (c.prio < PRIORITY.react) { c.plan = null; c.prio = 0; }
    }
  }

  function updateCritter(dt) {
    const bug = W.critter;
    if (!bug) {
      W.nextCritter -= dt;
      if (W.nextCritter <= 0 && !W.calm && !reduced()) {
        W.nextCritter = (W.aquarium ? 40 : 70) + Math.random() * 90;
        const fromLeft = Math.random() < .5;
        W.critter = { x: fromLeft ? -20 : W.w + 20, y: W.h * (.45 + Math.random() * .3), dir: fromLeft ? 1 : -1, t: 0, flap: 0, hue: pick(['#f2c78d', '#c3acf0', '#8fd3b5', '#f29bb0']), flee: false, gone: false, life: 25 + Math.random() * 15 };
        log('A butterfly drifted in.');
        // The curious notice first.
        for (const c of cats) if (c.prio < PRIORITY.social && Math.random() < c.mind.t.curiosity * .7 && !['sleep', 'cuddle'].includes(c.mind.activity)) { c.mind.begin('hunt'); c.plan = A.hunt(c); c.prio = PRIORITY.normal + 5; }
      }
      return;
    }
    bug.t += dt; bug.flap += dt * 18;
    const floorY = floorInfo().base;
    if (bug.flee || bug.t > bug.life) { bug.y -= dt * 160; bug.x += bug.dir * dt * 120; if (bug.y < -40) { bug.gone = true; W.critter = null; } return; }
    bug.x += bug.dir * dt * (40 + Math.sin(bug.t * .7) * 30);
    bug.y += Math.sin(bug.t * 2.1) * dt * 60 + Math.sin(bug.t * .45) * dt * 25;
    bug.y = clamp(bug.y, W.h * .3, floorY - 60);
    if (bug.x < 30) bug.dir = 1; if (bug.x > W.w - 30) bug.dir = -1;
  }
  function updateTreat(dt) {
    const tr = W.treat; if (!tr) return;
    if (tr.falling) {
      tr.vy += 1800 * dt; tr.y += tr.vy * dt; tr.spin += dt * 9;
      if (tr.y >= tr.ground) { tr.y = tr.ground; if (tr.vy > 250) { tr.vy *= -.35; puff(tr.x, tr.y, 2); } else { tr.falling = false; tr.vy = 0; } }
    } else if (tr.surface?.type === 'shelf') { tr.surface.rect = tr.surface.el.getBoundingClientRect(); tr.y = tr.surface.rect.top; }
  }

  let last = performance.now(), raf = 0, saveAt = 0, panelAt = 0, hiddenAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    W.time += dt;
    measure();
    updateFloor();
    const day = dayRhythm(new Date().getHours());
    for (const c of cats) {
      const near = cats.some(o => o !== c && Math.abs(o.body.x - c.body.x) < 120 && o.surface === c.surface);
      c.mind.tick(dt, { day, nearFriend: near });
      // Follow the shelf as the page scrolls; fall off if it leaves the screen.
      if (c.surface.type === 'shelf' && !c.body.jump) {
        const el = c.surface.el;
        if (!document.contains(el) || !visible(el)) { c.surface = FLOOR; c.plan = null; c.prio = 0; }
        else {
          c.surface.rect = el.getBoundingClientRect();
          if (c.body.move) c.dx = c.body.x - c.surface.rect.left; else c.body.x = c.surface.rect.left + c.dx;
          if (c.surface.rect.top < 30 || c.surface.rect.top > W.h - 10) {
            const f = floorInfo(), z = f.zMax - 5;
            c.body.leap(clamp(c.body.x, 20, W.w - 20), groundAt(FLOOR, z).y, z, 10, .5); c.surface = FLOOR;
            if (c.prio < PRIORITY.react) { c.plan = null; c.prio = 0; }
          }
        }
      }
      if (W.drag?.cat === c) {
        const p = W.pointer; if (p) { c.body.x = p.x; c.body.gy = p.y + (c.body.L.legLen + c.body.L.bodyR * 3.2) * c.body.k; c.body.h = 0; c.body.shadowY = groundAt(FLOOR, c.body.z).y; }
      } else step(c, dt);
      c.body.update(dt);
      if (!c.body.jump && W.drag?.cat !== c) {
        const g = groundAt(c.surface, c.body.z);
        if (c.surface.type === 'shelf') { c.body.gy = g.y; c.body.x = clamp(c.body.x, c.surface.rect.left + 8, c.surface.rect.right - 8); }
        else { const f = floorInfo(); c.body.z = clamp(c.body.z, f.zMin, f.zMax); c.body.gy = groundAt(FLOOR, c.body.z).y; c.body.x = clamp(c.body.x, -30, W.w + 30); }
        c.body.k = g.k;
      } else if (c.body.jump) {
        const f = floorInfo(); const t = (c.body.z - f.zMin) / (f.zMax - f.zMin || 1);
        c.body.k = scaleBase() * (W.aquarium ? .72 + t * .7 : .84 + t * .16);
      }
      // Fade over controls and text; cats are guests, not obstacles.
      const bb = c.body.bounds, core = { left: bb.left + 8, right: bb.right - 8, top: bb.top + 10, bottom: bb.bottom - 4 };
      const dragged = W.drag?.cat === c, overControl = !dragged && W.ghosts.some(r => hits(core, r));
      // On phones there's no empty floor, so cats also soften over text.
      const overText = !dragged && !overControl && W.w < 700 && !W.aquarium && W.protect.some(r => hits(core, r));
      c.ghost += ((overControl ? 1 : overText ? .5 : 0) - c.ghost) * Math.min(1, dt * 6);
      c.body.alpha = 1 - c.ghost * .72;
    }
    updateCritter(dt); updateTreat(dt);
    for (const p of W.particles) { p.age += dt; p.x += p.vx * dt; p.y -= p.rise * dt / p.life; }
    W.particles = W.particles.filter(p => p.age < p.life);
    render();
    if (now > panelAt) { panelAt = now + 500; renderPanel(); }
    if (now > saveAt) { saveAt = now + 15000; save(); }
  }

  function render() {
    const c2 = ctx; c2.setTransform(W.dpr, 0, 0, W.dpr, 0, 0); c2.clearRect(0, 0, W.w, W.h);
    // Treat.
    if (W.treat && !W.treat.eaten) drawTreat(c2, W.treat);
    else if (W.treat?.eaten && W.treat.eater) { /* being eaten: hidden by the cat's head */ }
    const order = [...cats].sort((a, b) => (W.drag?.cat === a) - (W.drag?.cat === b) || a.body.gy - b.body.gy);
    for (const c of order) c.body.draw(c2);
    if (W.critter) drawButterfly(c2, W.critter);
    for (const p of W.particles) drawParticle(c2, p);
    for (const c of order) drawBubble(c2, c);
    if (W.hovered && !W.drag && !W.hovered.bubble) drawTag(c2, W.hovered);
    if (W.laser && W.pointer && !W.overUI) {
      const p = W.pointer; c2.save(); c2.fillStyle = '#ff3b5c'; c2.shadowColor = '#ff2d55'; c2.shadowBlur = 14;
      c2.beginPath(); c2.arc(p.x, p.y, 5 + Math.sin(W.time * 30) * .6, 0, TAU); c2.fill(); c2.restore();
    }
  }
  function drawTreat(c2, tr) {
    c2.save(); c2.translate(tr.x, tr.y - 6); c2.rotate(Math.sin(tr.spin) * .5);
    c2.fillStyle = '#3D2C3E'; c2.beginPath(); c2.ellipse(0, 0, 11, 6.5, 0, 0, TAU); c2.moveTo(8, 0); c2.lineTo(17, -6); c2.lineTo(17, 6); c2.closePath(); c2.fill();
    c2.fillStyle = '#9fc6e8'; c2.beginPath(); c2.ellipse(0, 0, 9, 4.6, 0, 0, TAU); c2.moveTo(9, 0); c2.lineTo(15, -4); c2.lineTo(15, 4); c2.closePath(); c2.fill();
    c2.fillStyle = '#2b2030'; c2.beginPath(); c2.arc(-5, -1, 1.3, 0, TAU); c2.fill(); c2.restore();
  }
  function drawButterfly(c2, b) {
    const f = Math.abs(Math.sin(b.flap)) * .8 + .2;
    c2.save(); c2.translate(b.x, b.y); c2.scale(b.dir, 1);
    c2.fillStyle = b.hue; c2.strokeStyle = '#3D2C3E'; c2.lineWidth = 1.5;
    for (const s of [-1, 1]) { c2.beginPath(); c2.ellipse(-3, s * 6 * f, 7, 9 * f, s * .5, 0, TAU); c2.fill(); c2.stroke(); c2.beginPath(); c2.ellipse(4, s * 4 * f, 4.5, 6 * f, -s * .4, 0, TAU); c2.fill(); c2.stroke(); }
    c2.fillStyle = '#3D2C3E'; c2.beginPath(); c2.ellipse(0, 0, 7, 2, 0, 0, TAU); c2.fill(); c2.restore();
  }
  function drawParticle(c2, p) {
    const a = 1 - p.age / p.life;
    c2.save(); c2.globalAlpha = clamp(a * 1.6, 0, 1);
    if (p.glyph === 'dust') { c2.fillStyle = p.color; c2.globalAlpha *= .5; c2.beginPath(); c2.arc(p.x, p.y, p.size * (1 + p.age * 2), 0, TAU); c2.fill(); }
    else { c2.fillStyle = p.color; c2.font = `700 ${p.size}px ${font}`; c2.textAlign = 'center'; c2.fillText(p.glyph, p.x, p.y); }
    c2.restore();
  }
  function roundRect(c2, x, y, w, h, r) { c2.beginPath(); c2.moveTo(x + r, y); c2.arcTo(x + w, y, x + w, y + h, r); c2.arcTo(x + w, y + h, x, y + h, r); c2.arcTo(x, y + h, x, y, r); c2.arcTo(x, y, x + w, y, r); c2.closePath(); }
  function drawBubble(c2, cat) {
    const bb = cat.bubble; if (!bb) return;
    if (W.time > bb.until) { cat.bubble = null; return; }
    const fade = clamp((bb.until - W.time) * 3, 0, 1) * (1 - cat.ghost * .8);
    const x = cat.body.top.x, y = cat.body.top.y - 6;
    c2.save(); c2.globalAlpha = fade;
    if (bb.think) {
      c2.fillStyle = '#2f2a3aee'; c2.beginPath(); c2.arc(x + 14, y - 16, 15, 0, TAU); c2.fill();
      c2.beginPath(); c2.arc(x + 4, y - 1, 3.5, 0, TAU); c2.fill();
      c2.fillStyle = '#f8f3e9'; c2.font = `700 15px ${font}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(bb.text, x + 14, y - 15);
    } else {
      c2.font = `600 13px ${font}`; const tw = c2.measureText(bb.text).width, w = tw + 22, h = 30;
      // Above the head unless that covers a control; then beside it.
      const options = [[x - w / 2, y - h - 8], [x + 24, y - h / 2 + 10], [x - w - 24, y - h / 2 + 10]].map(([ox, oy]) => [clamp(ox, 6, W.w - w - 6), Math.max(6, oy)]);
      const [bx, by] = options.find(([ox, oy]) => !W.ghosts.some(r => hits({ left: ox, top: oy, right: ox + w, bottom: oy + h + 8 }, r))) || options[0];
      c2.fillStyle = '#2f2a3af2'; roundRect(c2, bx, by, w, h, 14); c2.fill();
      c2.beginPath(); c2.moveTo(clamp(x - 5, bx + 10, bx + w - 16), by + h - 1); c2.lineTo(clamp(x + 6, bx + 18, bx + w - 8), by + h - 1); c2.lineTo(clamp(x, bx + 8, bx + w - 8), by + h + 7); c2.fill();
      c2.fillStyle = '#f8f3e9'; c2.textBaseline = 'middle'; c2.fillText(bb.text, bx + 11, by + h / 2 + 1);
    }
    c2.restore();
  }
  function drawTag(c2, cat) {
    const text = `${cat.name} · ${cat.mind.label.toLowerCase()}`;
    c2.save(); c2.font = `600 12px ${font}`; const w = c2.measureText(text).width + 18, x = clamp(cat.body.top.x - w / 2, 6, W.w - w - 6), y = Math.max(6, cat.body.top.y - 34);
    c2.fillStyle = '#2f2a3ae6'; roundRect(c2, x, y, w, 24, 12); c2.fill();
    c2.fillStyle = cat.cast.look.collar; c2.beginPath(); c2.arc(x + 10, y + 12, 3, 0, TAU); c2.fill();
    c2.fillStyle = '#f1eaf7'; c2.textBaseline = 'middle'; c2.fillText(text, x + 17, y + 12.5); c2.restore();
  }

  // ---------- context from the page ----------
  function updateContext() {
    const before = W.playing; W.playing = document.body.dataset.playback === 'playing';
    W.vibe = videoVibe(W.title).kind;
    if (W.playing && !before) for (const c of cats) if (c.prio < PRIORITY.social && Math.random() < .55 && !['sleep', 'cuddle'].includes(c.mind.activity)) { c.plan = null; c.prio = 0; }
    if (!W.playing && before) {
      const watchers = cats.filter(c => c.mind.activity === 'watch' || c.mind.activity === 'dance');
      watchers.forEach((c, i) => interrupt(c, (function* () { c.body.look = 'viewer'; think(c, '?', 1.8); if (i === 0) say(c, 'pause', 1, true); yield* wait(2.5); })(), PRIORITY.react));
    }
  }
  const playbackWatch = new MutationObserver(updateContext);
  playbackWatch.observe(document.body, { attributes: true, attributeFilter: ['data-playback'] });
  disposers.push(() => playbackWatch.disconnect());

  listen(window, 'resize', resize);
  listen(window, 'scroll', () => { W.rectsAt = -1; }, { passive: true });
  listen(document, 'pointermove', onPointerMove, { passive: true });
  listen(document, 'pointerdown', onPointerDown);
  listen(document, 'pointerup', onPointerUp);
  listen(document, 'pointercancel', onPointerUp);
  listen(document, 'touchstart', onTouchStart, { passive: false });
  listen(document, 'dblclick', onDoubleClick);
  listen(document.documentElement, 'pointerleave', () => { W.pointer = null; W.hovered = null; document.documentElement.classList.remove('cat-hover'); });
  listen(document, 'keydown', e => {
    W.idleSince = performance.now();
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (W.laser) setLaser(false);
    else if (!panel.hidden) { setPanel(false); panelBtn.focus(); }
    else if (W.aquarium) setAquarium(false);
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) { hiddenAt = performance.now(); save(); return; }
    const away = (performance.now() - hiddenAt) / 1000; last = performance.now();
    if (!hiddenAt || away < 45) return;
    // Life went on without you.
    const day = dayRhythm(new Date().getHours());
    for (let t = 0; t < Math.min(away, 3600); t += 5) for (const c of cats) c.mind.tick(5, { day, nearFriend: Math.random() < .4 });
    cats.forEach((c, i) => { place(c, i); c.plan = null; c.prio = 0; if (c.body.goal.curl) c.mind.begin('sleep'); });
    const summary = awaySummary(cats.map(c => c.mind), away); if (summary) log(summary);
    const host = [...cats].sort((a, b) => b.mind.trust - a.mind.trust)[0];
    host.mind.begin('approach'); host.plan = (function* () { yield* A.approach(host); })(); host.prio = PRIORITY.react;
    W.speechAt = 0;
  });
  listen(window, 'pagehide', save);
  listen(panelBtn, 'click', () => setPanel(panel.hidden));
  listen($('cat-panel-close'), 'click', () => { setPanel(false); panelBtn.focus(); });
  listen($('cat-treat-btn'), 'click', () => dropTreat());
  listen($('cat-snack-btn'), 'click', () => dropTreat());
  listen($('cat-laser-btn'), 'click', () => setLaser(!W.laser));
  listen($('cat-aquarium-btn'), 'click', () => setAquarium(!W.aquarium));
  listen($('cat-calm-btn'), 'click', () => setCalm(!W.calm));
  listen($('cat-calm-dock'), 'click', () => setCalm(!W.calm));
  listen(document.querySelector('.create-room-button'), 'pointerenter', () => { const c = byKind.pink; if (c.prio < PRIORITY.react) { c.body.look = { x: W.pointer?.x ?? W.w / 2, y: W.pointer?.y ?? 200 }; say(c, 'createHover', .6); } });
  listen($('url-in'), 'focus', () => { const c = byKind.black; say(c, 'newVideo', .4); });

  // ---------- start ----------
  resize();
  cats.forEach(place);
  setCalm(W.calm);
  if (new URLSearchParams(location.search).get('wallpaper') === '1') setAquarium(true);
  // Greet the visitor.
  {
    const host = firstVisit ? byKind.mint : [...cats].sort((a, b) => b.mind.trust - a.mind.trust)[0];
    const key = firstVisit ? 'greet' : sinceLast > 4 * 3600 ? 'returnLong' : null;
    if (key) {
      host.mind.begin('approach'); host.prio = PRIORITY.react;
      host.plan = (function* () { yield* wait(1.2); yield* A.approach(host); })();
      setTimeout(() => say(host, key, 1, true), 2600);
      if (firstVisit) log('You met the cats.'); else log(`You came back after ${Math.round(sinceLast / 3600)} hours. ${host.name} noticed.`);
    } else if (!journal.length) log('The cats are settling in.');
  }
  raf = requestAnimationFrame(t => { last = t; frame(t); });

  active = {
    cats, world: W,
    observe(data) {
      if (data.title !== undefined && data.title !== W.title) {
        const had = !!W.title; W.title = data.title; updateContext();
        if (had || data.title) for (const c of cats) if (c.prio < PRIORITY.react && !['sleep', 'cuddle'].includes(c.mind.activity)) {
          c.body.set({ earsBack: 0 }); const s = stageCenter(); if (s) c.body.look = { ...s, behind: true }; think(c, '!', 1.2);
        }
        if (data.title) { say(pick(cats), 'newVideo', .7); log(`New video: ${data.title.slice(0, 60)}`); }
      }
      if (W.users !== null && data.users > W.users) {
        const c = byKind.mint; say(c, 'newcomer', 1, true); log('Someone joined the room. The cats noticed.');
        for (const o of cats) if (o.prio < PRIORITY.react) o.body.look = { x: Math.random() < .5 ? 0 : W.w, y: W.h * .6 };
      }
      if (data.users !== undefined) W.users = data.users;
    },
    linkError(message) { if (message) say(byKind.mint, 'linkError', 1, true); },
    inviteCopied() { say(byKind.mint, 'invite', 1, true); },
    treat: dropTreat, laser: setLaser, aquarium: setAquarium, calm: setCalm,
    destroy() {
      cancelAnimationFrame(raf); disposers.forEach(d => d()); save();
      document.body.classList.remove('cat-simulation', 'cat-wallpaper'); universe.hidden = true;
      legacy.forEach(el => { el.removeAttribute('tabindex'); el.removeAttribute('aria-hidden'); }); active = null;
    },
  };
  if (new URLSearchParams(location.search).has('catdebug')) window.youpleCats = active;
  return active;
}
