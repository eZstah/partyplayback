// Pure motion primitives: independent of the DOM, frame rate and input device.
export const REST = Object.freeze({ lift: 0, turn: 0, sx: 1, sy: 1, headX: 0, headY: 0, head: 0, leftArm: 0, rightArm: 0, leftEar: 0, rightEar: 0, tail: 0, leftFoot: 0, rightFoot: 0 });
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// Analytic critically damped spring. Interrupted actions retain their velocity.
export function spring(state, target, dt, frequency = 14) {
  const t = Math.max(0, dt), delta = state.value - target;
  const impulse = state.velocity + frequency * delta;
  const decay = Math.exp(-frequency * t);
  return { value: target + (delta + impulse * t) * decay, velocity: (state.velocity - frequency * impulse * t) * decay };
}

export function samplePose(frames, progress) {
  const p = clamp(progress, 0, 1);
  let a = frames[0], b = frames.at(-1);
  for (let i = 1; i < frames.length; i++) if (p <= frames[i].at) { a = frames[i - 1]; b = frames[i]; break; }
  const t = clamp((p - a.at) / (b.at - a.at || 1), 0, 1);
  const ease = t * t * (3 - 2 * t);
  return Object.fromEntries(Object.entries(REST).map(([key, rest]) => [key, (a.pose[key] ?? rest) + ((b.pose[key] ?? rest) - (a.pose[key] ?? rest)) * ease]));
}

export class ActionTrack {
  constructor() { this.current = null; this.sequence = 0; this.cooldowns = new Map(); }
  start(name, now, { priority = 30, duration = 1600, cooldown = 0, force = false, hold = false } = {}) {
    const active = this.current;
    if (active && (active.hold || now < active.until)) {
      if (priority < active.priority || (name === active.name && !force)) return null;
    }
    if (!force && now < (this.cooldowns.get(name) || 0)) return null;
    this.cooldowns.set(name, now + cooldown);
    return this.current = { name, priority, duration, start: now, until: now + duration, id: ++this.sequence, hold };
  }
  finish(id) { if (this.current?.id !== id) return false; this.current = null; return true; }
  clear() { this.current = null; this.sequence++; }
}

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const overlapArea = (a, b) => overlaps(a, b) ? (Math.min(a.right, b.right) - Math.max(a.left, b.left)) * (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
// Sweep a rectangle along the entire route so a cat cannot cross a control to
// reach an otherwise valid endpoint. Every move, including dragging, uses this.
export function safeTravel(origin, from, desired, bounds, obstacles = []) {
  const target = { x: clamp(desired.x, bounds.minX, bounds.maxX), y: clamp(desired.y, bounds.minY, bounds.maxY) };
  const distance = Math.hypot(target.x - from.x, target.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 4));
  let result = { ...from };
  const rectangle = (x, y) => ({ left: origin.left + x, right: origin.right + x, top: origin.top + y, bottom: origin.bottom + y });
  // Permit escape from a pre-existing layout overlap, never deeper penetration.
  let previousAreas = obstacles.map(b => overlapArea(rectangle(from.x, from.y), b));
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (target.x - from.x) * i / steps, y = from.y + (target.y - from.y) * i / steps;
    const areas = obstacles.map(b => overlapArea(rectangle(x, y), b));
    if (areas.some((area, j) => area > previousAreas[j] + .001)) break;
    previousAreas = areas;
    result = { x, y };
  }
  return result;
}
