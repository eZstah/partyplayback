// A cat drawn from a tiny 3D rig: spheres for body and head, sticks for legs,
// a lagging chain for the tail, and face "decals" mapped onto the head sphere.
// Everything is projected through a slightly tilted camera, so a cat can turn
// all the way around and show its back, its profile or its face.
export const TILT = .38;
const ST = Math.sin(TILT), CT = Math.cos(TILT), TAU = Math.PI * 2;
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (cur, target, rate, dt) => target + (cur - target) * Math.exp(-rate * dt);
const smooth = t => { const s = clamp(t, 0, 1); return s * s * (3 - 2 * s); };
const strideLength = look => look.legLen * 2.6 + 8;

// A planted paw moves back at a constant rate while the body moves over it.
// The shorter swing returns it softly, with no sharp lift or touchdown.
function footStep(phase, stride, duty, lift) {
  const cycle = ((phase / TAU) % 1 + 1) % 1, reach = stride * duty;
  if (cycle < duty) return { forward: reach * (.5 - cycle / duty), up: 0, planted: true };
  const swing = (cycle - duty) / (1 - duty);
  return { forward: lerp(-reach * .5, reach * .5, smooth(swing)), up: Math.sin(Math.PI * swing) ** 2 * lift, planted: false };
}

// Vector helpers on [x, up, z] where +z points at the viewer.
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const VIEW = [0, ST, CT];
// Colour helpers for soft shading.
const tints = new Map();
export function tint(hex, amount) {
  const key = hex + amount; if (tints.has(key)) return tints.get(key);
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const out = '#' + c.map(v => Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount)).toString(16).padStart(2, '0')).join('');
  tints.set(key, out); return out;
}
export const visibility = n => dot(n, VIEW);
export const project2 = v => [v[0], -v[1] * CT + v[2] * ST];

export const REST = {
  sit: 0, loaf: 0, curl: 0, crouch: 0, stretch: 0, rear: 0, dangle: 0, leap: 0,
  headYaw: 0, headPitch: 0, headRoll: 0, earsBack: 0, tailUp: .45, tailCurl: .35, tailWag: .12, tailPuff: 0, tailWrap: 0,
  eyes: 1, pupil: .7, mouth: 0, groom: 0, pawsUp: 0, swat: 0, offerPaw: 0, knead: 0, bob: 0, wiggle: 0, tailHang: 0, overEdge: 0,
};
const RATES = { sit: 4, loaf: 3.2, curl: 2.8, stretch: 4, headYaw: 7, headPitch: 6, headRoll: 5, eyes: 12, mouth: 12, swat: 18, offerPaw: 4.5, earsBack: 9, pupil: 6, tailPuff: 5 };
const LEGS = [
  { front: true, side: 1, walk: .25, trot: 0, gallop: 0 }, { front: true, side: -1, walk: .75, trot: .5, gallop: .1 },
  { front: false, side: 1, walk: 0, trot: .5, gallop: .55 }, { front: false, side: -1, walk: .5, trot: 0, gallop: .65 },
];
const TAIL_SEGMENTS = 9;

export class CatBody {
  constructor(look, random = Math.random) {
    this.random = random;
    this.L = { ...look, light: look.light || tint(look.fur, .38) }; this.x = 0; this.z = 0; this.gy = 0; this.h = 0; this.k = 1; this.yaw = Math.PI / 2; this.yawVel = 0;
    this.pose = { ...REST }; this.goal = { ...REST }; this.face = 'open'; this.blink = 0; this.nextBlink = 1 + this.random() * 3;
    this.speed = 0; this.gait = this.random() * TAU; this.move = null; this.turnTo = null; this.jump = null;
    this.look = null; this.time = this.random() * 100; this.squash = 0; this.squashVel = 0; this.alpha = 1; this.shadowY = null;
    this.tail = Array.from({ length: TAIL_SEGMENTS }, () => ({ a: .4, b: 0 })); this.tailSide = this.random() < .5 ? 1 : -1;
    this.hit = []; this.top = { x: 0, y: 0 }; this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    // Set by the world: an external gait speed (climbing), and whether to draw a floor shadow.
    this.drive = null; this.noShadow = false; this.headLift = look.headR * 2.6; this.paws = [];
    this.blinkCycle = null;
    this.motion = { breathPhase: this.time, breathRate: 1.8, breath: 0, headBreath: 0, walk: 0, bob: 0, headBob: 0, forward: 0, side: 0, headForward: 0 };
  }
  set(goal) { Object.assign(this.goal, goal); return this; }
  reset(extra = {}) { this.goal = { ...REST, ...extra }; return this; }
  goTo(x, z, speed) { this.move = { x, z, speed }; this.turnTo = null; }
  stop() { this.move = null; }
  get arrived() { return !this.move && !this.jump; }
  get airborne() { return !!this.jump; }
  faceYaw(yaw) { this.turnTo = yaw; }
  bounce(amount = 1) { this.squashVel -= 7 * amount; }
  // An affectionate close / hold / reopen layered over the current eye pose.
  // It never changes face or eyes goals, so a sleeping cat stays asleep.
  slowBlink(duration = 1.2) {
    if (!this.blinkCycle?.slow) this.blinkCycle = { t: 0, duration: clamp(duration, .4, 3), from: this.blink, slow: true };
    return this;
  }
  leap(x1, gy1, z1, arc = 60, dur = null) {
    const dist = Math.hypot(x1 - this.x, gy1 - this.gy);
    this.jump = { x0: this.x, gy0: this.gy, z0: this.z, x1, gy1, z1, arc, t: 0, dur: dur ?? clamp(.32 + dist / 900, .35, .85) };
    this.move = null; this.turnTo = Math.abs(x1 - this.x) > 4 ? (x1 > this.x ? 0 : Math.PI) : this.turnTo;
  }

