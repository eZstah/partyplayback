import test from 'node:test';
import assert from 'node:assert/strict';
import { CatBody } from '../src/scripts/cats/body.js';
import { CAST } from '../src/scripts/cats/cast.js';
import { rng } from '../src/scripts/cats/mind.js';

// Exercise every drawing path without a browser. Invalid coordinates fail at
// their canvas call, including poses that are normally only briefly visible.
function checkedCanvas() {
  const check = args => { for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), 'finite drawing coordinate'); };
  return new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key in target) return target[key];
      if (String(key).startsWith('create')) return (...args) => { check(args); return { addColorStop: (...values) => check(values) }; };
      return (...args) => check(args);
    },
    set(target, key, value) { check([value]); target[key] = value; return true; },
  });
}

const bean = () => new CatBody(CAST.black.look, rng(24));
const advance = (body, seconds, ctx) => {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) { body.update(1 / 60); if (ctx) body.draw(ctx); }
};
const spread = values => Math.max(...values) - Math.min(...values);

test('slow blinking closes, holds and softly reopens without changing the acting pose', () => {
  const body = bean();
  body.set({ eyes: .65, headRoll: .2 });
  body.slowBlink(1.2);
  const samples = [];
  for (let i = 0; i < 80; i++) { body.update(1 / 60); samples.push(body.blink); }
  assert.ok(samples.every(value => value >= 0 && value <= 1));
  assert.ok(samples.filter(value => value > .99).length >= 10, 'a readable closed-eye hold');
  assert.ok(Math.max(...samples.slice(1).map((value, i) => Math.abs(value - samples[i]))) < .08, 'no instant snap shut or open');
  assert.equal(body.blink, 0);
  assert.equal(body.goal.eyes, .65);
  assert.equal(body.goal.headRoll, .2);
  body.face = 'sleep'; body.set({ eyes: 0 }); body.slowBlink();
  advance(body, 2);
  assert.equal(body.face, 'sleep');
  assert.equal(body.goal.eyes, 0, 'an affectionate blink never wakes a sleeping pose');
});

test('resting breath moves the chest before the head while grounded paws stay still', () => {
  const body = bean(), ctx = checkedCanvas();
  body.reset({ sit: 1 }); advance(body, 3, ctx);
  const chest = [], head = [], feet = [];
  for (let i = 0; i < 240; i++) {
    body.update(1 / 60); body.draw(ctx);
    const sk = body.skeleton();
    chest.push(sk.C[1]); head.push(sk.D[1]); feet.push(body.paws[0].s[1]);
  }
  assert.ok(spread(chest) > .75, 'breathing is visibly present');
  assert.ok(spread(head) > .2 && spread(head) < spread(chest), 'head follows more gently than the ribs');
  assert.ok(chest.findIndex((value, i) => i > 0 && value < chest[i - 1]) !== head.findIndex((value, i) => i > 0 && value < head[i - 1]), 'head and chest do not reverse together');
  assert.ok(spread(feet) < .02, 'breathing does not lift planted paws');
});

test('straight walking carries the body over a planted stance instead of skating the paw', () => {
  for (const scale of [.7, 1, 3.2]) {
    const body = bean(), ctx = checkedCanvas();
    body.k = scale; body.yaw = 0; body.goTo(10000, 0, 65); advance(body, 3, ctx);
    let previous = null, checked = 0, maxSlip = 0;
    for (let i = 0; i < 240; i++) {
      body.update(1 / 60); body.draw(ctx);
      const paw = body.paws[0];
      if (paw.planted && previous?.planted) {
        maxSlip = Math.max(maxSlip, Math.hypot(paw.s[0] - previous.s[0], paw.s[1] - previous.s[1]));
        checked++;
      }
      previous = { planted: paw.planted, s: [...paw.s] };
    }
    assert.ok(checked > 60, 'exercise sustained stance intervals');
    assert.ok(maxSlip < .03, `planted paws at scale ${scale} drifted ${maxSlip.toFixed(3)} pixels in a frame`);
  }
});

test('seated breathing does not swap a planted foreleg across the white chest', () => {
  // These views straddle the old painter-order crossing. Record actual canvas
  // paint order, not just paw positions: those stayed still during the bug.
  for (const degrees of [23, 24, 87, 90, 93, 156, 157]) {
    const body = bean(), ctx = checkedCanvas(), L = body.L;
    body.yaw = degrees * Math.PI / 180;
    body.reset({ sit: 1, tailWrap: 1, tailWag: .025 });
    Object.assign(body.pose, body.goal); advance(body, 4);
    let path = null, order = [];
    ctx.beginPath = () => { path = {}; };
    ctx.moveTo = (x, y) => { path.from = [x, y]; };
    ctx.lineTo = (x, y) => { path.to = [x, y]; };
    ctx.ellipse = (x, y, rx, ry) => { path.ellipse = [rx, ry]; };
    ctx.fill = () => {
      if (ctx.fillStyle === L.belly && path.ellipse?.[0] === L.bodyR * .62 && path.ellipse[1] === L.bodyR * .95) order.push('bib');
    };
    ctx.stroke = () => {
      if (ctx.strokeStyle !== L.fur || ctx.lineWidth !== L.legW || !path.from || !path.to) return;
      const leg = body.paws.findIndex(paw => {
        const point = body.screen(paw.w);
        return Math.hypot(path.to[0] - point[0], path.to[1] - point[1]) < 1e-7;
      });
      if (leg !== -1) order.push(`foreleg-${leg}`);
    };
    let baseline = null;
    const ribs = [];
    for (let i = 0; i < 480; i++) {
      order = []; body.update(1 / 60); body.draw(ctx); ribs.push(body.skeleton().C[1]);
      baseline ??= [...order];
      assert.equal(order.length, 3, 'both forelegs and the chest were painted');
      assert.deepEqual(order, baseline, `${degrees}°: the breath changed which part covers the bib at frame ${i}`);
    }
    assert.ok(spread(ribs) > .75, 'stability must preserve visible breathing');
  }
});

