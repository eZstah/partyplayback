# Bean project

One cozy black cat, developed as a continuing character engine inside youple.tv.

The current release candidate is **1.0.0-rc.2**. Bean can chain reachable surfaces
after a butterfly or when evading a grab, roll in flight, catch an edge, pull up
and hide. Drag gently to pick him up; release while moving to toss, or hold still
before releasing to place him. Mood, trust and recent handling determine whether
he accepts a pickup. Drops use gravity, paw reach and landing absorption.
Refusal raises a paw and shakes his head before he dodges, with a short response
to the attempted grab. Gentle drag gestures are forgiving; the grabbing cursor
appears only once he is actually held.

Right-click Bean (or use the small paw button) and choose
**Come say hi** to see the notice → approach → sniff → paw → slow blink → settle
sequence. Hold a cursor near Bean over empty space for a quieter invitation.
The compact menu also has treats, laser and sleep/wake; Aquarium has its own
button. The old profile, diary and home playbar are removed.

Playing video now means quiet company: Bean rests where he is or stays offscreen.
Butterflies, ambient speech and decorative events stop; music titles and passing
cursors cannot start antics. Fresh, explicit interactions still work, then he
settles again. Pausing restores normal idle behavior without a queued butterfly.
Full-page visual and performance checks remain outstanding as recorded in the
handoff. The user authorized publishing this checkpoint on 2026-10-03.

Start with [the vision](VISION.md), then [the architecture](ARCHITECTURE.md).
[The roadmap](ROADMAP.md) describes the larger direction; [the handoff](HANDOFF.md)
records the latest checkpoint, evidence and concrete next tasks. Update that
handoff when an increment is finished so the next agent continues this project.

The engine is currently local to this repository. There is no separate package,
external service, scheduled worker or automatic cross-agent handoff.