  update(dt) {
    this.time += dt;
    const p = this.pose, g = this.goal;
    for (const key in g) p[key] = ease(p[key], g[key], RATES[key] || 6, dt);
    // Locomotion: turn toward the goal first, move along the facing direction.
    const prevYaw = this.yaw, prevX = this.x, prevZ = this.z, prevSpeed = this.speed;
    if (this.jump) {
      const j = this.jump; j.t += dt; const s = clamp(j.t / j.dur, 0, 1);
      this.x = lerp(j.x0, j.x1, s); this.gy = lerp(j.gy0, j.gy1, s); this.z = lerp(j.z0, j.z1, s);
      this.h = j.arc * 4 * s * (1 - s); const vy = j.arc * 4 * (1 - 2 * s) / j.dur;
      p.leap = ease(p.leap, s < .9 ? 1 : 0, 14, dt); this.pitch = clamp(vy * .0028, -.55, .55);
      if (this.turnTo !== null) this.yaw += clamp(wrap(this.turnTo - this.yaw), -9 * dt, 9 * dt);
      if (s >= 1) { this.jump = null; this.h = 0; this.pitch = 0; this.bounce(1.1); }
    } else {
      this.pitch = ease(this.pitch || 0, 0, 10, dt); p.leap = ease(p.leap, 0, 10, dt);
      if (this.move) {
        const m = this.move, dx = m.x - this.x, dz = m.z - this.z, dist = Math.hypot(dx, dz);
        if (dist < 2.5) { this.move = null; } else {
          const want = Math.atan2(dz, dx), off = wrap(want - this.yaw), turn = 7 + 4 / (1 + this.speed / 60);
          this.yaw += clamp(off, -turn * dt, turn * dt);
          const target = m.speed * clamp(dist / 50 + .25, .25, 1) * Math.max(0, Math.cos(off));
          this.speed = ease(this.speed, target, 5, dt);
          const step = Math.min(dist, this.speed * dt);
          this.x += Math.cos(this.yaw) * step; this.z += Math.sin(this.yaw) * step;
        }
      }
      if (!this.move) {
        this.speed = ease(this.speed, this.drive ?? 0, this.drive ? 6 : 9, dt);
        if (this.turnTo !== null) {
          const off = wrap(this.turnTo - this.yaw);
          this.yaw += clamp(off, -4.2 * dt, 4.2 * dt);
          if (Math.abs(off) < .02) this.turnTo = null;
        }
      }
    }
    this.yaw = wrap(this.yaw);
    const yawVel = wrap(this.yaw - prevYaw) / Math.max(dt, 1e-3); this.yawVel = ease(this.yawVel, yawVel, 10, dt);
    // Cadence follows distance covered, including scene scale, instead of a
    // residual speed after stopping. The stance therefore stays under Bean.
    const distance = this.jump ? 0 : Math.hypot(this.x - prevX, this.z - prevZ);
    const travel = this.drive !== null ? Math.abs(this.drive) * dt : distance / Math.max(.05, this.k);
    this.gait += (travel / strideLength(this.L) + Math.abs(wrap(this.yaw - prevYaw)) * .22) * TAU;
    const m = this.motion, resting = clamp(Math.max(p.sit, p.loaf, p.curl), 0, 1);
    m.walk = ease(m.walk, clamp((this.speed + Math.abs(this.yawVel) * 12) / 45, 0, 1), 10, dt);
    const grounded = 1 - Math.max(p.leap, p.dangle, p.rear);
    const accel = (this.speed - prevSpeed) / Math.max(dt, 1e-3);
    m.forward = ease(m.forward, clamp(-accel / 650, -.3, .3) * grounded, 5, dt);
    m.side = ease(m.side, clamp(-this.yawVel * this.speed / 950, -.3, .3) * grounded, 5, dt);
    m.headForward = ease(m.headForward, m.forward, 3, dt);
    m.bob = ease(m.bob, (.5 - .5 * Math.cos(this.gait * 2)) * m.walk * (1 - resting) * 1.25, 16, dt);
    m.headBob = ease(m.headBob, m.bob * .45, 5, dt);
    m.breathRate = ease(m.breathRate, lerp(1.8, 1.3, p.curl) + m.walk * .7, 2, dt);
    m.breathPhase += m.breathRate * dt;
    m.breath = (Math.sin(m.breathPhase) + Math.sin(m.breathPhase * 2 - .4) * .12) * (.65 + resting * .4);
    m.headBreath = ease(m.headBreath, m.breath * .4, 3, dt);
    // Squash and stretch spring.
    this.squashVel += (-this.squash * 160 - this.squashVel * 13) * dt; this.squash += this.squashVel * dt;
    // Blinking.
    if (!this.blinkCycle) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) this.blinkCycle = { t: 0, duration: .22 + this.random() * .08, from: 0, slow: false };
    }
    if (this.blinkCycle) {
      const b = this.blinkCycle; b.t += dt;
      const t = b.t / b.duration, close = b.slow ? .35 : .27, hold = b.slow ? .55 : .38;
      this.blink = t < close ? lerp(b.from, 1, smooth(t / close)) : t < hold ? 1 : 1 - smooth((t - hold) / (1 - hold));
      if (t >= 1) { this.blinkCycle = null; this.blink = 0; this.nextBlink = 2.8 + this.random() * 4.5; }
    }
    this.updateHead(dt); this.updateTail(dt);
  }

  // Aim the head at a target: {x, y} on screen, {cat}, 'viewer' or 'behind' (the video).
  updateHead(dt) {
    const g = this.goal, look = this.look;
    if (!look || this.pose.curl > .5) { if (!look) g.headYaw = ease(g.headYaw, 0, 2.4, dt); return; }
    let yaw, pitch = 0;
    const headY = this.gy - this.k * (this.L.legLen + this.L.bodyR * 1.8) * CT;
    if (look === 'viewer') { yaw = Math.PI / 2; pitch = .08; }
    else if (look.behind) { const dx = look.x - this.x; yaw = Math.atan2(-220, dx); pitch = clamp((headY - look.y) / 500, -.2, .55); }
    else if (look.z !== undefined) { yaw = Math.atan2(look.z - this.z, look.x - this.x); }
    else { const dx = look.x - this.x, dy = look.y - headY; yaw = Math.atan2(140, dx); pitch = clamp(-dy / 420, -.5, .6); }
    let rel = wrap(yaw - this.yaw);
    // Beyond what a neck can do, turn the whole body (only when standing still).
    if (Math.abs(rel) > 1.25 && !this.move && !this.jump && this.pose.curl < .3 && this.pose.loaf < .5) this.turnTo = this.yaw + rel - Math.sign(rel) * .7;
    rel = clamp(rel, -1.25, 1.25);
    g.headYaw = rel; g.headPitch = pitch;
  }

  updateTail(dt) {
    const p = this.pose, n = TAIL_SEGMENTS, t = this.time;
    const baseUp = lerp(-.55, 1.5, (p.tailUp + 1) / 2);
    const wagFreq = 2.2 + p.tailWag * 6, wrapSide = this.tailSide;
    for (let i = 0; i < n; i++) {
      const s = this.tail[i], f = i / (n - 1);
      let a = (i === 0 ? baseUp : .05 + p.tailCurl * .3 * f * f * 3) ;
      let b = (i === 0 ? .32 : -.05) + Math.sin(t * wagFreq - i * .55) * p.tailWag * .14 * (i + 1) / 3 - this.yawVel * .025 * f;
      // Moving: the tail streams out behind; sitting or curled: it wraps along the floor.
      a = lerp(a, i === 0 ? .35 : -.04, clamp(this.speed / 260, 0, .6));
      const w = clamp(Math.max(p.tailWrap, p.curl, p.sit * .9, p.loaf * .8), 0, 1);
      a = lerp(a, i === 0 ? -.35 : -.03, w); b = lerp(b, wrapSide * (.12 + .3 * f), w);
      // Hanging over an edge, swinging lazily.
      const hang = clamp(p.tailHang, 0, 1);
      if (hang > .001) { a = lerp(a, i === 0 ? -1.3 : -.02, hang); b = lerp(b, (i === 0 ? 0 : Math.sin(t * 1.4 - i * .45) * .09) , hang); }
      const rate = 14 - f * 9;
      s.a = ease(s.a, a, rate, dt); s.b = ease(s.b, b, rate, dt);
    }
  }

  // Blend the four body shapes (stand, sit, loaf, curl) into key points.
  skeleton() {
    const L = this.L, p = this.pose, R = L.bodyR, sp = L.spine, ll = L.legLen, hr = L.headR;
    const shapes = {
      stand: { H: [-sp, ll + R * .8, 0, R * .98], B: [0, ll + R * .78, 0, R * 1.02], C: [sp * .95, ll + R * .86, 0, R * .95], D: [sp + R * .7, ll + R * .95 + hr * .9, 0] },
      sit: { H: [-sp * .35, R * .95, 0, R * 1.05], B: [sp * .05, R * 1.45, 0, R * .95], C: [sp * .35, R * 1.95, 0, R * .9], D: [sp * .45 + 4, R * 2.5 + hr * .6, 0] },
      loaf: { H: [-sp * .9, R * .88, 0, R], B: [0, R * .95, 0, R * 1.06], C: [sp * .85, R * .93, 0, R * .96], D: [sp + R * .6, R * 1.05 + hr * .55, 0] },
      curl: { H: [-sp * .5, R * .8, -R * .1, R], B: [0, R * .86, 0, R * 1.08], C: [sp * .5, R * .82, -R * .05, R * .96], D: [sp * .7, hr * .82, R * .75] },
      stretch: { H: [-sp * 1.05, ll + R * 1, 0, R * .95], B: [-sp * .05, ll * .6 + R * .7, 0, R * .98], C: [sp * 1.05, R * .85, 0, R * .9], D: [sp * 1.3 + R * .7, R * .9 + hr * .45, 0] },
    };
    const pick = key => {
      let v = shapes.stand[key].slice();
      for (const [name, weight] of [['stretch', p.stretch], ['sit', p.sit], ['loaf', p.loaf], ['curl', p.curl]]) {
        if (weight > .001) v = v.map((x, i) => lerp(x, shapes[name][key][i], clamp(weight, 0, 1)));
      }
      return v;
    };
    const H = pick('H'), B = pick('B'), C = pick('C'), D = pick('D');
    // Crouch (stalking) lowers everything and pushes the head forward; a butt wiggle before the pounce.
    const crouch = p.crouch * ll * .62;
    H[1] -= crouch * .85; B[1] -= crouch; C[1] -= crouch * 1.05; D[1] -= crouch * 1.25; D[0] += p.crouch * 5;
    const wig = Math.sin(this.time * 26) * p.wiggle * 3.2; H[2] += wig;
    // Hips support the weight; breath expands the ribs and lifts the chest.
    // The head follows a fraction later rather than riding the same bob.
    const m = this.motion, dance = Math.sin(this.time * 7.85) * p.bob * 4;
    H[1] += m.bob * .55 + dance; H[3] += m.breath * .1;
    B[1] += m.bob + dance + m.breath * .14; B[3] += m.breath * .3;
    C[1] += m.bob + dance + m.breath * .48; C[3] += m.breath * .42;
    D[1] += m.headBob + dance * .7 + m.headBreath;
    C[0] += m.forward * R * .5; B[0] += m.forward * R * .2; D[0] += m.headForward * R * .8;
    H[2] -= m.side * R * .15; C[2] += m.side * R * .45; D[2] += m.side * R * .65;
    return { H, B, C, D };
  }

  // Local (forward, up, side) → world offset, applying body pitch (rearing, dangling, leaping).
  toWorld(f, u, s, pitch, pivot) {
    if (pitch) {
      const cf = f - pivot[0], cu = u - pivot[1], c = Math.cos(pitch), sn = Math.sin(pitch);
      f = pivot[0] + cf * c - cu * sn; u = pivot[1] + cf * sn + cu * c;
    }
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return [f * cy - s * sy, u, f * sy + s * cy];
  }
  dirWorld(f, u, s, yaw) { const cy = Math.cos(yaw), sy = Math.sin(yaw); return [f * cy - s * sy, u, f * sy + s * cy]; }
  screen(w) { const k = this.k; return [this.x + k * w[0], this.gy - k * (w[1] + this.h) * CT + k * w[2] * ST]; }
  depth(w) { return w[2] * CT + w[1] * ST; }

  draw(ctx) {
    const L = this.L, p = this.pose, k = this.k, R = L.bodyR, ll = L.legLen;
    const outline = L.outline || '#3D2C3E', ow = 2.1 * k;
    const sq = this.squash, sx = 1 + sq * .12, sy = 1 - sq * .16;
    const sk = this.skeleton();
    const rear = clamp(p.rear, 0, 1), dangle = clamp(p.dangle, 0, 1);
    let pitch = (this.pitch || 0) + rear * 1.1 + dangle * 1.4, pivot = dangle > rear ? sk.D : sk.H;
    const W = (f, u, s) => { const w = this.toWorld(f, u, s, pitch, pivot); return [w[0] * sx, w[1] * sy, w[2] * sx]; };
    const parts = [];
    const H = W(sk.H[0], sk.H[1], sk.H[2]), B = W(sk.B[0], sk.B[1], sk.B[2]), C = W(sk.C[0], sk.C[1], sk.C[2]);
    let D = W(sk.D[0], sk.D[1], sk.D[2]);
    const yawH = this.yaw + p.headYaw, hr = L.headR;
    // Head sits a little to the side it is turned to.
    D = add(D, this.dirWorld(0, 0, Math.sin(p.headYaw) * 3, this.yaw));
    // The head basis is in world space: keep the face level while the body pitches.
    const headPitch = p.headPitch + pitch * .2 - p.crouch * .1 - p.groom * .25;
    const basis = headBasis(yawH, headPitch, p.headRoll + Math.sin(this.time * .7) * .03);
    const [Fh, Uh, Sh] = basis;

    // Shadow.
    const center = this.screen([B[0], 0, B[2]]);
    const shadowY = this.shadowY ?? (this.gy + k * B[2] * ST);
    ctx.save(); ctx.globalAlpha = this.noShadow ? 0 : this.alpha * .26 * clamp(1 - this.h / 160, .25, 1) * (this.shadowY ? .6 : 1);
    ctx.fillStyle = '#0b0714'; ctx.beginPath();
    ctx.ellipse(center[0], shadowY, k * (R * 1.7 + Math.abs(Math.cos(this.yaw)) * L.spine * .9) * clamp(1 - this.h / 300, .4, 1), k * R * .5, 0, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.globalAlpha = this.alpha;

    // Legs: shoulder/hip anchors to paws, with gait.
    const legVis = clamp(1 - p.loaf - p.curl + p.overEdge, 0, 1), sitW = clamp(p.sit, 0, 1);
    const gallop = this.speed > 170, trot = this.speed > 85;
    for (const leg of LEGS) {
      const base = leg.front ? sk.C : sk.H, s = leg.side;
      const anchor = [base[0] + (leg.front ? R * .2 : -R * .15), base[1] - R * .42, s * R * .5];
      const phase = this.gait + TAU * (gallop ? leg.gallop : trot ? leg.trot : leg.walk);
      const moving = this.motion.walk;
      const step = footStep(phase, strideLength(L), gallop ? .43 : trot ? .54 : .64, (4 + ll * .3) * (gallop ? 1.35 : 1));
      // Paw anchors exclude chest sway, which transfers weight above the feet.
      const footBase = anchor[0] - (leg.front ? this.motion.forward * R * .5 : 0);
      let paw = [footBase + step.forward * moving + (leg.front ? 2 : -1), step.up * moving, s * R * .42];
      if (leg.front) {
        paw = mixArr(paw, [sk.C[0] + R * .3, 0, s * R * .36], sitW);
        paw = mixArr(paw, [sk.C[0] + R * .9 + ll * .9, 0, s * R * .4], p.stretch);
        const kneadLift = Math.max(0, Math.sin(this.time * 7 + (s > 0 ? 0 : Math.PI))) * p.knead * 6;
        paw[1] += kneadLift;
        if (p.overEdge > .01) paw = mixArr(paw, [sk.C[0] + R * .7 + Math.sin(this.time * 2.2 + s) * 2.5, -ll * 1.2 - R * .45, s * R * .42], clamp(p.overEdge, 0, 1));
      } else {
        paw = mixArr(paw, [sk.H[0] + R * 1.05, 0, s * R * .68], sitW);
      }
      paw = mixArr(paw, [base[0] + (leg.front ? R * .75 : R * .2), 1.5, s * R * .38], 1 - legVis);
      // Leap: front paws reach forward, hind legs push back.
      if (p.leap > .01) paw = mixArr(paw, leg.front ? [anchor[0] + ll * 1.1, anchor[1] - ll * .5, s * R * .35] : [anchor[0] - ll * 1.2, anchor[1] - ll * .6, s * R * .4], p.leap);
      if (rear > .01 && leg.front) paw = mixArr(paw, [anchor[0] + R * .55, anchor[1] - ll * .35 + Math.sin(this.time * 7.8 + s) * p.pawsUp * 5, s * R * .5], rear);
      let wa = W(anchor[0], anchor[1], anchor[2]);
      let wp = (rear > .01 && !leg.front) ? [this.toWorld(paw[0], paw[1], paw[2], 0, pivot)][0] : W(paw[0], paw[1], paw[2]);
      if (dangle > .01) {
        const hang = add(wa, [Math.sin(this.time * 3 + s) * 3, -ll * 1.05, 0]);
        wp = mix(wp, hang, dangle);
      }
      // Grooming paw goes to the mouth; a swat lashes forward.
      if (leg.front && s === 1) {
        const mouth = add(D, add(mul(Fh, hr * .78), mul(Uh, -hr * .45)));
        if (p.groom > .01) wp = mix(wp, add(mouth, [0, Math.sin(this.time * 9) * 2, 0]), clamp(p.groom, 0, 1));
        if (p.swat > .01) wp = mix(wp, add(wa, add(this.dirWorld(R * 1.4 + ll * .6, ll * .5, 0, this.yaw), [0, Math.sin(this.time * 30) * 2, 0])), clamp(p.swat, 0, 1));
        // A held, soft invitation has its own channel: no swat vibration.
        if (p.offerPaw > .01) wp = mix(wp, add(wa, this.dirWorld(R * .7, ll * .4, R * .32, this.yaw)), clamp(p.offerPaw, 0, 1));
      }
      if (leg.front && p.pawsUp > .01 && rear < .01) wp = mix(wp, add(wa, this.dirWorld(R * .6, ll * .9, s * 2, this.yaw)), clamp(p.pawsUp, 0, 1) * .8);
      // Jazz paws: when standing up, front paws wave out to the sides.
      if (leg.front && p.pawsUp > .01 && rear > .3) wp = mix(wp, add(wa, add(this.dirWorld(R * .5, -ll * .75 + Math.sin(this.time * 7.8 + s * 1.6) * 5, s * (R * 1.15 + 3), this.yaw), [0, 0, 0])), clamp(p.pawsUp * rear, 0, 1));
      if (leg.front) this.paws[s > 0 ? 0 : 1] = { w: wp, depth: this.depth(wp), planted: step.planted && p.leap < .01 && rear < .01 && dangle < .01 && p.overEdge < .01 && p.knead < .01 && p.groom < .01 && p.swat < .01 && p.offerPaw < .01 && p.pawsUp < .01 };
      const hidden = legVis < .05 && !(leg.front && (p.groom > .1 || p.swat > .1 || p.offerPaw > .1));
      const isHindSit = !leg.front && sitW > .5;
      parts.push({ depth: this.depth(wp) + (leg.front ? .5 : 0), draw: () => {
        if (hidden) { if (leg.front) drawPaw(this, ctx, wp, L, outline, ow, .85); return; }
        if (!isHindSit) drawLeg(this, ctx, wa, wp, L, outline, ow, legVis);
        drawPaw(this, ctx, wp, L, outline, ow, isHindSit ? 1.25 : 1);
      } });
    }

    // Tail.
    const tailRoot = W(sk.H[0] - R * .85, sk.H[1] + R * .2, 0);
    const tailPts = [tailRoot];
    let a = 0, b = 0;
    const segLen = L.tailLen / TAIL_SEGMENTS;
    for (let i = 0; i < TAIL_SEGMENTS; i++) {
      const s = this.tail[i]; a += s.a; b += s.b; if (i === 0) a = s.a;
      const local = [-Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b)];
      const dir = this.dirWorld(local[0], local[1] * Math.cos(pitch * .6) , local[2], this.yaw);
      tailPts.push(add(tailPts[i], mul(norm(dir), segLen)));
    }
    if (p.tailHang < .3) for (const pt of tailPts) if (pt[1] < 2 && dangle < .5) pt[1] = 2 + (pt[1] - 2) * .1;
    const tailDepth = this.depth(tailPts[4]);
    parts.push({ depth: tailDepth, draw: () => drawTail(this, ctx, tailPts, L, outline, ow) });

    // Body: chest, belly, hips (+ haunches when sitting).
    const bodyBalls = [{ c: H, r: sk.H[3], fill: L.fur }, { c: B, r: sk.B[3], fill: L.fur }, { c: C, r: sk.C[3], fill: L.fur }];
    // In-between spheres keep the silhouette smooth instead of three bumps.
    for (const t of [.25, .75]) {
      const a = t < .5 ? H : B, b = t < .5 ? B : C, ra = t < .5 ? sk.H[3] : sk.B[3], rb = t < .5 ? sk.B[3] : sk.C[3];
      bodyBalls.push({ c: mix(a, b, .5), r: (ra + rb) / 2 * 1.01, fill: L.fur });
    }
    if (sitW > .05) for (const s of [1, -1]) bodyBalls.push({ c: W(sk.H[0] + R * .25, sk.H[1] - R * .2, s * R * .55), r: R * .66 * sitW, fill: L.fur });
    const bodyDepth = this.depth(B);
    parts.push({ depth: bodyDepth, draw: () => {
      drawBalls(this, ctx, bodyBalls, outline, ow);
      bodyDecals(this, ctx, bodyBalls, { H, B, C }, L);
    } });

    // Collar.
    if (p.curl < .5) parts.push({ depth: bodyDepth + .2, draw: () => drawCollar(this, ctx, C, D, R, L, outline, ow) });

    // Head: ears, skull, cheeks, muzzle, then the face.
    const headDepth = this.depth(D) + (this.depth(D) > bodyDepth ? 0 : -.1) + dangle * 60;
    parts.push({ depth: headDepth, draw: () => drawHead(this, ctx, D, basis, L, outline, ow) });

    parts.sort((x, y) => x.depth - y.depth);
    for (const part of parts) part.draw();
    ctx.restore();

    this.headLift = (this.gy - this.screen(D)[1]) / k; this.headPos = this.screen(D);
    for (const paw of this.paws) if (paw) paw.s = this.screen(paw.w);
    // Hit areas and the anchor for speech bubbles.
    this.hit = [...bodyBalls, { c: D, r: hr * 1.05 }].map(ball => { const [x, y] = this.screen(ball.c); return { x, y, r: ball.r * k + 4 }; });
    const headTop = this.screen(add(D, [0, hr * 1.5, 0]));
    this.top = { x: headTop[0], y: headTop[1] };
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const c of this.hit) { left = Math.min(left, c.x - c.r); right = Math.max(right, c.x + c.r); top = Math.min(top, c.y - c.r); bottom = Math.max(bottom, c.y + c.r); }
    this.bounds = { left, top: Math.min(top, headTop[1] + 8), right, bottom: Math.max(bottom, this.gy) };
  }

  contains(x, y) { return this.hit.some(c => (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r); }
}

