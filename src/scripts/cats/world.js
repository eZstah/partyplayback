// The habitat: one canvas over the whole page, with Bean as its sole resident.
// The page is their furniture. Cards are boxes they climb, sit on, hide behind
// and peek over; big words are ledges; the screen edges are doorways to
// somewhere else; and the glass between them and you is something to tap on.
// The canvas never takes pointer events, so everything under a cat still works.
import { CatBody } from './body.js';
import { createRuntime } from './runtime.js';
import { planRelease } from './release.js';
import { refusePickup } from './handling.js';
import { windUp, windUpTime, flightTrick, arcFor } from './moves.js';
import { CAST, ACTIVE_KINDS } from './cast.js';
import { Mind, awaySummary, clamp, dayRhythm, pick as sample, videoVibe } from './mind.js';

const STORE = 'youple-cats-v1';
const UI = 'a,button,input,select,textarea,label,summary,iframe,video,dialog,[role=button],[role=switch],[contenteditable=true],.cat-dock,#player-wrap,.control-bar';
// Things people click. Cats never settle over these.
const CONTROLS = 'a,button,input,select,textarea,summary,label,[role=button],[role=switch],#add-form,.control-bar,.cat-dock,.toast,.playlist-add-feedback';
// Opaque cards: cats sit on top, hide behind, and peek over or around them.
const SOLIDS = '.room-launcher,#stage,.playlist-panel,.member-rooms';
// Small boxes and big words: places to sit, too small to hide behind.
const BOXES = '.step-symbol,#q-list > li';
const WORDS = '.hero-wordmark,.how-it-works h2,.how-grid h3,.room-wordmark-link,.room-name';
// Text cats prefer not to sit on top of.
const TEXT = 'h1,h2,h3,p,li,summary,.how-grid article';
// Decorations a cat may knock about.
const TOYS = '.step-symbol,.floating-popcorn,.room-doodle,.bg-spark';
// Aquarium furniture (CatHabitat.astro). Any element marked data-perch becomes a surface:
// "solid" is opaque (climb, sit on top, hide behind, peek over), "shelf" is a platform.
const PERCHES = '#cat-universe [data-perch]';
const HABITAT_TOYS = '#cat-universe [data-toy]';
const PHONE = '(max-width: 760px), (hover: none) and (pointer: coarse)';
const PRIORITY = { carried: 100, evade: 90, react: 80, treat: 70, laser: 60, social: 50, normal: 10 };
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);

let active = null;
// Phones get the static mascots; the living cats need a big screen and a mouse.
const STUB = { cats: [], snapshot: () => ({ disabled: true, cats: [] }), observe() {}, linkError() {}, inviteCopied() {}, greet() {}, treat() {}, laser() {}, aquarium() {}, calm() {}, destroy() {} };

