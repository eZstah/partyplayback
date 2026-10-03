import { CAT_MOVES } from './mascot-moves.js';
import { ActionTrack, REST, clamp, safeTravel, samplePose, spring } from './mascot-motion.js';
import { centerOf, lookVector, setBaseMood, setMood } from './mascot-fx.js';

const scenes = new WeakMap();
const PARTS = { motion: '.cat-motion', head: '.cat-head', leftArm: '.cat-arm-left', rightArm: '.cat-arm-right', leftEar: '.cat-ear-left', rightEar: '.cat-ear-right', tail: '.cat-tail', leftFoot: '.cat-foot-left', rightFoot: '.cat-foot-right', shadow: '.cat-ground' };
const mirrorPose = p => ({ ...p, turn: -p.turn, head: -p.head, headX: -p.headX, leftArm: -p.rightArm, rightArm: -p.leftArm, leftEar: -p.rightEar, rightEar: -p.leftEar, tail: -p.tail, leftFoot: -p.rightFoot, rightFoot: -p.leftFoot });

export class CatActor {
  constructor(scene, el, root, index) {
    this.scene = scene; this.el = el; this.root = root; this.kind = el.dataset.kind;
    this.parts = Object.fromEntries(Object.entries(PARTS).map(([key, selector]) => [key, el.querySelector(selector)]));
    this.pupils = [...el.querySelectorAll('.cat-pupils')]; this.eyes = [...el.querySelectorAll('.cat-eyes')];
    this.track = new ActionTrack(); this.pose = Object.fromEntries(Object.entries(REST).map(([k, value]) => [k, { value, velocity: 0 }]));
    this.position = { x: 0, y: 0 }; this.velocity = { x: 0, y: 0 }; this.target = { x: 0, y: 0 };
    this.gaze = { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 } };
    this.phase = index * 2.3 + Math.random(); this.stride = 0; this.attention = null;
    this.base = 'idle'; this.visible = true; this.blinkAt = performance.now() + 2300 + Math.random() * 5000;
    this.travel = scene.travel; this.el.dataset.rig = 'active'; this.measure();
  }
  measure() {
    const r = this.root.getBoundingClientRect();
    if (this.scene.world) {
      this.origin = { left: 0, top: 0, right: r.width, bottom: r.height };
      this.center = { x: r.width / 2, y: r.height * .38 }; return;
    }
    this.origin = { left: r.left - this.position.x, right: r.right - this.position.x, top: r.top - this.position.y, bottom: r.bottom - this.position.y };
    this.center = { x: (this.origin.left + this.origin.right) / 2, y: this.origin.top + r.height * .38 };
  }
  setBase(mood) { this.base = mood; setBaseMood(this.el, mood); }
  lookAt(target, duration = 1800) { this.attention = { target, until: performance.now() + duration }; }
  play(name, options = {}) {
    const clip = CAT_MOVES[name];
    if (!clip || this.scene.destroyed || document.hidden) return false;
    const action = this.track.start(name, performance.now(), { duration: clip.duration, ...options });
    if (!action) return false;
    clearTimeout(this.actionTimer);
    action.mirror = options.mirror || false;
    this.el.dataset.action = name;
    setMood(this.el, options.mood || clip.mood);
    if (!action.hold) this.actionTimer = setTimeout(() => {
      if (this.track.finish(action.id)) { delete this.el.dataset.action; setMood(this.el, null); }
    }, action.duration);
    return true;
  }
  stop() {
    clearTimeout(this.actionTimer); this.track.clear(); delete this.el.dataset.action;
    setMood(this.el, null); this.attention = null;
  }
  constrain(desired, from = this.position) {
    if (!this.travel) return { x: 0, y: 0 };
    if (this.scene.world) {
      const margin = this.cinematic ? 700 : 0;
      return { x: clamp(desired.x, -margin, innerWidth - this.origin.right + margin), y: clamp(desired.y, -margin, innerHeight - this.origin.bottom + margin) };
    }
    const mobile = innerWidth <= 900, range = mobile ? 18 : 115;
    const rect = this.origin;
    const bounds = {
      minX: Math.max(-range, 8 - rect.left), maxX: Math.min(range, document.documentElement.clientWidth - 8 - rect.right),
      minY: mobile ? 0 : -38, maxY: mobile ? 0 : 38,
    };
    // A responsive layout may leave less than eight pixels at a rotated edge.
    bounds.minX = Math.min(0, bounds.minX); bounds.maxX = Math.max(0, bounds.maxX);
    const peers = this.scene.actors.filter(a => a !== this).map(a => ({ left: a.origin.left + a.position.x + 8, right: a.origin.right + a.position.x - 8, top: a.origin.top + a.position.y + 8, bottom: a.origin.bottom + a.position.y - 8 }));
    return safeTravel(rect, from, desired, bounds, [...this.scene.obstacles, ...peers]);
  }
  moveTo(x, y = 0) { if (this.scene.motion) this.target = this.constrain({ x, y }); }
  home() { this.target = { x: 0, y: 0 }; }
  reset() {
    this.stop(); this.home(); this.position = { x: 0, y: 0 }; this.velocity = { x: 0, y: 0 };
    this.root.style.removeProperty('translate');
    for (const [key, value] of Object.entries(REST)) this.pose[key] = { value, velocity: 0 };
    for (const part of [...Object.values(this.parts), ...this.pupils, ...this.eyes]) part?.style.removeProperty('transform');
    this.el.dataset.gait = 'rest';
  }
  update(now, dt) {
    if (!this.visible || !this.root.getClientRects().length) return;
    const action = this.track.current, clip = action && CAT_MOVES[action.name];
    let pose = clip ? samplePose(clip.frames, (now - action.start) / action.duration) : { ...REST };
    if (action?.mirror) pose = mirrorPose(pose);
    const t = now / 1000 + this.phase;
    const alive = this.scene.ambient || !!action;
    if (alive) {
      pose.sy += Math.sin(t * 1.65) * .007;
      pose.tail += Math.sin(t * 2.1) * (action ? 6 : 9);
      pose.leftEar += Math.pow(Math.max(0, Math.sin(t * .73)), 20) * -7;
      pose.rightEar += Math.pow(Math.max(0, Math.sin(t * .81 + 2)), 20) * 8;
    }
    const next = {}, speed = action?.name === 'carry' ? 22 : this.travelSpeed || 3.7;
    for (const axis of ['x', 'y']) {
      const s = spring({ value: this.position[axis], velocity: this.velocity[axis] }, this.target[axis], dt, speed);
      next[axis] = s.value; this.velocity[axis] = s.velocity;
    }
    const safe = this.constrain(next);
    if (Math.abs(safe.x - next.x) > .01 || Math.abs(safe.y - next.y) > .01) { this.target = safe; this.velocity = { x: 0, y: 0 }; }
    this.position = safe;
    if (this.travel) this.root.style.translate = `${safe.x.toFixed(2)}px ${safe.y.toFixed(2)}px`;
    const walking = Math.hypot(this.velocity.x, this.velocity.y) > 2 && action?.name !== 'carry';
    this.el.dataset.gait = walking ? 'walk' : 'rest';
    if (walking) {
      this.stride += dt * Math.min(13, 5 + Math.abs(this.velocity.x) * .08);
      const step = Math.sin(this.stride), strength = Math.min(1, Math.hypot(this.velocity.x, this.velocity.y) / 16);
      pose.leftFoot += step * 23 * strength; pose.rightFoot -= step * 23 * strength;
      pose.leftArm -= step * 19 * strength; pose.rightArm += step * 19 * strength;
      pose.lift -= Math.abs(step) * 2.5 * strength; pose.turn += clamp(this.velocity.x * .06, -5, 5);
      pose.head -= step * 2; pose.tail -= clamp(this.velocity.x * .15, -13, 13);
    }
    if (action?.name === 'carry') { pose.turn += clamp(this.velocity.x * .07, -14, 14); pose.head -= clamp(this.velocity.x * .035, -8, 8); }
    const attention = this.attention?.until > now ? this.attention.target : this.scene.pointer;
    const point = attention?.getBoundingClientRect ? centerOf(attention) : attention;
    const look = this.base === 'sleepy' || action?.name === 'sleep' ? { x: 0, y: 0 } : point ? lookVector({ x: this.center.x + safe.x, y: this.center.y + safe.y }, point) : { x: 0, y: 0 };
    for (const axis of ['x', 'y']) this.gaze[axis] = spring(this.gaze[axis], look[axis], dt, 19);
    pose.head += look.x * 1.25; pose.headX += look.x * .4; pose.headY += look.y * .45;
    for (const key of Object.keys(REST)) this.pose[key] = spring(this.pose[key], pose[key], dt, key === 'tail' ? 9 : 16);
    const p = Object.fromEntries(Object.entries(this.pose).map(([key, s]) => [key, s.value.toFixed(3)]));
    const apply = (part, transform) => { if (this.parts[part]) this.parts[part].style.transform = transform; };
    apply('motion', `translateY(${p.lift}px) rotate(${p.turn}deg) scale(${p.sx},${p.sy})`);
    apply('head', `translate(${p.headX}px,${p.headY}px) rotate(${p.head}deg)`);
    for (const part of ['leftArm', 'rightArm', 'leftEar', 'rightEar', 'tail', 'leftFoot', 'rightFoot']) apply(part, `rotate(${p[part]}deg)`);
    apply('shadow', `scaleX(${(1 + this.pose.lift.value / 100).toFixed(3)})`);
    const pupil = `translate(${this.gaze.x.value.toFixed(2)}px,${this.gaze.y.value.toFixed(2)}px)`;
    this.pupils.forEach(el => { el.style.transform = pupil; });
    if (now > this.blinkAt + 180) this.blinkAt = now + 3000 + Math.random() * 5000;
    const blink = now >= this.blinkAt ? 1 - Math.sin((now - this.blinkAt) / 180 * Math.PI) * .94 : 1;
    this.eyes.forEach(el => { el.style.transform = `scaleY(${blink.toFixed(3)})`; });
  }
}