const mixArr = (a, b, t) => t <= 0 ? a : t >= 1 ? b.slice() : a.map((v, i) => lerp(v, b[i], t));

export function headBasis(yaw, pitch, roll) {
  let F = [1, 0, 0], U = [0, 1, 0], S = [0, 0, 1];
  const cr = Math.cos(roll), sr = Math.sin(roll);
  [U, S] = [add(mul(U, cr), mul(S, sr)), add(mul(U, -sr), mul(S, cr))];
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  [F, U] = [add(mul(F, cp), mul(U, sp)), add(mul(F, -sp), mul(U, cp))];
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const toW = v => [v[0] * cy - v[2] * sy, v[1], v[0] * sy + v[2] * cy];
  return [toW(F), toW(U), toW(S)];
}

function drawBalls(body, ctx, balls, outline, ow) {
  const k = body.k;
  const sorted = balls.map(b => ({ ...b, s: body.screen(b.c), d: body.depth(b.c) })).sort((a, b) => a.d - b.d);
  ctx.fillStyle = outline;
  for (const b of sorted) { ctx.beginPath(); ctx.arc(b.s[0], b.s[1], b.r * k + ow, 0, TAU); ctx.fill(); }
  for (const b of sorted) {
    ctx.fillStyle = b.fill; ctx.beginPath(); ctx.arc(b.s[0], b.s[1], b.r * k, 0, TAU); ctx.fill();
  }
  // One soft light over the whole silhouette, so the spheres read as one plump body without seams.
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const b of sorted) { const r = b.r * k; left = Math.min(left, b.s[0] - r); right = Math.max(right, b.s[0] + r); top = Math.min(top, b.s[1] - r); bottom = Math.max(bottom, b.s[1] + r); }
  ctx.save(); clipBalls(body, ctx, balls);
  const w = right - left, h = bottom - top, cx = left + w * .4, cy = top + h * .3;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .7);
  g.addColorStop(0, `rgba(255,255,255,${body.L.tuxedo ? .1 : .24})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(left, top, w, h); ctx.restore();
  return sorted;
}

function clipBalls(body, ctx, balls) {
  ctx.beginPath();
  for (const b of balls) { const s = body.screen(b.c); ctx.moveTo(s[0] + b.r * body.k, s[1]); ctx.arc(s[0], s[1], b.r * body.k, 0, TAU); }
  ctx.clip();
}

// Map a flat drawing onto a sphere surface point: x along t1, y along -t2 (screen down).
function decal(body, ctx, point, t1, t2) {
  const k = body.k, s = body.screen(point), a = project2(t1), b = project2(t2);
  ctx.transform(k * a[0], k * a[1], -k * b[0], -k * b[1], s[0], s[1]);
}
function surface(center, r, F, U, S, az, el) {
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  const n = add(add(mul(F, ce * ca), mul(S, ce * sa)), mul(U, se));
  const t1 = norm(add(mul(F, -sa), mul(S, ca)));
  const t2 = norm(add(add(mul(F, -se * ca), mul(S, -se * sa)), mul(U, ce)));
  return { p: add(center, mul(n, r)), n, t1, t2 };
}

function bodyDecals(body, ctx, balls, { H, B, C }, L) {
  const fwd = body.dirWorld(1, 0, 0, body.yaw), up = [0, 1, 0], side = body.dirWorld(0, 0, 1, body.yaw);
  ctx.save(); clipBalls(body, ctx, balls);
  // A soft lighter belly / chest bib facing forward.
  const chest = surface(C, balls[2].r, fwd, up, side, 0, -.15), vis = visibility(chest.n);
  if (vis > -.2) {
    ctx.save(); decal(body, ctx, chest.p, chest.t1, chest.t2); ctx.globalAlpha *= clamp((vis + .2) * 2.5, 0, 1);
    ctx.fillStyle = L.belly; ctx.beginPath(); ctx.ellipse(0, L.tuxedo ? 4 : 3, L.bodyR * (L.tuxedo ? .62 : .5), L.bodyR * (L.tuxedo ? .95 : .7), 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  // Shading on the underside so the body reads as round.
  ctx.fillStyle = L.shade; ctx.globalAlpha *= .55;
  const lowest = Math.min(...balls.slice(0, 3).map(b => b.c[1]));
  for (const ball of balls.slice(0, 3)) { if (ball.c[1] > lowest + L.bodyR * .35) continue; const s = body.screen(ball.c); ctx.beginPath(); ctx.ellipse(s[0], s[1] + ball.r * body.k * 1.05, ball.r * body.k * 1.1, ball.r * body.k * .55, 0, 0, TAU); ctx.fill(); }
  ctx.globalAlpha /= .55;
  if (L.stripe) {
    // Tabby stripes wrap around the back from spine toward belly.
    ctx.strokeStyle = L.stripe; ctx.lineCap = 'round';
    const bands = [[H, balls[0].r, [-.5, .1]], [B, balls[1].r, [-.2, .35]], [C, balls[2].r, [.15]]];
    for (const [center, r, azs] of bands) for (const az0 of azs) for (const s of [1, -1]) {
      const st = surface(center, r, fwd, up, side, az0, .9);
      const sideVec = mul(side, s);
      const dirP = surface(center, r, fwd, up, sideVec, Math.PI / 2, .55 + az0 * .2);
      if (visibility(norm(add(st.n, dirP.n))) < -.1) continue;
      const a = body.screen(st.p), m = body.screen(dirP.p), e = body.screen(surface(center, r, fwd, up, sideVec, Math.PI / 2, .05).p);
      ctx.lineWidth = body.k * 3.2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1], (m[0] + e[0]) / 2, (m[1] + e[1]) / 2); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLeg(body, ctx, wa, wp, L, outline, ow, vis) {
  const a = body.screen(wa), p = body.screen(wp), w = L.legW * body.k * (.6 + .4 * vis);
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline; ctx.lineWidth = w + ow * 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
  ctx.strokeStyle = L.fur; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
}
function drawPaw(body, ctx, wp, L, outline, ow, scale) {
  const p = body.screen(wp), r = L.legW * .62 * body.k * scale;
  ctx.fillStyle = outline; ctx.beginPath(); ctx.ellipse(p[0], p[1], r * 1.25 + ow, r + ow, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = L.tuxedo ? L.belly : L.fur; ctx.beginPath(); ctx.ellipse(p[0], p[1], r * 1.25, r, 0, 0, TAU); ctx.fill();
}

function drawTail(body, ctx, pts, L, outline, ow) {
  const s = pts.map(p => body.screen(p)), k = body.k, puff = 1 + body.pose.tailPuff * 1.3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (let i = 0; i < s.length - 1; i++) {
      const f = i / (s.length - 1), w = L.tailW * k * puff * (1 - f * .35) * (L.fluffy ? 1.1 + Math.sin(f * 3) * .15 : 1);
      ctx.strokeStyle = pass ? (L.tuxedo && i >= s.length - 3 ? L.belly : L.stripe && i % 3 === 2 ? L.stripe : L.fur) : outline;
      ctx.lineWidth = pass ? w : w + ow * 2;
      ctx.beginPath(); ctx.moveTo(s[i][0], s[i][1]); ctx.lineTo(s[i + 1][0], s[i + 1][1]); ctx.stroke();
    }
  }
}

function drawCollar(body, ctx, C, D, R, L, outline, ow) {
  const axis = norm(add(D, mul(C, -1))), Q = mix(C, D, .36), rad = R * .62;
  const e1 = norm(Math.abs(axis[1]) < .9 ? [axis[2], 0, -axis[0]] : [1, 0, 0]);
  const e2 = norm([axis[1] * e1[2] - axis[2] * e1[1], axis[2] * e1[0] - axis[0] * e1[2], axis[0] * e1[1] - axis[1] * e1[0]]);
  ctx.lineCap = 'round'; ctx.strokeStyle = L.collar; ctx.lineWidth = 4 * body.k;
  let open = false; ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const t = i / 24 * TAU, n = add(mul(e1, Math.cos(t)), mul(e2, Math.sin(t)));
    if (visibility(n) < .05) { open = false; continue; }
    const s = body.screen(add(Q, mul(n, rad)));
    if (open) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); open = true;
  }
  ctx.stroke();
  const fwd = body.dirWorld(1, 0, 0, body.yaw), front = norm(add(fwd, mul(axis, -dot(fwd, axis))));
  if (visibility(front) > .1) {
    const s = body.screen(add(Q, mul(front, rad + 2.5)));
    ctx.fillStyle = outline; ctx.beginPath(); ctx.arc(s[0], s[1] + 3 * body.k, 4.4 * body.k + ow * .6, 0, TAU); ctx.fill();
    ctx.fillStyle = L.tag; ctx.beginPath(); ctx.arc(s[0], s[1] + 3 * body.k, 4.4 * body.k, 0, TAU); ctx.fill();
  }
}

function drawHead(body, ctx, D, [F, U, S], L, outline, ow) {
  const p = body.pose, r = L.headR, k = body.k;
  // Ears first so the skull covers their base.
  // Ears are drawn as cards whose base always has screen width, so they read from every angle.
  const ears = [1, -1].map(side => {
    const back = clamp(p.earsBack, 0, 1);
    const at = surface(D, r * .92, F, U, S, side * (.66 + back * .55), .72 - back * .3);
    const up = norm(add(add(mul(at.n, .4), mul(U, 1 - back * .5)), mul(F, -.3 - back * .3)));
    const tip = add(at.p, mul(up, r * 1.02 * L.earSize * (1 - back * .3)));
    return { tip, base: at.p, front: norm(add(mul(F, .85), mul(at.n, .35))) };
  });
  ctx.lineJoin = 'round';
  const earPath = (e, inset = 0) => {
    const b = body.screen(e.base), t = body.screen(e.tip), dx = t[0] - b[0], dy = t[1] - b[1], len = Math.hypot(dx, dy) || 1;
    const w = r * .42 * L.earSize * k, nx = -dy / len * w, ny = dx / len * w;
    let pts = [[b[0] + nx, b[1] + ny], t, [b[0] - nx, b[1] - ny]];
    if (inset) { const c = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3]; pts = pts.map(q => [lerp(q[0], c[0], inset), lerp(q[1], c[1], inset)]); pts[0][1] += inset * 4 * k; pts[2][1] += inset * 4 * k; }
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.quadraticCurveTo((pts[0][0] + pts[1][0]) / 2 - nx * .15, (pts[0][1] + pts[1][1]) / 2 - ny * .15, pts[1][0], pts[1][1]);
    ctx.quadraticCurveTo((pts[1][0] + pts[2][0]) / 2 + nx * .15, (pts[1][1] + pts[2][1]) / 2 + ny * .15, pts[2][0], pts[2][1]); ctx.closePath();
  };
  for (const e of ears) {
    earPath(e); ctx.strokeStyle = outline; ctx.lineWidth = ow * 2; ctx.stroke(); ctx.fillStyle = L.fur; ctx.fill();
    const v = visibility(e.front);
    if (v > -.05) {
      ctx.save(); ctx.globalAlpha *= clamp((v + .05) * 4, 0, 1); earPath(e, .38); ctx.fillStyle = L.ear; ctx.fill();
      // A little tuft of fur inside the ear.
      const b = body.screen(e.base), t = body.screen(e.tip);
      ctx.strokeStyle = L.light; ctx.lineWidth = 1.5 * k; ctx.lineCap = 'round'; ctx.beginPath();
      for (const off of [-.18, .18]) { ctx.moveTo(lerp(b[0], t[0], .1) + off * r * k * .5, lerp(b[1], t[1], .1)); ctx.lineTo(lerp(b[0], t[0], .48) + off * r * k * .15, lerp(b[1], t[1], .48)); }
      ctx.stroke(); ctx.restore();
    }
  }
  // Cheek fluff: spiky tufts that widen the face from any angle.
  const hs0 = body.screen(D), rr = r * k, puff = L.cheeks;
  for (const sgn of [1, -1]) {
    const spikes = [[-.5, .9], [-.3, 1.17], [-.16, .98], [.02, 1.24], [.17, .98], [.33, 1.13], [.52, .88]];
    ctx.beginPath();
    spikes.forEach(([da, rad], i) => {
      const a = sgn > 0 ? .4 + da : Math.PI - .4 - da, q = rad > 1 ? 1 + (rad - 1) * puff : rad;
      const x = hs0[0] + Math.cos(a) * rr * q, y = hs0[1] + Math.sin(a) * rr * q;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath(); ctx.lineJoin = 'round'; ctx.strokeStyle = outline; ctx.lineWidth = ow * 2; ctx.stroke(); ctx.fillStyle = L.fur; ctx.fill();
  }
  const ballDepth = b => body.depth(b.c);
  const balls = [
    { c: D, r, fill: L.fur },
    { c: add(add(D, mul(S, r * .5)), add(mul(U, -r * .3), mul(F, r * .05))), r: r * .55 * L.cheeks, fill: L.fur },
    { c: add(add(D, mul(S, -r * .5)), add(mul(U, -r * .3), mul(F, r * .05))), r: r * .55 * L.cheeks, fill: L.fur },
  ];
  const muzzle = { c: add(add(D, mul(F, r * .74)), mul(U, -r * .3)), r: r * .4, fill: L.belly };
  balls.push(muzzle);
  // Skull: outline pass for all balls, then fills nearest last.
  const sorted = balls.map(b => ({ ...b, s: body.screen(b.c), d: ballDepth(b) })).sort((a, b) => a.d - b.d);
  ctx.fillStyle = outline;
  for (const b of sorted) { ctx.beginPath(); ctx.arc(b.s[0], b.s[1], b.r * k + ow, 0, TAU); ctx.fill(); }
  for (const b of sorted) { ctx.fillStyle = b.fill; ctx.beginPath(); ctx.arc(b.s[0], b.s[1], b.r * k, 0, TAU); ctx.fill(); }
  ctx.save(); clipBalls(body, ctx, balls);
  // Soft light on the forehead.
  const lg = ctx.createRadialGradient(hs0[0] - rr * .35, hs0[1] - rr * .5, 0, hs0[0] - rr * .35, hs0[1] - rr * .5, rr * 1.25);
  lg.addColorStop(0, `rgba(255,255,255,${L.tuxedo ? .13 : .3})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(hs0[0] - rr * 1.6, hs0[1] - rr * 1.6, rr * 3.2, rr * 3.2);
  // Under-chin shade.
  const hs = body.screen(D); ctx.fillStyle = L.shade; ctx.globalAlpha *= L.tuxedo ? .2 : .4;
  ctx.beginPath(); ctx.ellipse(hs[0], hs[1] + r * k * 1.25, r * k * 1.3, r * k * .42, 0, 0, TAU); ctx.fill(); ctx.globalAlpha /= L.tuxedo ? .2 : .4;
  // Forehead tabby "M" (visible from the front and the back of the head).
  if (L.stripe) {
    for (const el of [.55, 1.05]) {
      const m = surface(D, r, F, U, S, el > 1 ? Math.PI : 0, el > 1 ? .6 : el);
      if (visibility(m.n) < 0) continue;
      ctx.save(); decal(body, ctx, m.p, m.t1, m.t2); ctx.strokeStyle = L.stripe; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); for (const x of [-6, 0, 6]) { ctx.moveTo(x, -5); ctx.lineTo(x * .8, 2); } ctx.stroke(); ctx.restore();
    }
  }
  drawFace(body, ctx, D, [F, U, S], L, muzzle);
  ctx.restore();
  // Whiskers reach past the head outline.
  for (const side of [1, -1]) {
    const w = surface(muzzle.c, muzzle.r, F, U, S, side * .9, .05);
    const vis = visibility(w.n); if (vis < -.15) continue;
    ctx.save(); decal(body, ctx, w.p, w.t1, w.t2); ctx.globalAlpha *= clamp((vis + .15) * 3, 0, .75);
    ctx.strokeStyle = L.tuxedo ? '#EDE6F2' : '#7A6378'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    ctx.beginPath(); for (const dy of [-2.2, 1, 4]) { ctx.moveTo(side * 1, dy * .5); ctx.lineTo(side * 15, dy * 1.2 - 1); } ctx.stroke(); ctx.restore();
  }
}

