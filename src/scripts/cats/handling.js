// Shared pickup acting: used by world choreography and independent rig studies.
// The paw and head gesture happens before a dodge, so refusal reads as a choice.
function* hold(seconds) { let time = 0; while (time < seconds) time += yield; }

export function* refusePickup(body, { quiet = false } = {}) {
  body.stop(); body.look = null; body.face = 'open'; body.faceYaw(Math.PI / 2);
  body.reset({ sit: .55, recoil: .85, offerPaw: 1, earsBack: .55, tailUp: .25,
    tailWag: quiet ? .12 : .7, eyes: .83, headPitch: .06 });
  try {
    if (quiet) { body.set({ headRoll: -.12 }); yield* hold(.75); }
    else {
      body.set({ headYaw: -.6 }); yield* hold(.25);
      body.set({ headYaw: .6 }); yield* hold(.3);
      body.set({ headYaw: -.45 }); yield* hold(.25);
      body.set({ headYaw: 0 }); yield* hold(.2);
    }
  } finally {
    body.set({ recoil: 0, offerPaw: 0, headYaw: 0, headPitch: 0, headRoll: 0, earsBack: 0, tailWag: .12 });
  }
}
