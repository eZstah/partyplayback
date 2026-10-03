# Current handoff — 2026-10-03

## User direction and boundary

One exceptional, cozy black mascot developed as a continuing character engine.
Keep the plain logo and synchronized video functionality. The user explicitly
wants actual working improvements, with focused agent help, not just planning.
The implementation is complete as a release candidate. The latest instruction
authorizes committing this checkpoint and pushing it to `main` on GitHub.

Repository: `partyplayback`, branch `main`. Commit and push are authorized for
this checkpoint; **production deployment has not been requested**. Include the
previously requested 5–50 activity-counter edit. Keep the unused
`public/meme-cats/` reference assets local.
No external chats, scheduled jobs or messages were created.

## Delivered: 1.0.0-rc.1, local candidate

- One active Bean, plain wordmark and static black mobile fallback.
- Existing engine facade, single owned frame loop, seeded RNG, simulated-time
  effects, hidden-tab suspension, disposal and detached snapshots preserved.
- Visible motion pass: chest-led breathing with head lag, acceleration/braking
  and turning weight transfer, distance-based planted walking phases, slower
  rest transitions, affectionate slow blinks and softer resting eyes.
- A dedicated `offerPaw` rig channel for a soft held greeting.
- **Bean → Come say hi**, also exposed as facade `greet()`: notice, approach one
  destination, sniff, offer paw, slow blink, knead briefly, loaf, keep company.
  Phases appear in the panel and snapshot. Repeat invitations do not restart it.
- Stationary nearby cursor curiosity requires a fresh pause outside controls.
  Passing pointers and time spent hovering controls do not count as invitation.
- Softer petting reactions with input cooldowns; gentle first/return greetings.
- Cozy behavior director with explicit action cooldowns and attention recovery.
  Quiet playback satisfies companionship. Title hints can prompt occasional
  play, without continuous spectacle. Explicit greeting/toys still take priority.
- Calm holds sleep through long sessions; Wake opens the sleeping expression.
  Reduced-motion laser play watches from rest without chasing or jumping.
- `Mind.inspect()` explains scored choices and blocked candidates. Snapshots
  include it, but direct commands can differ from the last autonomous decision.
- Recovering from interrupted jumps preserves visible height and owns its
  landing independently; selected sit now gets its real default rest duration.

## Evidence and reproducible route

Refresh the local preview, then open **Bean → Come say hi**. Try it from rest,
sleep and after travel. Calm should interrupt it; returning from a hidden tab
must not duplicate the loop. Real video controls should remain usable.

- `npm test`: **145 passed**, including complete invitation phases, repeated
  input, airborne recovery, three-minute Calm rest, reduced-motion laser,
  playback precedence, cursor intent, motion geometry and long pacing scenarios.
- `npm run check`: **passed**, including Astro build, TypeScript and Wrangler
  deployment dry run. No production deployment occurred.
- A motion agent implemented rig layers/tests; a behavior agent implemented
  pacing/tests. Independent integration review found sleeping-face persistence,
  lost landing continuation, null sit duration and Calm sleep expiry. All fixed.
- Direct native-canvas rendering of the actual CatBody was inspected. Sources:
  `scripts/render-bean.mjs`; outputs in parent `output/bean-motion/`; animated
  preview in parent `output/bean-motion.webp`. The six sampled phases show the
  new acting. These are rig-study frames, not screenshots of the site.
- Local preview rebuilt for `http://127.0.0.1:8787/`.
- Implementation was validated locally before the user's commit/push request.
  No production deployment is part of that request.

## Remaining release gates

Browser UI access to localhost was explicitly blocked by the computer-use tool
in this session. **Do not route around it with another browser or indirect page
execution.** Full-page visual QA and real browser performance remain unverified.
Tests and direct rig frames do not substitute for those checks.

Before calling this shipped 1.0, verify home, active room and wallpaper layouts;
perching near controls; greeting, pet/boop/carry/drop, treat and laser; scrolling
and resizing during travel; sleep/wake; reduced motion; hidden-tab resume; and
long playback performance. Fix demonstrated issues before production deployment;
the current authorization covers GitHub publication only. Local preview is
intended at `http://127.0.0.1:8787/`.

## Continuing the engine

Read VISION.md and ARCHITECTURE.md. Extend one bounded capability at a time;
retain the new invitation as a regression scenario. The strongest next work is
real-page geometry/perch resilience with a single staged fourth-wall action,
after the release checks above. Give agents separate file ownership.

Known limits: no full foot IK during sharp turns; no action-scoped cancellation
of every old delayed effect; memory needs validation/versioning before expansion;
away diary is invented flavor; rendering still computes hit/paw geometry. A seed
alone cannot replay calendar, layout, storage and input. Video uses title and
playback hints, not decoded audio or frames. Animation is local to each viewer.
The old dormant cast remains code/data only; never revive extra residents without
the user changing the one-Bean direction.
