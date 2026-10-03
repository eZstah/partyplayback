// The habitat: one canvas over the whole page, four cats with their own minds.
// The page is their furniture. Cards are boxes they climb, sit on, hide behind
// and peek over; big words are ledges; the screen edges are doorways to
// somewhere else; and the glass between them and you is something to tap on.
// The canvas never takes pointer events, so everything under a cat still works.
import { CatBody } from './body.js';
import { CAST, KINDS, traitWords } from './cast.js';
import { Mind, awaySummary, clamp, dayRhythm, pick, videoVibe } from './mind.js';

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
const PHONE = '(max-width: 760px), (hover: none) and (pointer: coarse)';
const PRIORITY = { carried: 100, react: 80, treat: 70, laser: 60, social: 50, normal: 10 };
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);

let active = null;
// Phones get the static mascots; the living cats need a big screen and a mouse.
const STUB = { cats: [], observe() {}, linkError() {}, inviteCopied() {}, treat() {}, laser() {}, aquarium() {}, calm() {}, destroy() {} };

export function bootCats() {
  if (active) return active;
  const universe = document.getElementById('cat-universe');
  if (!universe || matchMedia(PHONE).matches) return STUB;
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
    pointer: null, overUI: false, idleSince: performance.now(), controls: [], text: [], solids: [], ledges: [], toys: [], rectsAt: -1,
    treat: null, critter: null, nextCritter: 90 + Math.random() * 90, particles: [], glass: [], speechAt: 0,
    playing: false, title: '', vibe: 'unknown', users: null, hovered: null, press: null, drag: null, petDist: 0 };

  const cats = KINDS.map((kind, i) => {
    const mind = new Mind(kind, saved.cats?.[kind]);
    const body = new CatBody(CAST[kind].look);
    return { kind, i, name: CAST[kind].name, cast: CAST[kind], mind, body, plan: null, prio: 0, at: { kind: 'floor' }, target: null,
      bubble: null, nextGlance: 0, thought: '', xf: null, peek: null, closeup: null, forceMask: false, edgePaws: null, offAt: 0, home: .14 + i * .24 };
  });
  const byKind = Object.fromEntries(cats.map(c => [c.kind, c]));

  // ---------- geometry ----------
  const S = () => clamp(Math.min(W.w / 1440, W.h / 900), .75, 1.3) * 1.05;
  function floor() {
    if (W.aquarium) return { base: W.h * .93, slope: .42, zMin: -W.h * .5 / .42, zMax: 30, zBehind: -Infinity };
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
      // The cats' own buttons count too (visible() skips everything in #cat-universe).
      if (el.closest('#cat-world,[hidden],[inert]')) continue;
      if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const r = rectOf(el); if (onScreen(r)) W.controls.push(r);
    }
    W.text = [];
    for (const el of document.querySelectorAll(TEXT)) { if (el.closest('#cat-universe')) continue; const r = rectOf(el); if (onScreen(r) && visible(el)) W.text.push(r); }
    W.solids = []; W.ledges = []; W.toys = [];
    if (W.aquarium) return;
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

  // Where a cat is right now, as a "surface" the planner understands.
  const surfaceOf = cat => cat.at.kind === 'ledge' ? cat.at.ledge : cat.at.kind === 'floor' ? FLOOR : null;
  const kAt = (surface, z = 0) => surface === FLOOR ? floorK(z) : S() * LEDGE_K;
  const yAt = (surface, x, z = 0) => surface === FLOOR ? floorY(z) : surface.y(x);

  // A sitting cat's footprint, for checking it won't cover something.
  const restBox = (x, y, k) => ({ left: x - 58 * k, right: x + 58 * k, top: y - 120 * k, bottom: y + 4 });
  const clearOf = box => !W.controls.some(r => hits(box, inflate(r, 20)));
  // Words a sitting cat would cover. A word ledge doesn't count against itself.
  const overText = (box, surface) => W.text.some(r => hits(inflate(box, -10), r) && !(surface?.rect && hits(r, surface.rect)));
  function crowded(cat, spot) {
    return cats.some(c => c !== cat && c.target && c.target.surface === spot.surface && Math.abs(c.target.x - spot.x) < 70 * S());
  }
  // Pick somewhere to be. where: 'any' | 'floor' | 'ledge' | 'high'
  // Cats keep to themselves: each has a home patch of the screen and keeps its distance from the others.
  function crowdGap(cat, x, y) {
    let gap = Infinity;
    for (const o of cats) {
      if (o === cat) continue;
      if (o.at.kind !== 'away') gap = Math.min(gap, Math.hypot(o.body.x - x, o.body.gy - y));
      if (o.target) gap = Math.min(gap, Math.hypot(o.target.x - x, yAt(o.target.surface, o.target.x, o.target.z) - y));
    }
    return gap;
  }
  function findSpot(cat, { where = 'any', near = null, spread = 400, z = null } = {}) {
    measure();
    const f = floor(), ledges = W.ledges.filter(l => onScreen(l.rect));
    const social = near !== null;
    if (!social && Math.random() < .7) { near = cat.home * W.w; spread = W.w * .4; }
    for (let i = 0; i < 50; i++) {
      let spot;
      const wantLedge = ledges.length && (where === 'ledge' || where === 'high' || (where === 'any' && Math.random() < .6));
      if (wantLedge) {
        let pool = ledges;
        if (where === 'high') pool = ledges.filter(l => l.top < W.h * .55).concat(ledges.filter(l => l.top < W.h * .3));
        if (near !== null) pool = pool.filter(l => l.right > near - spread && l.left < near + spread);
        if (!pool.length) pool = ledges;
        const l = pick(pool);
        spot = { surface: l, x: near !== null ? clamp(near + (Math.random() - .5) * spread * .5, l.left, l.right) : lerp(l.left, l.right, Math.random()), z: 0 };
      } else {
        const zz = z ?? (Math.random() < .25 ? lerp(f.zMin, f.zBehind, Math.random()) : lerp(-45, 35, Math.random()));
        spot = { surface: FLOOR, x: clamp((near ?? Math.random() * W.w) + (near !== null ? (Math.random() - .5) * spread : 0), 50, W.w - 50), z: clamp(zz, f.zMin, f.zMax) };
      }
      const k = kAt(spot.surface, spot.z), y = yAt(spot.surface, spot.x, spot.z), tall = y < 150 ? 75 : 115;
      if (y - tall * k < 4) continue;
      const box = restBox(spot.x, y, k * tall / 120);
      if (!clearOf(box) || crowded(cat, spot)) continue;
      // Try not to sit on top of words, on the floor or up on a card.
      if (i < 35 && overText(box, spot.surface === FLOOR ? null : spot.surface)) continue;
      if (!social && i < 40 && crowdGap(cat, spot.x, y) < (i < 25 ? 300 : 180) * S()) continue;
      return spot;
    }
    return { surface: FLOOR, x: 60 + Math.random() * (W.w - 120), z: 0 };
  }

  // ---------- route planning: walk, jump, climb, or leave and come back ----------
  const JX = () => 430 * S(), JY = () => 330 * S();
  function hop(a, b, fromX) {
    const lo = Math.max(a.left, b.left), hi = Math.min(a.right, b.right);
    let xa, xb;
    if (lo <= hi) { xa = clamp(fromX, lo, hi); xb = clamp(xa + (xa < (lo + hi) / 2 ? 34 : -34), b.left, b.right); }
    else if (b.left > a.right) { xa = a.right; xb = b.left; } else { xa = a.left; xb = b.right; }
    const ya = a.y(xa), yb = b.y(xb), dx = Math.abs(xb - xa), rise = ya - yb;
    if (dx > JX() || rise > JY()) return null;
    return { kind: 'jump', to: b, xa, xb, cost: dx + Math.abs(rise) * 1.3 + 90 + Math.abs(fromX - xa) };
  }
  function climbable(l, fromX) {
    if (l.kind !== 'solid') return null;
    const r = l.rect, gap = floorY(0) - r.bottom;
    if (gap > 240 * S() || gap < -20 || r.top < 90) return null;
    const sides = [];
    if (r.left > 40) sides.push(-1); if (r.right < W.w - 40) sides.push(1);
    if (!sides.length) return null;
    const side = sides.sort((p, q) => Math.abs((p < 0 ? r.left : r.right) - fromX) - Math.abs((q < 0 ? r.left : r.right) - fromX))[0];
    const xa = side < 0 ? r.left - 36 * S() : r.right + 36 * S();
    return { kind: 'climb', to: l, side, xa, xb: side < 0 ? r.left + 30 : r.right - 30, cost: (floorY(0) - r.top) * 1.1 + Math.abs(fromX - xa) + 120 };
  }
  function route(from, fromX, to) {
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
        const link = hop(u, v, xs.get(u)) || (u === FLOOR ? climbable(v, xs.get(u)) : null);
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
    if (surface === FLOOR) cat.at = { kind: 'floor' };
    else { refresh(surface); cat.at = { kind: 'ledge', ledge: surface, dx: b.x - surface.rect.left }; b.z = 0; }
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
  function* leapTo(cat, x, y, k1, arc, dur = null) {
    const b = cat.body;
    b.leap(x, y, 0, arc, dur); b.jump.k0 = b.k; b.jump.k1 = k1;
    cat.at = { kind: 'air' };
    while (b.jump) yield;
  }
  function* jumpTo(cat, surface, x) {
    const b = cat.body;
    if (surface !== FLOOR) refresh(surface);
    const tx = surface === FLOOR ? clamp(x, 30, W.w - 30) : clamp(x, surface.left, surface.right);
    const ty = yAt(surface, tx, 0), rise = b.gy - ty;
    b.reset({ crouch: 1, tailUp: .2 }); b.faceYaw(tx >= b.x ? 0 : Math.PI);
    yield* wait(reduced() ? .1 : rise > 120 ? .4 : .25);
    b.set({ crouch: 0, tailUp: .5 });
    b.z = 0;
    yield* leapTo(cat, tx, ty, kAt(surface, 0), rise > 0 ? rise + 46 * S() : 26 * S(), rise < -200 ? clamp(.35 + Math.sqrt(-rise) / 45, .5, .95) : null);
    land(cat, surface);
    if (rise < -160 || rise > 160) puff(b.x, b.gy, 4);
  }
  // Up the side of a card like a wall.
  function* climb(cat, ledge, side) {
    const b = cat.body; refresh(ledge);
    const r = ledge.rect, wallX = side < 0 ? r.left : r.right, angle = side * Math.PI / 2;
    b.faceYaw(side < 0 ? 0 : Math.PI); b.reset({ tailUp: .8 }); b.look = null;
    yield* wait(.35);
    if (Math.random() < .3) say(cat, 'climb', .6);
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
      if (l.top < 220 && Math.random() < .5 && !reduced()) {
        // Straight up and out of the top of the screen.
        b.reset({ crouch: 1 }); yield* wait(.3);
        yield* leapTo(cat, b.x + (Math.random() - .5) * 80, -260 * S(), S(), 120, .55);
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
    if (spot.surface !== FLOOR && Math.random() < .65 && !reduced()) {
      // Drop in from above.
      const l = refresh(spot.surface), x = clamp(spot.x, l.left, l.right);
      b.x = x; b.gy = -200 * S(); b.k = S() * LEDGE_K; b.yaw = Math.random() < .5 ? 0 : Math.PI;
      b.reset({ tailUp: 1, earsBack: .4 }); b.face = 'wide';
      yield* leapTo(cat, x, l.y(x), S() * LEDGE_K, 0, clamp(Math.sqrt(Math.max(0, l.y(x) + 200)) / 30, .45, .9));
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
    cat.forceMask = true; b.reset({ tailUp: .9 }); b.yaw = Math.random() < .5 ? 0 : Math.PI;
    yield* leapTo(cat, x, l.rect.top, S() * LEDGE_K, 60 * S(), .45);
    cat.forceMask = false; land(cat, l); b.bounce(.8);
  }
  // Down behind a card. Returns false when the card is too small to hide a cat.
  function* dive(cat, l) {
    const b = cat.body; refresh(l);
    const k = S() * BEHIND_K, need = (b.headLift + CAST[cat.kind].look.headR * 2.1) * k;
    if (l.rect.height < need + 10) return false;
    const x = clamp(b.x + (Math.random() - .5) * 60, l.rect.left + 40 * k, l.rect.right - 40 * k);
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
      if (cat.at.kind === 'air' || cat.at.kind === 'wall') { yield; continue; }
      const here = surfaceOf(cat);
      if ((here === FLOOR && spot.surface === FLOOR) || sameLedge(here, spot.surface)) { yield* walkTo(cat, spot.x, spot.z ?? null, speed); return; }
      const steps = route(here, b.x, spot.surface);
      if (!steps?.length) {
        if (Math.random() < .5 || here !== FLOOR) { yield* exit(cat, speed * 1.2); yield* wait(.8 + Math.random() * 1.6); yield* enter(cat, spot, speed); }
        return;
      }
      const st = steps[0];
      if (here === FLOOR) yield* walkTo(cat, st.xa, 0, speed); else yield* walkTo(cat, st.xa, null, speed);
      if (st.kind === 'climb') yield* climb(cat, st.to, st.side);
      else yield* jumpTo(cat, st.to, st.xb);
    }
  }

  // ---------- peeking: over or around cards, and in from the screen edges ----------
  // A peek is an edge and an outward direction; amt runs from -.4 (hidden) through 0 (ear tips) to 1 (whole head, paws on the edge).
  function* peek(cat, spec, hold = 2 + Math.random() * 3) {
    const b = cat.body;
    cat.peek = { ...spec, amt: -.45, goal: 0 };
    b.reset({ sit: 1, earsBack: 0 }); b.yaw = Math.PI / 2; b.face = 'open'; b.look = 'viewer';
    yield* wait(.5 + Math.random() * .8);
    cat.peek.goal = Math.random() < .3 ? .55 : 1;
    let t = 0;
    while (t < hold) {
      const dt = yield; t += dt;
      const p = W.pointer, head = peekHead(cat);
      if (p && head && performance.now() - p.t < 3000) {
        b.look = { x: p.x, y: p.y };
        // Too close: duck!
        if (Math.hypot(p.x - head.x, p.y - head.y) < 70 * S() && cat.peek.goal > 0) {
          cat.peek.goal = -.45; cat.peek.fast = true; think(cat, '!', .8); yield* wait(1.2 + Math.random());
          cat.peek.fast = false; cat.peek.goal = .55; t = Math.max(t, hold - 1.5);
        }
      } else if (Math.random() < dt * .4) b.look = Math.random() < .5 ? 'viewer' : null;
      if (Math.random() < dt * .25) b.set({ headRoll: (Math.random() - .5) * .5 });
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
  // Somewhere to look out from behind a panel: over the top, or round a side of a tall one.
  function hidePeek(cat, l) {
    const b = cat.body, tall = l.rect.height > 260 * S(), mode = tall && Math.random() < .45 ? 'side' : 'over';
    if (mode === 'side') return { mode, solid: l, side: Math.random() < .5 ? -1 : 1, v: lerp(110 * S(), Math.min(l.rect.height - 40, 300 * S()), Math.random()) };
    const spec = { mode, solid: l, u: lerp(l.rect.width * .1, l.rect.width * .9, Math.random()) };
    const x = l.rect.left + spec.u, hr = b.L.headR * b.k;
    const box = { left: x - hr * 1.6, right: x + hr * 1.6, top: l.rect.top - hr * 2.4, bottom: l.rect.top };
    return clearOf(box) && !overText(box, l) ? spec : null;
  }
  function screenPeekSpec(cat) {
    measure();
    const edges = ['left', 'right', 'bottom', 'bottom', 'top'];
    for (let i = 0; i < 20; i++) {
      const edge = pick(edges), k = S() * (edge === 'bottom' ? 1.55 : 1.15), hr = CAST[cat.kind].look.headR * k;
      const u = edge === 'left' || edge === 'right' ? lerp(W.h * .22, W.h * .82, Math.random()) : lerp(W.w * .1, W.w * .9, Math.random());
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
    if (W.time > cat.nextGlance) {
      cat.nextGlance = W.time + 1.4 + Math.random() * 3.5;
      const others = cats.filter(o => o !== cat && o.at.kind !== 'away');
      const r = Math.random();
      if (W.pointer && !W.overUI && r < .35 + cat.mind.t.curiosity * .2) b.look = { x: W.pointer.x, y: W.pointer.y };
      else if (r < .55 && others.length) { const o = pick(others); b.look = { x: o.body.x, y: o.body.gy - 40 }; }
      else if (r < .72) b.look = 'viewer';
      else if (r < .82 && room) { const s = stageCenter(); if (s) b.look = { ...s, behind: true }; }
      else b.look = null;
      if (Math.random() < .25) { b.goal.earsBack = .5; setTimeout(() => { b.goal.earsBack = 0; }, 160); }
      b.goal.tailWag = Math.random() < .2 ? .5 + Math.random() * .4 : .1;
    }
  }
  function stageCenter() {
    const el = document.getElementById('stage') || document.getElementById('player-wrap');
    if (!el) return null; const r = el.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r } : null;
  }
  // Settle on arrival: on a card's top edge, legs and tail hang over the front.
  function restPose(cat, base = 'sit') {
    const b = cat.body, l = cat.at.kind === 'ledge' ? cat.at.ledge : null;
    if (l && Math.random() < .7) b.faceYaw(Math.PI / 2 + (Math.random() - .5) * 1.4);
    if (l && l.top < 150 && base === 'sit') base = 'loaf';
    else if (l && l.kind !== 'word' && base !== 'curl' && Math.random() < .55) { b.reset({ sit: .85, overEdge: 1, tailHang: 1 }); b.faceYaw(Math.PI / 2 + (Math.random() - .5) * .5); return; }
    b.reset({ [base]: 1, tailWrap: base === 'sit' ? 1 : .5, ...(l && l.kind !== 'word' && base === 'loaf' ? { tailHang: 1 } : {}) });
  }

  // ----- activities -----
  const A = {
    *sit(cat, seconds = 12 + Math.random() * 20) {
      restPose(cat, 'sit'); let t = 0;
      if (Math.random() < .25) say(cat, 'idle', .15);
      while (t < seconds) { const dt = yield; t += dt; fidget(cat); if (Math.random() < .002) cat.body.set({ knead: cat.body.goal.knead ? 0 : 1 }); }
    },
    *loaf(cat) {
      restPose(cat, 'loaf'); cat.body.set({ eyes: .55 }); let t = 0; const seconds = 30 + Math.random() * 60;
      while (t < seconds) {
        const dt = yield; t += dt; fidget(cat);
        // Slow blink at the viewer: cat for "I trust you".
        if (cat.body.look === 'viewer' && cat.mind.trust > 45 && Math.random() < dt * .4) { cat.body.goal.eyes = 0; yield* wait(.9); cat.body.goal.eyes = .55; think(cat, '♥', 1.4); }
      }
    },
    *sleep(cat) {
      if (Math.random() < .2 && W.solids.length) { if (yield* A.hide(cat, true)) return; }
      // Often a cat just drops off where it is.
      if (Math.random() < .45 && cat.at.kind !== 'behind') yield* nap(cat, 90 + Math.random() * 210);
      else {
        yield* travel(cat, findSpot(cat, { where: Math.random() < .55 ? 'ledge' : 'floor' }), walkSpeed(cat) * .8);
        yield* nap(cat, 90 + Math.random() * 210);
      }
    },
    *cuddle(cat, partnerKind) {
      const p = byKind[partnerKind];
      if (!p || !['sleep', 'cuddle'].includes(p.mind.activity) || !surfaceOf(p)) return;
      const side = Math.random() < .5 ? -1 : 1, s = surfaceOf(p);
      yield* travel(cat, { surface: s, x: p.body.x + side * 50 * p.body.k, z: p.body.z }, walkSpeed(cat) * .8);
      cat.body.faceYaw(side > 0 ? Math.PI : 0); yield* wait(.6);
      yield* settleToSleep(cat);
      cat.mind.bond(partnerKind, .08); p.mind.bond(cat.kind, .05);
      particle('♥', (cat.body.top.x + p.body.top.x) / 2, Math.min(cat.body.top.y, p.body.top.y), { color: '#f29bb0', size: 16 });
      log(`${cat.name} curled up next to ${p.name}.`);
      let t = 0; while (t < 40 && (cat.mind.drives.sleepy > 5 || W.calm)) { const dt = yield; t += dt; if (Math.random() < dt * .3) particle('z', cat.body.top.x, cat.body.top.y, { rise: 18, life: 2.4, size: 12, color: '#cbbbe8' }); }
      yield* wake(cat);
    },
    *groom(cat) {
      const b = cat.body; restPose(cat, 'sit'); b.set({ overEdge: 0 }); b.look = null;
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
      yield* travel(cat, findSpot(cat, { where: 'any', near: Math.random() < .4 ? b.x : null }), walkSpeed(cat));
      // Sniff around on arrival.
      b.set({ crouch: .3 }); b.goal.headPitch = -.3; yield* wait(.8 + Math.random()); b.set({ crouch: 0 });
      yield* A.sit(cat, 2 + Math.random() * 4);
    },
    *explore(cat) {
      const b = cat.body; b.reset({ tailUp: .7 });
      yield* travel(cat, findSpot(cat, { where: 'high' }), walkSpeed(cat) * 1.15);
      if (cat.at.kind === 'ledge') { say(cat, 'shelf', .4); cat.mind.drives.curious -= 30; }
      restPose(cat, Math.random() < .5 ? 'loaf' : 'sit'); b.look = null;
      let t = 0; const seconds = 10 + Math.random() * 16;
      while (t < seconds) { const dt = yield; t += dt; fidget(cat); }
    },
    // Hide behind a card and play peekaboo. With nap = true, just sleep back there.
    *hide(cat, nap = false) {
      const b = cat.body;
      const hideouts = W.solids.filter(l => onScreen(l.rect) && l.rect.height > 150 && l.rect.top > 80);
      if (!hideouts.length) { yield* A.sit(cat); return false; }
      const l = pick(hideouts);
      let hx = lerp(l.left, l.right, .5);
      for (let i = 0; i < 20; i++) { const x = lerp(l.left, l.right, .1 + Math.random() * .8); const box = restBox(x, l.top, S() * LEDGE_K * .7); if (clearOf(box) && !overText(box, l)) { hx = x; break; } }
      yield* travel(cat, { surface: l, x: hx, z: 0 }, walkSpeed(cat) * 1.2);
      if (!sameLedge(surfaceOf(cat), l)) return false;
      if (!(yield* dive(cat, l))) { yield* A.sit(cat); return false; }
      if (!nap) say(cat, 'hidden', .4);
      // Settle near a side so the tail gives the game away.
      const r = refresh(l).rect, side = Math.random() < .5 ? -1 : 1;
      cat.at.dx = side < 0 ? 34 * b.k : r.width - 34 * b.k; b.x = r.left + cat.at.dx;
      b.yaw = side < 0 ? 0 : Math.PI;
      b.reset({ sit: 1, tailUp: .5, tailWag: .45 });
      if (nap) {
        b.reset({ curl: 1, eyes: 0, tailWrap: 0, tailUp: .3, tailWag: .1 }); b.face = 'sleep';
        let t = 0; const max = 90 + Math.random() * 180; while (t < max && (cat.mind.drives.sleepy > 6 || W.calm)) t += yield;
        b.face = 'open'; b.reset({ sit: 1, tailUp: .5 });
        // Peek out to check the coast is clear before coming out.
        const spec = Math.random() < .6 && hidePeek(cat, refresh(l));
        if (spec) yield* peek(cat, spec, 2 + Math.random() * 2);
        yield* popOut(cat); return true;
      }
      let t = 0; const seconds = 25 + Math.random() * 35;
      while (t < seconds) {
        t += yield* waitT(5 + Math.random() * 7);
        refresh(l);
        const spec = hidePeek(cat, l); if (!spec) continue;
        if (Math.random() < .3) say(cat, 'peek', .6);
        const before = performance.now();
        yield* peek(cat, spec, 1.5 + Math.random() * 3);
        t += (performance.now() - before) / 1000;
        // Out of sight: sneak to the other side.
        if (cat.at.kind === 'behind') { cat.at.dx = Math.random() < .5 ? 34 * b.k : l.rect.width - 34 * b.k; b.yaw = cat.at.dx < l.rect.width / 2 ? 0 : Math.PI; }
      }
      if (cat.at.kind === 'behind') { yield* popOut(cat); say(cat, 'peek', .5); restPose(cat, 'sit'); yield* wait(2); }
      return true;
    },
    // Leave the screen for a while; maybe peek back in; then come home.
    *leave(cat) {
      const b = cat.body;
      if (Math.random() < .3) say(cat, 'idle', .4);
      yield* exit(cat, walkSpeed(cat) * 1.3);
      log(`${cat.name} went off-screen to explore.`);
      let t = 0; const seconds = 60 + Math.random() * 120 + cat.mind.t.curiosity * 60;
      while (t < seconds) {
        t += yield* waitT(15 + Math.random() * 30);
        if (Math.random() < .3 && !W.calm) {
          const spec = screenPeekSpec(cat);
          if (spec) { if (Math.random() < .35) say(cat, 'peek', 1); yield* peek(cat, spec, 2 + Math.random() * 3); t += 3; }
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
        const cx = lerp(W.w * .12, W.w * .88, Math.random());
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
      for (let i = 0; i < 3; i++) { b.set({ headPitch: .15, eyes: .6 }); particle('sniff', b.headPos[0] + (Math.random() - .5) * 40, b.headPos[1] + hr * .3, { color: '#e6d8f5', size: 13, rise: 20 }); yield* wait(.28); b.set({ headPitch: 0, eyes: 1 }); yield* wait(.2); }
      glassMark('fog', b.headPos[0], b.headPos[1] + hr * .35, hr * .9);
      let taps = 0, t = 0;
      while (t < 7 + Math.random() * 5) {
        const dt = yield; t += dt;
        const p = W.pointer;
        if (p && performance.now() - p.t < 2500) b.look = { x: p.x, y: p.y };
        // Tap the glass, at your cursor if it's near.
        if (Math.random() < dt * .9 && taps < 6) {
          taps++;
          b.set({ rear: .25, pawsUp: 0, swat: 1 }); yield* wait(.13);
          const paw = b.paws[0]?.s; if (paw) { glassMark('paw', paw[0], paw[1], b.L.legW * b.k * .9, { a: (Math.random() - .5) * .4 }); puffGlass(paw[0], paw[1]); }
          yield* wait(.15); b.set({ swat: 0, rear: 0 }); yield* wait(.25);
        }
        if (Math.random() < dt * .12) {
          // A lick.
          b.set({ mouth: .6 }); b.face = 'happy'; yield* wait(.25);
          glassMark('lick', b.headPos[0], b.headPos[1] + hr * .55, hr * .5); yield* wait(.25); b.set({ mouth: 0 }); b.face = 'open';
        }
        if (Math.random() < dt * .1 && cat.mind.trust > 45) { b.goal.eyes = 0; yield* wait(.9); b.goal.eyes = 1; think(cat, '♥', 1.4); }
      }
      if (!cat.mind.stats.glass) log(`${cat.name} pressed against the glass to look at you.`);
      cat.mind.stats.glass = (cat.mind.stats.glass || 0) + 1;
      // Turn around (a very large back view) and walk back into the room.
      b.look = null; b.faceYaw(-Math.PI / 2); yield* wait(.9);
      cat.closeup.goal = 0; b.reset({ tailUp: 1 });
      b.goTo(b.x + (Math.random() - .5) * 200, -60, walkSpeed(cat) * .8);
      yield* wait(1.6); cat.closeup = null;
      yield* A.sit(cat, 2 + Math.random() * 3);
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
      const surface = under || FLOOR, side = Math.random() < .5 ? -1 : 1;
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
      const fall = !own && !toy.el.matches('.step-symbol') && floorY(0) - r.bottom > 60 && Math.random() < .45 && cat.mind.t.mischief > .5;
      wobble(toy.el, fall ? floorY(0) - r.bottom : 0, tx > b.x ? 1 : -1);
      say(cat, 'knock', .9);
      if (fall) log(`${cat.name} knocked something off the page.`);
      b.face = 'happy'; b.look = 'viewer'; yield* wait(1.4); b.face = 'open';
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 30);
    },
    *watch(cat) {
      const s = stageCenter(); if (!s) { yield* A.sit(cat); return; }
      const r = s.rect;
      // Usually a cat watches from wherever it already is; sometimes it moves in for a better seat.
      const stay = (cat.at.kind === 'floor' || (cat.at.kind === 'ledge' && !hits(cat.at.ledge.rect, r))) && clearOf(restBox(cat.body.x, cat.body.gy, cat.body.k)) && Math.random() < .6;
      if (!stay) {
        let spot = null;
        for (let i = 0; i < 25 && !spot; i++) {
          const cand = { surface: FLOOR, x: r.left + 40 + Math.random() * Math.max(20, r.width - 80), z: lerp(-35, 20, Math.random()) };
          if (clearOf(restBox(cand.x, floorY(cand.z), floorK(cand.z))) && !crowded(cat, cand)) spot = cand;
        }
        yield* travel(cat, spot || findSpot(cat, { where: 'floor' }), walkSpeed(cat) * .8);
        if (cat.at.kind !== 'floor') { yield* A.sit(cat); return; }
      }
      const lie = Math.random() < .5;
      cat.body.reset(lie ? { loaf: 1 } : { sit: 1, tailWrap: 1 }); cat.body.look = { x: s.x, y: s.y, behind: true };
      cat.body.faceYaw(Math.atan2(-220, s.x - cat.body.x));
      if (Math.random() < .3) say(cat, 'watch', .25);
      let t = 0;
      while (W.playing && t < 60 + Math.random() * 90) {
        const dt = yield; t += dt;
        const c = stageCenter(); if (c) cat.body.look = { x: c.x, y: c.y, behind: true };
        cat.body.goal.bob = W.vibe === 'music' ? .5 : 0;
        if (Math.random() < dt * .04) cat.body.goal.tailWag = .6; else if (Math.random() < dt * .1) cat.body.goal.tailWag = .12;
        // Now and then, glance back at the viewer.
        if (Math.random() < dt * .03) { cat.body.look = 'viewer'; yield* wait(1.5); }
      }
      cat.body.goal.bob = 0;
    },
    *dance(cat) {
      const b = cat.body;
      yield* travel(cat, findSpot(cat, { where: Math.random() < .5 ? 'ledge' : 'floor' }), walkSpeed(cat) * 1.2);
      say(cat, 'music', .6); b.look = 'viewer';
      let t = 0; const seconds = 8 + Math.random() * 6;
      while (t < seconds && W.playing) {
        b.reset({ rear: reduced() ? 0 : .9, pawsUp: 1, bob: 1, tailWag: .8, tailUp: .9 }); b.face = 'happy';
        yield* wait(1.3); t += 1.3;
        if (!reduced() && Math.random() < .6) { b.faceYaw(b.yaw + Math.PI * (Math.random() < .5 ? 1 : -1)); particle('♪', b.top.x, b.top.y, { color: '#c3acf0' }); }
        if (!reduced() && Math.random() < .3) { b.reset({ crouch: .5 }); yield* wait(.2); b.leap(b.x, b.gy, b.z, 26, .4); b.jump.k0 = b.jump.k1 = b.k; while (b.jump) yield; t += .6; }
      }
      b.face = 'open'; b.reset();
    },
    *zoomies(cat) {
      const b = cat.body; say(cat, 'zoomies', .5);
      b.reset({ earsBack: .6, tailPuff: .5, tailUp: .3, pupil: 1.2 }); b.face = 'wide';
      for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
        if (cat.at.kind === 'floor' && Math.random() < .25) {
          // Off one side of the screen and straight back in from the other.
          const dir = b.x < W.w / 2 ? -1 : 1;
          yield* walkTo(cat, dir < 0 ? -120 * S() : W.w + 120 * S(), clamp(b.z, -20, 20), runSpeed(cat) * 1.3);
          b.x = dir < 0 ? W.w + 120 * S() : -120 * S();
          yield* walkTo(cat, dir < 0 ? W.w * .6 : W.w * .4, null, runSpeed(cat) * 1.3);
          continue;
        }
        yield* travel(cat, findSpot(cat, { where: Math.random() < .5 ? 'ledge' : 'floor' }), runSpeed(cat) * 1.25);
        if (Math.random() < .3) { b.set({ crouch: .4 }); yield* wait(.15); b.leap(b.x, b.gy, b.z, 34, .42); b.jump.k0 = b.jump.k1 = b.k; while (b.jump) yield; b.set({ crouch: 0 }); }
      }
      cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 50);
      b.face = 'open'; restPose(cat, 'sit'); yield* wait(1.5);
      b.set({ mouth: .4 }); yield* wait(.4); b.set({ mouth: 0 });
      log(`${cat.name} had the zoomies.`);
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
        const p = W.pointer; if (!p || W.overUI || performance.now() - p.t > 6000) break;
        b.look = { x: p.x, y: p.y };
        const dist = Math.abs(p.x - b.x), s = surfaceOf(cat); if (!s) break;
        if (dist > 70 * b.k) { b.goTo(clamp(p.x - Math.sign(p.x - b.x) * 50 * b.k, s.left, s === FLOOR ? W.w - 30 : s.right), b.z, walkSpeed(cat) * .55); still = 0; }
        else { b.stop(); still += dt; }
        if (p.speed > .6) still = 0;
        if (still > .9 && b.gy - p.y < 280 && b.gy > p.y - 30) {
          b.set({ wiggle: 1 }); if (Math.random() < .5) say(cat, 'cursorStill', .5); yield* wait(.7); b.set({ wiggle: 0, crouch: .2 });
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
      const b = cat.body, p = W.pointer;
      const x = p && !W.overUI ? p.x : W.w * (.3 + Math.random() * .4);
      yield* travel(cat, findSpot(cat, { where: 'floor', near: x, spread: 200, z: 30 + Math.random() * 20 }), walkSpeed(cat) * 1.1);
      b.reset({ sit: 1, tailUp: .9, tailCurl: .9, tailWrap: 0 }); b.look = 'viewer';
      b.set({ mouth: .6 }); yield* wait(.35); b.set({ mouth: 0 });
      say(cat, cat.mind.trust > 60 ? 'greet' : 'idle', .6);
      let t = 0; while (t < 6) { const dt = yield; t += dt; if (W.pointer && Math.random() < dt) b.look = { x: W.pointer.x, y: W.pointer.y }; }
    },
    *stare(cat) {
      const b = cat.body;
      yield* travel(cat, findSpot(cat, { where: 'any', z: 40 }), walkSpeed(cat));
      b.reset({ sit: 1 }); b.look = 'viewer'; yield* wait(1);
      b.set({ headRoll: (Math.random() < .5 ? -1 : 1) * .3 }); think(cat, '?', 1.5); yield* wait(1.5);
      say(cat, 'stare', .4);
      yield* wait(2 + Math.random() * 3); b.set({ headRoll: 0 });
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
      if (Math.random() < .5) { b.set({ sit: 1, groom: 1 }); b.face = 'open'; yield* wait(2); b.set({ groom: 0 }); }
      cat.mind.bond(p.kind, .05); p.mind.bond(cat.kind, .03); cat.mind.drives.lonely = 0;
      b.face = 'open'; b.reset({ sit: 1 });
      if (Math.random() < .3) log(`${cat.name} booped noses with ${p.name}.`);
      yield* A.sit(cat, 3 + Math.random() * 4);
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
        yield* travel(cat, findSpot(cat, { where: Math.random() < .5 ? 'any' : 'floor', near: clamp(b.x + away * 320, 50, W.w - 50), spread: 260 }), runSpeed(cat) * .9);
      }
      b.face = 'open';
    },
    *wrestle(cat, partnerKind) {
      const p = byKind[partnerKind], b = cat.body;
      cat.mind.begin('wrestle', partnerKind);
      for (let i = 0; i < 4; i++) {
        b.look = { x: p.body.x, y: p.body.gy - 30 }; b.faceYaw(Math.atan2(p.body.z - b.z, p.body.x - b.x));
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
      say(cat, 'hunt', .4);
      yield* travel(cat, surfaceUnder(bug.x, bug.y, cat), walkSpeed(cat) * 1.4);
      b.reset({ crouch: .8, pupil: 1.3, tailWag: .4 }); b.face = 'focus';
      let t = 0;
      while (t < 15 && W.critter === bug && !bug.gone) {
        const dt = yield; t += dt;
        b.look = { x: bug.x, y: bug.y };
        const s = surfaceOf(cat); if (!s) break;
        const lo = s === FLOOR ? 30 : s.left, hi = s === FLOOR ? W.w - 30 : s.right;
        if (Math.abs(bug.x - b.x) > 60) b.goTo(clamp(bug.x, lo, hi), b.z, walkSpeed(cat) * (Math.abs(bug.x - b.x) > 250 ? 2.2 : .8));
        else b.stop();
        if (Math.abs(bug.x - b.x) < 80 && b.gy - bug.y < 250 && b.gy > bug.y && Math.random() < dt * 1.2) {
          b.set({ wiggle: 1 }); yield* wait(.5); b.set({ wiggle: 0, crouch: .2 });
          b.leap(clamp(bug.x, lo, hi), b.gy, b.z, clamp(b.gy - bug.y, 30, 260), .55); b.jump.k0 = b.jump.k1 = b.k; b.goal.swat = 1; b.goal.rear = .3;
          while (b.jump) yield;
          if (s !== FLOOR) cat.at.dx = b.x - s.rect.left;
          b.set({ swat: 0, rear: 0 });
          if (Math.random() < .35 + cat.mind.t.bold * .2) { bug.flee = true; say(cat, 'caught', 1); particle('✦', bug.x, bug.y, { color: '#f2c78d', size: 22 }); log(`${cat.name} nearly caught a butterfly.`); }
          else say(cat, 'miss', .4);
          b.reset({ crouch: .7, pupil: 1.2 });
          cat.mind.drives.playful = Math.max(0, cat.mind.drives.playful - 25);
          if (bug.flee) break;
        }
        if (Math.abs(bug.x - b.x) > 300 && Math.random() < dt * .5) yield* travel(cat, surfaceUnder(bug.x, bug.y, cat), runSpeed(cat) * .7);
      }
      b.face = 'open'; restPose(cat, 'sit'); b.look = null; yield* wait(1);
    },
    *laser(cat) {
      const b = cat.body;
      if (cat.mind.t.grumpy > .7 && Math.random() < .6) { say(cat, 'laser', 1); b.reset({ loaf: 1, eyes: .5 }); b.look = W.pointer; yield* wait(6); return; }
      if (Math.random() < .5) say(cat, 'laser', .5);
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
        if (!near) { b.goTo(clamp(p.x, lo, hi), s === FLOOR ? clamp(b.z + (Math.random() - .5) * 4, floor().zBehind, 30) : 0, runSpeed(cat) * (Math.abs(p.x - b.x) > 200 ? 1.1 : .6)); still = 0; b.set({ crouch: .4 }); }
        else { b.stop(); still += dt; b.set({ crouch: 1 }); }
        if (still > .45 + Math.random() * .4 && !b.jump && p.y < b.gy + 10) {
          b.set({ wiggle: 1 }); yield* wait(.35); b.set({ wiggle: 0 });
          const q = W.pointer || p;
          b.leap(clamp(q.x, lo, hi), b.gy, b.z, clamp(b.gy - q.y, 15, 240) + 10, .45); b.jump.k0 = b.jump.k1 = b.k; b.goal.swat = 1;
          while (b.jump) yield;
          if (s !== FLOOR) cat.at.dx = b.x - s.rect.left;
          b.goal.swat = 0; still = 0; puff(b.x, b.gy, 2);
          if (Math.random() < .2) particle('?', b.top.x, b.top.y, { color: '#f2c78d', size: 18 });
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
        const off = (b.x < tr.x ? -1 : 1) * (60 + Math.random() * 50) * b.k;
        yield* walkTo(cat, tr.x + off, null, walkSpeed(cat));
        // Too slow. Somebody else got it.
        b.face = 'grumpy'; b.reset({ sit: 1, earsBack: .5 }); b.look = tr.eater ? { x: tr.eater.body.x, y: tr.eater.body.gy - 30 } : null;
        if (tr.eater) cat.mind.bond(tr.eater.kind, -.04);
        if (Math.random() < .5) say(cat, 'annoyed', .5);
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
      let t = 0; const seconds = 10 + Math.random() * 10;
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
          b.look = Math.random() < .02 ? 'viewer' : { x: p.body.x, y: p.body.gy - 30 };
        }
      }
      if (Math.random() < .3) log(`${cat.name} followed ${p.name} around.`);
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
  // Sleep in place until rested (or for as long as calm mode holds), then wake slowly.
  function* nap(cat, max, settled = false) {
    if (!settled) yield* settleToSleep(cat);
    let t = 0;
    while (t < max && (cat.mind.drives.sleepy > 6 || W.calm)) {
      const dt = yield; t += dt;
      if (Math.random() < dt * .35) particle('z', cat.body.top.x + 8, cat.body.top.y + 6, { rise: 18, life: 2.4, size: 12 + Math.random() * 6, color: '#cbbbe8' });
      if (Math.random() < dt * .05) cat.body.goal.tailWag = cat.body.goal.tailWag ? 0 : .2;
      // An ear flicks at a dream now and then.
      if (Math.random() < dt * .04) { cat.body.goal.earsBack = .6; yield* wait(.25); cat.body.goal.earsBack = 0; }
    }
    yield* wake(cat);
  }
  function* wake(cat) {
    const b = cat.body; b.face = 'open'; b.reset({ loaf: 1, eyes: .4 }); yield* wait(.7);
    yield* A.stretch(cat); cat.mind.drives.sleepy = Math.min(cat.mind.drives.sleepy, 10);
    if (Math.random() < .3) say(cat, 'wake', .3);
  }

  // A cat responds to another starting something with them.
  function respond(cat, from, kind = 'visit') {
    if (cat.prio >= PRIORITY.social && cat.mind.activity !== 'sit' && cat.mind.activity !== 'loaf') return 'busy';
    if (cat.at.kind === 'away' || cat.at.kind === 'behind' || cat.closeup) return 'busy';
    const bond = cat.mind.bonds[from.kind] ?? 0, grumpy = cat.mind.t.grumpy;
    if (['sleep', 'cuddle'].includes(cat.mind.activity) && kind === 'chase') return 'hiss';
    if (bond + (1 - grumpy) * .5 + Math.random() * .4 < .45) {
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
  // Interrupting mid-peek or mid-climb: put the cat somewhere sensible first.
  function unstick(cat) {
    const b = cat.body;
    cat.peek = null; cat.edgePaws = null; cat.forceMask = false; b.drive = null; b.noShadow = false;
    if (cat.closeup) cat.closeup.goal = 0;
    if (cat.at.kind === 'wall') { cat.xf = null; const l = cat.at.ledge; b.x += cat.at.side * 30; b.gy = l.rect.top + cat.at.dy; cat.at = { kind: 'air' }; fallToFloor(cat); }
    else if (cat.at.kind !== 'away') cat.xf = null;
  }
  function fallToFloor(cat) {
    const b = cat.body, z = clamp(b.z, -30, 20);
    b.leap(clamp(b.x, 30, W.w - 30), floorY(z), z, 10, clamp(Math.sqrt(Math.max(0, floorY(z) - b.gy) / 1400), .2, .8));
    b.jump.k0 = b.k; b.jump.k1 = floorK(z); cat.at = { kind: 'air', then: FLOOR };
  }
  function interrupt(cat, gen, prio = PRIORITY.react, type = 'react', partner = null) {
    if (cat.prio > prio) return false;
    if (cat.at.kind === 'away' && prio < PRIORITY.treat) return false;
    unstick(cat);
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
      treat: !!W.treat && !W.treat.eaten, critter: !!W.critter && !W.critter.flee, shelves: W.ledges.length > 0,
      hideouts: W.solids.some(l => l.rect.height > 150 && onScreen(l.rect)), toys: W.toys.length > 0,
      aquarium: W.aquarium || idle > 60,
    };
  }
  function next(cat) {
    const choice = cat.mind.choose(context(cat));
    let type = choice.type;
    if (!A[type]) type = 'sit';
    // Only one cat at the glass at a time, and not too many out of the room.
    if (type === 'glass' && cats.some(c => c !== cat && c.mind.activity === 'glass')) type = 'stare';
    if (type === 'leave' && cats.filter(c => c !== cat && c.at.kind === 'away').length >= 2) type = 'wander';
    cat.mind.begin(type, choice.partner);
    cat.prio = type === 'treat' ? PRIORITY.treat : type === 'laser' ? PRIORITY.laser : PRIORITY.normal;
    if (choice.partner && byKind[choice.partner]) cat.prio = Math.max(cat.prio, PRIORITY.social - 5);
    cat.plan = A[type](cat, choice.partner);
  }
  function step(cat, dt) {
    if (!cat.plan) {
      // Cats who are somewhere odd come back first.
      if (cat.at.kind === 'away') { cat.plan = (function* () { yield* enter(cat, findSpot(cat), walkSpeed(cat)); })(); cat.prio = PRIORITY.normal; }
      else next(cat);
    }
    let guard = 0;
    while (cat.plan && guard++ < 3) {
      const r = cat.plan.next(dt);
      if (!r.done) break;
      cat.plan = null; cat.prio = 0; cat.body.face = cat.body.face === 'sleep' ? 'open' : cat.body.face;
      if (cat.at.kind !== 'away') unstick(cat);
      if (cat.at.kind === 'away') { cat.plan = (function* () { yield* enter(cat, findSpot(cat), walkSpeed(cat)); })(); cat.prio = PRIORITY.normal; }
      else next(cat);
      dt = 0;
    }
  }

  // ---------- speech, thoughts, particles ----------
  function say(cat, key, chance = 1, force = false) {
    if (Math.random() > chance) return false;
    if (!force && W.time < W.speechAt) return false;
    if (cat.at.kind === 'away' && !cat.peek) return false;
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
  function puffGlass(x, y) { for (let i = 0; i < 2; i++) particle('tap', x + (Math.random() - .5) * 30, y - 20, { color: '#f1eaf7', size: 12, rise: 24, life: .8 }); }
  function log(text) {
    const at = new Date(); journal.push({ t: at.getTime(), text }); if (journal.length > 30) journal.shift();
    renderJournal();
  }
  // Nudge a page decoration as if a paw hit it; drop distance > 0 knocks it off.
  function wobble(el, drop, dir) {
    if (!el.animate) return;
    el.dataset.catKnocked = '1';
    if (drop > 0) {
      // Transform adds to the element's own animation; opacity must replace, or 1 + 0 stays visible.
      const a = el.animate([{ transform: 'none' }, { transform: `translate(${dir * 30}px, -14px) rotate(${dir * 25}deg)`, offset: .18 }, { transform: `translate(${dir * 80}px, ${drop}px) rotate(${dir * 200}deg)`, offset: .85 }, { transform: `translate(${dir * 86}px, ${drop}px) rotate(${dir * 215}deg)` }], { duration: 1100, easing: 'cubic-bezier(.4,0,.9,.6)', fill: 'forwards', composite: 'add' });
      const gone = el.animate([{ opacity: 1, offset: .85 }, { opacity: 0 }], { duration: 1100, fill: 'forwards' });
      a.onfinish = () => { setTimeout(() => { a.cancel(); gone.cancel(); el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600 }); el.animate([{ transform: 'scale(.6)' }, { transform: 'none' }], { duration: 600, composite: 'add' }).onfinish = () => delete el.dataset.catKnocked; }, 25000); };
      setTimeout(() => puff(el.getBoundingClientRect().left + dir * 80, floorY(0), 5), 950);
    } else {
      el.animate([{ transform: 'none' }, { transform: `rotate(${dir * 14}deg) translateX(${dir * 6}px)` }, { transform: `rotate(${-dir * 7}deg)` }, { transform: `rotate(${dir * 3}deg)` }, { transform: 'none' }], { duration: 800, easing: 'ease-out', composite: 'add' })
        .onfinish = () => setTimeout(() => delete el.dataset.catKnocked, 8000);
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
    particle('♥', top.x + (Math.random() - .5) * 20, top.y, { color: '#f29bb0', size: 14 + Math.random() * 6 });
    if (stay || cat.mind.activity === 'sleep' || cat.mind.activity === 'cuddle' || cat.at.kind === 'behind') {
      particle('prr', top.x, top.y + 10, { color: '#e6d8f5', size: 11 }); b.face = cat.mind.activity === 'sleep' ? 'sleep' : 'happy'; setTimeout(() => { if (b.face === 'happy') b.face = 'open'; }, 900); return;
    }
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
    if (cat.peek) {
      // Booped while peeking: duck, then pop up somewhere else.
      cat.peek.goal = -.45; cat.peek.fast = true; say(cat, 'boop', 1, true); return;
    }
    if (cat.closeup) { b.bounce(1); b.face = 'wide'; say(cat, 'boop', 1, true); setTimeout(() => { b.face = 'open'; }, 700); return; }
    interrupt(cat, (function* () {
      b.look = 'viewer'; b.bounce(.8);
      if (cat.kind === 'black' && Math.random() < .5 && cat.at.kind === 'floor') {
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
    const b = cat.body;
    // Lift from wherever it was: behind a card, peeking, climbing, at the glass.
    const head = applyXf(cat, b.x, b.gy);
    cat.peek = null; cat.edgePaws = null; cat.closeup = null; cat.xf = null; cat.forceMask = false; b.drive = null; b.noShadow = false;
    b.x = head.x; b.gy = head.y;
    W.drag = { cat }; cat.mind.carried(); cat.mind.begin('carried'); cat.at = { kind: 'air' };
    cat.plan = (function* () { while (W.drag?.cat === cat) yield; })(); cat.prio = PRIORITY.carried;
    b.stop(); b.jump = null; b.reset({ dangle: 1, tailUp: -.8, earsBack: cat.mind.t.grumpy > .5 ? .7 : .2 }); b.face = cat.mind.t.grumpy > .5 ? 'grumpy' : 'wide';
    b.look = 'viewer'; say(cat, 'carried', 1, true);
  }
  function drop(cat) {
    const b = cat.body; W.drag = null;
    measure(true);
    // Land on the first ledge below the paws, or the floor.
    const ledge = W.ledges.filter(l => b.x > l.left && b.x < l.right && l.y(b.x) >= b.gy - 6 && l.y(b.x) - b.gy < 600).sort((p, q) => p.y(b.x) - q.y(b.x))[0];
    const f = floor(), z = clamp(b.z, f.zBehind + 5, f.zMax - 10);
    const surface = ledge || FLOOR, y = ledge ? ledge.y(b.x) : floorY(z), k = ledge ? S() * LEDGE_K : floorK(z);
    b.shadowY = null; b.reset({ leap: 1, tailUp: .9, earsBack: .3 }); b.face = 'wide';
    b.leap(ledge ? b.x : clamp(b.x, 20, W.w - 20), y, ledge ? 0 : z, 0, clamp(Math.sqrt(Math.max(0, y - b.gy) / 1400), .15, .7));
    b.jump.k0 = b.k; b.jump.k1 = k; cat.at = { kind: 'air' };
    cat.plan = (function* () {
      while (b.jump) yield;
      land(cat, surface); puff(b.x, b.gy, 4); cat.mind.begin('react');
      b.reset({ crouch: .5 }); yield* wait(.25); restPose(cat, 'sit'); b.face = 'open';
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
    W.pointer = { x, y, t: now, speed: dist / dtm };
    W.overUI = !!e.target?.closest?.(UI);
    if (W.drag) { e.preventDefault?.(); return; }
    if (W.press && Math.hypot(x - W.press.x, y - W.press.y) > 8 && W.press.cat) { startCarry(W.press.cat); W.press = null; return; }
    const hovered = !W.overUI && !e.target?.closest?.('dialog') ? catAt(x, y) : null;
    if (hovered !== W.hovered) { W.hovered = hovered; W.petDist = 0; document.documentElement.classList.toggle('cat-hover', !!hovered); }
    if (hovered) {
      const speed = W.pointer.speed;
      if (speed > .03 && speed < 1.4) { W.petDist += dist; if (W.petDist > 150) { W.petDist = 0; onPet(hovered); } }
    }
    // A fast cursor near a shy cat startles it.
    if (!W.overUI && W.pointer.speed > 2.2) {
      for (const c of cats) {
        if (c.mind.t.bold > .4 || c.prio >= PRIORITY.react || !drawn(c) || c.peek || c.closeup || c.at.kind === 'behind') continue;
        if (Math.hypot(c.body.x - x, c.body.gy - 40 - y) > 140 || W.time < (c.scaredAt || 0) + 8) continue;
        c.scaredAt = W.time; c.mind.startle(); const b = c.body;
        interrupt(c, (function* () {
          b.look = { x, y }; b.reset({ earsBack: 1, tailPuff: 1, tailUp: .6 }); b.face = 'wide'; b.bounce(1.2); say(c, 'cursorFast', 1);
          b.leap(b.x, b.gy, b.z, 22, .32); b.jump.k0 = b.jump.k1 = b.k; while (b.jump) yield;
          // Hide, if there's somewhere to hide.
          if (W.solids.length && Math.random() < .5) { yield* A.hide(c); return; }
          yield* travel(c, findSpot(c, { where: 'any', near: clamp(b.x + (b.x > x ? 260 : -260), 40, W.w - 40), spread: 160 }), runSpeed(c));
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
  function onDoubleClick(e) {
    if (e.target?.closest?.(UI) || catAt(e.clientX, e.clientY)) return;
    if (String(getSelection?.() || '').trim()) return;
    dropTreat(e.clientX, e.clientY);
  }
  function dropTreat(x = W.w * (.3 + Math.random() * .4), y = 80) {
    if (W.treat && !W.treat.eaten) return;
    measure(true);
    const ledge = W.ledges.filter(l => x > l.left && x < l.right && l.y(x) >= y).sort((p, q) => p.y(x) - q.y(x))[0];
    const z = ledge ? 0 : -20 + Math.random() * 30;
    W.treat = { x, y, vy: 0, falling: true, surface: ledge || FLOOR, z, ground: ledge ? ledge.y(x) : floorY(z), eaten: false, spin: 0 };
    log('You dropped a treat.');
    for (const c of cats) {
      if (c.prio >= PRIORITY.treat || (['sleep', 'cuddle'].includes(c.mind.activity) && c.mind.drives.hungry < 50)) continue;
      if (c.at.kind === 'away' && Math.random() < .5) continue;
      unstick(c); c.mind.begin('treat'); c.plan = A.treat(c); c.prio = PRIORITY.treat;
    }
  }
  function setLaser(on) {
    W.laser = on; $('cat-laser-btn')?.setAttribute('aria-pressed', String(on));
    document.documentElement.classList.toggle('cat-laser', on);
    if (on) { log('You turned on the laser pointer.'); for (const c of cats) if (c.prio < PRIORITY.laser && c.at.kind !== 'away') { unstick(c); c.mind.begin('laser'); c.plan = A.laser(c); c.prio = PRIORITY.laser; } }
  }
  function setCalm(on) {
    W.calm = on;
    for (const id of ['cat-calm-btn', 'cat-calm-dock']) { const el = $(id); if (el) { el.setAttribute('aria-pressed', String(on)); el.textContent = on ? 'Wake cats' : 'Calm cats'; } }
    for (const c of cats) if (c.prio < PRIORITY.react && c.at.kind !== 'away') { unstick(c); c.plan = null; c.prio = 0; }
    if (!on) for (const c of cats) c.mind.drives.sleepy = Math.min(c.mind.drives.sleepy, 15);
    save();
  }
  function setAquarium(on) {
    W.aquarium = on; document.body.classList.toggle('cat-wallpaper', on);
    const btn = $('cat-aquarium-btn'); if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? (room ? 'Back to room' : 'Back to site') : 'Aquarium'; }
    const url = new URL(location.href); if (on) url.searchParams.set('wallpaper', '1'); else url.searchParams.delete('wallpaper'); history.replaceState(history.state, '', url);
    for (const el of document.querySelectorAll(room ? '.room-nav,.playlist-column' : '.home-main,.site-footer')) el.inert = on;
    resize(); measure(true);
    const f = floor();
    for (const c of cats) {
      unstick(c); c.xf = null; c.closeup = null;
      c.body.jump = null; c.body.stop(); c.at = { kind: 'floor' };
      c.body.z = on ? lerp(f.zMin * .8, 0, Math.random()) : clamp(c.body.z, -40, 30);
      c.body.x = clamp(c.body.x, 40, W.w - 40);
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
      set('[data-doing]', c.at.kind === 'away' && !['leave', 'treat'].includes(c.mind.activity) ? 'Out exploring' : c.peek ? 'Peeking at you' : c.mind.label);
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
    for (const cv of [canvas, layer]) { cv.width = Math.round(W.w * W.dpr); cv.height = Math.round(W.h * W.dpr); }
    canvas.style.width = W.w + 'px'; canvas.style.height = W.h + 'px';
    measure(true);
    for (const c of cats) { if (c.at.kind === 'floor') c.body.x = clamp(c.body.x, 20, W.w - 20); c.target = null; }
  }
  // Put a cat straight into a resting spot: somewhere of its own, not lined up with the others.
  function place(c, i, pose = ['sit', 'loaf', 'sit', 'curl'][Math.floor(Math.random() * 4)]) {
    const spot = findSpot(c, { where: Math.random() < .6 ? 'ledge' : 'floor' });
    c.body.x = spot.x; c.body.z = spot.z ?? 0; c.target = spot;
    if (spot.surface === FLOOR) { c.at = { kind: 'floor' }; c.body.gy = floorY(c.body.z); c.body.k = floorK(c.body.z); }
    else { land(c, spot.surface); c.body.gy = spot.surface.y(spot.x); c.body.k = S() * LEDGE_K; }
    c.body.yaw = Math.random() < .6 ? Math.PI / 2 + (Math.random() - .5) : Math.random() * TAU;
    if (pose === 'curl') { restPose(c, 'sit'); c.body.reset({ curl: 1, eyes: 0, tailWrap: 1 }); c.body.face = 'sleep'; }
    else restPose(c, pose);
    Object.assign(c.body.pose, c.body.goal);
  }
  // What you find when the page opens: most cats asleep or loafing in their spots, maybe one out.
  function opening() {
    measure(true);
    let out = 0;
    // Spread the home patches across the screen, in a different order each visit.
    const homes = [.14, .38, .62, .86].sort(() => Math.random() - .5);
    cats.forEach((c, i) => { c.home = homes[i]; c.target = null; c.at = { kind: 'away', side: 'left' }; });
    [...cats].sort(() => Math.random() - .5).forEach((c, i) => {
      unstick(c); c.closeup = null; c.xf = null; c.prio = PRIORITY.normal;
      const r = Math.random();
      const mode = i === 0 ? (r < .6 ? 'sleep' : 'loaf') : r < .5 ? 'sleep' : r < .72 ? 'loaf' : out++ < 1 ? 'away' : 'sleep';
      if (mode === 'away') {
        c.at = { kind: 'away', side: Math.random() < .5 ? 'left' : 'right' }; c.mind.begin('leave');
        c.plan = (function* () {
          yield* wait(40 + Math.random() * 80);
          yield* enter(c, findSpot(c, { where: 'any' }), walkSpeed(c));
          say(c, 'back', .5); restPose(c, 'sit'); yield* wait(2);
        })();
        return;
      }
      place(c, i, mode === 'sleep' ? 'curl' : 'loaf');
      if (mode === 'sleep') { c.mind.drives.sleepy = Math.max(c.mind.drives.sleepy, 55); c.mind.begin('sleep'); c.plan = nap(c, 60 + Math.random() * 200, true); }
      else { c.mind.begin('loaf'); c.plan = A.loaf(c); }
    });
    for (const c of cats) c.target = null;
  }

  // Keep a cat attached to whatever it's on (pages scroll; cards move).
  function settle(cat, dt) {
    const b = cat.body, at = cat.at;
    if (W.drag?.cat === cat) return;
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
        if (cat.offAt > 3 && cat.prio < PRIORITY.react) { cat.offAt = 0; cat.at = { kind: 'away', side: 'top' }; cat.plan = null; cat.prio = 0; }
      } else cat.offAt = 0;
    } else if (at.kind === 'behind') {
      const r = refresh(at.solid).rect;
      b.x = r.left + at.dx; b.gy = r.top + at.dy; b.k = S() * BEHIND_K;
      if (!onScreen(r, -20) && cat.prio < PRIORITY.react) { cat.at = { kind: 'away', side: 'top' }; cat.peek = null; cat.plan = null; cat.prio = 0; }
    } else if (at.kind === 'wall') {
      const r = refresh(at.ledge).rect;
      b.x = at.side < 0 ? r.left : r.right; b.gy = r.top + at.dy;
      cat.xf = { angle: at.side * Math.PI / 2, px: b.x, py: b.gy };
    }
    if (cat.peek) placePeek(cat, dt);
  }

  function updateCritter(dt) {
    const bug = W.critter;
    if (!bug) {
      W.nextCritter -= dt;
      if (W.nextCritter <= 0 && !W.calm && !reduced()) {
        W.nextCritter = (W.aquarium ? 80 : 150) + Math.random() * 180;
        const fromLeft = Math.random() < .5;
        W.critter = { x: fromLeft ? -20 : W.w + 20, y: W.h * (.25 + Math.random() * .5), dir: fromLeft ? 1 : -1, t: 0, flap: 0, hue: pick(['#f2c78d', '#c3acf0', '#8fd3b5', '#f29bb0']), flee: false, gone: false, life: 25 + Math.random() * 15 };
        log('A butterfly drifted in.');
        // The curious notice first.
        for (const c of cats) if (c.prio < PRIORITY.social && c.at.kind !== 'away' && Math.random() < c.mind.t.curiosity * .7 && !['sleep', 'cuddle'].includes(c.mind.activity)) { unstick(c); c.mind.begin('hunt'); c.plan = A.hunt(c); c.prio = PRIORITY.normal + 5; }
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

  let last = performance.now(), raf = 0, saveAt = 0, panelAt = 0, hiddenAt = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    W.time += dt;
    measure();
    const day = dayRhythm(new Date().getHours());
    for (const c of cats) {
      const near = cats.some(o => o !== c && Math.abs(o.body.x - c.body.x) < 120 && Math.abs(o.body.gy - c.body.gy) < 60);
      c.mind.tick(dt, { day, nearFriend: near });
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
    if (now > panelAt) { panelAt = now + 500; renderPanel(); }
    if (now > saveAt) { saveAt = now + 15000; save(); }
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
    if (p.glyph === 'dust') { c2.fillStyle = p.color; c2.globalAlpha *= .5; c2.beginPath(); c2.arc(p.x, p.y, p.size * (1 + p.age * 2), 0, TAU); c2.fill(); }
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
  function updateContext() {
    const before = W.playing; W.playing = document.body.dataset.playback === 'playing';
    W.vibe = videoVibe(W.title).kind;
    if (W.playing && !before) for (const c of cats) if (c.prio < PRIORITY.social && c.at.kind !== 'away' && Math.random() < .55 && !['sleep', 'cuddle'].includes(c.mind.activity)) { unstick(c); c.plan = null; c.prio = 0; }
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
    opening();
    const summary = awaySummary(cats.map(c => c.mind), away); if (summary) log(summary);
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
  listen(document.querySelector('.create-room-button'), 'pointerenter', () => { const c = byKind.pink; if (c.prio < PRIORITY.react && drawn(c)) { c.body.look = { x: W.pointer?.x ?? W.w / 2, y: W.pointer?.y ?? 200 }; say(c, 'createHover', .6); } });
  listen($('url-in'), 'focus', () => { const c = byKind.black; say(c, 'newVideo', .4); });

  // ---------- start ----------
  resize();
  opening();
  setCalm(W.calm);
  if (new URLSearchParams(location.search).get('wallpaper') === '1') setAquarium(true);
  // Greet the visitor: the host peeks in, then comes up to the glass to say hello.
  {
    const host = firstVisit ? byKind.mint : [...cats].sort((a, b) => b.mind.trust - a.mind.trust)[0];
    const key = firstVisit ? 'greet' : sinceLast > 4 * 3600 ? 'returnLong' : null;
    if (key && !W.calm) {
      // One cat looks in to say hello; everyone else stays asleep.
      unstick(host); host.mind.begin('greet'); host.prio = PRIORITY.react; host.at = { kind: 'away', side: 'left' };
      host.plan = (function* () {
        yield* wait(1.5);
        const spec = screenPeekSpec(host); if (spec) yield* peek(host, spec, 2.2);
        yield* enter(host, findSpot(host, { where: 'floor' }), walkSpeed(host) * .8);
        say(host, key, 1, true); host.body.look = 'viewer'; yield* wait(1.5);
        host.mind.begin('loaf'); yield* A.loaf(host);
      })();
      if (firstVisit) log('You met the cats.'); else log(`You came back after ${Math.round(sinceLast / 3600)} hours. ${host.name} noticed.`);
    } else if (!journal.length) log('The cats are settling in.');
  }
  raf = requestAnimationFrame(t => { last = t; frame(t); });

  active = {
    cats, world: W,
    observe(data) {
      if (data.title !== undefined && data.title !== W.title) {
        const had = !!W.title; W.title = data.title; updateContext();
        if (had || data.title) for (const c of cats) if (c.prio < PRIORITY.react && drawn(c) && !c.peek && !['sleep', 'cuddle'].includes(c.mind.activity)) {
          c.body.set({ earsBack: 0 }); const s = stageCenter(); if (s) c.body.look = { ...s, behind: true }; think(c, '!', 1.2);
        }
        if (data.title) { say(pick(cats.filter(drawn).length ? cats.filter(drawn) : cats), 'newVideo', .7); log(`New video: ${data.title.slice(0, 60)}`); }
      }
      if (W.users !== null && data.users > W.users) {
        const c = byKind.mint; say(c, 'newcomer', 1, true); log('Someone joined the room. The cats noticed.');
        for (const o of cats) if (o.prio < PRIORITY.react && drawn(o)) o.body.look = { x: Math.random() < .5 ? 0 : W.w, y: W.h * .6 };
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
  if (new URLSearchParams(location.search).has('catdebug')) {
    // Testing hook: make a cat do something now, e.g. youpleCats.play('Mochi', 'hide').
    active.play = (name, type, ...args) => { const c = cats.find(x => x.name === name || x.kind === name); if (!c || !A[type]) return false; unstick(c); c.mind.begin(type); c.plan = A[type](c, ...args); c.prio = PRIORITY.react; return true; };
    active.peekIn = name => { const c = cats.find(x => x.name === name); unstick(c); c.at = { kind: 'away', side: 'left' }; c.plan = (function* () { const s = screenPeekSpec(c); if (s) yield* peek(c, s, 4); })(); c.prio = PRIORITY.react; };
    active.pos = name => { const c = cats.find(x => x.name === name); const h = c.body.headPos; return h ? applyXf(c, h[0], h[1]) : null; };
    active.measure = () => { measure(true); return { ledges: W.ledges.map(l => ({ kind: l.kind, cls: l.el.className || l.el.id, left: l.left, right: l.right, top: l.top })), solids: W.solids.map(s => s.el.className || s.el.id) }; };
    window.youpleCats = active;
  }
  return active;
}