export function bootCats({ seed } = {}) {
  if (active) return active;
  const universe = document.getElementById('cat-universe');
  if (!universe || matchMedia(PHONE).matches) return STUB;
  const params = new URLSearchParams(location.search);
  const debug = params.has('catdebug');
  const requestedSeed = seed ?? (debug && params.has('catseed') ? Number(params.get('catseed')) : undefined);
  const runtime = createRuntime({ seed: Number.isFinite(requestedSeed) ? requestedSeed : undefined });
  const random = runtime.random, pick = list => sample(list, random), clock = () => runtime.time * 1000;
  universe.hidden = false;
  document.body.classList.add('cat-simulation');
  const legacy = [...document.querySelectorAll('.mascot-cast .mascot,.room-pal .mascot')];
  legacy.forEach(el => { el.tabIndex = -1; el.setAttribute('aria-hidden', 'true'); });
  const $ = id => document.getElementById(id);
  const canvas = $('cat-canvas'), ctx = canvas.getContext('2d');
  // Cats behind the page are drawn here first, then the cards are cut out of them.
  const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  const measurer = document.createElement('canvas').getContext('2d');
  const room = document.body.classList.contains('room-page');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const effects = new Map(), knocked = new Set(), inertBefore = new Map();
  const listen = runtime.listen;

  // Every decoration effect belongs to this mount, including its restoration.
  function animate(el, frames, options) {
    const animation = el.animate(frames, options);
    const release = () => { effects.get(animation)?.(); effects.delete(animation); };
    effects.set(animation, runtime.own(() => { animation.onfinish = null; animation.cancel(); effects.delete(animation); }));
    animation.addEventListener('cancel', release, { once: true });
    animation.addEventListener('finish', () => { if (!['forwards', 'both'].includes(options?.fill)) release(); }, { once: true });
    if (runtime.paused) animation.pause();
    return animation;
  }
  function restoreToy(el) { delete el.dataset.catKnocked; knocked.delete(el); }

  // ---------- memory ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch {}
  const firstVisit = !saved.visits, sinceLast = saved.lastSeen ? (Date.now() - saved.lastSeen) / 1000 : 0;
  const visits = (saved.visits || 0) + 1;
  const journal = Array.isArray(saved.journal) ? saved.journal.slice(-12) : [];

  // ---------- world state ----------
  const W = { w: innerWidth, h: innerHeight, dpr: 1, aquarium: false, calm: !!saved.calm, laser: false, time: 0,
    pointer: null, overUI: false, idleSince: clock(), controls: [], text: [], solids: [], ledges: [], toys: [], rectsAt: -1,
    treat: null, critter: null, nextCritter: 60 + random() * 90, particles: [], glass: [], speechAt: 0,
    playing: false, title: '', vibe: 'unknown', users: null, hovered: null, press: null, drag: null, petDist: 0,
    invitedUntil: 0, attentionReadyAt: 8 };

  const cats = ACTIVE_KINDS.map((kind, i) => {
    const mind = new Mind(kind, saved.cats?.[kind], random);
    const body = new CatBody(CAST[kind].look, random);
    const cat = { kind, i, name: CAST[kind].name, cast: CAST[kind], mind, body, plan: null, prio: 0, at: { kind: 'floor' }, target: null,
      bubble: null, nextGlance: 0, thought: '', xf: null, peek: null, closeup: null, forceMask: false, edgePaws: null, offAt: 0 };
    runtime.own(() => cancelPlan(cat));
    return cat;
  });
  const byKind = Object.fromEntries(cats.map(c => [c.kind, c]));
  const companion = byKind.black;

  // ---------- geometry ----------
  const S = () => clamp(Math.min(W.w / 1440, W.h / 900), .75, 1.3) * 1.05;
  function floor() {
    // Aquarium: a room. Furniture stands against the back at 87% of the height (cat-habitat.css
    // --floor), Bean walks in front of it, and a cat further back than that is behind it.
    if (W.aquarium) return { base: W.h * .95, slope: .42, zMin: -W.h * .13 / .42, zMax: 30, zBehind: -W.h * .08 / .42 };
    return { base: W.h - 10, slope: .42, zMin: -140, zMax: 60, zBehind: -55 };
  }
  const floorY = z => { const f = floor(); return f.base + z * f.slope; };
  const floorK = z => { const f = floor(); return S() * (W.aquarium ? 1.12 + z / -f.zMin * .6 : 1 + z / 420); };
  const LEDGE_K = .88, BEHIND_K = .84;
  const FLOOR = { kind: 'floor', left: 30, right: 0, y: () => floorY(0) };

  function visible(el) {
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    return !el.closest('#cat-universe,[hidden],[inert]');
  }
  function rectOf(el) { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }
  const onScreen = (r, pad = 0) => r.width > 2 && r.height > 2 && r.bottom > -pad && r.top < W.h + pad && r.right > -pad && r.left < W.w + pad;
  const radiusOf = el => { const v = parseFloat(getComputedStyle(el).borderTopLeftRadius); return Number.isFinite(v) ? v : 0; };
  const hits = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const inflate = (r, d) => ({ left: r.left - d, top: r.top - d, right: r.right + d, bottom: r.bottom + d });

  // Ledges: the tops of cards and boxes, and the skyline of big words.
  function boxLedge(el, solid = false) {
    const radius = radiusOf(el);
    return { el, kind: solid ? 'solid' : 'box', radius, inset: Math.min(radius * .7, 26) + 8, rect: null, left: 0, right: 0, top: 0, y() { return this.rect.top; } };
  }
  const glyphCache = new WeakMap();
  function glyphsOf(el, r) {
    const out = [], range = document.createRange(), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) {
      const cs = getComputedStyle(node.parentElement);
      measurer.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const fm = measurer.measureText('Hg'), text = node.textContent;
      for (let i = 0; i < text.length && out.length < 120; i++) {
        const ch = text[i]; if (!ch.trim()) continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        const q = range.getBoundingClientRect(); if (!q.width) continue;
        const ink = measurer.measureText(ch).actualBoundingBoxAscent;
        const baseline = q.top + (q.height - fm.fontBoundingBoxAscent - fm.fontBoundingBoxDescent) / 2 + fm.fontBoundingBoxAscent;
        out.push({ l: q.left - r.left, r: q.right - r.left, top: baseline - ink - r.top, line: q.top });
      }
    }
    if (!out.length) return out;
    const first = Math.min(...out.map(g => g.line));
    return out.filter(g => g.line < first + 4).sort((a, b) => a.l - b.l);
  }
  function wordLedge(el) {
    const r = rectOf(el); if (!onScreen(r)) return null;
    let g = glyphCache.get(el);
    if (!g || Math.abs(g.w - r.width) > 1 || Math.abs(g.h - r.height) > 1) { g = { w: r.width, h: r.height, glyphs: glyphsOf(el, r) }; glyphCache.set(el, g); }
    if (g.glyphs.length < 3) return null;
    return { el, kind: 'word', glyphs: g.glyphs, minTop: Math.min(...g.glyphs.map(q => q.top)), rect: r, left: 0, right: 0, top: 0,
      y(x) {
        const lx = x - this.rect.left, pad = 10; let best = Infinity, near = this.glyphs[0], nd = Infinity;
        for (const q of this.glyphs) {
          if (q.r >= lx - pad && q.l <= lx + pad) best = Math.min(best, q.top);
          const d = Math.min(Math.abs(q.l - lx), Math.abs(q.r - lx)); if (d < nd) { nd = d; near = q; }
        }
        return this.rect.top + (best < Infinity ? best : near.top);
      } };
  }
  function refresh(l) {
    if (!l || l === FLOOR) return l;
    const r = rectOf(l.el); l.rect = r;
    if (l.kind === 'word') { l.left = r.left + l.glyphs[0].l + 4; l.right = r.left + l.glyphs[l.glyphs.length - 1].r - 4; l.top = r.top + l.minTop; }
    else { l.left = r.left + l.inset; l.right = r.right - l.inset; l.top = r.top; }
    return l;
  }
  const sameLedge = (a, b) => a && b && (a === b || (a.el && a.el === b.el));

  function measure(force = false) {
    if (!force && W.time - W.rectsAt < .4) return;
    W.rectsAt = W.time;
    FLOOR.right = W.w - 30;
    W.controls = [];
    for (const el of document.querySelectorAll(CONTROLS)) {
      if (el.closest('#cat-world')) continue;
      const r = rectOf(el); if (onScreen(r) && visible(el)) W.controls.push(r);
    }
    W.text = [];
    for (const el of document.querySelectorAll(TEXT)) { if (el.closest('#cat-universe')) continue; const r = rectOf(el); if (onScreen(r) && visible(el)) W.text.push(r); }
    W.solids = []; W.ledges = []; W.toys = [];
    if (W.aquarium) { measureHabitat(); return; }
    for (const el of document.querySelectorAll(SOLIDS)) {
      if (!visible(el)) continue;
      const l = refresh(boxLedge(el, true));
      if (onScreen(l.rect, 300) && l.rect.width > 120 && l.rect.height > 70) W.solids.push(l);
    }
    const ledges = [...W.solids];
    for (const el of document.querySelectorAll(BOXES)) if (visible(el)) ledges.push(refresh(boxLedge(el)));
    for (const el of document.querySelectorAll(WORDS)) if (visible(el)) { const l = wordLedge(el); if (l) ledges.push(refresh(l)); }
    W.ledges = ledges.filter(l => l.right - l.left > 34 && l.top > 40 && l.top < W.h - 70 && l.right > 20 && l.left < W.w - 20);
    for (const el of document.querySelectorAll(TOYS)) if (visible(el)) { const r = rectOf(el); if (onScreen(r) && r.top > 40) W.toys.push({ el, rect: r }); }
  }

  // Aquarium: the habitat's furniture. In a room the player sits on the TV's screen, so the TV is its block.
  function measureHabitat() {
    const shown = el => !el.checkVisibility || el.checkVisibility({ visibilityProperty: true });
    const ledges = [];
    for (const el of document.querySelectorAll(PERCHES)) {
      if (!shown(el)) continue;
      const solid = el.dataset.perch === 'solid', l = refresh(boxLedge(el, solid));
      if (!onScreen(l.rect)) continue;
      if (solid) W.solids.push(l);
      ledges.push(l);
    }
    W.ledges = ledges.filter(l => l.right - l.left > 34 && l.top > 40 && l.top < W.h - 70);
    for (const el of document.querySelectorAll(HABITAT_TOYS)) { const r = rectOf(el); if (onScreen(r) && shown(el)) W.toys.push({ el, rect: r }); }
  }

  // Where a cat is right now, as a "surface" the planner understands.
  const surfaceOf = cat => cat.at.kind === 'ledge' ? cat.at.ledge : cat.at.kind === 'floor' ? FLOOR : null;
  const kAt = (surface, z = 0) => surface === FLOOR ? floorK(z) : S() * LEDGE_K;
  const yAt = (surface, x, z = 0) => surface === FLOOR ? floorY(z) : surface.y(x);

  // A sitting cat's footprint, for checking it won't cover something.
  const restBox = (x, y, k) => ({ left: x - 48 * k, right: x + 48 * k, top: y - 120 * k, bottom: y + 4 });
  const clearOf = box => !W.controls.some(r => hits(box, inflate(r, 8)));
  // Words a sitting cat would cover. A word ledge doesn't count against itself.
  const overText = (box, surface) => W.text.some(r => hits(inflate(box, -10), r) && !(surface?.rect && hits(r, surface.rect)));
  function crowded(cat, spot) {
    return cats.some(c => c !== cat && c.target && c.target.surface === spot.surface && Math.abs(c.target.x - spot.x) < 70 * S());
  }
  // Pick somewhere to be. where: 'any' | 'floor' | 'ledge' | 'high'
  function findSpot(cat, { where = 'any', near = null, spread = 400, z = null } = {}) {
    measure();
    const f = floor(), ledges = W.ledges.filter(l => onScreen(l.rect));
    for (let i = 0; i < 50; i++) {
      let spot;
      const wantLedge = ledges.length && (where === 'ledge' || where === 'high' || (where === 'any' && random() < .6));
      if (wantLedge) {
        let pool = ledges;
        if (where === 'high') pool = ledges.filter(l => l.top < W.h * .55).concat(ledges.filter(l => l.top < W.h * .3));
        if (near !== null) pool = pool.filter(l => l.right > near - spread && l.left < near + spread);
        if (!pool.length) pool = ledges;
        const l = pick(pool);
        spot = { surface: l, x: near !== null ? clamp(near + (random() - .5) * spread * .5, l.left, l.right) : lerp(l.left, l.right, random()), z: 0 };
      } else {
        const zz = z ?? (random() < .25 ? lerp(f.zMin, f.zBehind, random()) : lerp(-45, 35, random()));
        spot = { surface: FLOOR, x: clamp((near ?? random() * W.w) + (near !== null ? (random() - .5) * spread : 0), 50, W.w - 50), z: clamp(zz, f.zMin, f.zMax) };
      }
      const k = kAt(spot.surface, spot.z), y = yAt(spot.surface, spot.x, spot.z), tall = y < 150 ? 75 : 115;
      if (y - tall * k < 4) continue;
      const box = restBox(spot.x, y, k * tall / 120);
      if (!clearOf(box) || crowded(cat, spot)) continue;
      // Try not to sit on top of words, on the floor or up on a card.
      if (i < 35 && overText(box, spot.surface === FLOOR ? null : spot.surface)) continue;
      return spot;
    }
    return { surface: FLOOR, x: 60 + random() * (W.w - 120), z: 0 };
  }

  // ---------- route planning: walk, jump, climb, or leave and come back ----------
  const JX = () => 430 * S(), JY = () => 330 * S();
  function hop(a, b, fromX, agile = false) {
    const lo = Math.max(a.left, b.left), hi = Math.min(a.right, b.right);
    let xa, xb;
    if (lo <= hi) { xa = clamp(fromX, lo, hi); xb = clamp(xa + (xa < (lo + hi) / 2 ? 34 : -34), b.left, b.right); }
    else if (b.left > a.right) { xa = a.right; xb = b.left; } else { xa = a.left; xb = b.right; }
    const ya = a.y(xa), yb = b.y(xb), dx = Math.abs(xb - xa), rise = ya - yb;
    if (dx > JX() * (agile ? 1.3 : 1) || rise > JY() * (agile ? 1.2 : 1)) return null;
    return { kind: 'jump', to: b, xa, xb, cost: dx + Math.abs(rise) * 1.3 + 90 + Math.abs(fromX - xa) };
  }
  function climbable(l, fromX, agile = false) {
    if (l.kind !== 'solid') return null;
    const r = l.rect, gap = floorY(0) - r.bottom;
    if (gap > (agile ? 400 : 240) * S() || gap < -20 || r.top < 90) return null;
    const sides = [];
    if (r.left > 40) sides.push(-1); if (r.right < W.w - 40) sides.push(1);
    if (!sides.length) return null;
    const side = sides.sort((p, q) => Math.abs((p < 0 ? r.left : r.right) - fromX) - Math.abs((q < 0 ? r.left : r.right) - fromX))[0];
    const xa = side < 0 ? r.left - 36 * S() : r.right + 36 * S();
    return { kind: 'climb', to: l, side, xa, xb: side < 0 ? r.left + 30 : r.right - 30, cost: (floorY(0) - r.top) * 1.1 + Math.abs(fromX - xa) + 120 };
  }
  function route(from, fromX, to, agile = false) {
    measure();
    const nodes = [FLOOR, ...W.ledges.filter(l => onScreen(l.rect, 40))];
    if (to !== FLOOR && !nodes.some(n => sameLedge(n, to))) nodes.push(refresh(to));
    const dist = new Map(nodes.map(n => [n, Infinity])), prev = new Map(), xs = new Map();
    const start = nodes.find(n => sameLedge(n, from)) || (from === FLOOR ? FLOOR : null);
    if (!start) return null;
    dist.set(start, 0); xs.set(start, fromX);
    const open = new Set(nodes);
    while (open.size) {
      let u = null; for (const n of open) if (u === null || dist.get(n) < dist.get(u)) u = n;
      if (dist.get(u) === Infinity) break;
      open.delete(u);
      if (sameLedge(u, to) || (u === FLOOR && to === FLOOR)) break;
      for (const v of open) {
        const link = hop(u, v, xs.get(u), agile) || (u === FLOOR ? climbable(v, xs.get(u), agile) : null);
        if (!link) continue;
        const d = dist.get(u) + link.cost;
        if (d < dist.get(v)) { dist.set(v, d); prev.set(v, { from: u, link }); xs.set(v, link.xb); }
      }
    }
    const end = nodes.find(n => sameLedge(n, to)) || (to === FLOOR ? FLOOR : null);
    if (!end || dist.get(end) === Infinity) return null;
    const steps = [];
    for (let n = end; prev.has(n); n = prev.get(n).from) steps.unshift(prev.get(n).link);
    return steps;
  }

  // ---------- movement primitives (generators: yield, receive dt) ----------
  function* wait(seconds) { let t = 0; while (t < seconds) t += yield; }
  const reduced = () => reducedQuery.matches;
  const walkSpeed = cat => (reduced() ? 45 : 64) * cat.cast.gait * S();
  const runSpeed = cat => (reduced() ? 70 : 260) * cat.cast.gait * S();

  function land(cat, surface) {
    const b = cat.body;
    if (surface !== FLOOR && (!surface || !document.contains(surface.el) || !onScreen(refresh(surface).rect))) { fallToFloor(cat); return false; }
    b.hangPaws = null; b.noShadow = false; b.set({ hang: 0 });
    if (surface === FLOOR) cat.at = { kind: 'floor' };
    else { refresh(surface); cat.at = { kind: 'ledge', ledge: surface, dx: b.x - surface.rect.left }; b.z = 0; }
    return true;
  }
  function* walkTo(cat, x, z = null, speed = walkSpeed(cat)) {
    const b = cat.body, surface = surfaceOf(cat); if (!surface) return;
    if (surface !== FLOOR) refresh(surface);
    const tx = surface === FLOOR ? x : clamp(x, surface.left, surface.right);
    b.goTo(tx, surface === FLOOR ? (z ?? b.z) : 0, speed);
    let t = 0;
    while (b.move && t < 16) {
      t += yield;
      if (surface !== FLOOR && b.move) b.move.x = clamp(x, surface.left, surface.right);
      if (!sameLedge(surfaceOf(cat), surface) && surface !== FLOOR) { b.stop(); return; }
    }
    b.stop();
  }
  function* leapTo(cat, x, y, k1, arc, dur = null, options = {}) {
    const b = cat.body;
    b.leap(x, y, 0, arc, dur, options); b.jump.k0 = b.k; b.jump.k1 = k1;
    cat.at = { kind: 'air', ...(options.surface ? { then: options.surface, landingY: yAt(options.surface, x) } : {}) };
    const trick = options.trick ? flightTrick(b, options.trick) : null;
    while (b.jump) { trick?.(); yield; }
    return !options.surface || !!sameLedge(surfaceOf(cat) || cat.at.then, options.surface);
  }
  // windup: seconds to size up the jump first; by default only far or high jumps get one.
  // twist: whole turns around the vertical axis in the air (see moves.js).
  function* jumpTo(cat, surface, x, { agile = false, spin = 0, twist = 0, hang = false, windup = null } = {}) {
    const b = cat.body;
    if (surface !== FLOOR) refresh(surface);
    const tx = surface === FLOOR ? clamp(x, 30, W.w - 30) : clamp(x, surface.left, surface.right);
    const edgeY = yAt(surface, tx, 0), rise = b.gy - edgeY;
    const catchEdge = hang && !reduced() && surface !== FLOOR && surface.kind === 'solid' && rise > 60;
    const ty = edgeY + (catchEdge ? 64 * kAt(surface) : 0);
    const sizeUp = reduced() ? 0 : windup ?? windUpTime(tx - b.x, rise, S(), { agile });
    if (sizeUp > 0) yield* windUp(b, { x: tx, y: edgeY - 20 * S() }, sizeUp);
    else { b.reset({ crouch: 1, tailUp: .2 }); b.faceYaw(tx >= b.x ? 0 : Math.PI); }
    yield* wait(reduced() ? .1 : agile ? .12 : rise > 120 ? .3 : .2);
    b.set({ crouch: 0, tailUp: .5 });
    if (sizeUp > 0) { b.face = 'open'; b.look = null; }
    b.z = 0;
    const span = Math.abs(tx - b.x);
    const arc = Math.min((45 + span * .16 + Math.max(0, rise) * .2) * S(), Math.max(20, Math.min(b.gy, ty) - 100 * S()));
    const options = { spin: reduced() ? 0 : spin, surface, landing: !catchEdge, ...(twist && !reduced() ? { trick: { twist } } : {}) };
    let duration = clamp(.3 + Math.hypot(span, rise) / (agile ? 880 : 700), .35, .95);
    if (rise < -100) { options.type = 'fall'; options.velocityY = -100 * S(); options.gravity = 1600 * S(); duration = null; }
    if (!(yield* leapTo(cat, tx, ty, kAt(surface, 0), arc, duration, options))) return;
    if (catchEdge && !(yield* hangAt(cat, surface, tx, agile ? .5 : 1))) return;
    land(cat, surface);
    if (agile) yield* wait(.09); else yield* wait(.18);
    if (rise < -160 || rise > 160) puff(b.x, b.gy, 4);
  }
  // Up the side of a card like a wall.
  function* climb(cat, ledge, side) {
    const b = cat.body; refresh(ledge);
    const r = ledge.rect, wallX = side < 0 ? r.left : r.right, angle = side * Math.PI / 2;
    b.faceYaw(side < 0 ? 0 : Math.PI); b.reset({ tailUp: .8 }); b.look = null;
    yield* wait(.35);
    if (random() < .3) say(cat, 'climb', .6);
    b.set({ crouch: 1 }); yield* wait(.2); b.set({ crouch: 0 });
    const startY = Math.min(r.bottom - 6, floorY(0) - 50 * S());
    b.noShadow = true;
    const jump = leapTo(cat, wallX, startY, S() * .92, 30 * S(), .32);
    for (let r2 = jump.next(); !r2.done; r2 = jump.next(yield)) cat.xf = { angle: angle * clamp(b.jump ? b.jump.t / b.jump.dur : 1, 0, 1), px: b.x, py: b.gy };
    b.yaw = side < 0 ? 0 : Math.PI;
    cat.at = { kind: 'wall', ledge, side, dy: startY - r.top };
    b.drive = 70 * S(); b.bounce(.6);
    const speed = (reduced() ? 80 : 150) * cat.cast.gait * S();
    let t = 0;
    while (cat.at.dy > 12 && t < 12) { const dt = yield; t += dt; cat.at.dy -= speed * dt * (.75 + .25 * Math.sin(t * 9)); }
    b.drive = null;
    // Pull up over the top edge.
    const ox = side < 0 ? r.left + 34 * S() : r.right - 34 * S();
    refresh(ledge);
    const up = leapTo(cat, ox, ledge.rect.top, S() * LEDGE_K, 22 * S(), .3);
    for (let r2 = up.next(); !r2.done; r2 = up.next(yield)) cat.xf = { angle: angle * (1 - clamp(b.jump ? b.jump.t / b.jump.dur : 1, 0, 1)), px: b.x, py: b.gy };
    cat.xf = null; b.noShadow = false;
    land(cat, ledge);
  }
  // Off the edge of the screen. Where do they go? Nobody knows.
  function* exit(cat, speed = walkSpeed(cat)) {
    const b = cat.body;
    if (cat.at.kind === 'behind') yield* popOut(cat);
    if (cat.at.kind === 'ledge') {
      const l = cat.at.ledge;
      if (l.top < 220 && random() < .5 && !reduced()) {
        // Straight up and out of the top of the screen.
        b.reset({ crouch: 1 }); yield* wait(.3);
        yield* leapTo(cat, b.x + (random() - .5) * 80, -260 * S(), S(), 120, .55);
        cat.at = { kind: 'away', side: 'top' }; return;
      }
      const link = hop(l, FLOOR, b.x);
      yield* walkTo(cat, link ? link.xa : b.x, null, speed);
      yield* jumpTo(cat, FLOOR, link ? link.xb : b.x);
    }
    const side = b.x < W.w / 2 ? -1 : 1;
    b.reset({ tailUp: .7 });
    yield* walkTo(cat, side < 0 ? -140 * S() : W.w + 140 * S(), clamp(b.z, -30, 20), speed);
    cat.at = { kind: 'away', side: side < 0 ? 'left' : 'right' };
  }
  // Back from wherever they went, near a spot.
  function* enter(cat, spot, speed = walkSpeed(cat)) {
    const b = cat.body; cat.xf = null; cat.peek = null;
    b.stop(); b.jump = null; b.reset({ tailUp: .8 }); b.face = 'open';
    if (spot.surface !== FLOOR && random() < .65 && !reduced()) {
      // Drop in from above.
      const l = refresh(spot.surface), x = clamp(spot.x, l.left, l.right);
      b.x = x; b.gy = -200 * S(); b.k = S() * LEDGE_K; b.yaw = random() < .5 ? 0 : Math.PI;
      b.reset({ tailUp: 1, earsBack: .4 }); b.face = 'wide';
      if (!(yield* leapTo(cat, x, l.y(x), S() * LEDGE_K, 0, null, { type: 'fall', gravity: 1600 * S(), surface: l }))) return;
      land(cat, l); puff(b.x, b.gy, 5); b.bounce(1.4); b.face = 'open'; b.reset({ crouch: .5 }); yield* wait(.3); b.reset({ sit: 1 });
      return;
    }
    const side = spot.x < W.w / 2 ? -1 : 1, z = spot.surface === FLOOR ? clamp(spot.z ?? 0, -40, 30) : 0;
    b.x = side < 0 ? -120 * S() : W.w + 120 * S(); b.z = z; b.yaw = side < 0 ? 0 : Math.PI; b.gy = floorY(z); b.k = floorK(z);
    cat.at = { kind: 'floor' };
    yield* travel(cat, spot, speed);
  }
  // Up from behind a card onto its top.
  function* popOut(cat) {
    const b = cat.body, l = cat.at.solid; cat.peek = null; refresh(l);
    const x = clamp(b.x, l.left, l.right);
    cat.forceMask = true; b.reset({ tailUp: .9 }); b.yaw = random() < .5 ? 0 : Math.PI;
    yield* leapTo(cat, x, l.rect.top, S() * LEDGE_K, 60 * S(), .45);
    cat.forceMask = false; land(cat, l); b.bounce(.8);
  }
  // Down behind a card. Returns false when the card is too small to hide a cat.
  function* dive(cat, l) {
    const b = cat.body; refresh(l);
    const k = S() * BEHIND_K, need = (b.headLift + CAST[cat.kind].look.headR * 2.1) * k;
    if (l.rect.height < need + 10) return false;
    const x = clamp(b.x + (random() - .5) * 60, l.rect.left + 40 * k, l.rect.right - 40 * k);
    b.reset({ crouch: 1 }); yield* wait(.25); b.set({ crouch: 0 });
    cat.forceMask = true;
    yield* leapTo(cat, x, l.rect.top + need + 4, k, 40 * S(), .42);
    cat.forceMask = false;
    cat.at = { kind: 'behind', solid: l, dx: b.x - l.rect.left, dy: need + 4 };
    return true;
  }
  // Travel anywhere: walk, jump, climb, or leave the screen and come back in.
  function* travel(cat, spot, speed = walkSpeed(cat)) {
    cat.target = spot;
    for (let guard = 0; guard < 8; guard++) {
      const b = cat.body;
      if (cat.at.kind === 'away') { yield* enter(cat, spot, speed); return; }
      if (cat.at.kind === 'behind') yield* popOut(cat);
      // A recovery landing can take longer than eight route attempts.
      if (cat.at.kind === 'air' && cat.at.then) {
        while (b.jump) yield;
        if (cat.at.kind === 'air') land(cat, cat.at.then);
      }
      if (cat.at.kind === 'air' || cat.at.kind === 'wall') { yield; continue; }
      const here = surfaceOf(cat);
      if ((here === FLOOR && spot.surface === FLOOR) || sameLedge(here, spot.surface)) { yield* walkTo(cat, spot.x, spot.z ?? null, speed); return; }
      const steps = route(here, b.x, spot.surface);
      if (!steps?.length) {
        if (random() < .5 || here !== FLOOR) { yield* exit(cat, speed * 1.2); yield* wait(.8 + random() * 1.6); yield* enter(cat, spot, speed); }
        return;
      }
      const st = steps[0];
      if (here === FLOOR) yield* walkTo(cat, st.xa, 0, speed); else yield* walkTo(cat, st.xa, null, speed);
      if (st.kind === 'climb') yield* climb(cat, st.to, st.side);
      else yield* jumpTo(cat, st.to, st.xb);
    }
  }

  // Shared pursuit primitives: chase and escape use real surfaces, without
  // travel's offscreen exit/re-entry shortcut.
  function safeLanding(surface, near) {
    const k = kAt(surface), margin = Math.min(24 * k, (surface.right - surface.left) / 3);
    const left = Math.max(35, surface.left + margin), right = Math.min(W.w - 35, surface.right - margin);
    if (left > right) return null;
    for (const x of [clamp(near, left, right), (left + right) / 2, left, right]) {
      const y = yAt(surface, x);
      if (y > 80 * k && clearOf(restBox(x, y, k * .78))) return x;
    }
    return null;
  }
  function pursuitSpot(cat, target, escaping = false) {
    measure();
    const b = cat.body, here = surfaceOf(cat);
    if (!here || !target) return null;
    let best = null, bestScore = Infinity;
    for (const surface of [FLOOR, ...W.ledges.filter(l => onScreen(l.rect) && document.contains(l.el))]) {
      const near = escaping ? (target.x < b.x ? surface.right : surface.left) : target.x;
      const x = safeLanding(surface, near); if (x === null) continue;
      const steps = sameLedge(here, surface) ? [] : route(here, b.x, surface, true);
      if (!steps || steps.length > 6) continue;
      const y = yAt(surface, x), k = kAt(surface), cost = steps.reduce((sum, step) => sum + step.cost, 0);
      const distance = Math.hypot(x - target.x, y - 60 * k - target.y);
      const score = escaping
        ? -distance - (floorY(0) - y) * .15 + cost * .06 - (surface.kind === 'solid' ? 75 : 0)
        : distance + cost * .07 - (surface !== FLOOR ? 35 : 0);
      if (score < bestScore) { bestScore = score; best = { surface, x, z: 0 }; }
    }
    return best;
  }
  function* pursue(cat, getSpot, { maxHops = 5, hang = false } = {}) {
    const b = cat.body;
    if (cat.at.kind === 'behind') yield* popOut(cat);
    if (cat.at.kind === 'air' && cat.at.then) { while (b.jump) yield; if (cat.at.kind === 'air') land(cat, cat.at.then); }
    for (let i = 0; i < maxHops; i++) {
      const here = surfaceOf(cat), spot = getSpot();
      if (!here || !spot) return;
      cat.target = spot;
      if (sameLedge(here, spot.surface)) { yield* walkTo(cat, spot.x, spot.z, runSpeed(cat)); return; }
      const steps = route(here, b.x, spot.surface, true); if (!steps?.length) return;
      const st = steps[0], landingX = safeLanding(st.to, st.xb);
      if (landingX === null) return;
      b.look = null; b.reset({ tailUp: .75, eyes: 1, pupil: 1 });
      yield* walkTo(cat, st.xa, here === FLOOR ? 0 : null, runSpeed(cat));
      if (st.to !== FLOOR && (!document.contains(st.to.el) || !onScreen(refresh(st.to).rect))) return;
      if (st.kind === 'climb') yield* climb(cat, st.to, st.side);
      else {
        const roomForRoll = Math.min(b.gy, yAt(st.to, landingX)) > 190 * S();
        const spin = !reduced() && roomForRoll && Math.abs(landingX - b.x) > 130 * S() && random() < .4 ? (landingX > b.x ? 1 : -1) : 0;
        yield* jumpTo(cat, st.to, landingX, { agile: true, spin, hang: hang && steps.length === 1 });
      }
    }
  }

  // Straight up and back down onto the same surface, to catch something above.
  // Returns false when the surface went away mid-flight.
  function* springUp(cat, surface, x, height, { windup = 0, target = null, trick = {} } = {}) {
    const b = cat.body;
    if (windup > 0) yield* windUp(b, target || { x, y: b.gy - height }, windup);
    else { b.reset({ crouch: 1, pupil: 1.2 }); yield* wait(.15); }
    b.set({ crouch: 0, wiggle: 0, tailUp: .6 }); b.face = 'focus';
    const duration = clamp(.5 + height / (650 * S()), .55, .95);
    const ok = yield* leapTo(cat, x, yAt(surface, x, b.z), b.k, arcFor(height, b.k), duration, { surface, trick: reduced() ? {} : trick });
    b.set({ swat: 0, rear: 0 });
    if (!ok) return false;
    land(cat, surface); return true;
  }
  // Far or high single jumps from here that are worth showing off, best first.
  function bigJumps(here, x) {
    measure();
    const out = [];
    for (const to of [FLOOR, ...W.ledges]) {
      if (sameLedge(here, to) || (to !== FLOOR && (!onScreen(to.rect) || !document.contains(to.el)))) continue;
      const link = hop(here, to, x); if (!link) continue;
      const landing = safeLanding(to, link.xb); if (landing === null) continue;
      const span = Math.abs(landing - link.xa), rise = yAt(here, link.xa) - yAt(to, landing);
      if (rise < -100 * S() || (span < 170 * S() && rise < 140 * S())) continue;
      out.push({ ...link, xb: landing, span, rise, score: span + rise * 1.3 - Math.abs(x - link.xa) * .8 });
    }
    return out.sort((p, q) => q.score - p.score);
  }

  // ---------- peeking: over or around cards, and in from the screen edges ----------
  // A peek is an edge and an outward direction; amt runs from -.4 (hidden) through 0 (ear tips) to 1 (whole head, paws on the edge).
  function* peek(cat, spec, hold = 2 + random() * 3) {
    const b = cat.body;
    cat.peek = { ...spec, amt: -.45, goal: 0 };
    b.reset({ sit: 1, earsBack: 0 }); b.yaw = Math.PI / 2; b.face = 'open'; b.look = 'viewer';
    yield* wait(.5 + random() * .8);
    cat.peek.goal = random() < .3 ? .55 : 1;
    let t = 0;
    while (t < hold) {
      const dt = yield; t += dt;
      const p = W.pointer, head = peekHead(cat);
      if (p && head && clock() - p.t < 3000) {
        b.look = { x: p.x, y: p.y };
        // Too close: duck!
        if (Math.hypot(p.x - head.x, p.y - head.y) < 70 * S() && cat.peek.goal > 0) {
          cat.peek.goal = -.45; cat.peek.fast = true; think(cat, '!', .8); yield* wait(1.2 + random());
          cat.peek.fast = false; cat.peek.goal = .55; t = Math.max(t, hold - 1.5);
        }
      } else if (random() < dt * .4) b.look = random() < .5 ? 'viewer' : null;
      if (random() < dt * .25) b.set({ headRoll: (random() - .5) * .5 });
    }
    cat.peek.goal = -.45; yield* wait(.6);
    cat.peek = null; cat.xf = null; cat.edgePaws = null; b.set({ headRoll: 0 });
  }
  function peekGeometry(cat) {
    const pk = cat.peek, k = cat.body.k;
    if (pk.mode === 'over' || pk.mode === 'side') {
      const r = refresh(pk.solid).rect;
      if (pk.mode === 'over') return { ex: r.left + pk.u, ey: r.top, nx: 0, ny: -1 };
      return { ex: pk.side < 0 ? r.left : r.right, ey: r.top + pk.v, nx: pk.side, ny: 0 };
    }
    if (pk.edge === 'left') return { ex: 0, ey: pk.u, nx: 1, ny: 0 };
    if (pk.edge === 'right') return { ex: W.w, ey: pk.u, nx: -1, ny: 0 };
    if (pk.edge === 'top') return { ex: pk.u, ey: 0, nx: 0, ny: 1 };
    return { ex: pk.u, ey: W.h + 8 * k, nx: 0, ny: -1 };
  }
  function placePeek(cat, dt) {
    const pk = cat.peek, b = cat.body;
    pk.amt = ease(pk.amt, pk.goal, pk.fast ? 16 : 4.5, dt);
    b.k = S() * (pk.mode === 'screen' ? (pk.edge === 'bottom' ? 1.55 : 1.15) : BEHIND_K);
    const g = peekGeometry(cat), hr = b.L.headR * b.k, lift = b.headLift * b.k;
    const angle = g.ny > 0 ? Math.PI : g.nx ? g.nx * .78 : 0;
    const out = hr * (-1.25 + 2.05 * pk.amt);
    const hx = g.ex + g.nx * out, hy = g.ey + g.ny * out;
    const fx = hx - Math.sin(angle) * lift, fy = hy + Math.cos(angle) * lift;
    b.x = fx; b.gy = fy; b.yaw = Math.PI / 2;
    if (g.nx) b.goal.headRoll = -g.nx * .45;
    cat.xf = angle ? { angle, px: fx, py: fy } : null;
    // Paws hooked over the edge once the head is out.
    cat.edgePaws = pk.amt > .72 ? (g.nx ? [{ x: g.ex, y: hy + hr * .75, a: g.nx * Math.PI / 2 }] : [-1, 1].map(s => ({ x: g.ex + s * hr * .55, y: g.ey + (g.ny > 0 ? 3 : 1), a: g.ny > 0 ? Math.PI : 0 }))) : null;
  }
  function peekHead(cat) {
    if (!cat.peek) return null;
    const b = cat.body, p = b.headPos; if (!p) return null;
    return applyXf(cat, p[0], p[1]);
  }
  function screenPeekSpec(cat) {
    measure();
    const edges = ['left', 'right', 'bottom', 'bottom', 'top'];
    for (let i = 0; i < 20; i++) {
      const edge = pick(edges), k = S() * (edge === 'bottom' ? 1.55 : 1.15), hr = CAST[cat.kind].look.headR * k;
      const u = edge === 'left' || edge === 'right' ? lerp(W.h * .22, W.h * .82, random()) : lerp(W.w * .1, W.w * .9, random());
      const box = edge === 'left' ? { left: 0, right: hr * 2.6, top: u - hr * 2, bottom: u + hr * 1.6 }
        : edge === 'right' ? { left: W.w - hr * 2.6, right: W.w, top: u - hr * 2, bottom: u + hr * 1.6 }
        : edge === 'top' ? { left: u - hr * 1.6, right: u + hr * 1.6, top: 0, bottom: hr * 2.6 }
        : { left: u - hr * 1.7, right: u + hr * 1.7, top: W.h - hr * 3, bottom: W.h };
      if (clearOf(box)) return { mode: 'screen', edge, u };
    }
    return null;
  }

  // ---------- the glass ----------
  function glassMark(kind, x, y, size, extra = {}) {
    W.glass.push({ kind, x, y, size, age: 0, life: kind === 'fog' ? 3.5 : kind === 'lick' ? 7 : 14, ...extra });
    if (W.glass.length > 30) W.glass.shift();
  }

  // Ambient life while doing something calm: glance at things, flick ears and tail.
  function fidget(cat) {
    const b = cat.body;
    // A passing butterfly holds a resting cat's eyes.
    if (W.critter && !W.critter.gone && cat.mind.activity !== 'sleep') { b.look = { x: W.critter.x, y: W.critter.y }; return; }
    if (W.time > cat.nextGlance) {
      cat.nextGlance = W.time + 4 + random() * 5;
      const others = cats.filter(o => o !== cat && o.at.kind !== 'away');
      const r = random();
      if (W.pointer && !W.overUI && r < .35 + cat.mind.t.curiosity * .2) b.look = { x: W.pointer.x, y: W.pointer.y };
      else if (r < .55 && others.length) { const o = pick(others); b.look = { x: o.body.x, y: o.body.gy - 40 }; }
      else if (r < .72) b.look = 'viewer';
      else if (r < .82 && room) { const s = stageCenter(); if (s) b.look = { ...s, behind: true }; }
      else b.look = null;
      if (random() < .2) { b.goal.earsBack = .16; runtime.delay(() => { if (b.goal.earsBack === .16) b.goal.earsBack = 0; }, 260); }
      if (b.look === 'viewer' && cat.mind.trust > 45 && W.time > (cat.blinkAt || 0)) {
        b.slowBlink(1.35); cat.blinkAt = W.time + 12 + random() * 12;
      }
      b.goal.tailWag = random() < .15 ? .22 : .07;
    }
  }
  function stageCenter() {
    const el = (W.aquarium && document.querySelector('.cat-habitat .tv-screen')) || document.getElementById('stage') || document.getElementById('player-wrap');
    if (!el) return null; const r = el.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r } : null;
  }
  // Settle on arrival: on a card's top edge, legs and tail hang over the front.
  function restPose(cat, base = 'sit') {
    const b = cat.body, l = cat.at.kind === 'ledge' ? cat.at.ledge : null;
    if (l && random() < .7) b.faceYaw(Math.PI / 2 + (random() - .5) * 1.4);
    if (l && l.top < 150 && base === 'sit') base = 'loaf';
    else if (l && l.kind !== 'word' && base !== 'curl' && random() < .55) { b.reset({ sit: .85, overEdge: 1, tailHang: 1 }); b.faceYaw(Math.PI / 2 + (random() - .5) * .5); return; }
    b.reset({ [base]: 1, tailWrap: base === 'sit' ? 1 : .5, ...(l && l.kind !== 'word' && base === 'loaf' ? { tailHang: 1 } : {}) });
  }

  // Calm pacing stretches rests; invited play keeps its normal rhythm.
  const restScale = cat => (W.time >= W.invitedUntil && cat.mind.cast.pacing?.calm?.restScale) || 1;

  // ----- activities -----
  const A = {
    *greet(cat, key = 'greet') {
      const b = cat.body;
      b.face = 'open';
      restPose(cat, 'sit'); b.set({ eyes: .86, pupil: .66, tailWag: .08 });
      b.look = 'viewer'; yield* wait(.65);
      b.slowBlink(1.4); say(cat, key, .65);
      yield* wait(2.5); b.set({ headRoll: .08 }); yield* wait(1.2);
      b.set({ headRoll: 0 });
    },
    *sit(cat, seconds = (9 + random() * 12) * restScale(cat)) {
      restPose(cat, 'sit'); cat.body.set({ eyes: .88, pupil: .68 }); let t = 0;
      while (t < seconds) { const dt = yield; t += dt; fidget(cat); }
    },
    *loaf(cat) {
      restPose(cat, 'loaf'); cat.body.set({ eyes: .65, pupil: .65, tailWag: .06 }); let t = 0; const seconds = (18 + random() * 18) * restScale(cat);
      while (t < seconds) {
        const dt = yield; t += dt; fidget(cat);
        // Quiet eye contact uses the rig's slow blink instead of a bubble.
      }
    },
    // here: already where it wants to be (a fresh page finds Bean mid-nap).
    *sleep(cat, here = false) {
      // Usually a resting cat just dozes off where it is.
      if (!here && ['loaf', 'sit', 'watch'].includes(cat.mind.last[0]) && ['floor', 'ledge'].includes(cat.at.kind) && random() < .7) here = true;
      if (!here) {
        if (random() < .2 && W.solids.length) { if (yield* A.hide(cat, true)) return; }
        const spot = findSpot(cat, { where: random() < .55 ? 'ledge' : 'floor' });
        yield* travel(cat, spot, walkSpeed(cat) * .8);
      }
      yield* settleToSleep(cat);
      let t = 0; const max = (25 + random() * 60) * restScale(cat);
      while (W.calm || (t < max && cat.mind.drives.sleepy > 6)) {
        const dt = yield; t += dt;
        if (random() < dt * .35) particle('z', cat.body.top.x + 8, cat.body.top.y + 6, { rise: 18, life: 2.4, size: 12 + random() * 6, color: '#cbbbe8' });
        if (random() < dt * .05) cat.body.goal.tailWag = cat.body.goal.tailWag ? 0 : .2;
      }
      yield* wake(cat);
    },
    *cuddle(cat, partnerKind) {
      const p = byKind[partnerKind];
      if (!p || !['sleep', 'cuddle'].includes(p.mind.activity) || !surfaceOf(p)) return;
      const side = random() < .5 ? -1 : 1, s = surfaceOf(p);
      yield* travel(cat, { surface: s, x: p.body.x + side * 50 * p.body.k, z: p.body.z }, walkSpeed(cat) * .8);
      cat.body.faceYaw(side > 0 ? Math.PI : 0); yield* wait(.6);
      yield* settleToSleep(cat);
      cat.mind.bond(partnerKind, .08); p.mind.bond(cat.kind, .05);
      particle('♥', (cat.body.top.x + p.body.top.x) / 2, Math.min(cat.body.top.y, p.body.top.y), { color: '#f29bb0', size: 16 });
      log(`${cat.name} curled up next to ${p.name}.`);
      let t = 0; while (t < 40 && (cat.mind.drives.sleepy > 5 || W.calm)) { const dt = yield; t += dt; if (random() < dt * .3) particle('z', cat.body.top.x, cat.body.top.y, { rise: 18, life: 2.4, size: 12, color: '#cbbbe8' }); }
      yield* wake(cat);
    },
    *groom(cat) {
      const b = cat.body; restPose(cat, 'sit'); b.set({ overEdge: 0 }); b.look = null;
      for (let i = 0; i < 2 + Math.floor(random() * 3); i++) {
        b.set({ groom: 1, headPitch: -.25, eyes: .3, headYaw: .35 }); b.face = 'open';
        yield* wait(1.2 + random());
        b.set({ groom: 0, eyes: 1 }); yield* wait(.4 + random() * .6);
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
      yield* travel(cat, findSpot(cat, { where: 'any', near: random() < .4 ? b.x : null }), walkSpeed(cat));
      // Sniff around on arrival.
      b.set({ crouch: .3 }); b.goal.headPitch = -.3; yield* wait(.8 + random()); b.set({ crouch: 0 });
      yield* A.sit(cat, 2 + random() * 4);
    },
    *explore(cat) {
      const b = cat.body; b.reset({ tailUp: .7 });
      yield* travel(cat, findSpot(cat, { where: 'high' }), walkSpeed(cat) * 1.15);
      if (cat.at.kind === 'ledge') { say(cat, 'shelf', .4); cat.mind.drives.curious -= 30; }
      restPose(cat, random() < .5 ? 'loaf' : 'sit'); b.look = null;
      let t = 0; const seconds = 10 + random() * 16;
      while (t < seconds) { const dt = yield; t += dt; fidget(cat); }
    },
    // Hide behind a card and play peekaboo. With nap = true, just sleep back there.
    *hide(cat, nap = false) {
      const b = cat.body;
      const hideouts = W.solids.filter(l => onScreen(l.rect) && l.rect.height > 150 && l.rect.top > 80);
      if (!hideouts.length) { yield* A.sit(cat); return false; }
      const l = pick(hideouts);
      let hx = lerp(l.left, l.right, .5);
      for (let i = 0; i < 20; i++) { const x = lerp(l.left, l.right, .1 + random() * .8); const box = restBox(x, l.top, S() * LEDGE_K * .7); if (clearOf(box) && !overText(box, l)) { hx = x; break; } }
      yield* travel(cat, { surface: l, x: hx, z: 0 }, walkSpeed(cat) * 1.2);
      if (!sameLedge(surfaceOf(cat), l)) return false;
      if (!(yield* dive(cat, l))) { yield* A.sit(cat); return false; }
      if (!nap) say(cat, 'hidden', .4);
      // Settle near a side so the tail gives the game away.
      const r = refresh(l).rect, side = random() < .5 ? -1 : 1;
      cat.at.dx = side < 0 ? 34 * b.k : r.width - 34 * b.k; b.x = r.left + cat.at.dx;
      b.yaw = side < 0 ? 0 : Math.PI;
      b.reset({ sit: 1, tailUp: .5, tailWag: .45 });
      if (nap) {
        b.reset({ curl: 1, eyes: 0, tailWrap: 0, tailUp: .3, tailWag: .1 }); b.face = 'sleep';
        let t = 0; while (W.calm || (t < 60 && cat.mind.drives.sleepy > 6)) t += yield;
        b.face = 'open'; yield* popOut(cat); return true;
      }
      let t = 0; const seconds = 18 + random() * 26;
      while (t < seconds) {
        t += yield* waitT(1.5 + random() * 3.5);
        refresh(l);
        const tall = l.rect.height > 260 * S(), mode = tall && random() < .45 ? 'side' : 'over';
        const spec = mode === 'over'
          ? { mode, solid: l, u: lerp(l.rect.width * .1, l.rect.width * .9, random()) }
          : { mode, solid: l, side: random() < .5 ? -1 : 1, v: lerp(110 * S(), Math.min(l.rect.height - 40, 300 * S()), random()) };
        if (mode === 'over') {
          const x = l.rect.left + spec.u, hr = b.L.headR * b.k;
          const box = { left: x - hr * 1.6, right: x + hr * 1.6, top: l.rect.top - hr * 2.4, bottom: l.rect.top };
          if (!clearOf(box) || overText(box, l)) continue;
        }
        if (random() < .3) say(cat, 'peek', .6);
        const before = clock();
        yield* peek(cat, spec, 1.5 + random() * 3);
        t += (clock() - before) / 1000;
        // Out of sight: sneak to the other side.
        if (cat.at.kind === 'behind') { cat.at.dx = random() < .5 ? 34 * b.k : l.rect.width - 34 * b.k; b.yaw = cat.at.dx < l.rect.width / 2 ? 0 : Math.PI; }
      }
      if (cat.at.kind === 'behind') { yield* popOut(cat); say(cat, 'peek', .5); restPose(cat, 'sit'); yield* wait(2); }
      return true;
    },
    // Leave the screen for a while; maybe peek back in; then come home.
    *leave(cat) {
      const b = cat.body;
      if (random() < .3) say(cat, 'idle', .4);
      yield* exit(cat, walkSpeed(cat) * 1.3);
      log(`${cat.name} went off-screen to explore.`);
      let t = 0; const seconds = 15 + random() * 40 + cat.mind.t.curiosity * 20;
      while (t < seconds) {
        t += yield* waitT(4 + random() * 8);
        if (random() < .5 && !W.calm) {
          const spec = screenPeekSpec(cat);
          if (spec) { if (random() < .35) say(cat, 'peek', 1); yield* peek(cat, spec, 2 + random() * 3); t += 3; }
        }
      }
      yield* enter(cat, findSpot(cat, { where: 'any' }), walkSpeed(cat) * 1.2);
      say(cat, 'back', .7); restPose(cat, 'sit'); b.look = 'viewer';
      yield* wait(2.5);
    },
    // Walk right up to the screen and press against the glass.
    *glass(cat) {
      const b = cat.body, s = S(), kc = s * 3.1, hr = b.L.headR * kc;
      let x = null;
      for (let i = 0; i < 24 && x === null; i++) {
        const cx = lerp(W.w * .12, W.w * .88, random());
        if (clearOf({ left: cx - hr * 2, right: cx + hr * 2, top: W.h - hr * 3.2, bottom: W.h })) x = cx;
      }
      if (x === null) { yield* A.stare(cat); return; }
      yield* travel(cat, { surface: FLOOR, x, z: 40 }, walkSpeed(cat) * 1.1);
      if (cat.at.kind !== 'floor') return;
      b.faceYaw(Math.PI / 2); b.reset({ sit: 1, tailUp: .8 }); b.look = 'viewer'; yield* wait(.6);
      cat.closeup = { amt: 0, goal: 1 };
      yield* wait(1.4);
      say(cat, 'glass', .8);
      // Sniff the glass.
      for (let i = 0; i < 3; i++) { b.set({ headPitch: .15, eyes: .6 }); particle('sniff', b.headPos[0] + (random() - .5) * 40, b.headPos[1] + hr * .3, { color: '#e6d8f5', size: 13, rise: 20 }); yield* wait(.28); b.set({ headPitch: 0, eyes: 1 }); yield* wait(.2); }
      glassMark('fog', b.headPos[0], b.headPos[1] + hr * .35, hr * .9);
      let taps = 0, t = 0;
      while (t < 7 + random() * 5) {
        const dt = yield; t += dt;
        const p = W.pointer;
        if (p && clock() - p.t < 2500) b.look = { x: p.x, y: p.y };
        // Tap the glass, at your cursor if it's near.
        if (random() < dt * .9 && taps < 6) {
          taps++;
          b.set({ rear: .25, pawsUp: 0, swat: 1 }); yield* wait(.13);
          const paw = b.paws[0]?.s; if (paw) { glassMark('paw', paw[0], paw[1], b.L.legW * b.k * .9, { a: (random() - .5) * .4 }); puffGlass(paw[0], paw[1]); }
          yield* wait(.15); b.set({ swat: 0, rear: 0 }); yield* wait(.25);
        }
        if (random() < dt * .12) {
          // A lick.
          b.set({ mouth: .6 }); b.face = 'happy'; yield* wait(.25);
          glassMark('lick', b.headPos[0], b.headPos[1] + hr * .55, hr * .5); yield* wait(.25); b.set({ mouth: 0 }); b.face = 'open';
        }
        if (random() < dt * .1 && cat.mind.trust > 45) { b.goal.eyes = 0; yield* wait(.9); b.goal.eyes = 1; think(cat, '♥', 1.4); }
      }
      if (!cat.mind.stats.glass) log(`${cat.name} pressed against the glass to look at you.`);
      cat.mind.stats.glass = (cat.mind.stats.glass || 0) + 1;
      // Turn around (a very large back view) and walk back into the room.
      b.look = null; b.faceYaw(-Math.PI / 2); yield* wait(.9);
      cat.closeup.goal = 0; b.reset({ tailUp: 1 });
      b.goTo(b.x + (random() - .5) * 200, -60, walkSpeed(cat) * .8);
      yield* wait(1.6); cat.closeup = null;
      yield* A.sit(cat, 2 + random() * 3);
    },
    // Swat a decoration and watch it wobble (or fall).
    *knock(cat) {
      const b = cat.body, toys = W.toys.filter(t => !t.el.dataset.catKnocked);
      if (!toys.length) { yield* A.sit(cat); return; }
      const toy = pick(toys), r = rectOf(toy.el);
      const tx = (r.left + r.right) / 2;
      // Find the ledge the toy sits on, or the floor below it.
      measure(true);
      const under = W.ledges.filter(l => l.el !== toy.el && l.left < tx + 60 && l.right > tx - 60 && l.top >= r.bottom - 30 && l.top - r.bottom < 220).sort((p, q) => p.top - q.top)[0];
      const surface = under || FLOOR, side = random() < .5 ? -1 : 1;
      const own = W.ledges.find(l => l.el === toy.el);
      yield* travel(cat, own ? { surface: own, x: tx, z: 0 } : { surface, x: tx + side * (r.width / 2 + 34 * S()), z: 0 }, walkSpeed(cat));
      const head = b.headPos ? applyXf(cat, b.headPos[0], b.headPos[1]) : { x: b.x, y: b.gy };
      const reach = Math.hypot(tx - head.x, (r.top + r.bottom) / 2 - head.y);
      b.look = { x: tx, y: (r.top + r.bottom) / 2 }; b.faceYaw(tx > b.x ? 0 : Math.PI); b.reset({ sit: 1 }); b.face = 'focus';
      yield* wait(.8);
      if (!own && reach > 190 * S()) { think(cat, '?', 1.4); yield* wait(1.5); b.face = 'open'; return; }
      b.set({ rear: own ? 0 : .5, swat: 1 }); yield* wait(.22); b.set({ swat: 0 }); yield* wait(.3);
      b.set({ swat: 1 }); yield* wait(.22); b.set({ swat: 0, rear: 0 });
      // Page icons only wobble; loose decorations can go over the edge.
      const fall = !own && !toy.el.matches('.step-symbol') && floorY(0) - r.bottom > 60 && random() < .45 && cat.mind.t.mischief > .5;
      wobble(toy.el, fall ? floorY(0) - r.bottom : 0, tx > b.x ? 1 : -1);
      say(cat, 'knock', .9);
      if (fall) log(`${cat.name} knocked something off the page.`);
      b.face = 'happy'; b.look = 'viewer'; yield* wait(1.4); b.face = 'open';
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 30);
    },
    *watch(cat) {
      if (W.playing) yield* quietPlayback(cat);
      else yield* A.sit(cat);
    },
    *dance(cat) {
      const b = cat.body;
      yield* travel(cat, findSpot(cat, { where: random() < .5 ? 'ledge' : 'floor' }), walkSpeed(cat) * 1.2);
      say(cat, 'music', .6); b.look = 'viewer';
      let t = 0; const seconds = 8 + random() * 6;
      while (t < seconds && W.playing) {
        b.reset({ rear: reduced() ? 0 : .9, pawsUp: 1, bob: 1, tailWag: .8, tailUp: .9 }); b.face = 'happy';
        yield* wait(1.3); t += 1.3;
        if (!reduced() && random() < .6) { b.faceYaw(b.yaw + Math.PI * (random() < .5 ? 1 : -1)); particle('♪', b.top.x, b.top.y, { color: '#c3acf0' }); }
        if (!reduced() && random() < .3) { b.reset({ crouch: .5 }); yield* wait(.2); b.leap(b.x, b.gy, b.z, 26, .4); b.jump.k0 = b.jump.k1 = b.k; while (b.jump) yield; t += .6; }
      }
      b.face = 'open'; b.reset();
    },
    *zoomies(cat) {
      const b = cat.body; say(cat, 'zoomies', .5);
      b.reset({ earsBack: .6, tailPuff: .5, tailUp: .3, pupil: 1.2 }); b.face = 'wide';
      for (let i = 0; i < 4 + Math.floor(random() * 3); i++) {
        if (cat.at.kind === 'floor' && random() < .25) {
          // Off one side of the screen and straight back in from the other.
          const dir = b.x < W.w / 2 ? -1 : 1;
          yield* walkTo(cat, dir < 0 ? -120 * S() : W.w + 120 * S(), clamp(b.z, -20, 20), runSpeed(cat) * 1.3);
          b.x = dir < 0 ? W.w + 120 * S() : -120 * S();
          yield* walkTo(cat, dir < 0 ? W.w * .6 : W.w * .4, null, runSpeed(cat) * 1.3);
          continue;
        }
        yield* travel(cat, findSpot(cat, { where: random() < .5 ? 'ledge' : 'floor' }), runSpeed(cat) * 1.25);
        if (random() < .3) { b.set({ crouch: .4 }); yield* wait(.15); b.leap(b.x, b.gy, b.z, 34, .42); b.jump.k0 = b.jump.k1 = b.k; while (b.jump) yield; b.set({ crouch: 0 }); }
      }
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 50);
      b.face = 'open'; restPose(cat, 'sit'); yield* wait(1.5);
      b.set({ mouth: .4 }); yield* wait(.4); b.set({ mouth: 0 });
      log(`${cat.name} had the zoomies.`);
    },
    // Show off: walk to the edge of a far or high jump, size it up with a long
    // wind-up and go, sometimes with a roll or a corkscrew twist in the air.
    *leap(cat) {
      const b = cat.body;
      if (cat.at.kind === 'behind') yield* popOut(cat);
      const here = surfaceOf(cat); if (!here) return;
      const jumps = bigJumps(here, b.x);
      if (!jumps.length) { yield* A.highjump(cat); return; }
      const st = pick(jumps.slice(0, 3));
      try {
        cat.phase = 'eyeing a big jump'; b.reset({ tailUp: .6 }); b.look = null;
        yield* walkTo(cat, st.xa, here === FLOOR ? 0 : null, walkSpeed(cat) * 1.3);
        if (st.to !== FLOOR && (!document.contains(st.to.el) || !onScreen(refresh(st.to).rect))) return;
        const dir = st.xb > b.x ? 1 : -1, roomy = Math.min(b.gy, yAt(st.to, st.xb)) > 200 * S();
        const roll = random(), trick = roll < .3 && roomy && st.span > 160 * S() ? { spin: dir } : roll < .55 ? { twist: dir } : {};
        cat.phase = 'leaping';
        yield* jumpTo(cat, st.to, st.xb, { windup: .9 + random() * .5, ...trick });
        if (!sameLedge(surfaceOf(cat), st.to)) return;
        b.face = 'happy'; b.look = 'viewer'; b.bounce(.6);
        if (random() < .5) say(cat, 'leap', .6);
        log(`${cat.name} made a big leap.`);
        cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 25);
        yield* wait(1.2); b.face = 'open'; restPose(cat, 'sit'); b.look = null;
        yield* A.sit(cat, 3 + random() * 4);
      } finally { cat.phase = null; }
    },
    // A speck of dust drifts down. Bean tracks it, winds up and springs straight
    // up to bat at it, sometimes twisting in the air on the way.
    *highjump(cat) {
      const b = cat.body;
      if (cat.at.kind === 'behind') yield* popOut(cat);
      const s = surfaceOf(cat); if (!s) return;
      const height = Math.min((180 + random() * 150) * S(), b.gy - 110 * b.k - 30);
      if (height < 90 * S()) { yield* A.sit(cat); return; }
      const dir = random() < .5 ? -1 : 1;
      const x = s === FLOOR ? clamp(b.x + dir * 30 * S(), 40, W.w - 40) : clamp(b.x + dir * 30 * S(), s.left, s.right);
      // The speck drifts down so that it reaches his raised paw at the top of the jump.
      const paw = b.gy - height - 70 * b.k, windup = .7 + random() * .4, drift = 14 * S();
      const meet = 1.2 + windup + clamp(.5 + height / (650 * S()), .55, .95) / 2;
      particle('mote', x, paw - drift * meet, { color: '#f3ecff', size: 4, rise: -drift * 6, life: 6, vx: 0 });
      const mote = W.particles[W.particles.length - 1];
      const follow = () => { if (mote.age < mote.life) b.look = { x: mote.x, y: mote.y }; };
      try {
        cat.phase = 'watching a dust speck';
        b.stop(); restPose(cat, 'sit'); b.set({ overEdge: 0, pupil: 1.15 }); b.face = 'focus'; follow();
        let t = 0; while (t < 1.2) { t += yield; follow(); }
        const twist = random() < .3 ? dir : 0;
        cat.phase = 'jumping for it';
        if (!(yield* springUp(cat, s, x, height, { windup, target: mote, trick: { swipe: true, reach: !twist, twist } }))) return;
        const caught = Math.abs(mote.x - b.x) < 60 * S() && random() < .5;
        if (caught) { mote.age = mote.life; particle('✦', x, paw, { color: '#f2c78d', size: 18 }); say(cat, 'caught', .5); }
        else { mote.vx = dir * 40; say(cat, 'miss', .4); }
        log(caught ? `${cat.name} caught a speck of dust.` : `${cat.name} jumped for a speck of dust.`);
        cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 20);
        restPose(cat, 'sit'); b.set({ overEdge: 0 });
        if (caught) { b.look = null; b.goal.headPitch = -.35; yield* wait(1.1); b.goal.headPitch = 0; }
        else { t = 0; while (t < 1.6) { t += yield; follow(); } }
        b.face = 'open'; b.look = null;
        yield* A.sit(cat, 2 + random() * 3);
      } finally { cat.phase = null; b.set({ swat: 0, rear: 0, wiggle: 0 }); }
    },
    *stalk(cat) {
      const b = cat.body;
      let t = 0, still = 0;
      const p0 = W.pointer; if (!p0) return;
      // Get onto whatever is under the cursor.
      yield* travel(cat, surfaceUnder(p0.x, p0.y, cat), walkSpeed(cat) * 1.2);
      b.reset({ crouch: 1, pupil: 1.25, tailUp: -.2, tailWag: .5 }); b.face = 'focus'; think(cat, '!', 1.2);
      while (t < 12) {
        const dt = yield; t += dt;
        const p = W.pointer; if (!p || W.overUI || clock() - p.t > 6000) break;
        b.look = { x: p.x, y: p.y };
        const dist = Math.abs(p.x - b.x), s = surfaceOf(cat); if (!s) break;
        if (dist > 70 * b.k) { b.goTo(clamp(p.x - Math.sign(p.x - b.x) * 50 * b.k, s.left, s === FLOOR ? W.w - 30 : s.right), b.z, walkSpeed(cat) * .55); still = 0; }
        else { b.stop(); still += dt; }
        if (p.speed > .6) still = 0;
        if (still > .9 && b.gy - p.y < 280 && b.gy > p.y - 30) {
          b.set({ wiggle: 1 }); if (random() < .5) say(cat, 'cursorStill', .5); yield* wait(.7); b.set({ wiggle: 0, crouch: .2 });
          const target = W.pointer || p, lift = clamp(b.gy - target.y, 20, 260);
          const lx = s === FLOOR ? clamp(target.x, 30, W.w - 30) : clamp(target.x, s.left, s.right);
          b.leap(lx, b.gy, b.z, lift + 18, .55); b.jump.k0 = b.jump.k1 = b.k; b.goal.swat = 1;
          while (b.jump) yield;
          if (s !== FLOOR) cat.at.dx = b.x - s.rect.left;
          b.goal.swat = 0; puff(b.x, b.gy, 3);
          const caught = W.pointer && Math.abs(W.pointer.x - b.x) < 60 && W.pointer.speed < .4;
          if (caught) { say(cat, 'caught', 1); particle('✦', b.top.x, b.top.y, { color: '#f2c78d', size: 22 }); log(`${cat.name} pounced on your cursor.`); }
          else say(cat, 'miss', .5);
          cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 35);
          break;
        }
      }
      b.face = 'open'; restPose(cat, 'sit'); yield* wait(1.2);
    },
    *approach(cat) {
      const b = cat.body, p = W.pointer && !W.overUI ? { ...W.pointer } : null;
      const x = p ? p.x + (b.x < p.x ? -70 : 70) * S() : W.w * .46;
      try {
        // Notice first, then stand up and commit to one destination.
        cat.phase = 'noticing'; b.face = 'open'; b.look = p || 'viewer';
        b.set({ eyes: .94, headRoll: .13, earsBack: 0, pupil: .75 }); yield* wait(.65);
        b.set({ headRoll: 0 }); b.reset({ tailUp: .8, tailCurl: .6, eyes: .9 }); yield* wait(.4);
        cat.phase = 'approaching';
        yield* travel(cat, findSpot(cat, { where: 'floor', near: x, spread: 100, z: 5 }), walkSpeed(cat) * .78);
        b.stop(); b.faceYaw(Math.PI / 2); b.look = p || 'viewer';
        cat.phase = 'sniffing'; b.look = null; b.reset({ sit: .55, tailUp: .9, tailCurl: .8, eyes: .85 });
        yield* wait(.65);
        b.set({ headPitch: -.12, headRoll: -.08 }); yield* wait(.45);
        b.set({ headPitch: .08, headRoll: .08 }); yield* wait(.45);
        cat.phase = 'offering a paw'; b.set({ sit: 1, headRoll: 0, offerPaw: reduced() ? 0 : 1 });
        yield* wait(1); b.set({ offerPaw: 0 }); b.look = 'viewer'; b.slowBlink(1.4);
        if (W.time < W.invitedUntil) say(cat, 'pet', .3);
        yield* wait(1.5);
        cat.phase = 'settling';
        b.set({ eyes: .7, knead: reduced() ? 0 : .3 }); yield* wait(1.3);
        b.set({ knead: 0, sit: .3, loaf: 1, tailWrap: .8, tailWag: .05 });
        yield* wait(1.2); cat.phase = 'keeping you company';
        let t = 0; while (t < 8) { t += yield; fidget(cat); }
      } finally { cat.phase = null; b.set({ offerPaw: 0, knead: 0, headRoll: 0, headPitch: 0 }); }
    },
    *stare(cat) {
      const b = cat.body;
      yield* travel(cat, findSpot(cat, { where: 'any', z: 40 }), walkSpeed(cat));
      b.reset({ sit: 1 }); b.look = 'viewer'; yield* wait(1);
      b.set({ headRoll: (random() < .5 ? -1 : 1) * .3 }); think(cat, '?', 1.5); yield* wait(1.5);
      say(cat, 'stare', .4);
      yield* wait(2 + random() * 3); b.set({ headRoll: 0 });
    },
    *visit(cat, partnerKind) {
      const p = byKind[partnerKind]; if (!p || !surfaceOf(p)) return;
      const b = cat.body; b.reset({ tailUp: .9, tailCurl: .7 });
      for (let i = 0; i < 2; i++) {
        const side = p.body.x > b.x ? -1 : 1, s = surfaceOf(p); if (!s) return;
        yield* travel(cat, { surface: s, x: p.body.x + side * 46 * p.body.k, z: p.body.z }, walkSpeed(cat) * 1.15);
        if (Math.abs(p.body.x - b.x) < 90) break;
      }
      if (Math.abs(p.body.x - b.x) > 110 || !sameLedge(surfaceOf(p), surfaceOf(cat)) && !(surfaceOf(p) === FLOOR && surfaceOf(cat) === FLOOR)) return;
      b.look = { x: p.body.x, y: p.body.gy - 40 };
      b.faceYaw(Math.atan2(p.body.z - b.z, p.body.x - b.x));
      say(cat, 'visit', .3);
      const welcome = respond(p, cat);
      yield* wait(.8);
      if (welcome === 'hiss') {
        b.reset({ earsBack: 1, crouch: .3 }); b.face = 'wide'; cat.mind.startle(.4); yield* wait(1);
        cat.mind.bond(p.kind, -.06); log(`${p.name} hissed at ${cat.name}.`);
        yield* travel(cat, findSpot(cat, { where: 'any', near: b.x + (b.x > p.body.x ? 260 : -260), spread: 200 }), walkSpeed(cat) * 1.6);
        b.face = 'open'; b.reset(); return;
      }
      // Nose boop, then a head rub or some grooming.
      b.goTo(p.body.x + (b.x < p.body.x ? -24 : 24) * b.k, p.body.z, 30);
      yield* wait(.7); b.stop();
      particle('♥', (b.top.x + p.body.top.x) / 2, Math.min(b.top.y, p.body.top.y) - 4, { color: '#f29bb0', size: 18 });
      b.face = 'happy'; b.set({ headRoll: .3, eyes: .2 }); yield* wait(1.2);
      if (random() < .5) { b.set({ sit: 1, groom: 1 }); b.face = 'open'; yield* wait(2); b.set({ groom: 0 }); }
      cat.mind.bond(p.kind, .05); p.mind.bond(cat.kind, .03); cat.mind.drives.lonely = 0;
      b.face = 'open'; b.reset({ sit: 1 });
      if (random() < .3) log(`${cat.name} booped noses with ${p.name}.`);
      yield* A.sit(cat, 3 + random() * 4);
    },
    *chase(cat, partnerKind) {
      const p = byKind[partnerKind]; if (!p || !surfaceOf(p)) return;
      const b = cat.body;
      b.reset({ crouch: .6, pupil: 1.2, tailWag: .7 }); b.face = 'focus';
      b.look = { x: p.body.x, y: p.body.gy - 30 };
      yield* wait(.6);
      const answer = respond(p, cat, 'chase');
      if (answer === 'hiss') { b.reset({ earsBack: .8 }); b.face = 'open'; yield* wait(1); say(cat, 'annoyed', .4); return; }
      say(cat, 'visit', .3);
      let t = 0;
      while (t < 10 && p.mind.activity === 'flee') {
        const dt = yield; t += dt;
        const ps = surfaceOf(p); if (!ps) continue;
        const mine = surfaceOf(cat);
        if (!(ps === FLOOR && mine === FLOOR) && !sameLedge(ps, mine)) { yield* travel(cat, { surface: ps, x: p.body.x, z: p.body.z }, runSpeed(cat)); continue; }
        b.goTo(p.body.x, p.body.z, runSpeed(cat) * .95); b.look = { x: p.body.x, y: p.body.gy - 30 };
        if (Math.abs(p.body.x - b.x) < 40 * b.k && Math.abs(p.body.z - b.z) < 20) break;
      }
      b.stop();
      if (p.mind.activity === 'flee' && (surfaceOf(p) === surfaceOf(cat) || sameLedge(surfaceOf(p), surfaceOf(cat)))) interrupt(p, A.wrestle(p, cat.kind), PRIORITY.social);
      yield* A.wrestle(cat, partnerKind);
    },
    *flee(cat, fromKind) {
      const b = cat.body, from = byKind[fromKind];
      b.reset({ tailUp: .8, earsBack: .4 }); b.face = 'happy';
      for (let i = 0; i < 3; i++) {
        const away = b.x < from.body.x ? -1 : 1;
        yield* travel(cat, findSpot(cat, { where: random() < .5 ? 'any' : 'floor', near: clamp(b.x + away * 320, 50, W.w - 50), spread: 260 }), runSpeed(cat) * .9);
      }
      b.face = 'open';
    },
    *wrestle(cat, partnerKind) {
      const p = byKind[partnerKind], b = cat.body;
      cat.mind.begin('wrestle', partnerKind);
      for (let i = 0; i < 4; i++) {
        b.look = { x: p.body.x, y: p.body.gy - 30 }; b.faceYaw(Math.atan2(p.body.z - b.z, p.body.x - b.x));
        b.reset({ crouch: .5, earsBack: .5, tailPuff: .4, tailWag: 1 }); b.face = 'focus';
        yield* wait(.25 + random() * .3);
        b.set({ swat: 1, rear: reduced() ? 0 : .35 }); puff((b.x + p.body.x) / 2, b.gy, 2); yield* wait(.25); b.set({ swat: 0, rear: 0 });
      }
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 45); cat.mind.bond(partnerKind, .03);
      b.face = 'open'; b.reset({ sit: 1 });
      if (cat.i < p.i) log(`${cat.name} and ${p.name} had a play fight.`);
      yield* wait(1 + random());
      yield* A.groom(cat);
    },
    *evade(cat, origin = W.pointer, mode = 'flee') {
      const b = cat.body, from = origin || { x: b.x - 100, y: b.gy };
      try {
        // Finish an interrupted flight before planting a paw to say no.
        if (cat.at.kind === 'air' && cat.at.then) { while (b.jump) yield; if (cat.at.kind === 'air') land(cat, cat.at.then); }
        cat.phase = 'no uppies right now';
        yield* refusePickup(b, { quiet: W.calm || reduced() });
        if (W.calm || reduced()) { b.look = from; b.slowBlink(); yield* wait(.5); return; }
        b.face = 'focus'; b.reset({ crouch: .7, earsBack: .3, tailUp: .8 }); yield* wait(.14);
        const here = surfaceOf(cat);
        if (here) {
          cat.phase = 'dodging your hand';
          const direction = from.x < b.x ? 1 : -1;
          const x = safeLanding(here, b.x + direction * 160 * S());
          if (x !== null && (yield* leapTo(cat, x, yAt(here, x, b.z), b.k, 45 * S(), .34, { surface: here }))) land(cat, here);
        }
        if (mode === 'flee') {
          cat.phase = 'finding a way out';
          yield* pursue(cat, () => pursuitSpot(cat, W.pointer || from, true), { maxHops: 5, hang: true });
          const ledge = surfaceOf(cat);
          if (ledge?.kind === 'solid' && ledge.rect.height > 150 && (yield* dive(cat, ledge))) {
            cat.phase = 'hiding from your hand'; b.reset({ sit: 1, tailUp: .1 }); b.face = 'open'; yield* wait(3.5);
            yield* popOut(cat);
          }
        }
        cat.phase = 'checking if you followed'; restPose(cat, 'sit'); b.face = 'open'; b.look = W.pointer || from;
        yield* wait(mode === 'flee' ? 2.5 : 1.6);
      } finally { cat.phase = null; b.hangPaws = null; b.set({ hang: 0, recoil: 0, offerPaw: 0, earsBack: 0, headYaw: 0, headRoll: 0 }); }
    },
    *hunt(cat) {
      const b = cat.body, bug = W.critter; if (!bug || W.calm || reduced()) return;
      const until = W.time + 22;
      const alive = () => W.time < until && W.critter === bug && !bug.gone && !bug.flee;
      try {
        cat.phase = 'tracking the butterfly'; b.look = { x: bug.x, y: bug.y }; b.set({ crouch: .5, pupil: 1.2 }); yield* wait(.3);
        while (alive()) {
          cat.phase = 'chasing across the room';
          // Replan between landings against the butterfly's projected position.
          yield* pursue(cat, () => alive() ? pursuitSpot(cat, { x: bug.x + bug.dir * 65, y: bug.y }) : null, { maxHops: 4, hang: true });
          if (!alive()) break;
          const s = surfaceOf(cat); if (!s) break;
          b.stop(); b.look = { x: bug.x, y: bug.y }; b.reset({ crouch: .65, pupil: 1.2, tailWag: .4 }); b.face = 'focus';
          const height = b.gy - bug.y, close = Math.abs(bug.x - b.x) < 125 * S();
          if (close && height > 10 && height < 270 * S()) {
            cat.phase = 'pouncing'; b.set({ wiggle: .7 }); yield* wait(.22); b.set({ wiggle: 0, crouch: 0, swat: .7 });
            const x = safeLanding(s, bug.x) ?? b.x;
            if (!(yield* leapTo(cat, x, yAt(s, x, b.z), b.k, clamp(height - 40 * b.k, 35, 210 * S()), .6, { surface: s }))) break;
            land(cat, s); b.set({ swat: 0 });
            if (Math.hypot(b.top.x - bug.x, b.top.y - bug.y) < 130 * S() && random() < .45) {
              bug.flee = true; particle('✦', bug.x, bug.y, { color: '#f2c78d', size: 18 }); log(`${cat.name} nearly caught a butterfly.`);
            }
            cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 14);
          } else if (close && height >= 270 * S() && height < 420 * S() && b.gy - height > 120 * b.k) {
            // Out of pouncing reach: a big vertical leap with a quick wind-up.
            cat.phase = 'leaping for it';
            const x = safeLanding(s, bug.x) ?? b.x;
            if (!(yield* springUp(cat, s, x, height - 50 * b.k, { windup: .45, target: bug, trick: { swipe: true, reach: true } }))) break;
            // His paw reached the butterfly's height; only the sideways miss matters.
            if (Math.abs(b.x - bug.x) < 110 * S() && random() < .4) {
              bug.flee = true; particle('✦', bug.x, bug.y, { color: '#f2c78d', size: 18 }); log(`${cat.name} nearly caught a butterfly.`);
            }
            cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 14);
          }
          yield* wait(.35);
        }
        b.face = 'open'; restPose(cat, 'sit'); b.look = null; yield* wait(1);
      } finally { cat.phase = null; b.set({ swat: 0, rear: 0, wiggle: 0, hang: 0 }); b.hangPaws = null; }
    },
    *laser(cat) {
      const b = cat.body;
      if (reduced()) {
        restPose(cat, 'sit'); b.face = 'open'; b.set({ eyes: .9 });
        let t = 0; while (W.laser && !W.calm && t < 15) { t += yield; if (W.pointer && !W.overUI) b.look = { x: W.pointer.x, y: W.pointer.y }; }
        return;
      }
      if (cat.mind.t.grumpy > .7 && random() < .6) { say(cat, 'laser', 1); b.reset({ loaf: 1, eyes: .5 }); b.look = W.pointer; yield* wait(6); return; }
      if (random() < .5) say(cat, 'laser', .5);
      b.reset({ crouch: .7, pupil: 1.35, tailWag: .9, tailUp: .1 }); b.face = 'focus';
      let still = 0, t = 0, moveAt = 0;
      while (W.laser && t < 30) {
        const dt = yield; t += dt;
        const p = W.pointer; if (!p) continue;
        b.look = { x: p.x, y: p.y };
        const s = surfaceOf(cat); if (!s) continue;
        // The dot is somewhere else entirely: get over there.
        if (t > moveAt && (Math.abs(yAt(s, b.x, b.z) - p.y) > 320 || p.y > yAt(s, b.x, b.z) + 20)) {
          moveAt = t + 2.5; const target = surfaceUnder(p.x, p.y, cat);
          if (!(target.surface === s || sameLedge(target.surface, s))) { yield* travel(cat, target, runSpeed(cat)); b.reset({ crouch: .7, pupil: 1.35, tailWag: .9 }); b.face = 'focus'; continue; }
        }
        const lo = s === FLOOR ? 20 : s.left, hi = s === FLOOR ? W.w - 20 : s.right;
        const near = Math.abs(p.x - b.x) < 50 * b.k;
        if (!near) { b.goTo(clamp(p.x, lo, hi), s === FLOOR ? clamp(b.z + (random() - .5) * 4, floor().zBehind, 30) : 0, runSpeed(cat) * (Math.abs(p.x - b.x) > 200 ? 1.1 : .6)); still = 0; b.set({ crouch: .4 }); }
        else { b.stop(); still += dt; b.set({ crouch: 1 }); }
        if (still > .45 + random() * .4 && !b.jump && p.y < b.gy + 10) {
          b.set({ wiggle: 1 }); yield* wait(.35); b.set({ wiggle: 0 });
          const q = W.pointer || p;
          b.leap(clamp(q.x, lo, hi), b.gy, b.z, clamp(b.gy - q.y, 15, 240) + 10, .45); b.jump.k0 = b.jump.k1 = b.k; b.goal.swat = 1;
          while (b.jump) yield;
          if (s !== FLOOR) cat.at.dx = b.x - s.rect.left;
          b.goal.swat = 0; still = 0; puff(b.x, b.gy, 2);
          if (random() < .2) particle('?', b.top.x, b.top.y, { color: '#f2c78d', size: 18 });
        }
      }
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 40);
      b.face = 'open'; restPose(cat, 'sit'); yield* wait(1);
    },
    *treat(cat) {
      const tr = W.treat; if (!tr || tr.eaten) return;
      const b = cat.body; b.reset({ tailUp: 1 }); b.face = 'wide'; think(cat, '🐟', 1.5);
      while (tr.falling) yield;
      if (tr.eaten) { b.face = 'open'; return; }
      yield* travel(cat, { surface: tr.surface, x: tr.x + (tr.x > b.x ? -28 : 28) * b.k, z: tr.z }, runSpeed(cat) * (.6 + cat.mind.drives.hungry / 200));
      if (tr.eaten && tr.eater !== cat) {
        const off = (b.x < tr.x ? -1 : 1) * (60 + random() * 50) * b.k;
        yield* walkTo(cat, tr.x + off, null, walkSpeed(cat));
        // Too slow. Somebody else got it.
        b.face = 'grumpy'; b.reset({ sit: 1, earsBack: .5 }); b.look = tr.eater ? { x: tr.eater.body.x, y: tr.eater.body.gy - 30 } : null;
        if (tr.eater) cat.mind.bond(tr.eater.kind, -.04);
        if (random() < .5) say(cat, 'annoyed', .5);
        yield* wait(2.5); b.face = 'open'; return;
      }
      if (Math.abs(b.x - tr.x) > 90 * b.k) { b.face = 'open'; return; }
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
      let t = 0; const seconds = 10 + random() * 10;
      while (t < seconds) {
        const dt = yield; t += dt;
        const ps = surfaceOf(p); if (!ps) continue;
        const behind = p.body.x - Math.cos(p.body.yaw) * 55 * p.body.k;
        const mine = surfaceOf(cat);
        if (!(ps === FLOOR && mine === FLOOR) && !sameLedge(ps, mine) && !b.jump) { yield* travel(cat, { surface: ps, x: behind, z: p.body.z }, walkSpeed(cat) * 1.6); continue; }
        if (Math.abs(behind - b.x) > 30) { b.goTo(ps === FLOOR ? clamp(behind, 20, W.w - 20) : clamp(behind, ps.left, ps.right), p.body.z, Math.max(walkSpeed(cat), p.body.speed * 1.1)); b.reset({ tailUp: 1 }); }
        else if (!b.move) {
          // Copy whatever the hero is doing.
          const pp = p.body.goal; b.set({ sit: pp.sit, loaf: pp.loaf, crouch: pp.crouch * .8, rear: pp.rear, pawsUp: pp.pawsUp });
          b.look = random() < .02 ? 'viewer' : { x: p.body.x, y: p.body.gy - 30 };
        }
      }
      if (random() < .3) log(`${cat.name} followed ${p.name} around.`);
    },
  };
  function* waitT(seconds) { yield* wait(seconds); return seconds; }

  // The surface right below a point (a ledge under it, or the floor).
  function surfaceUnder(x, y, cat) {
    measure();
    const l = W.ledges.filter(q => onScreen(q.rect) && q.left < x + 40 && q.right > x - 40 && q.top > y - 20 && q.top - y < 320).sort((a, b) => a.top - b.top)[0];
    if (l) return { surface: l, x: clamp(x, l.left, l.right), z: 0 };
    return { surface: FLOOR, x: clamp(x, 40, W.w - 40), z: clamp(cat?.body.z ?? 0, -40, 30) };
  }

  function* settleToSleep(cat) {
    const b = cat.body; b.look = null;
    b.reset({ sit: 1 }); yield* wait(.5);
    // Turn around once or twice before lying down, like real cats.
    if (!reduced()) { b.faceYaw(b.yaw + Math.PI); yield* wait(.7); b.faceYaw(b.yaw + Math.PI * .9); yield* wait(.6); }
    b.reset({ loaf: 1, eyes: .4 }); yield* wait(.8);
    const ledge = cat.at.kind === 'ledge' && cat.at.ledge.kind !== 'word';
    b.reset({ curl: 1, eyes: 0, tailWrap: ledge ? 0 : 1, tailHang: ledge ? 1 : 0 }); b.face = 'sleep';
  }
  function* wake(cat) {
    const b = cat.body; b.face = 'open'; b.reset({ loaf: 1, eyes: .4 }); yield* wait(.7);
    yield* A.stretch(cat); cat.mind.drives.sleepy = Math.min(cat.mind.drives.sleepy, 10);
    if (random() < .3) say(cat, 'wake', .3);
  }

  // A cat responds to another starting something with them.
  function respond(cat, from, kind = 'visit') {
    if (cat.prio >= PRIORITY.social && cat.mind.activity !== 'sit' && cat.mind.activity !== 'loaf') return 'busy';
    if (cat.at.kind === 'away' || cat.at.kind === 'behind' || cat.closeup) return 'busy';
    const bond = cat.mind.bonds[from.kind] ?? 0, grumpy = cat.mind.t.grumpy;
    if (['sleep', 'cuddle'].includes(cat.mind.activity) && kind === 'chase') return 'hiss';
    if (bond + (1 - grumpy) * .5 + random() * .4 < .45) {
      interrupt(cat, (function* () {
        const b = cat.body; b.look = { x: from.body.x, y: from.body.gy - 30 };
        b.reset({ earsBack: 1, tailPuff: 1, tailUp: .9, crouch: .3, mouth: .8 }); b.face = 'wide'; say(cat, 'hiss', 1) || say(cat, 'annoyed', 1);
        yield* wait(1.4); b.reset({ sit: 1 }); b.face = 'grumpy'; yield* wait(2); b.face = 'open';
      })(), PRIORITY.social, 'hiss');
      return 'hiss';
    }
    if (kind === 'chase' && cat.mind.drives.playful + cat.mind.t.energy * 40 > 35) {
      interrupt(cat, A.flee(cat, from.kind), PRIORITY.social, 'flee', from.kind); return 'flee';
    }
    interrupt(cat, (function* () {
      const b = cat.body; b.look = { x: from.body.x, y: from.body.gy - 30 };
      if (cat.mind.activity === 'sleep' || cat.mind.activity === 'cuddle') { b.set({ eyes: .4 }); b.face = 'open'; yield* wait(2); b.set({ eyes: 0 }); b.face = 'sleep'; return; }
      b.reset({ sit: 1, tailUp: .8, tailCurl: .8 }); yield* wait(3.5);
    })(), PRIORITY.social, 'greet');
    return 'ok';
  }

  // ---------- plan control ----------
  function cancelPlan(cat) {
    const plan = cat.plan;
    cat.plan = null;
    try { plan?.return(); } finally { cat.phase = null; }
  }
  function* hangAt(cat, ledge, x, seconds = .7) {
    const b = cat.body;
    cat.at = { kind: 'hang', ledge, dx: x - refresh(ledge).rect.left };
    b.stop(); b.faceYaw(Math.PI / 2); b.reset({ hang: 1, tailHang: 1, tailUp: -.5, eyes: .95 }); b.noShadow = true;
    try {
      let t = 0;
      while (t < seconds) {
        if (!document.contains(ledge.el) || !onScreen(refresh(ledge).rect)) { fallToFloor(cat); while (b.jump) yield; return false; }
        t += yield;
      }
      b.hangPaws = null; b.set({ hang: 0, crouch: .25 });
      if (!(yield* leapTo(cat, clamp(x, ledge.left, ledge.right), ledge.y(x), S() * LEDGE_K, 20 * S(), .32, { surface: ledge }))) return false;
      land(cat, ledge);
      return true;
    } finally { b.hangPaws = null; b.noShadow = false; b.set({ hang: 0 }); }
  }
  // Interrupting mid-peek or mid-climb: put the cat somewhere sensible first.
  function unstick(cat) {
    cancelPlan(cat);
    const b = cat.body;
    b.stop();
    cat.peek = null; cat.edgePaws = null; cat.forceMask = false; b.drive = null; b.noShadow = false; b.hangPaws = null; b.set({ hang: 0 });
    if (cat.closeup) cat.closeup.goal = 0;
    if (cat.at.kind === 'wall') { cat.xf = null; const l = cat.at.ledge; b.x += cat.at.side * 30; b.gy = l.rect.top + cat.at.dy; cat.at = { kind: 'air' }; fallToFloor(cat); }
    else if (cat.at.kind !== 'away') {
      cat.xf = null;
      // Closing a leap also closes its future land() call. Recovery owns its
      // landing independently, so the next action cannot leave Bean floating.
      if (cat.at.kind === 'air' || cat.at.kind === 'hang') fallToFloor(cat);
    }
  }
  function fallToFloor(cat) {
    const b = cat.body, z = clamp(b.z, -30, 20);
    // Leap height is drawn above gy; preserve the visible position when a
    // cancelled jump becomes a recovery fall.
    b.gy = b.screen([0, 0, 0])[1]; b.h = 0;
    b.hangPaws = null; b.noShadow = false; b.set({ hang: 0, dangle: 0 });
    b.leap(clamp(b.x, 30, W.w - 30), floorY(z), z, 0, null, { type: 'fall', velocityY: Math.max(0, b.flight?.velocityY || 0), gravity: 1600 * S() });
    b.jump.k0 = b.k; b.jump.k1 = floorK(z); cat.at = { kind: 'air', then: FLOOR };
  }
  function interrupt(cat, gen, prio = PRIORITY.react, type = 'react', partner = null) {
    if (cat.prio > prio) return false;
    if (cat.at.kind === 'away' && prio < PRIORITY.treat) return false;
    unstick(cat);
    cat.plan = gen; cat.prio = prio; cat.body.stop();
    cat.body.set({ rear: 0, pawsUp: 0, swat: 0, offerPaw: 0, wiggle: 0, groom: 0, bob: 0, knead: 0 }); if (cat.body.face !== 'sleep') cat.body.face = 'open';
    if (type !== 'react' || cat.mind.activity === 'carried') cat.mind.begin(type, partner);
    return true;
  }
  function context(cat) {
    const others = cats.filter(o => o !== cat).map(o => ({ kind: o.kind, activity: o.mind.activity, playful: o.mind.drives.playful }));
    return {
      playing: W.playing, vibe: W.vibe, day: dayRhythm(new Date().getHours()), others, reduced: reduced(), calm: W.calm,
      cursor: !!W.pointer && !W.overUI && clock() - W.pointer.t < 15000,
      // A still cursor is an invitation only near Bean, not anywhere on the page.
      cursorDwell: W.pointer && !W.overUI && Math.hypot(W.pointer.x - cat.body.x, W.pointer.y - cat.body.gy) < 380 * S() ? (clock() - (W.pointer.stillSince ?? clock())) / 1000 : 0,
      invitedPlay: W.time < W.invitedUntil, laser: W.laser && !!W.pointer,
      treat: !!W.treat && !W.treat.eaten, critter: !!W.critter && !W.critter.flee, shelves: W.ledges.length > 0,
      hideouts: W.solids.some(l => l.rect.height > 150 && onScreen(l.rect)), toys: W.toys.length > 0,
      aquarium: W.aquarium,
    };
  }
  function next(cat) {
    if (W.playing && !W.laser && (!W.treat || W.treat.eaten)) {
      cat.prio = PRIORITY.normal; cat.plan = quietPlayback(cat); return;
    }
    const choice = cat.mind.choose(context(cat));
    let type = choice.type;
    if (!A[type]) type = 'sit';
    // An enabled but inactive toy must not route a rest choice through the
    // idle animations, which travel to new spots and emit sleep particles.
    if (W.playing && type !== 'treat' && type !== 'laser') {
      cat.prio = PRIORITY.normal; cat.plan = quietPlayback(cat); return;
    }
    // Only one cat at the glass at a time, and not too many out of the room.
    if (type === 'glass' && cats.some(c => c !== cat && c.mind.activity === 'glass')) type = 'stare';
    if (type === 'leave' && cats.filter(c => c !== cat && c.at.kind === 'away').length >= 2) type = 'wander';
    cat.mind.begin(type, choice.partner);
    cat.prio = type === 'treat' ? PRIORITY.treat : type === 'laser' ? PRIORITY.laser : PRIORITY.normal;
    if (choice.partner && byKind[choice.partner]) cat.prio = Math.max(cat.prio, PRIORITY.social - 5);
    cat.plan = A[type](cat, choice.partner ?? undefined);
  }
  function step(cat, dt) {
    // An independently owned recovery must land before choosing an activity
    // whose walking/exit primitives expect a supporting surface.
    if (!cat.plan && cat.at.kind === 'air' && cat.at.then && cat.body.jump) return;
    if (!cat.plan) {
      // Cats who are somewhere odd come back first.
      if (cat.at.kind === 'away' && !W.playing) { cat.plan = (function* () { yield* enter(cat, findSpot(cat), walkSpeed(cat)); })(); cat.prio = PRIORITY.normal; }
      else next(cat);
    }
    let guard = 0;
    while (cat.plan && guard++ < 3) {
      const r = cat.plan.next(dt);
      if (!r.done) break;
      cat.plan = null; cat.prio = 0; cat.body.face = cat.body.face === 'sleep' ? 'open' : cat.body.face;
      if (cat.at.kind !== 'away') unstick(cat);
      if (cat.at.kind === 'away' && !W.playing) { cat.plan = (function* () { yield* enter(cat, findSpot(cat), walkSpeed(cat)); })(); cat.prio = PRIORITY.normal; }
      else next(cat);
      dt = 0;
    }
  }

  // ---------- speech, thoughts, particles ----------
  function say(cat, key, chance = 1, force = false) {
    if (W.playing && !force) return false;
    if (random() > chance) return false;
    if (!force && W.time < W.speechAt) return false;
    if (cat.at.kind === 'away' && !cat.peek) return false;
    const text = cat.mind.line(key); if (!text) return false;
    cat.bubble = { text, until: W.time + 2.6 + text.length * .05, think: false };
    cat.thought = text; W.speechAt = W.time + 5 + random() * 5;
    cat.body.set({ mouth: .5 }); runtime.delay(() => { cat.body.goal.mouth = 0; }, 220);
    return true;
  }
  function think(cat, glyph, seconds = 1.6) { cat.bubble = { text: glyph, until: W.time + seconds, think: true }; }
  function particle(glyph, x, y, { color = '#fff', size = 16, rise = 34, life = 1.4, vx = 0 } = {}) {
    W.particles.push({ glyph, x, y, color, size, rise, life, age: 0, vx: vx || (random() - .5) * 12 });
    if (W.particles.length > 80) W.particles.shift();
  }
  function puff(x, y, n = 3) { if (W.playing) return; for (let i = 0; i < n; i++) W.particles.push({ glyph: 'dust', x: x + (random() - .5) * 30, y: y - 4, color: '#d6c8e6', size: 6 + random() * 6, rise: 8, life: .6, age: 0, vx: (random() - .5) * 60 }); }
  function puffGlass(x, y) { for (let i = 0; i < 2; i++) particle('tap', x + (random() - .5) * 30, y - 20, { color: '#f1eaf7', size: 12, rise: 24, life: .8 }); }
  function log(text) {
    const at = new Date(); journal.push({ t: at.getTime(), text }); if (journal.length > 30) journal.shift();
  }
  // Nudge a page decoration as if a paw hit it; drop distance > 0 knocks it off.
  function wobble(el, drop, dir) {
    if (W.playing || !el.animate) return;
    knocked.add(el);
    el.dataset.catKnocked = '1';
    if (drop > 0) {
      // Transform adds to the element's own animation; opacity must replace, or 1 + 0 stays visible.
      const a = animate(el, [{ transform: 'none' }, { transform: `translate(${dir * 30}px, -14px) rotate(${dir * 25}deg)`, offset: .18 }, { transform: `translate(${dir * 80}px, ${drop}px) rotate(${dir * 200}deg)`, offset: .85 }, { transform: `translate(${dir * 86}px, ${drop}px) rotate(${dir * 215}deg)` }], { duration: 1100, easing: 'cubic-bezier(.4,0,.9,.6)', fill: 'forwards', composite: 'add' });
      const gone = animate(el, [{ opacity: 1, offset: .85 }, { opacity: 0 }], { duration: 1100, fill: 'forwards' });
      a.onfinish = () => { runtime.delay(() => { a.cancel(); gone.cancel(); if (W.playing) { restoreToy(el); return; } animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 }); animate(el, [{ transform: 'scale(.6)' }, { transform: 'none' }], { duration: 600, composite: 'add' }).onfinish = () => restoreToy(el); }, 25000); };
      runtime.delay(() => { if (!W.playing) puff(el.getBoundingClientRect().left + dir * 80, floorY(0), 5); }, 950);
    } else {
      animate(el, [{ transform: 'none' }, { transform: `rotate(${dir * 14}deg) translateX(${dir * 6}px)` }, { transform: `rotate(${-dir * 7}deg)` }, { transform: `rotate(${dir * 3}deg)` }, { transform: 'none' }], { duration: 800, easing: 'ease-out', composite: 'add' })
        .onfinish = () => runtime.delay(() => restoreToy(el), 8000);
    }
  }

  // ---------- interactions ----------
  function applyXf(cat, x, y) {
    const xf = cat.xf; if (!xf) return { x, y };
    const c = Math.cos(xf.angle), s = Math.sin(xf.angle), dx = x - xf.px, dy = y - xf.py;
    return { x: xf.px + dx * c - dy * s, y: xf.py + dx * s + dy * c };
  }
  function unXf(cat, x, y) {
    const xf = cat.xf; if (!xf) return { x, y };
    const c = Math.cos(-xf.angle), s = Math.sin(-xf.angle), dx = x - xf.px, dy = y - xf.py;
    return { x: xf.px + dx * c - dy * s, y: xf.py + dx * s + dy * c };
  }
  const drawn = cat => !(cat.at.kind === 'away' && !cat.peek);
  const masked = cat => cat.forceMask || cat.at.kind === 'behind' || (cat.at.kind === 'floor' && cat.body.z < floor().zBehind && !cat.closeup);
  function catAt(x, y) {
    const order = drawOrder().reverse();
    return order.find(c => {
      if (!drawn(c)) return false;
      if (masked(c) && W.solids.some(s => x > s.rect.left && x < s.rect.right && y > s.rect.top && y < s.rect.bottom)) return false;
      const p = unXf(c, x, y); return c.body.contains(p.x, p.y);
    }) || null;
  }
  function onPet(cat) {
    if (W.time < (cat.petReadyAt || 0)) return;
    cat.petReadyAt = W.time + .85; W.invitedUntil = W.time + 16;
    const r = cat.mind.pet(), b = cat.body;
    const stay = !!cat.peek || !!cat.closeup;
    if (r === 'enough') {
      if (cat.peek) { cat.peek.goal = -.45; say(cat, cat.cast.voice.petMax ? 'petMax' : 'annoyed', 1, true); return; }
      interrupt(cat, (function* () {
        b.reset({ sit: 1, earsBack: 1, tailWag: 1 }); b.face = 'grumpy'; say(cat, cat.cast.voice.petMax ? 'petMax' : 'annoyed', 1, true);
        b.look = W.pointer ? { x: W.pointer.x, y: W.pointer.y } : null; yield* wait(.4); b.set({ swat: 1 }); yield* wait(.25); b.set({ swat: 0 });
        yield* wait(.6); b.face = 'open'; yield* A.wander(cat);
      })(), PRIORITY.react, 'annoyed');
      return;
    }
    const top = applyXf(cat, b.top.x, b.top.y);
    particle('♥', top.x + (random() - .5) * 20, top.y, { color: '#f29bb0', size: 14 + random() * 6 });
    if (stay || cat.mind.activity === 'sleep' || cat.mind.activity === 'cuddle' || cat.at.kind === 'behind') {
      b.face = cat.mind.activity === 'sleep' ? 'sleep' : 'happy'; b.slowBlink(1.3);
      runtime.delay(() => { if (b.face === 'happy') b.face = 'open'; }, 1200); return;
    }
    interrupt(cat, (function* () {
      b.reset({ sit: 1, tailUp: .8, tailCurl: .9, eyes: .85, headRoll: (random() < .5 ? -1 : 1) * .15 }); b.face = 'happy'; b.look = null; b.slowBlink(1.4);
      if (cat.mind.stats.pets % 5 === 1) say(cat, 'pet', .7);
      yield* wait(1.8);
      b.face = 'open'; b.set({ eyes: .88, headRoll: 0 });
    })(), PRIORITY.react, 'react');
    if (cat.mind.stats.pets === 1 || cat.mind.stats.pets % 15 === 0) log(`You petted ${cat.name}${cat.mind.stats.pets > 1 ? ` (${cat.mind.stats.pets} times so far)` : ''}.`);
  }
  function onBoop(cat) {
    if (W.time < (cat.boopReadyAt || 0)) return;
    cat.boopReadyAt = W.time + .7; W.invitedUntil = W.time + 16;
    const r = cat.mind.boop(), b = cat.body;
    if (cat.peek) {
      // Booped while peeking: duck, then pop up somewhere else.
      cat.peek.goal = -.45; cat.peek.fast = true; say(cat, 'boop', 1, true); return;
    }
    if (cat.closeup) { b.bounce(1); b.face = 'wide'; say(cat, 'boop', 1, true); runtime.delay(() => { b.face = 'open'; }, 700); return; }
    interrupt(cat, (function* () {
      b.look = 'viewer'; b.bounce(.8);
      if (!reduced() && cat.kind === 'black' && random() < .18 && cat.at.kind === 'floor') {
        // Bean falls over from the sheer force of the boop.
        b.reset({ loaf: 1, curl: .6, eyes: 0 }); b.face = 'happy'; say(cat, 'boop', 1, true); yield* wait(1.2); b.reset({ sit: 1 }); b.face = 'open'; yield* wait(.8); return;
      }
      if (r === 'annoyed') { b.reset({ sit: 1, earsBack: 1, tailWag: 1 }); b.face = 'grumpy'; say(cat, 'boop', 1, true); yield* wait(2); b.face = 'open'; return; }
      if (r === 'playful') { b.reset({ crouch: .8, pupil: 1.3 }); b.face = 'focus'; say(cat, 'boop', 1, true); yield* wait(.5); b.set({ swat: 1 }); yield* wait(.25); b.set({ swat: 0 }); yield* wait(.25); b.set({ swat: 1 }); yield* wait(.25); b.set({ swat: 0 }); b.face = 'open'; return; }
      b.reset({ sit: 1, tailUp: 1 }); b.face = 'happy'; say(cat, 'boop', 1, true); particle('♥', b.top.x, b.top.y, { color: '#f29bb0' });
      yield* wait(1.4); b.face = 'open';
    })(), PRIORITY.react, 'react');
  }
  function pickupFeedback(cat, key) {
    W.hovered = null; W.petDist = 0;
    document.documentElement.classList.remove('cat-hover');
    // An acknowledged attempt must not disappear behind a speech cooldown.
    // Repeated attempts refresh neither the escape nor its handling pressure.
    if (cat.bubble?.pickup && cat.bubble.until > W.time + .8) return;
    if (say(cat, key, 1, true)) cat.bubble.pickup = true;
  }
  function* refuseScreenPeek(cat, pk) {
    const b = cat.body;
    try {
      // Stay in this window edge long enough for the refusal to be readable.
      // Generic interruption clears the peek and makes an away cat invisible.
      cat.phase = 'no uppies right now';
      pk.fast = false; pk.goal = Math.max(pk.amt, .82);
      yield* refusePickup(b, { quiet: W.calm || reduced() });
      b.look = 'viewer'; yield* wait(.65);
      cat.phase = 'ducking out of reach'; pk.goal = -.45;
      while (pk.amt > -.4) yield;
      cat.peek = null; cat.xf = null; cat.edgePaws = null;
      cat.phase = 'taking a little space'; yield* wait(1.2);
    } finally {
      if (cat.peek === pk) cat.peek = null;
      cat.xf = null; cat.edgePaws = null; cat.phase = null;
      b.look = null;
      b.set({ recoil: 0, offerPaw: 0, headYaw: 0, headPitch: 0, headRoll: 0, earsBack: 0, tailWag: .12 });
      if (cat.bubble?.pickup) cat.bubble = null;
    }
  }
  function startCarry(cat, speed = 0) {
    if (W.drag) return false;
    if (cat.prio >= PRIORITY.evade) { pickupFeedback(cat, 'spaceGrab'); return false; }
    const outcome = cat.mind.requestGrab({ speed, calm: W.calm, reduced: reduced(),
      invitedPlay: W.time < W.invitedUntil, approaching: cat.mind.activity === 'approach' });
    if (outcome !== 'accept') {
      if (cat.at.kind === 'away' && cat.peek?.mode === 'screen') {
        const pk = cat.peek, xf = cat.xf, paws = cat.edgePaws;
        cancelPlan(cat);
        cat.peek = pk; cat.xf = xf; cat.edgePaws = paws;
        cat.mind.begin('evade'); cat.prio = PRIORITY.evade;
        cat.plan = refuseScreenPeek(cat, pk);
        // Arm its finally block now, including Calm/teardown before a frame.
        cat.plan.next(0);
      } else interrupt(cat, A.evade(cat, W.pointer && { ...W.pointer }, outcome), PRIORITY.evade, 'evade');
      cat.phase = 'no uppies right now';
      pickupFeedback(cat, outcome === 'flee' ? 'fleeGrab' : 'refuseGrab');
      return false;
    }
    W.invitedUntil = W.time + 16;
    cancelPlan(cat);
    const b = cat.body;
    // Lift from wherever it was: behind a card, peeking, climbing, at the glass.
    const head = applyXf(cat, b.x, b.gy);
    cat.peek = null; cat.edgePaws = null; cat.closeup = null; cat.xf = null; cat.forceMask = false; b.drive = null; b.noShadow = false; b.hangPaws = null;
    b.x = head.x; b.gy = head.y;
    W.drag = { cat, vx: 0, vy: 0, inputAt: performance.now() }; cat.mind.carried(); cat.mind.begin('carried'); cat.at = { kind: 'air' };
    document.documentElement.classList.add('cat-carrying');
    cat.plan = (function* () { while (W.drag?.cat === cat) yield; })(); cat.prio = PRIORITY.carried;
    b.stop(); b.jump = null; b.reset({ dangle: 1, tailUp: -.8, earsBack: cat.mind.t.grumpy > .5 ? .7 : .2 }); b.face = cat.mind.t.grumpy > .5 ? 'grumpy' : 'wide';
    b.look = 'viewer'; say(cat, 'carried', 1, true);
    return true;
  }
  function drop(cat, allowThrow = true) {
    cancelPlan(cat);
    const b = cat.body, drag = W.drag; W.drag = null; W.press = null;
    W.hovered = null;
    document.documentElement.classList.remove('cat-carrying', 'cat-hover');
    if (drag && W.pointer) { b.x = W.pointer.x; b.gy = W.pointer.y + (b.L.legLen + b.L.bodyR * 3.2) * b.k; b.h = 0; }
    measure(true);
    const f = floor(), z = clamp(b.z, f.zBehind + 5, f.zMax - 10);
    // Flat, durable edges are release catches. Word skylines remain route
    // perches, but are not approximated as a flat collision surface here.
    const surfaces = W.ledges.filter(l => l.kind !== 'word' && onScreen(l.rect) && document.contains(l.el));
    const fresh = allowThrow && !W.calm && !reduced() && drag && performance.now() - drag.inputAt < 100;
    const flight = planRelease({ x: b.x, y: b.screen([0, 0, 0])[1], vx: fresh ? drag.vx : 0, vy: fresh ? drag.vy : 0,
      floorY: floorY(z), width: W.w, scale: S(),
      surfaces: surfaces.map((l, id) => ({ id, left: l.left, right: l.right, y: l.y(clamp(b.x, l.left, l.right)) })) });
    const surface = flight.surfaceId === null ? FLOOR : surfaces[flight.surfaceId];
    b.x = flight.startX; b.gy = flight.startY; b.h = 0; b.shadowY = null;
    b.reset({ tailUp: .75, earsBack: .1 }); b.face = 'open'; b.look = null;
    b.leap(flight.x, flight.y, surface === FLOOR ? z : 0, 0, flight.duration,
      { type: flight.thrown ? 'throw' : 'fall', velocityY: flight.vy, gravity: flight.gravity, spin: reduced() ? 0 : flight.spin });
    b.jump.k0 = b.k; b.jump.k1 = kAt(surface, z); cat.at = { kind: 'air', then: surface, landingY: flight.y };
    cat.mind.recordRelease({ thrown: flight.thrown });
    cat.phase = flight.thrown ? 'righting in the air' : 'finding his feet';
    cat.plan = (function* () {
      try {
        while (b.jump) yield;
        land(cat, surfaceOf(cat) || cat.at.then || FLOOR); cat.mind.begin('react');
        cat.phase = 'absorbing the landing'; b.set({ crouch: .5 }); yield* wait(.2); b.set({ crouch: 0 });
        if (flight.thrown && !W.calm && !reduced()) {
          cat.phase = 'running out the landing';
          const s = surfaceOf(cat), x = safeLanding(s, b.x + Math.sign(flight.vx || 1) * 100 * S());
          if (x !== null) yield* walkTo(cat, x, b.z, runSpeed(cat) * .75);
        }
        restPose(cat, 'sit'); b.face = 'open'; cat.target = null; yield* wait(.8);
      } finally { cat.phase = null; }
    })();
    cat.prio = PRIORITY.react;
  }

  function onPointerMove(e) {
    // Releases outside the document (including over an iframe) may never send
    // pointerup here. Do not keep a ghost grab when the pointer comes back.
    if ((W.drag || W.press) && typeof e.buttons === 'number' && !(e.buttons & 1)) {
      if (W.drag) drop(W.drag.cat, false);
      W.press = null;
    }
    const now = clock(), x = e.clientX, y = e.clientY;
    const inputAt = e.timeStamp ?? performance.now();
    W.idleSince = now;
    const prev = W.pointer;
    const dist = prev ? Math.hypot(x - prev.x, y - prev.y) : 0, dtm = prev ? Math.max(8, inputAt - prev.inputAt) : 16;
    const overUI = !!e.target?.closest?.(UI);
    // Time over a player/button must not become an instant invitation when
    // that control moves away or the pointer crosses onto empty space.
    const steady = prev && !overUI && !W.overUI && Math.hypot(x - prev.anchorX, y - prev.anchorY) < 16;
    W.pointer = { x, y, t: now, inputAt, speed: dist / dtm,
      stillSince: steady ? prev.stillSince : now, anchorX: steady ? prev.anchorX : x, anchorY: steady ? prev.anchorY : y };
    W.overUI = overUI;
    if (W.drag) {
      const weight = 1 - Math.exp(-dtm / 35);
      W.drag.vx = lerp(W.drag.vx, clamp((x - (prev?.x ?? x)) / dtm * 1000, -2400, 2400), weight);
      W.drag.vy = lerp(W.drag.vy, clamp((y - (prev?.y ?? y)) / dtm * 1000, -2400, 2400), weight);
      W.drag.inputAt = performance.now(); return; // passive listener: no preventDefault
    }
    if (W.press?.cat) {
      const distance = Math.hypot(x - W.press.x, y - W.press.y);
      if (distance > 8) {
        // A normal drag's first 8–20 px arrive in very few milliseconds. Use
        // the whole pickup gesture with a short noise floor, not one sample.
        const speed = distance / Math.max(120, inputAt - W.press.inputAt) * 1000;
        startCarry(W.press.cat, speed); W.press = null; return;
      }
    }
    const hovered = !W.overUI && !e.target?.closest?.('dialog') ? catAt(x, y) : null;
    if (hovered !== W.hovered) { W.hovered = hovered; W.petDist = 0; document.documentElement.classList.toggle('cat-hover', !!hovered); }
    if (hovered) {
      const speed = W.pointer.speed;
      if (speed > .03 && speed < 1.4) { W.petDist += dist; if (W.petDist > 150) { W.petDist = 0; onPet(hovered); } }
    }
    // A fast cursor near a shy cat startles it.
    if (!W.playing && !W.overUI && W.pointer.speed > 2.2) {
      for (const c of cats) {
        if (c.mind.t.bold > .4 || c.prio >= PRIORITY.react || !drawn(c) || c.peek || c.closeup || c.at.kind === 'behind') continue;
        if (Math.hypot(c.body.x - x, c.body.gy - 40 - y) > 140 || W.time < (c.scaredAt || 0) + 8) continue;
        c.scaredAt = W.time; c.mind.startle(); const b = c.body;
        interrupt(c, (function* () {
          b.look = { x, y }; b.reset({ earsBack: 1, tailPuff: 1, tailUp: .6 }); b.face = 'wide'; b.bounce(1.2); say(c, 'cursorFast', 1);
          b.leap(b.x, b.gy, b.z, 22, .32); b.jump.k0 = b.jump.k1 = b.k; while (b.jump) yield;
          // Hide, if there's somewhere to hide.
          if (W.solids.length && random() < .5) { yield* A.hide(c); return; }
          yield* travel(c, findSpot(c, { where: 'any', near: clamp(b.x + (b.x > x ? 260 : -260), 40, W.w - 40), spread: 160 }), runSpeed(c));
          b.reset({ sit: 1 }); b.face = 'open'; b.look = { x, y }; yield* wait(1.5);
        })(), PRIORITY.react, 'react');
      }
    }
  }
  function onPointerDown(e) {
    if (!panel.hidden && !panel.contains(e.target) && !panelBtn.contains(e.target)) setPanel(false);
    if (e.button !== 0 || e.target?.closest?.(UI) || document.querySelector('dialog[open]')) return;
    const cat = catAt(e.clientX, e.clientY);
    if (!cat) return;
    e.preventDefault();
    W.press = { cat, x: e.clientX, y: e.clientY, t: clock(), inputAt: e.timeStamp ?? performance.now() };
  }
  function onPointerUp(e) {
    if (W.drag) { drop(W.drag.cat, e?.type !== 'pointercancel'); return; }
    if (e?.type === 'pointercancel') { W.press = null; return; }
    if (W.press) { const cat = W.press.cat; W.press = null; onBoop(cat); }
  }
  function onDoubleClick(e) {
    if (e.target?.closest?.(UI) || catAt(e.clientX, e.clientY)) return;
    if (String(getSelection?.() || '').trim()) return;
    dropTreat(e.clientX, e.clientY);
  }
  function dropTreat(x = W.w * (.3 + random() * .4), y = 80) {
    if (W.treat && !W.treat.eaten) return;
    W.invitedUntil = W.time + 25;
    measure(true);
    const ledge = W.ledges.filter(l => x > l.left && x < l.right && l.y(x) >= y).sort((p, q) => p.y(x) - q.y(x))[0];
    const z = ledge ? 0 : -20 + random() * 30;
    W.treat = { x, y, vy: 0, falling: true, surface: ledge || FLOOR, z, ground: ledge ? ledge.y(x) : floorY(z), eaten: false, spin: 0 };
    log('You dropped a treat.');
    for (const c of cats) {
      if (W.calm) continue;
      if (c.prio >= PRIORITY.treat || (['sleep', 'cuddle'].includes(c.mind.activity) && c.mind.drives.hungry < 50)) continue;
      if (c.at.kind === 'away' && random() < .5) continue;
      unstick(c); c.mind.begin('treat'); c.plan = A.treat(c); c.prio = PRIORITY.treat;
    }
  }
  function setLaser(on) {
    W.laser = on; $('cat-laser-btn')?.setAttribute('aria-checked', String(on));
    document.documentElement.classList.toggle('cat-laser', on);
    if (on) { W.invitedUntil = W.time + 25; log('You turned on the laser pointer.'); for (const c of cats) if (!W.calm && c.prio < PRIORITY.laser && c.at.kind !== 'away') { unstick(c); c.mind.begin('laser'); c.plan = A.laser(c); c.prio = PRIORITY.laser; } }
    else for (const c of cats) if (c.mind.activity === 'laser' && c.prio < PRIORITY.carried) { unstick(c); c.body.stop(); c.body.reset({ sit: 1 }); c.prio = 0; }
  }
  function inviteBean() {
    const c = companion;
    if (c.prio >= PRIORITY.carried || (c.mind.activity === 'approach' && c.plan) || W.time < (c.helloReadyAt || 0)) return false;
    c.helloReadyAt = W.time + 8; W.invitedUntil = W.time + 22; W.attentionReadyAt = W.time + 40;
    if (W.calm) setCalm(false);
    setPanel(false);
    interrupt(c, A.approach(c), PRIORITY.react, 'approach');
    return true;
  }
  function setCalm(on) {
    const waking = W.calm && !on;
    W.calm = on;
    const btn = $('cat-calm-dock'); if (btn) { btn.setAttribute('aria-checked', String(on)); btn.textContent = on ? 'Wake Bean' : 'Let Bean sleep'; }
    if (on && W.laser) setLaser(false);
    if (on && W.drag) drop(W.drag.cat, false);
    for (const c of cats) if (c.prio < PRIORITY.carried && (on || c.at.kind !== 'away')) { unstick(c); c.body.stop(); c.plan = null; c.prio = 0; }
    // Only Wake Bean ends a nap; starting up uncalm keeps a drowsy Bean drowsy.
    if (waking) for (const c of cats) {
      c.mind.drives.sleepy = Math.min(c.mind.drives.sleepy, 15);
      if (c.body.face === 'sleep') { c.body.face = 'open'; c.body.set({ eyes: .88 }); }
    }
    save();
  }
  function setAquarium(on) {
    setPanel(false);
    if (W.drag) drop(W.drag.cat, false);
    W.aquarium = on; document.body.classList.toggle('cat-wallpaper', on);
    const btn = $('cat-aquarium-btn'); if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? (room ? 'Back to room' : 'Back to site') : 'Aquarium'; }
    const url = new URL(location.href); if (on) url.searchParams.set('wallpaper', '1'); else url.searchParams.delete('wallpaper'); history.replaceState(history.state, '', url);
    for (const el of document.querySelectorAll(room ? '.room-nav,.playlist-column' : '.home-main,.site-footer')) {
      if (!inertBefore.has(el)) inertBefore.set(el, el.inert);
      el.inert = on || inertBefore.get(el);
    }
    resize(); measure(true);
    const f = floor();
    for (const c of cats) {
      unstick(c); c.xf = null; c.closeup = null;
      c.body.jump = null; c.body.stop(); c.at = { kind: 'floor' };
      c.body.z = on ? lerp(f.zMin * .8, 0, random()) : clamp(c.body.z, -40, 30);
      c.body.x = clamp(c.body.x, 40, W.w - 40);
      c.plan = null; c.prio = 0;
    }
  }

  // ---------- Bean's context menu ----------
  const panel = $('cat-panel'), panelBtn = $('cat-panel-btn');
  const menuItems = () => [...panel.querySelectorAll('[role^="menuitem"]')].filter(el => !el.disabled);
  function setPanel(open, point = null, restoreFocus = false) {
    panel.hidden = !open; panelBtn.setAttribute('aria-expanded', String(open));
    if (!open) { if (restoreFocus) panelBtn.focus(); return; }
    W.press = null;
    const trigger = panelBtn.getBoundingClientRect(), box = panel.getBoundingClientRect();
    const x = point ? point.x + 8 : trigger.right - box.width;
    const y = point ? point.y + 8 : trigger.top - box.height - 10;
    panel.style.left = `${clamp(x, 8, Math.max(8, W.w - box.width - 8))}px`;
    panel.style.top = `${clamp(y, 8, Math.max(8, W.h - box.height - 8))}px`;
    const items = menuItems();
    for (const item of items) item.tabIndex = -1;
    if (items[0]) { items[0].tabIndex = 0; items[0].focus(); }
  }
  function contextMenu(e) {
    if (e.target?.closest?.(UI) || document.querySelector('dialog[open]')) return;
    if (!catAt(e.clientX, e.clientY)) return;
    e.preventDefault();
    if (W.drag) drop(W.drag.cat, false);
    setPanel(true, { x: e.clientX, y: e.clientY });
  }

  // ---------- persistence ----------
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ visits, lastSeen: Date.now(), calm: W.calm, cats: { ...saved.cats, ...Object.fromEntries(cats.map(c => [c.kind, c.mind.memory()])) }, journal: journal.slice(-12) }));
    } catch {}
  }

  // ---------- simulation ----------
  function resize() {
    setPanel(false);
    W.w = innerWidth; W.h = innerHeight; W.dpr = Math.min(2, devicePixelRatio || 1);
    for (const cv of [canvas, layer]) { cv.width = Math.round(W.w * W.dpr); cv.height = Math.round(W.h * W.dpr); }
    canvas.style.width = W.w + 'px'; canvas.style.height = W.h + 'px';
    measure(true);
    for (const c of cats) { if (c.at.kind === 'floor') c.body.x = clamp(c.body.x, 20, W.w - 20); c.target = null; }
  }
  function place(c, i) {
    const spot = findSpot(c, { where: (i + (random() < .5 ? 1 : 0)) % 2 ? 'ledge' : 'floor', near: W.w * (.12 + i * .25 + random() * .6), spread: 300 });
    c.body.x = spot.x; c.body.z = spot.z ?? 0;
    if (spot.surface === FLOOR) { c.at = { kind: 'floor' }; c.body.gy = floorY(c.body.z); c.body.k = floorK(c.body.z); }
    else { land(c, spot.surface); c.body.gy = spot.surface.y(spot.x); c.body.k = S() * LEDGE_K; }
    c.body.yaw = random() < .6 ? Math.PI / 2 + (random() - .5) : random() * TAU;
    const pose = ['sit', 'loaf', 'sit', 'curl'][Math.floor(random() * 4)];
    c.body.reset({ [pose]: 1 }); Object.assign(c.body.pose, c.body.goal);
  }

  // Keep a cat attached to whatever it's on (pages scroll; cards move).
  function settle(cat, dt) {
    const b = cat.body, at = cat.at;
    if (W.drag?.cat === cat) return;
    if (at.kind === 'air' && at.then && at.then !== FLOOR) {
      const l = refresh(at.then), x = b.jump?.x1 ?? b.x;
      if (!document.contains(l.el) || !onScreen(l.rect) || x < l.left || x > l.right
        || (at.landingY !== undefined && Math.abs(l.y(x) - at.landingY) > 40)) fallToFloor(cat);
    }
    if (b.jump) {
      const j = b.jump; b.k = lerp(j.k0 ?? b.k, j.k1 ?? b.k, clamp(j.t / j.dur, 0, 1));
      if (cat.xf && !cat.peek && at.kind !== 'wall') cat.xf.px = b.x, cat.xf.py = b.gy;
      return;
    }
    if (at.kind === 'air') { if (at.then) land(cat, at.then); else if (!cat.plan) fallToFloor(cat); return; }
    if (at.kind === 'floor') {
      const f = floor(); b.z = clamp(b.z, f.zMin, f.zMax);
      let k = floorK(b.z), gy = floorY(b.z);
      if (cat.closeup) {
        const c = cat.closeup; c.amt = ease(c.amt, c.goal, 2.6, dt);
        const kc = S() * 3.1, a = c.amt * c.amt * (3 - 2 * c.amt);
        k = lerp(k, kc, a);
        const headY = W.h - b.L.headR * kc * 1.05;
        gy = lerp(gy, headY + b.headLift * kc, a);
      }
      b.k = k; b.gy = gy;
    } else if (at.kind === 'ledge') {
      const l = refresh(at.ledge);
      if (b.move) at.dx = b.x - l.rect.left; else b.x = l.rect.left + at.dx;
      b.x = clamp(b.x, l.left, l.right); at.dx = b.x - l.rect.left;
      const ty = l.y(b.x); b.gy = Math.abs(b.gy - ty) > 60 ? ty : ease(b.gy, ty, 22, dt); b.k = S() * LEDGE_K;
      // The ledge scrolled away: hop off it, or leave if it's gone for good.
      if (!onScreen(l.rect, -20) || !document.contains(l.el)) {
        cat.offAt += dt;
        if (cat.offAt > 3 && cat.prio < PRIORITY.react) { cancelPlan(cat); cat.offAt = 0; cat.at = { kind: 'away', side: 'top' }; cat.prio = 0; }
      } else cat.offAt = 0;
    } else if (at.kind === 'behind') {
      const r = refresh(at.solid).rect;
      if (!document.contains(at.solid.el) || !onScreen(r, -20)) {
        unstick(cat); fallToFloor(cat); cat.prio = 0; return;
      }
      b.x = r.left + at.dx; b.gy = r.top + at.dy; b.k = S() * BEHIND_K;
    } else if (at.kind === 'hang') {
      const l = refresh(at.ledge);
      if (!document.contains(l.el) || !onScreen(l.rect)) { unstick(cat); cat.prio = 0; return; }
      b.k = S() * LEDGE_K; b.x = clamp(l.rect.left + at.dx, l.left, l.right);
      const edgeY = l.y(b.x); b.gy = edgeY + 64 * b.k;
      b.hangPaws = [{ x: b.x - 12 * b.k, y: edgeY }, { x: b.x + 12 * b.k, y: edgeY }];
      b.noShadow = true;
    } else if (at.kind === 'wall') {
      const r = refresh(at.ledge).rect;
      if (!document.contains(at.ledge.el) || !onScreen(r)) { unstick(cat); cat.prio = 0; return; }
      b.x = at.side < 0 ? r.left : r.right; b.gy = r.top + at.dy;
      cat.xf = { angle: at.side * Math.PI / 2, px: b.x, py: b.gy };
    }
    if (cat.peek) placePeek(cat, dt);
  }

  function updateCritter(dt) {
    if (W.playing) { W.critter = null; return; }
    const bug = W.critter;
    if (!bug) {
      W.nextCritter -= dt;
      if (W.nextCritter <= 0 && !W.calm && !reduced()) {
        W.nextCritter = (W.aquarium ? 40 : 180) + random() * 180;
        const fromLeft = random() < .5;
        W.critter = { x: fromLeft ? -20 : W.w + 20, y: W.h * (.25 + random() * .5), dir: fromLeft ? 1 : -1, t: 0, flap: 0, hue: pick(['#f2c78d', '#c3acf0', '#8fd3b5', '#f29bb0']), flee: false, gone: false, life: 25 + random() * 15 };
        log('A butterfly drifted in.');
        // The curious notice first.
        for (const c of cats) if (c.prio < PRIORITY.social && c.at.kind !== 'away' && c.mind.canStart('hunt', context(c)) && random() < c.mind.t.curiosity * .7 && !['sleep', 'cuddle'].includes(c.mind.activity)
          // A loafing cat mostly just follows it with its eyes.
          && (c.mind.activity !== 'loaf' || random() < .3)) { unstick(c); c.mind.begin('hunt'); c.plan = A.hunt(c); c.prio = PRIORITY.normal + 5; }
      }
      return;
    }
    bug.t += dt; bug.flap += dt * 18;
    if (bug.flee || bug.t > bug.life) { bug.y -= dt * 160; bug.x += bug.dir * dt * 120; if (bug.y < -40) { bug.gone = true; W.critter = null; } return; }
    bug.x += bug.dir * dt * (40 + Math.sin(bug.t * .7) * 30);
    bug.y += Math.sin(bug.t * 2.1) * dt * 60 + Math.sin(bug.t * .45) * dt * 25;
    bug.y = clamp(bug.y, W.h * .15, floorY(0) - 70);
    if (bug.x < 30) bug.dir = 1; if (bug.x > W.w - 30) bug.dir = -1;
  }
  function updateTreat(dt) {
    const tr = W.treat; if (!tr) return;
    if (tr.surface !== FLOOR) { refresh(tr.surface); tr.ground = tr.surface.y(tr.x); }
    if (tr.falling) {
      tr.vy += 1800 * dt; tr.y += tr.vy * dt; tr.spin += dt * 9;
      if (tr.y >= tr.ground) { tr.y = tr.ground; if (tr.vy > 250) { tr.vy *= -.35; puff(tr.x, tr.y, 2); } else { tr.falling = false; tr.vy = 0; } }
    } else tr.y = tr.ground;
  }

  let saveAt = 0, hiddenAt = null;
  function frame(dt, time) {
    W.time = time;
    measure();
    const day = dayRhythm(new Date().getHours());
    for (const c of cats) {
      const near = cats.some(o => o !== c && Math.abs(o.body.x - c.body.x) < 120 && Math.abs(o.body.gy - c.body.gy) < 60);
      c.mind.tick(dt, { day, nearFriend: near, playing: W.playing, invitedPlay: W.time < W.invitedUntil });
      const attention = context(c);
      if (!W.drag && !W.calm && !W.playing && W.time > W.attentionReadyAt && attention.cursor && attention.cursorDwell > 1.3
        && c.prio < PRIORITY.social && c.at.kind === 'floor' && !c.body.move && !['sleep', 'approach'].includes(c.mind.activity)
        && Math.hypot(W.pointer.x - c.body.x, W.pointer.y - (c.body.gy - 55 * c.body.k)) < 220 * S()
        && c.mind.canStart('approach', attention)) {
        W.attentionReadyAt = W.time + 35;
        interrupt(c, A.approach(c), PRIORITY.normal + 5, 'approach');
      }
      if (W.drag?.cat === c) {
        const p = W.pointer; if (p) { const b = c.body; b.x = p.x; b.gy = p.y + (b.L.legLen + b.L.bodyR * 3.2) * b.k; b.h = 0; b.shadowY = floorY(clamp(b.z, -40, 30)); }
      } else step(c, dt);
      if (c.at.kind !== 'away' || c.peek) c.body.update(dt);
      settle(c, dt);
    }
    updateCritter(dt); updateTreat(dt);
    for (const p of W.particles) { p.age += dt; p.x += p.vx * dt; p.y -= p.rise * dt / p.life; }
    W.particles = W.particles.filter(p => p.age < p.life);
    for (const g of W.glass) g.age += dt;
    W.glass = W.glass.filter(g => g.age < g.life);
    render();
    if (time >= saveAt) { saveAt = time + 15; save(); }
  }

  function drawOrder() {
    const key = c => W.drag?.cat === c ? 1e4 : c.closeup ? 500 + c.closeup.amt : c.peek?.mode === 'screen' ? 300 : masked(c) ? -1000 + c.body.gy * .01 : c.at.kind === 'floor' ? c.body.z : 0;
    return cats.filter(drawn).sort((a, b) => key(a) - key(b));
  }
  function drawCat(c2, cat) {
    const xf = cat.xf;
    if (xf) { c2.save(); c2.translate(xf.px, xf.py); c2.rotate(xf.angle); c2.translate(-xf.px, -xf.py); }
    cat.body.draw(c2);
    if (xf) c2.restore();
  }
  function render() {
    const c2 = ctx; c2.setTransform(W.dpr, 0, 0, W.dpr, 0, 0); c2.clearRect(0, 0, W.w, W.h);
    if (W.treat && !W.treat.eaten) drawTreat(c2, W.treat);
    const order = drawOrder();
    // Cats behind the page: draw them, then cut the cards out so the cards sit in front.
    const behind = order.filter(masked);
    if (behind.length) {
      lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height);
      lctx.setTransform(W.dpr, 0, 0, W.dpr, 0, 0);
      for (const c of behind) drawCat(lctx, c);
      lctx.globalCompositeOperation = 'destination-out'; lctx.fillStyle = '#000';
      for (const s of W.solids) { const r = refresh(s).rect; roundRect(lctx, r.left, r.top, r.width, r.height, Math.min(s.radius, r.height / 2)); lctx.fill(); }
      lctx.globalCompositeOperation = 'source-over';
      c2.setTransform(1, 0, 0, 1, 0, 0); c2.drawImage(layer, 0, 0); c2.setTransform(W.dpr, 0, 0, W.dpr, 0, 0);
    }
    for (const c of order) if (!masked(c)) drawCat(c2, c);
    for (const c of order) if (c.edgePaws) for (const p of c.edgePaws) drawEdgePaw(c2, c, p);
    if (W.critter) drawButterfly(c2, W.critter);
    for (const p of W.particles) drawParticle(c2, p);
    drawGlass(c2);
    for (const c of order) drawBubble(c2, c);
    if (W.hovered && !W.drag && !W.hovered.bubble && drawn(W.hovered)) drawTag(c2, W.hovered);
    if (W.laser && W.pointer && !W.overUI) {
      const p = W.pointer; c2.save(); c2.fillStyle = '#ff3b5c'; c2.shadowColor = '#ff2d55'; c2.shadowBlur = 14;
      c2.beginPath(); c2.arc(p.x, p.y, 5 + Math.sin(W.time * 30) * .6, 0, TAU); c2.fill(); c2.restore();
    }
  }
  function drawEdgePaw(c2, cat, p) {
    const L = cat.body.L, k = cat.body.k, rx = L.legW * .72 * k, ry = L.legW * .52 * k;
    c2.save(); c2.translate(p.x, p.y); c2.rotate(p.a || 0);
    c2.fillStyle = L.outline || '#3D2C3E'; c2.beginPath(); c2.ellipse(0, 0, rx + 2.1 * k, ry + 2.1 * k, 0, 0, TAU); c2.fill();
    c2.fillStyle = L.tuxedo ? L.belly : L.fur; c2.beginPath(); c2.ellipse(0, 0, rx, ry, 0, 0, TAU); c2.fill();
    c2.strokeStyle = L.outline || '#3D2C3E'; c2.globalAlpha = .55; c2.lineWidth = 1.3 * k; c2.lineCap = 'round'; c2.beginPath();
    for (const dx of [-.33, .33]) { c2.moveTo(dx * rx, ry * .1); c2.lineTo(dx * rx, ry * .85); }
    c2.stroke(); c2.restore();
  }
  // Smudges on the inside of your screen.
  function drawGlass(c2) {
    for (const g of W.glass) {
      const a = 1 - g.age / g.life;
      c2.save(); c2.globalAlpha = clamp(a * 1.5, 0, 1);
      if (g.kind === 'paw') {
        c2.translate(g.x, g.y); c2.rotate(g.a || 0); c2.fillStyle = 'rgba(236,228,250,.26)'; c2.shadowColor = 'rgba(236,228,250,.5)'; c2.shadowBlur = 8;
        const s = g.size;
        c2.beginPath(); c2.ellipse(0, s * .35, s * 1.05, s * .8, 0, 0, TAU); c2.fill();
        for (const [tx, ty] of [[-1, -.75], [-.36, -1.15], [.36, -1.15], [1, -.75]]) { c2.beginPath(); c2.ellipse(tx * s * .9, ty * s, s * .3, s * .38, 0, 0, TAU); c2.fill(); }
      } else if (g.kind === 'fog') {
        const r = g.size * (1 + g.age * .15), grad = c2.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
        grad.addColorStop(0, 'rgba(240,236,250,.34)'); grad.addColorStop(1, 'rgba(240,236,250,0)');
        c2.fillStyle = grad; c2.beginPath(); c2.ellipse(g.x, g.y, r * 1.3, r * .8, 0, 0, TAU); c2.fill();
      } else if (g.kind === 'lick') {
        c2.strokeStyle = 'rgba(240,236,250,.28)'; c2.lineWidth = g.size * .5; c2.lineCap = 'round';
        c2.beginPath(); c2.moveTo(g.x - g.size * .3, g.y + g.size * .6); c2.quadraticCurveTo(g.x, g.y - g.size * .2, g.x + g.size * .25, g.y - g.size * .9); c2.stroke();
      }
      c2.restore();
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
    if (p.glyph === 'mote') { const x = p.x + Math.sin(p.age * 2.2) * 6; c2.fillStyle = p.color; c2.shadowColor = p.color; c2.shadowBlur = 8; c2.beginPath(); c2.arc(x, p.y, p.size, 0, TAU); c2.fill(); }
    else if (p.glyph === 'dust') { c2.fillStyle = p.color; c2.globalAlpha *= .5; c2.beginPath(); c2.arc(p.x, p.y, p.size * (1 + p.age * 2), 0, TAU); c2.fill(); }
    else { c2.fillStyle = p.color; c2.font = `700 ${p.size}px ${font}`; c2.textAlign = 'center'; c2.fillText(p.glyph, p.x, p.y); }
    c2.restore();
  }
  function roundRect(c2, x, y, w, h, r) { r = Math.max(0, r); c2.beginPath(); c2.moveTo(x + r, y); c2.arcTo(x + w, y, x + w, y + h, r); c2.arcTo(x + w, y + h, x, y + h, r); c2.arcTo(x, y + h, x, y, r); c2.arcTo(x, y, x + w, y, r); c2.closePath(); }
  // Where a speech bubble should point: the top of the head, wherever the head is.
  function anchor(cat) {
    const b = cat.body;
    if (cat.peek || cat.xf) { const h = b.headPos ? applyXf(cat, b.headPos[0], b.headPos[1]) : { x: b.x, y: b.gy }; const r = b.L.headR * b.k; return { x: h.x, y: h.y - r * 1.5, below: h.y - r * 1.5 < 50 ? h.y + r * 1.3 : null }; }
    return { x: b.top.x, y: b.top.y - 6, below: null };
  }
  function drawBubble(c2, cat) {
    const bb = cat.bubble; if (!bb) return;
    if (W.time > bb.until) { cat.bubble = null; return; }
    if (masked(cat) && !cat.peek) return;
    const fade = clamp((bb.until - W.time) * 3, 0, 1);
    const an = anchor(cat), x = an.x, y = an.below ?? an.y;
    c2.save(); c2.globalAlpha = fade;
    if (bb.think) {
      const ty = an.below ? y + 16 : y - 16;
      c2.fillStyle = '#2f2a3aee'; c2.beginPath(); c2.arc(x + 14, ty, 15, 0, TAU); c2.fill();
      c2.beginPath(); c2.arc(x + 4, an.below ? y + 1 : y - 1, 3.5, 0, TAU); c2.fill();
      c2.fillStyle = '#f8f3e9'; c2.font = `700 15px ${font}`; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(bb.text, x + 14, ty + 1);
    } else {
      c2.font = `600 13px ${font}`; const tw = c2.measureText(bb.text).width, w = tw + 22, h = 30;
      // Above the head unless that covers a control; then beside it.
      const options = (an.below ? [[x - w / 2, y + 8]] : [[x - w / 2, y - h - 8], [x + 30, y - h / 2 + 10], [x - w - 30, y - h / 2 + 10]]).map(([ox, oy]) => [clamp(ox, 6, W.w - w - 6), clamp(oy, 6, W.h - h - 6)]);
      const [bx, by] = options.find(([ox, oy]) => clearOf({ left: ox, top: oy, right: ox + w, bottom: oy + h + 8 })) || options[0];
      c2.fillStyle = '#2f2a3af2'; roundRect(c2, bx, by, w, h, 14); c2.fill();
      const tipY = an.below ? by + 1 : by + h - 1, tipTo = an.below ? by - 7 : by + h + 7;
      c2.beginPath(); c2.moveTo(clamp(x - 5, bx + 10, bx + w - 16), tipY); c2.lineTo(clamp(x + 6, bx + 18, bx + w - 8), tipY); c2.lineTo(clamp(x, bx + 8, bx + w - 8), tipTo); c2.fill();
      c2.fillStyle = '#f8f3e9'; c2.textBaseline = 'middle'; c2.fillText(bb.text, bx + 11, by + h / 2 + 1);
    }
    c2.restore();
  }
  function drawTag(c2, cat) {
    const text = `${cat.name} · ${(cat.peek ? 'Peeking at you' : cat.mind.label).toLowerCase()}`, an = anchor(cat);
    c2.save(); c2.font = `600 12px ${font}`; const w = c2.measureText(text).width + 18, x = clamp(an.x - w / 2, 6, W.w - w - 6), y = clamp(an.below ?? an.y - 30, 6, W.h - 30);
    c2.fillStyle = '#2f2a3ae6'; roundRect(c2, x, y, w, 24, 12); c2.fill();
    c2.fillStyle = cat.cast.look.collar; c2.beginPath(); c2.arc(x + 10, y + 12, 3, 0, TAU); c2.fill();
    c2.fillStyle = '#f1eaf7'; c2.textBaseline = 'middle'; c2.fillText(text, x + 17, y + 12.5); c2.restore();
  }

  // ---------- context from the page ----------
  // Aquarium during a video: somewhere cozy to settle that he can reach without
  // leaving the room. Furniture marked data-nap is for sleeping and data-view
  // faces the TV, as does the rug in front of it.
  function cozySpot(cat, type) {
    measure();
    const b = cat.body, here = surfaceOf(cat); if (!here) return null;
    const key = type === 'sleep' ? 'nap' : 'view';
    const spots = W.ledges.filter(l => l.el.dataset?.[key] !== undefined && !sameLedge(l, here))
      .map(l => ({ surface: l, x: safeLanding(l, lerp(l.left, l.right, .3 + random() * .4)), z: 0 })).filter(s => s.x !== null);
    const tv = stageCenter();
    if (key === 'view' && tv) spots.push({ surface: FLOOR, x: clamp(tv.x + (random() - .5) * 160 * S(), 60, W.w - 60), z: -20 + random() * 30 });
    const reachable = spots.filter(s => (s.surface === FLOOR && here === FLOOR) || route(here, b.x, s.surface)?.length);
    return reachable.length ? pick(reachable) : null;
  }
  function* quietPlayback(cat) {
    const b = cat.body;
    let settled = false;
    try {
      // Stay gone instead of restarting the old leave/peek/return cycle.
      if (cat.at.kind === 'away') {
        cat.mind.begin('watch'); cat.phase = 'offscreen while the video plays';
        while (W.playing) yield;
        return;
      }
      while (b.jump) yield;
      if (cat.at.kind === 'air' && cat.at.then) land(cat, cat.at.then);
      b.stop();
      while (W.playing) {
        const choice = cat.mind.choose({ ...context(cat), treat: false, laser: false });
        const type = ['sleep', 'watch', 'sit', 'loaf'].includes(choice.type) ? choice.type : 'watch';
        cat.mind.begin(type);
        // In his own room Bean lives around the TV: now and then, after settling
        // where the video found him, he wanders somewhere cozy first.
        if (W.aquarium && !W.calm && settled && random() < .45) {
          const spot = cozySpot(cat, type);
          if (spot) {
            cat.phase = 'finding a cozy spot'; b.reset({ tailUp: .5 }); b.look = null; b.face = 'open';
            if (type !== 'sleep' && random() < .3) yield* A.stretch(cat);
            yield* travel(cat, spot, walkSpeed(cat) * .8);
            if (!W.playing) break;
            if (type !== 'sleep' && random() < .35) yield* A.groom(cat);
          }
        }
        settled = true;
        cat.phase = type === 'sleep' ? 'sleeping through the video' : 'watching quietly';
        // Settle where he already is. No trip to a new perch, circling, or
        // periodic repositioning just because another rest interval began.
        b.reset(type === 'sleep' ? { curl: 1, eyes: 0, tailWrap: 1, tailWag: .02 }
          : { [type === 'loaf' ? 'loaf' : 'sit']: 1, eyes: .82, tailWrap: 1, tailWag: .025 });
        b.face = type === 'sleep' ? 'sleep' : 'open';
        const stage = stageCenter(); b.look = type === 'watch' && stage ? { ...stage, behind: true } : null;
        let t = 0; const duration = 90 + random() * 120;
        while (W.playing && t < duration) t += yield;
      }
    } finally { cat.phase = null; }
  }
  function settleForPlayback(cat) {
    if (W.drag?.cat === cat) return;
    unstick(cat); cat.body.stop(); cat.bubble = null;
    cat.mind.begin(cat.body.face === 'sleep' ? 'sleep' : 'watch');
    cat.prio = PRIORITY.normal; cat.plan = quietPlayback(cat);
  }
  function updateContext() {
    const before = W.playing; W.playing = document.body.dataset.playback === 'playing';
    W.vibe = videoVibe(W.title).kind;
    if (W.playing && !before) {
      W.critter = null; W.nextCritter = Math.max(25, W.nextCritter);
      W.treat = null; W.particles = []; W.glass = []; W.invitedUntil = 0;
      if (W.laser) setLaser(false);
      for (const animation of [...effects.keys()]) {
        animation.onfinish = null; animation.cancel();
        effects.get(animation)?.(); effects.delete(animation);
      }
      for (const el of knocked) restoreToy(el);
      cats.forEach(settleForPlayback);
    }
    if (!W.playing && before) {
      W.nextCritter = Math.max(25, W.nextCritter);
    }
  }
  const playbackWatch = new MutationObserver(updateContext);
  playbackWatch.observe(document.body, { attributes: true, attributeFilter: ['data-playback'] });
  runtime.own(() => playbackWatch.disconnect());

  listen(window, 'resize', resize);
  listen(window, 'scroll', () => { W.rectsAt = -1; setPanel(false); }, { passive: true });
  listen(document, 'pointermove', onPointerMove, { passive: true });
  listen(document, 'pointerdown', onPointerDown);
  listen(document, 'pointerup', onPointerUp);
  listen(document, 'pointercancel', onPointerUp);
  listen(document, 'dblclick', onDoubleClick);
  listen(document, 'contextmenu', contextMenu);
  listen(document.documentElement, 'pointerleave', () => {
    if (W.drag) drop(W.drag.cat, false);
    W.press = null; W.pointer = null; W.hovered = null;
    document.documentElement.classList.remove('cat-hover');
  });
  listen(document, 'keydown', e => {
    W.idleSince = clock();
    if (panel.hidden && document.activeElement === panelBtn && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault(); setPanel(true);
      if (e.key === 'ArrowUp') { const items = menuItems(); if (items.length) { items[0].tabIndex = -1; items.at(-1).tabIndex = 0; items.at(-1).focus(); } }
      return;
    }
    if (!panel.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); setPanel(false, null, true); return; }
      if (e.key === 'Tab') { setPanel(false, null, true); return; }
      const items = menuItems(), index = items.indexOf(document.activeElement);
      let next = null;
      if (e.key === 'ArrowDown') next = (index + 1) % items.length;
      if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = items.length - 1;
      if (next !== null && items[next]) { e.preventDefault(); for (const item of items) item.tabIndex = -1; items[next].tabIndex = 0; items[next].focus(); return; }
    }
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (W.laser) setLaser(false);
    else if (W.aquarium) setAquarium(false);
  });
  function suspend() {
    setPanel(false);
    if (hiddenAt === null) hiddenAt = Date.now();
    // A pointer release outside this page will never reach our input listeners.
    if (W.drag) drop(W.drag.cat, false);
    W.press = null; W.pointer = null; W.hovered = null; W.petDist = 0;
    document.documentElement.classList.remove('cat-hover');
    runtime.pause();
    for (const effect of effects.keys()) if (effect.playState === 'running') effect.pause();
    save();
  }
  function resume() {
    if (runtime.disposed || document.hidden) return;
    const away = hiddenAt === null ? 0 : Math.max(0, (Date.now() - hiddenAt) / 1000);
    hiddenAt = null;
    runtime.resume();
    for (const effect of effects.keys()) if (effect.playState === 'paused') effect.play();
    if (away < 45) return;
    // Life went on without you.
    const day = dayRhythm(new Date().getHours());
    for (let t = 0; t < Math.min(away, 3600); t += 5) for (const c of cats) c.mind.tick(5, { day, nearFriend: cats.length > 1 && random() < .4 });
    if (W.playing) { cats.forEach(settleForPlayback); return; }
    cats.forEach((c, i) => { unstick(c); c.closeup = null; c.xf = null; place(c, i); c.plan = null; c.prio = 0; if (c.body.goal.curl) c.mind.begin('sleep'); });
    const summary = awaySummary(cats.map(c => c.mind), away, random); if (summary) log(summary);
    const host = [...cats].sort((a, b) => b.mind.trust - a.mind.trust)[0];
    if (!W.calm && !W.playing) { host.mind.begin('greet'); host.plan = A.greet(host, 'returnLong'); host.prio = PRIORITY.react; }
    W.speechAt = 0;
  }
  listen(document, 'visibilitychange', () => document.hidden ? suspend() : resume());
  listen(window, 'pagehide', event => event.persisted ? suspend() : active?.destroy());
  listen(window, 'pageshow', event => { if (event.persisted) resume(); });
  listen(panelBtn, 'click', () => setPanel(panel.hidden));
  const menuAction = fn => () => { setPanel(false, null, true); fn(); };
  listen($('cat-hello-btn'), 'click', menuAction(inviteBean));
  listen($('cat-treat-btn'), 'click', menuAction(() => dropTreat()));
  listen($('cat-laser-btn'), 'click', menuAction(() => setLaser(!W.laser)));
  listen($('cat-aquarium-btn'), 'click', () => setAquarium(!W.aquarium));
  listen($('cat-calm-dock'), 'click', menuAction(() => setCalm(!W.calm)));
  listen(document.querySelector('.create-room-button'), 'pointerenter', () => { const c = companion; if (c.prio < PRIORITY.react && drawn(c)) { c.body.look = { x: W.pointer?.x ?? W.w / 2, y: W.pointer?.y ?? 200 }; say(c, 'createHover', .6); } });
  listen($('url-in'), 'focus', () => say(companion, 'newVideo', .4));

  // ---------- start ----------
  resize();
  cats.forEach(place);
  updateContext();
  setCalm(W.calm);
  if (new URLSearchParams(location.search).get('wallpaper') === '1') setAquarium(true);
  // A small welcome leaves the theatrical close-ups for later, invited play.
  {
    const host = companion;
    const key = firstVisit ? 'greet' : sinceLast > 4 * 3600 ? 'returnLong' : null;
    if (key && !W.calm && !W.playing) {
      host.mind.begin('greet'); host.prio = PRIORITY.react;
      host.plan = A.greet(host, key);
      if (firstVisit) log('You met Bean.'); else log(`You came back after ${Math.round(sinceLast / 3600)} hours. ${host.name} noticed.`);
    } else {
      // No performance on load: Bean is found where it was, napping or loafing.
      if (!W.playing && !W.calm) { const nap = random() < .65; host.mind.begin(nap ? 'sleep' : 'loaf'); host.plan = nap ? A.sleep(host, true) : A.loaf(host); }
      if (!journal.length) log('Bean is settling in.');
    }
  }
  runtime.start(frame);
  if (document.hidden) suspend();

  active = {
    cats, world: W,
    snapshot() {
      return { seed: runtime.seed, time: runtime.time, paused: runtime.paused, disposed: runtime.disposed,
        context: { playing: W.playing, vibe: W.vibe, calm: W.calm, aquarium: W.aquarium },
        cats: cats.map(c => ({ name: c.name, activity: c.mind.activity, phase: c.phase || null, location: c.at.kind,
          trust: c.mind.trust, drives: { ...c.mind.drives }, mood: { ...c.mind.mood },
          position: { x: c.body.x, y: c.body.gy, z: c.body.z }, thought: c.thought, director: c.mind.inspect() })) };
    },
    observe(data) {
      if (runtime.disposed) return;
      if (data.title !== undefined && data.title !== W.title) {
        const had = !!W.title; W.title = data.title; updateContext();
        if (!W.playing && (had || data.title)) for (const c of cats) if (c.prio < PRIORITY.react && drawn(c) && !c.peek && !['sleep', 'cuddle'].includes(c.mind.activity)) {
          c.body.set({ earsBack: 0 }); const s = stageCenter(); if (s) c.body.look = { ...s, behind: true }; think(c, '!', 1.2);
        }
        if (data.title) { say(pick(cats.filter(drawn).length ? cats.filter(drawn) : cats), 'newVideo', .7); log(`New video: ${data.title.slice(0, 60)}`); }
      }
      if (!W.playing && W.users !== null && data.users > W.users) {
        say(companion, 'newcomer', 1, true); log('Someone joined the room. Bean noticed.');
        for (const o of cats) if (o.prio < PRIORITY.react && drawn(o)) o.body.look = { x: random() < .5 ? 0 : W.w, y: W.h * .6 };
      }
      if (data.users !== undefined) W.users = data.users;
    },
    linkError(message) { if (!runtime.disposed && message) say(companion, 'linkError', 1, true); },
    inviteCopied() { if (!runtime.disposed) say(companion, 'invite', 1, true); },
    greet() { return !runtime.disposed && inviteBean(); },
    treat(...args) { if (!runtime.disposed) dropTreat(...args); },
    laser(on) { if (!runtime.disposed) setLaser(on); },
    aquarium(on) { if (!runtime.disposed) setAquarium(on); },
    calm(on) { if (!runtime.disposed) setCalm(on); },
    destroy() {
      if (runtime.disposed) return;
      if (W.drag) { W.drag.cat.mind.recordRelease({ thrown: false }); W.drag.cat.mind.begin('sit'); }
      W.drag = null; W.press = null; W.pointer = null; W.hovered = null;
      save();
      try { runtime.destroy(); } finally {
        for (const el of knocked) restoreToy(el);
        for (const [el, inert] of inertBefore) el.inert = inert;
        document.body.classList.remove('cat-simulation', 'cat-wallpaper');
        document.documentElement.classList.remove('cat-hover', 'cat-carrying', 'cat-laser');
        universe.hidden = true; panel.hidden = true;
        panelBtn.setAttribute('aria-expanded', 'false');
        $('cat-laser-btn')?.setAttribute('aria-checked', 'false');
        $('cat-aquarium-btn')?.setAttribute('aria-pressed', 'false');
        if ($('cat-aquarium-btn')) $('cat-aquarium-btn').textContent = 'Aquarium';
        legacy.forEach(el => { el.removeAttribute('tabindex'); el.setAttribute('aria-hidden', 'true'); });
        if (window.youpleCats === active) delete window.youpleCats;
        active = null;
      }
    },
  };
  if (debug) {
    // Testing hook: make Bean do something now, e.g. youpleCats.play('Bean', 'hide').
    active.play = (name, type, ...args) => { const c = cats.find(x => x.name === name || x.kind === name); if (runtime.disposed || !c || typeof A[type] !== 'function' || !Object.hasOwn(A, type)) return false; unstick(c); c.mind.begin(type); c.plan = A[type](c, ...args); c.prio = PRIORITY.react; return true; };
    active.peekIn = name => { const c = cats.find(x => x.name === name); if (runtime.disposed || !c) return false; unstick(c); c.at = { kind: 'away', side: 'left' }; c.plan = (function* () { const s = screenPeekSpec(c); if (s) yield* peek(c, s, 4); })(); c.prio = PRIORITY.react; return true; };
    active.pos = name => { const c = cats.find(x => x.name === name); const h = c?.body.headPos; return !runtime.disposed && h ? applyXf(c, h[0], h[1]) : null; };
    active.measure = () => { if (runtime.disposed) return null; measure(true); return { ledges: W.ledges.map(l => ({ kind: l.kind, cls: l.el.className || l.el.id, left: l.left, right: l.right, top: l.top })), solids: W.solids.map(s => s.el.className || s.el.id) }; };
    window.youpleCats = active;
  }
  return active;
}