test('turning and braking transfer weight, then settle without lingering oscillation', () => {
  const body = bean(), ctx = checkedCanvas();
  body.yaw = 0; body.goTo(500, 0, 100); advance(body, 1, ctx);
  body.goTo(body.x, -200, 100); advance(body, .3, ctx);
  assert.ok(Math.abs(body.motion.side) > .015, 'turning shifts the upper-body weight');
  body.stop(); advance(body, .15, ctx);
  assert.ok(body.motion.forward > .015, 'the head and shoulders carry forward while braking');
  advance(body, 4, ctx);
  assert.ok(body.speed < .001);
  assert.ok(Math.abs(body.motion.forward) < .001 && Math.abs(body.motion.side) < .001);
  assert.ok(Math.abs(body.motion.headBob) < .001, 'walking bob settles while breathing remains');
});

test('walking rises out of rest before translating and restores alternating steps', () => {
  for (const pose of [{ sit: 1 }, { loaf: 1 }, { curl: 1 }, { sit: .85, overEdge: 1, tailHang: 1 }]) {
    const body = bean(), ctx = checkedCanvas();
    body.yaw = 0; body.reset(pose); Object.assign(body.pose, body.goal);
    if (pose.curl) { body.face = 'sleep'; body.set({ eyes: 0 }); }
    advance(body, 2, ctx);
    const x = body.x;
    body.goTo(x + 250, 0, 65);
    body.update(1 / 60); body.draw(ctx);
    assert.equal(body.x, x, 'unfold the resting pose before moving along the ground');
    for (const key of ['sit', 'loaf', 'curl', 'overEdge', 'tailHang']) assert.equal(body.goal[key], 0, `${key} releases for walking`);
    assert.notEqual(body.face, 'sleep', 'walking wakes the sleeping expression');
    advance(body, 1, ctx);
    const lifts = [[], []];
    for (let i = 0; i < 120; i++) {
      body.update(1 / 60); body.draw(ctx);
      body.paws.forEach((paw, index) => lifts[index].push(paw.w[1]));
    }
    assert.ok(body.x > x + 90, 'the rise proceeds into real travel');
    for (const values of lifts) assert.ok(spread(values) > 3, 'both front paws take visible steps');
    assert.ok(lifts[0].some((value, i) => value > 3 && lifts[1][i] < .1), 'one paw supports while the other swings');
    advance(body, 5, ctx); assert.equal(body.move, null);
    body.reset({ sit: 1 }); advance(body, 3, ctx);
    assert.ok(body.pose.sit > .99, 'rest remains available after arrival');
  }
});

test('an offered paw lifts softly while the supporting paw stays grounded, then returns', () => {
  const body = bean(), ctx = checkedCanvas();
  body.reset({ sit: 1 }); advance(body, 3, ctx);
  const baseline = body.paws.map(p => [...p.w]);
  body.set({ offerPaw: 1 }); advance(body, 1, ctx);
  assert.ok(body.paws[0].w[1] > baseline[0][1] + 10, 'a readable, held lift');
  assert.ok(Math.abs(body.paws[1].w[1] - baseline[1][1]) < .01, 'the other paw supports the body');
  body.set({ offerPaw: 0 }); advance(body, 2, ctx);
  assert.ok(Math.abs(body.paws[0].w[1] - baseline[0][1]) < .1);
});

test('layered motion remains finite through poses, interrupted leaps and large close-ups', () => {
  const body = bean(), ctx = checkedCanvas();
  for (const pose of ['sit', 'loaf', 'curl', 'stretch', 'crouch', 'rear', 'dangle', 'overEdge', 'groom', 'swat', 'offerPaw', 'knead']) {
    body.k = pose === 'groom' ? 3.2 : .7;
    body.reset({ [pose]: 1 }); body.faceYaw(body.yaw + .7); body.slowBlink();
    advance(body, .8, ctx);
    body.leap(body.x + 30, body.gy, body.z + 10, 45, .4); advance(body, .2, ctx);
    body.jump = null; body.h = 0; body.reset(); advance(body, .8, ctx);
    assert.ok(Object.values(body.bounds).every(Number.isFinite));
    assert.ok(body.paws.every(paw => paw.s.every(Number.isFinite)));
  }
});