export class CatScene {
  constructor(root, { travel = false, ambient = true, obstacles = [], world = false } = {}) {
    scenes.get(root)?.destroy(); scenes.set(root, this);
    this.root = root; this.travel = travel; this.ambient = ambient; this.obstacleElements = obstacles; this.world = world;
    this.actors = []; this.obstacles = []; this.pointer = null; this.destroyed = false; this.offscreen = false;
    this.events = new AbortController(); this.timers = new Set(); this.effects = new Set(); this.disposers = new Set(); this.frame = 0;
    this.media = matchMedia('(prefers-reduced-motion: reduce)');
    try { this.calm = localStorage.getItem('youple-cat-calm') === 'true'; } catch { this.calm = false; }
    this.listen(document, 'visibilitychange', () => this.refresh());
    this.listen(this.media, 'change', () => this.refresh());
    this.listen(window, 'resize', () => this.measure());
    this.listen(window, 'scroll', () => this.measure(), { passive: true });
    this.listen(window, 'pagehide', e => e.persisted ? this.suspend() : this.destroy());
    this.listen(window, 'pageshow', e => { if (e.persisted) { this.measure(); this.refresh(); } });
    this.listen(window, 'storage', e => { if (e.key === 'youple-cat-calm') { this.calm = e.newValue === 'true'; this.refresh(); } });
    this.observer = new IntersectionObserver(entries => {
      if (this.world) return;
      for (const e of entries) { const actor = this.actors.find(a => a.root === e.target); if (actor) actor.visible = e.isIntersecting; }
      this.offscreen = this.actors.length > 0 && this.actors.every(a => !a.visible); this.refresh();
    });
    this.resize = new ResizeObserver(() => this.measure()); this.resize.observe(root);
  }
  get motion() { return !this.destroyed && !this.calm && !this.media.matches && !document.hidden && !this.offscreen; }
  add(el, root = el) { const actor = new CatActor(this, el, root, this.actors.length); this.actors.push(actor); this.observer.observe(root); return actor; }
  listen(el, name, fn, options = {}) { el?.addEventListener(name, fn, { ...options, signal: this.events.signal }); }
  after(fn, ms) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.destroyed && !document.hidden) fn(); }, ms);
    this.timers.add(id); return id;
  }
  measure() {
    this.obstacles = this.obstacleElements.filter(Boolean).map(el => { const r = el.getBoundingClientRect(); return { left: r.left - 10, right: r.right + 10, top: r.top - 10, bottom: r.bottom + 10 }; });
    this.actors.forEach(a => { a.measure(); a.target = a.constrain(a.target); });
  }
  setCalm(value) {
    this.calm = value; try { localStorage.setItem('youple-cat-calm', String(value)); } catch {}
    this.refresh();
  }
  suspend() {
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.timers.forEach(clearTimeout); this.timers.clear();
    this.effects.forEach(effect => { effect.animation.cancel(); effect.el.remove(); }); this.effects.clear();
    this.actors.forEach(a => a.reset()); this.onSuspend?.();
  }
  refresh() {
    this.root.dataset.catMotion = this.motion ? 'active' : 'calm';
    this.onMotionChange?.(this.motion);
    if (!this.motion) { this.suspend(); return; }
    if (this.frame) return;
    this.lastFrame = performance.now(); this.measure();
    const tick = now => {
      if (!this.motion) { this.suspend(); return; }
      const dt = Math.min(.05, (now - this.lastFrame) / 1000); this.lastFrame = now;
      this.onTick?.(now, dt); this.actors.forEach(a => a.update(now, dt));
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  // A real prop travels between paws. Cancellation removes it and prevents a
  // stale catch from interrupting a new action or a hidden/unmounted scene.
  throwSnack(from, to, onCatch) {
    if (!this.motion) { onCatch?.(); return; }
    const start = centerOf(from.el), end = centerOf(to.el), box = this.root.getBoundingClientRect();
    const el = document.createElement('span'); el.className = 'cat-projectile'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 17C-2 12 3 4 8 7c0-9 12-9 13-1 6 2 5 10-2 12-2 7-12 6-14-1Z" fill="#fff5d8"/><circle cx="13" cy="12" r="3" fill="#e8bc72"/></svg>';
    el.style.left = `${start.x - box.left}px`; el.style.top = `${start.y - box.top - 10}px`; this.root.append(el);
    const dx = end.x - start.x, dy = end.y - start.y;
    const animation = el.animate(Array.from({ length: 21 }, (_, i) => { const t = i / 20; return { transform: `translate(${dx * t}px,${dy * t - 4 * 80 * t * (1 - t)}px) rotate(${t * 430}deg)`, opacity: t < .95 ? 1 : 0 }; }), { duration: 900, easing: 'linear', fill: 'both' });
    const effect = { el, animation }; this.effects.add(effect);
    animation.finished.then(() => { if (this.motion) onCatch?.(); }, () => {}).finally(() => { this.effects.delete(effect); el.remove(); });
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.suspend(); this.disposers.forEach(fn => fn()); this.disposers.clear();
    this.events.abort(); this.observer.disconnect(); this.resize.disconnect();
    this.actors.forEach(a => { delete a.el.dataset.rig; }); scenes.delete(this.root);
  }
}
