// Acrobatic acting shared by world choreography: the wind-up before a big jump
// and tricks layered over a flight. Body-level only, like handling.js, so these
// moves stay independent of page geometry and can be studied on a bare rig.
import { TILT } from './body.js';

const TAU = Math.PI * 2, CT = Math.cos(TILT);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = t => { const s = clamp(t, 0, 1); return s * s * (3 - 2 * s); };

// Seconds Bean spends sizing up a jump. Hops get none; the closer a jump is to
// his limit (430 across, 330 up at scale 1), the longer he measures and wiggles.
export function windUpTime(span, rise, scale = 1, { agile = false, reduced = false } = {}) {
  if (reduced) return 0;
  const effort = Math.max(Math.abs(span) / (430 * scale), Math.max(0, rise) / (330 * scale));
  if (effort < .45) return 0;
  return clamp((effort - .45) * 2.2, .35, 1.2) * (agile ? .4 : 1);
}

// Jump arc (rig units) that lifts the body by height screen pixels at scale k.
export const arcFor = (height, k) => Math.max(0, height) / (Math.max(.05, k) * CT);

// Crouch facing the target, head bobbing as he judges the distance, then the
// rear-end wiggle that loads the spring. Ends crouched, ready to launch.
export function* windUp(body, target, seconds, { reduced = false } = {}) {
  body.stop(); body.faceYaw(target.x >= body.x ? 0 : Math.PI);
  body.look = { x: target.x, y: target.y };
  body.reset({ crouch: 1, tailUp: -.1, tailWag: .45, pupil: 1.2 }); body.face = 'focus';
  try {
    let t = 0;
    while (t < seconds) {
      t += yield;
      const late = t > seconds * .45;
      body.goal.headPitch = late ? 0 : Math.sin(t * 8) * .1;
      body.goal.wiggle = late && !reduced ? 1 : 0;
      body.goal.tailWag = late ? .9 : .45;
    }
  } finally { body.set({ wiggle: 0, headPitch: 0, tailWag: .3 }); }
}

// A trick layered over a flight already started with body.leap(). Call the
// returned step once per frame while the body is airborne.
// twist: whole turns around the vertical axis (signed), reading as a corkscrew.
// swipe: a paw lashes out near the top of the arc. reach: the body stretches up.
export function flightTrick(body, { twist = 0, swipe = false, reach = false } = {}) {
  const yaw0 = body.yaw;
  if (twist) body.turnTo = null;
  return () => {
    const s = body.flight.progress;
    if (twist) body.yaw = yaw0 + twist * TAU * smooth((s - .12) / .62);
    if (swipe) body.goal.swat = s > .32 && s < .72 ? 1 : 0;
    if (reach) body.goal.rear = s < .6 ? .85 : 0;
  };
}
