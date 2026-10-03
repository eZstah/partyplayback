# Current handoff — 2026-10-03

## Latest checkpoint: calm pacing and browser checks (Claude, afternoon)

Bean 1.0.0-rc.1 reached `main` and therefore youple.tv: every merge to `main`
deploys automatically. From now on, each increment goes through a pull request.

**Calm by default**, restored from Konstantin's feedback (see VISION.md):

- `cast.pacing.calm`: Bean starts drowsy; without an invitation, energy and
  curiosity build slowly, sleep drains slowly, rests last about twice as long
  and screen-crossing activities (wander, zoomies, stalk, hunt, glass, knock)
  score half as much. Zoomies at most every 20 minutes, exploring every 2.5.
- A fresh page finds Bean asleep or loafing in place, never walking. Starting up
  no longer applies Wake Bean's sleep cap, which used to wake him at once.
- After a rest, Bean usually dozes off where he is instead of walking to a
  new spot. A still cursor counts as an invitation only within about 400 px.
- Butterflies come every 3 to 6 minutes instead of every 1 to 3. A loafing Bean
  usually just follows one with his eyes.
- Removed a `preventDefault` in the passive pointermove listener that logged a
  console error on every drag.
- Simulated idle hour: about 8% of the time moving (was 28%), about 16 unprompted
  trips per hour (was about 73). Tests in `cat-pacing.test.js` and
  `cats-world.test.js` guard this.

**Browser checks** (Playwright with Chromium against `npm run preview`, 1440×900):

- Home, first and returning visits; room with a playing video; Hello sequence
  (notice, approach, sniff, paw, settle; a repeat is refused); pet, boop, carry
  and drop, treat, laser, Calm and Wake, aquarium; hidden tab (time freezes and
  resumes without a jump); resize and scroll while exploring; reduced motion;
  phone fallback. No page errors.
- Bean never rested on a real control. Room playback: Bean watches or sleeps
  below the player, and the player controls stay clear.
- Cost: about 0.5 ms of script per frame; no long tasks.

**Next small tasks**, in this order:

1. The butterfly hunt runs the full width of the screen twice. Make it shorter,
   for example a few steps, a crouch and one pounce.
2. Going to sleep after an activity can still walk far. Prefer a spot near Bean.
3. Bean sometimes sits on the cat's own links ("Pet Bean", "Drop a treat").
   Treat that row like other controls.
4. Then continue with roadmap stage 2 (quiet motion: breathing, ear and tail life
   while resting).

The checkpoint notes below are from Codex's 1.0 candidate and remain accurate
except where this section updates them.

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

Most browser checks listed here before were run in the afternoon checkpoint
above, in a separate session with browser access. Still open: a play session
longer than a few minutes for performance, and a visual pass on a real monitor
(the checks ran headless).

## Continuing the engine

Read VISION.md and ARCHITECTURE.md. Extend one bounded capability at a time;
retain the new invitation as a regression scenario. The strongest next work is
real-page geometry/perch resilience with a single staged fourth-wall action,
after the small tasks in the latest checkpoint. Give agents separate file ownership.

Known limits: no full foot IK during sharp turns; no action-scoped cancellation
of every old delayed effect; memory needs validation/versioning before expansion;
away diary is invented flavor; rendering still computes hit/paw geometry. A seed
alone cannot replay calendar, layout, storage and input. Video uses title and
playback hints, not decoded audio or frames. Animation is local to each viewer.
The old dormant cast remains code/data only; never revive extra residents without
the user changing the one-Bean direction.