function drawFace(body, ctx, D, [F, U, S], L, muzzle) {
  const p = body.pose, r = L.headR, face = body.face, ink = '#2B2030';
  const open = clamp(p.eyes * (1 - body.blink), 0, 1);
  for (const side of [1, -1]) {
    const e = surface(D, r, F, U, S, side * .5, .1), vis = visibility(e.n);
    if (vis < -.05) continue;
    ctx.save(); decal(body, ctx, e.p, e.t1, e.t2); ctx.globalAlpha *= clamp((vis + .05) * 5, 0, 1);
    const es = 5.3 * L.eyeSize * (r / 20);
    // Pupils follow the look target (approximated on screen).
    let gx = 0, gy = 0;
    if (body.look && typeof body.look === 'object' && !body.look.behind) {
      const s = body.screen(e.p), tx = body.look.x ?? s[0], ty = body.look.y ?? s[1];
      gx = clamp((tx - s[0]) / 220, -1, 1) * es * .3; gy = clamp((ty - s[1]) / 220, -1, 1) * es * .25;
      // Undo the decal's orientation roughly: flip x if the decal is mirrored on screen.
      if (project2(e.t1)[0] < 0) gx = -gx;
    } else if (body.look === 'viewer') { gx = 0; gy = 0; }
    const mood = face;
    if (mood === 'happy' || mood === 'love') {
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-es, 1.5); ctx.quadraticCurveTo(0, -es * 1.1, es, 1.5); ctx.stroke();
    } else if (mood === 'sleep' || open < .12) {
      ctx.strokeStyle = ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-es, 0); ctx.quadraticCurveTo(0, es * .7, es, 0); ctx.stroke();
    } else {
      const wide = mood === 'wide', ry = es * 1.18 * open * (wide ? 1.12 : 1), rx = es * (wide ? 1.1 : 1);
      ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(0, 0, rx + .9, ry + .9, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = wide ? '#FFFDF7' : L.iris; ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
      if (!wide) { ctx.fillStyle = tint(L.iris, -.35); ctx.globalAlpha *= .55; ctx.beginPath(); ctx.ellipse(0, -ry * .95, rx * 1.3, ry * .75, 0, 0, TAU); ctx.fill(); ctx.globalAlpha /= .55; }
      const pupil = wide ? .28 : clamp(p.pupil, .25, 1.3);
      ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(gx, gy, es * .62 * pupil + .5, es * 1.02, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(gx - es * .3, gy - es * .45, es * .38, 0, TAU); ctx.arc(gx + es * .38, gy + es * .42, es * .17, 0, TAU); ctx.fill();
      // Eye openness already shapes the oval. A second heavy, straight lid
      // made a relaxed Bean look cross; reserve it for deliberate expressions.
      const lid = Math.max(L.lidded || 0, mood === 'grumpy' ? .45 : 0, mood === 'focus' ? .2 : 0);
      if (lid > .02) { ctx.fillStyle = L.fur; ctx.fillRect(-rx - 2, -ry - 2, rx * 2 + 4, ry * 2 * lid + 2); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-rx, -ry + ry * 2 * lid); ctx.lineTo(rx, -ry + ry * 2 * lid - (mood === 'grumpy' ? side * 1.2 : 0)); ctx.stroke(); }
      ctx.restore();
      // Lash line along the top of the eye, flicked out at the outer corner.
      if (lid < .3) {
        ctx.strokeStyle = ink; ctx.lineWidth = 2.3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(0, 0, rx + .8, ry + .8, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        const corner = Math.PI * (side > 0 ? 1.9 : 1.1);
        ctx.beginPath(); ctx.moveTo(Math.cos(corner) * (rx + .8), Math.sin(corner) * (ry + .8)); ctx.lineTo(side * (rx + 3.4), -ry * .75 - 1.8); ctx.stroke();
      }
      // Brows only when they say something.
      if (mood === 'grumpy') { ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-side * es * 1.1, -es * 1.35); ctx.lineTo(side * es * 1.05, -es * 1.95); ctx.stroke(); }
      else if (wide) { ctx.strokeStyle = ink; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, -es * 1.35, es * .9, es * .5, 0, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); }
    }
    // Blush: always a little, more when happy.
    ctx.fillStyle = '#F29BB0'; ctx.globalAlpha *= (mood === 'love' || mood === 'happy' || body.blush) ? .6 : .28;
    ctx.beginPath(); ctx.ellipse(side * es * .5, es * 1.75, es * .9, es * .45, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // Nose and mouth on the muzzle.
  const front = surface(muzzle.c, muzzle.r, F, U, S, 0, .35), vis = visibility(front.n);
  if (vis > -.1) {
    ctx.save(); decal(body, ctx, front.p, front.t1, front.t2); ctx.globalAlpha *= clamp((vis + .1) * 4, 0, 1);
    ctx.fillStyle = L.nose; ctx.beginPath(); ctx.moveTo(-3.2, -1.5); ctx.quadraticCurveTo(0, -3, 3.2, -1.5); ctx.quadraticCurveTo(1, 2.2, 0, 2.4); ctx.quadraticCurveTo(-1, 2.2, -3.2, -1.5); ctx.fill();
    const m = clamp(p.mouth, 0, 1);
    if (m > .08) {
      ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(0, 6 + m * 2, 3 + m * 2.5, 1 + m * 4.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#EE8FA2'; ctx.beginPath(); ctx.ellipse(0, 7.5 + m * 4, 2.2 + m * 1.6, 1 + m * 1.8, 0, 0, TAU); ctx.fill();
    } else {
      ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
      ctx.moveTo(0, 2.4); ctx.lineTo(0, 4); ctx.moveTo(-4.5, 3.6); ctx.quadraticCurveTo(-2.2, 6.4, 0, 4); ctx.quadraticCurveTo(2.2, 6.4, 4.5, 3.6); ctx.stroke();
      if (body.face === 'groom' || p.groom > .4) { ctx.fillStyle = '#EE8FA2'; ctx.beginPath(); ctx.ellipse(0, 6.5, 2, 2.4 + Math.sin(body.time * 18) * 1, 0, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }
}
