// Choreography is data. Add a clip here; the rig handles blending, interruptions,
// recovery, reduced motion and returning to the current interface state.
const f = (at, pose = {}) => ({ at, pose });
const clip = (mood, duration, ...frames) => ({ mood, duration, frames });
export const CAT_MOVES = {
  greet: clip('happy', 1900, f(0), f(.2, { head: -8, rightArm: -130, tail: 18 }), f(.38, { head: -5, rightArm: -85, tail: -12 }), f(.56, { rightArm: -130, tail: 18 }), f(.75, { rightArm: -85 }), f(1)),
  pet: clip('happy', 2100, f(0), f(.25, { head: -13, headY: 6, leftEar: -12, rightEar: 12, sy: .97, tail: 24 }), f(.55, { head: 10, headY: 5, tail: -12, leftArm: -14, rightArm: 14 }), f(.8, { head: -7, tail: 20 }), f(1)),
  groom: clip('playing', 2600, f(0), f(.18, { leftArm: 135, head: -15, headY: 7, tail: 10 }), f(.35, { leftArm: 112, head: -20, headY: 9, leftEar: -10 }), f(.48, { leftArm: 143, head: -9 }), f(.64, { leftArm: 112, head: -20, headY: 9 }), f(.82, { leftArm: 135, head: -9 }), f(1)),
  stretch: clip('sleepy', 2600, f(0), f(.2, { sy: .92, sx: 1.06, headY: 5, leftArm: 24, rightArm: -24 }), f(.55, { sy: 1.1, sx: .95, headY: -8, leftArm: 160, rightArm: -160, tail: -22, leftEar: -9, rightEar: 9 }), f(.78, { sy: 1.07, head: 12, leftArm: 140, rightArm: -150, tail: 15 }), f(1)),
  dance: clip('happy', 2800, f(0), ...Array.from({ length: 7 }, (_, i) => f((i + 1) / 9, { turn: i % 2 ? -9 : 9, lift: i % 2 ? -5 : 0, head: i % 2 ? 13 : -13, leftArm: i % 2 ? 100 : -25, rightArm: i % 2 ? 25 : -100, tail: i % 2 ? -25 : 25, leftFoot: i % 2 ? -20 : 10, rightFoot: i % 2 ? -10 : 20 })), f(1)),
  pounce: clip('eager', 1200, f(0), f(.2, { sy: .82, sx: 1.12, headY: 10, leftArm: -30, rightArm: 30 }), f(.46, { lift: -29, sy: 1.07, sx: .97, leftArm: 90, rightArm: -90, tail: -22 }), f(.72, { sy: .87, sx: 1.08, headY: 5, leftFoot: -18, rightFoot: 18 }), f(1)),
  reach: clip('eager', 1700, f(0), f(.3, { turn: 7, head: -9, headX: 3, rightArm: -105, leftArm: 14, tail: -18 }), f(.65, { turn: 8, head: -6, rightArm: -120, leftArm: 14, tail: -8 }), f(1)),
  startle: clip('surprised', 1300, f(0), f(.16, { lift: -13, sy: 1.06, headY: -5, leftArm: 120, rightArm: -120, leftEar: -14, rightEar: 14, tail: -32 }), f(.45, { turn: -7, head: 12, leftArm: 70, rightArm: -70, tail: 24 }), f(.7, { turn: 4, head: -8 }), f(1)),
  dizzy: clip('dizzy', 2200, f(0), f(.2, { turn: -12, head: 20, leftArm: 60, rightArm: -10, tail: -20 }), f(.4, { turn: 12, head: -20, leftArm: 10, rightArm: -60, tail: 20 }), f(.6, { turn: -8, head: 15, leftArm: 40, tail: -15 }), f(.8, { turn: 5, head: -8 }), f(1)),
  snack: clip('snack', 2800, f(0), f(.2, { leftArm: -28, rightArm: 28, headY: 3 }), f(.38, { leftArm: -28, rightArm: 28, headY: 6, head: -6 }), f(.55, { leftArm: -28, rightArm: 28, headY: 2, head: 6 }), f(.72, { leftArm: -28, rightArm: 28, headY: 6, head: -4, tail: 16 }), f(1)),
  toss: clip('snack', 1500, f(0), f(.3, { turn: -8, head: 10, rightArm: -160, leftArm: -20, tail: 20 }), f(.52, { turn: 10, head: -8, rightArm: -65, tail: -15 }), f(.72, { rightArm: -85, head: -5 }), f(1)),
  catch: clip('happy', 1800, f(0), f(.25, { lift: -8, headY: -5, leftArm: 125, rightArm: -125, tail: 15 }), f(.5, { sy: .92, headY: 6, leftArm: -30, rightArm: 30 }), f(.7, { head: -9, leftArm: -25, rightArm: 25 }), f(1)),
  sulk: clip('annoyed', 2300, f(0), f(.3, { head: -14, headY: 6, sy: .96, leftArm: -35, rightArm: 35, leftEar: -20, rightEar: 20, tail: -22 }), f(.75, { head: -10, headY: 5, leftArm: -30, rightArm: 30, tail: 12 }), f(1)),
  sleep: clip('sleepy', 3000, f(0), f(.6, { sy: .86, sx: 1.07, headY: 22, head: 15, leftArm: -35, rightArm: 35, tail: -28, leftEar: -9, rightEar: 9 }), f(1, { sy: .86, sx: 1.07, headY: 22, head: 15, leftArm: -35, rightArm: 35, tail: -28 })),
  carry: clip('surprised', 600, f(0, { lift: -8, head: -8, leftArm: 35, rightArm: -35, leftFoot: -24, rightFoot: 24, tail: -20 }), f(1, { lift: -8, head: 8, leftArm: 20, rightArm: -20, leftFoot: -24, rightFoot: 24, tail: 15 })),
  land: clip('happy', 900, f(0, { lift: -8, sy: 1.03, leftFoot: -20, rightFoot: 20 }), f(.28, { sy: .82, sx: 1.12, headY: 9, leftArm: -30, rightArm: 30, tail: 22 }), f(.6, { sy: 1.03, headY: -2 }), f(1)),
  flex: clip('eager', 2600, f(0), f(.2, { sy: 1.07, headY: -5, leftArm: 130, rightArm: -130, tail: 22 }), f(.5, { sy: 1.06, head: -13, leftArm: 105, rightArm: -145 }), f(.76, { head: 13, leftArm: 145, rightArm: -105, tail: -20 }), f(1)),
  swat: clip('eager', 1100, f(0), f(.23, { turn: -12, head: 14, rightArm: -165, tail: 26 }), f(.43, { turn: 16, head: -12, rightArm: 20, lift: -9, leftFoot: -15 }), f(.66, { turn: -7, head: 5, rightArm: -110, tail: -25 }), f(1)),
  tiptoe: clip('playing', 2800, f(0), f(.2, { sy: .9, headY: 8, leftArm: 40, rightArm: -40, tail: 30, head: 12 }), f(.45, { sy: .93, headY: 6, leftFoot: -24, rightFoot: 18, leftArm: 60, head: -10 }), f(.7, { sy: .9, headY: 8, rightFoot: 24, leftFoot: -18, rightArm: -60, tail: 15 }), f(1)),
};
