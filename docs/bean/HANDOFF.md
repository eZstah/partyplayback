# Current handoff — 2026-10-03

## User direction and boundary

One exceptional, cozy black mascot developed as a continuing character engine.
Keep the plain logo and synchronized video functionality. The user explicitly
wants actual working improvements, with focused agent help, not just planning.
The latest follow-up reports sliding after a butterfly chase. Same-surface
pursuit and travel to a nap spot retained a sitting pose that suppressed gait.
`CatBody.goTo()` now releases incompatible rest/hand poses and unfolds before
translating. Regressions cover the chase and subsequent sleep journey on both
floor and ledge, plus sit/loaf/curl/perched rig transitions.

The preceding follow-up reports flashing colors/forelegs while Bean sits. The
reproduced cause was belly breathing crossing a planted foreleg's painter depth,
switching that entire leg over/under the white bib. Sort from the unbreathed
anchor while preserving the rendered breathing geometry.

The preceding request is quiet video playback and simpler controls: Bean watches,
sleeps or stays offscreen while content plays; no butterflies or ambient events.
Replace the bulky controls block with a compact right-click menu and a separate
Aquarium button. The preceding movement/pickup/refusal increments are preserved.

Repository: `partyplayback`, branch `main`. The previous candidate (including
the 5–50 activity counter) was committed and pushed as `788737e` at the user's
request. **On 2026-10-03 the user authorized committing all accumulated changes,
pushing GitHub main and deploying live to `youple.tv`.** This supersedes the
earlier local-only boundary. Historical `public/meme-cats/` references and source
notes are included in this full checkpoint; the procedural Bean does not use them.
Verify publication against GitHub and the Cloudflare deployment record rather
than assuming a prepared release has already been published.
No external chats, scheduled jobs or messages were created.

## Turntable and Bean's pick (Claude)

Konstantin asked for smarter record suggestions. The tall cabinet is now a low
record stand with a turntable on top and the five sleeves leaning in its front.
The platter spins in the record's colour while it plays. With nothing selected,
the shelf glows one sleeve as "Bean's pick": the room's last record, else Jazz
in rain, else by time of day (dawn Ambient, day Lo-fi, dusk Piano, night Sleep).
In Aquarium Bean sometimes walks to the stand and paws that sleeve (`pick`).
Checked in Chromium at 1024×768, 1280×720, 1440×900 and 1920×1080: the stand
and turntable stay below the TV, every sleeve is clickable, the disc spins on
play and stops on pause, Bean walks over and nudges the suggested record, and
the stand is a perch. Not checked: Safari, real YouTube.

## Records with backups (Claude)

Konstantin agreed to 15 record slots: five moods with up to three videos each.
The shelf now has Ambient, Lo-fi, Piano, Jazz and Sleep with 11 videos. Four are
confirmed to embed (`checked` in `music-shelf.js`); the other seven were found
by search and could not be checked from the cloud environment, which blocks
YouTube. Run `npm run check:records` on a normal network and replace any video
it reports. If a video fails at runtime, the shelf moves on to the next backup
on its own (tested with a stand-in player that fails two Lo-fi videos).

## Neon Aquarium and the music shelf (Codex)

Konstantin requested a cozy neon room in the site's tones and confirmed that
clicking the right shelf should load a mix into the shared TV. The scene now
uses charcoal/plum furniture, lavender edge light and muted pink/mint accents.
The record shelf offers Ambient, Lo-fi and Piano recordings by Lofi Girl through
the existing room player. Choices add/select by item identity and reuse queued
mixes. The selected sleeve follows remote selection and pause state. Loading,
disconnection, queue capacity, timeouts and embed errors have visible feedback.
From the homepage the record creates a guest room and carries the choice over.

The first live-radio trial buffered at the room's zero-based timeline, so the
final catalog uses seekable recordings: `fQ35eh6k0RI`, `8gJ716dhStg`, `cYPJaHT5f3E`.
All three were verified in the browser with media ready state 4, paused false
and advancing currentTime. A second local viewer received selection and pause
state; homepage-to-room selection also worked. Browser checks cover keyboard
selection, 1907×942, 1440×900, 1280×720 and 1024×768 shelf hit areas/TV alignment,
fullscreen, and the 390×844 fallback (shelf hidden, no horizontal overflow).
All 238 tests and `npm run check` pass. The library depends on YouTube
availability and its normal autoplay policy.
No changes to the cat engine or room server. Continued in PR #41; not deployed.

## Aquarium proportions from Konstantin's corrected mockup (Codex)

The October 3 reference enlarges the sunset window and TV, places the sofa
under the window, slims the cat tree and bookshelf, and adds two little plants
on the low console. Implemented in `CatHabitat.astro` and `cat-habitat.css` from
`09d8916`, on `codex/aquarium-mockup-layout`. The wall shelf, box and yarn are
removed; the tree has three decks. Existing perch, nap and viewing markers
remain on the furniture, and the mouse remains a toy. No cat engine changes.
TV and player share responsive length variables and keep a 16:9 screen.

Validated with all 229 tests and `npm run check` (build, TypeScript, Wrangler
dry run). Browser checks cover home and the local empty room, fullscreen in
and out, and room/player alignment at 1280×720, 1440×900, 1920×1080, 1280×1024,
1024×768 and the reference's 1907×942. All marked furniture stays on screen;
player edges match the TV screen within a fraction of a pixel. At 390×844,
Aquarium exits to the normal room without horizontal overflow. This layout
check does not verify external video playback or multi-user synchronization.
This increment is prepared for PR review, without publishing to main.

## A cozy lofi room with the player on the TV (Claude)

Konstantin asked for Aquarium to be an ultra-cozy cat playground room, with our
player on the TV at a modest size, full screen still possible, and things that
change over time like a lofi window. The room now has a wall with fairy lights,
a lamp on the wall shelf, a blanket on the sofa, a wall-mounted TV over a low
console, and a window whose sky follows the visitor's time of day and drifts
between clear, cloudy and rainy (`habitat-scene.js`). In a room, the player
sits on the TV screen with a compact control strip, and fullscreen works as
before. The floating `#stage` is no longer a separate surface; the TV is.
While a video plays in Aquarium, Bean now lives around the room: now and then
he quietly moves to the sofa, the rug in front of the TV, the box or the sill,
grooms and settles (`cozySpot()` in world.js, `data-nap` and `data-view` in
the markup). Outside Aquarium playback stays as still as before.
Checked at 1280×720, 1440×900, 1920×1080 and 1280×1024, home and room, plus
fullscreen in and out. Next steps for the room are in ROADMAP.md under 4c.

## New moves: wind-up, big leaps, high jumps (Claude)

Konstantin asked for more cat moves: preparing and launching a long jump,
jumping very high to catch something, and jumps with rolls. Added `moves.js`
(wind-up timing and acting, mid-air twist, swipe and reach) and two activities,
`leap` and `highjump`. Every far or high jump now has a short wind-up (crouch,
head bob, butt wiggle); hops do not. The butterfly hunt leaps straight up when
it flies out of pouncing reach. Acrobatics are rare on an ordinary page (a few
an hour in the decision simulation) and more common in Aquarium or during play;
playback, Calm and reduced motion block them. Checked in the browser on the
home page, in Aquarium and in a room, with frame sheets of the wind-up, a
sofa-to-TV leap with a twist and a high jump. Next moves are in ROADMAP.md
under 4b.

## Aquarium becomes Bean's room (Claude)

Konstantin asked for Aquarium to have big, interesting things to climb, jump
between and hide behind; before this, Bean only had an empty floor there.
`CatHabitat.astro` now furnishes it: a cat tree (cubby, two decks, a bed on
top), a sofa, a cardboard box, a big TV on a cabinet, a tall bookshelf with a
shelf to sit on, a window sill, a wall shelf, a yarn ball and a toy mouse. In a
room, the real player is the big block, framed by the cat tree and bookshelf.
Checked in the browser: climbing the bookshelf, jumping TV to shelf, hiding and
peeking behind the TV and the box, napping on shelves, butterfly hunts across the
furniture, no page errors. A 4-minute unscripted session moved 21% of the time,
more than the normal page (9%), which fits Aquarium being the place to play.
Next steps are in ROADMAP.md under 4a.

## Calm idle pacing and browser checks (Claude, pull request on rc.2)

Konstantin's standing direction (see VISION.md): Bean is calm by default. Real
cats rest most of the day, so the idle page should not feel busy either.

- `cast.pacing.calm`: Bean starts drowsy; without an invitation, energy and
  curiosity build slowly, sleep drains slowly, rests last about twice as long
  and screen-crossing activities (wander, zoomies, stalk, hunt, glass, knock)
  score half as much. Zoomies at most every 20 minutes, exploring every 2.5.
- A fresh page finds Bean asleep or loafing in place, never walking. Starting up
  no longer applies Wake Bean's sleep cap, which used to wake him at once.
- After a rest, Bean usually dozes off where he is instead of walking to a
  new spot. A still cursor counts as an invitation only within about 400 px.
- Idle butterflies come every 3 to 6 minutes instead of every 1 to 3. A loafing
  Bean usually just follows one with his eyes.
- The passive pointermove listener no longer calls `preventDefault` while
  dragging (it only logged a console error).
- Simulated idle hour: about 8% of the time moving (was 28%), about 16 unprompted
  trips per hour (was about 73). Guarded in `cat-pacing.test.js` and
  `cats-world.test.js`.

Browser checks on rc.1 (Playwright, Chromium, `npm run preview`, 1440×900):
home first and returning visits, room playback, the Hello sequence and its
repeat guard, pet, boop, carry and drop, treat, laser, Calm and Wake, aquarium,
hidden tab, resize and scroll during travel, reduced motion and the phone
fallback. No page errors; Bean never rested on a real control; about 0.5 ms of
script per frame. On rc.1 an idle returning visit had Bean moving 43% of the
time, with zoomies on load; with this change a 5-minute session measured 9%.

Next small tasks: shorten the butterfly hunt (it runs the full width twice);
prefer a nearby spot when going to sleep after an activity.

## New increment: 1.0.0-rc.2, release checkpoint

- Fixed seated sliding during/after pursuit. The shared walking command releases
  rest/perch/hand channels, wakes a sleeping expression and allows the rig to
  unfold before ground translation. Stalking crouch and expression are preserved;
  ordinary walking restores alternating planted/swinging paws.
- Fixed seated foreleg/bib flicker: the torso's sort anchor excludes breathing
  displacement, so breathing cannot flip a planted limb across the white chest.
  Poses, breathing shape, shading, paw locations and hit areas remain live.
- Playback is now a strict quiet policy, independent of music/action titles,
  curiosity, cursor dwell or a previous invitation. Bean settles in place with
  90–210 second rest intervals; an offscreen Bean remains offscreen until pause.
- Starting video clears butterflies, speech, particles, glass effects and toys,
  cancels current antics and restores displaced decorations. Butterfly spawn
  time freezes and pausing leaves a grace interval. Held cats still release and
  land safely. Fresh explicit play commands still work, then settle again.
- Long hidden-tab resumes preserve rest position/offscreen state. Enabled but
  inactive toys cannot restart the old traveling sleep animation or particles.
- Removed profile/cards/status/diary/hints and home playbar. Right-click Bean
  for Come say hi, Give a treat, Laser pointer and Let Bean sleep/Wake Bean.
  A small paw fallback opens the same menu when Bean is hidden. Arrow/Home/End,
  Escape/Tab and outside/scroll/resize dismissal are covered. Aquarium is its
  own visible button, with Back to room/site while active.
- Pickup follow-up: use the complete initial drag gesture with a 120 ms noise
  floor, rather than treating one fast small pointer event as a rushed grab.
  Friendly handling is more permissive; pressure recovers in a few seconds.
- A shared `handling.js` refusal performance raises a blocking paw beside the
  cheek, shifts weight back and shakes the head before the dodge. It releases
  its temporary pose when interrupted. Calm/reduced motion use a quiet hold.
- Refusal acknowledges input immediately with a short forced bubble. Repeated
  attempts during escape give feedback without restarting or extending it.
  The grabbing cursor now appears only during actual carrying.
- Pointer leave/cancellation and returning without the primary button held
  clear stale carrying. Cancelling a pending press does not trigger a boop.
- A refused screen-edge pickup keeps Bean visible for the acknowledgment,
  then ducks behind that same edge. It no longer clears the peek before acting.
  Calm/teardown cleanup is armed even before the next animation frame.
- Ballistic drops and throws from measured pointer velocity. Holding still
  before release places gently. The pure release planner finds the first
  descending ledge crossing using the same trajectory as the rendered body.
- Full-body rolls with matching hit geometry, airborne tuck, paw reach and
  decaying landing absorption. Shadows stay on the landing plane.
- Shared pursuit routes: butterfly chase and cursor escape chain measured
  surfaces, run between takeoffs and replan after each landing. These actions
  never use the older travel action's offscreen relocation shortcut.
- Escape may catch a panel edge, hang by two pinned front paws, pull up and
  hide behind cover. Missing climb/hang/hide geometry recovers to the floor.
- Mind chooses whether to accept, dodge or flee from a pickup based on trust,
  mood, sleep, pointer speed, invitation and recent handling. Repeated grabs
  and throws briefly encourage space. Handling diagnostics are session-only;
  existing persistent memories remain compatible.
- Removed or displaced airborne targets cannot leave a phantom landing.
  Recovery lands independently even after the original generator is cancelled.
- Calm, reduced motion, pointer cancellation and hidden-tab suspension keep
  their quiet behavior. Teardown clears actual held state and input references.

## Preserved from 1.0.0-rc.1

- One active Bean, plain wordmark and static black mobile fallback.
- Existing engine facade, single owned frame loop, seeded RNG, simulated-time
  effects, hidden-tab suspension, disposal and detached snapshots preserved.
- Visible motion pass: chest-led breathing with head lag, acceleration/braking
  and turning weight transfer, distance-based planted walking phases, slower
  rest transitions, affectionate slow blinks and softer resting eyes.
- A dedicated `offerPaw` rig channel for a soft held greeting.
- **Right-click Bean → Come say hi**, also exposed as facade `greet()`: notice, approach one
  destination, sniff, offer paw, slow blink, knead briefly, loaf, keep company.
  Phases appear in the snapshot. Repeat invitations do not restart it.
- Stationary nearby cursor curiosity requires a fresh pause outside controls.
  Passing pointers and time spent hovering controls do not count as invitation.
- Softer petting reactions with input cooldowns; gentle first/return greetings.
- Cozy behavior director with explicit action cooldowns and attention recovery.
  Quiet playback satisfies companionship. Fresh explicit greeting/toys remain
  available; title hints no longer cause playful antics during playback.
- Calm holds sleep through long sessions; Wake opens the sleeping expression.
  Reduced-motion laser play watches from rest without chasing or jumping.
- `Mind.inspect()` explains scored choices and blocked candidates. Snapshots
  include it, but direct commands can differ from the last autonomous decision.
- Recovering from interrupted jumps preserves visible height and owns its
  landing independently; selected sit now gets its real default rest duration.

## Evidence and reproducible route

Refresh the local preview. Start a video: Bean should settle, and any butterfly
or decoration effect should disappear. Pause to restore idle choices. Right-click
him or use the paw button; Aquarium is now separate. Test hidden-tab return
during playback and an enabled laser whose pointer leaves the page.

Drag Bean gently, pause then release; compare that
with releasing a moving hand. Repeated/rushed pickup attempts should sometimes
be declined. Give him space after a throw. Watch a butterfly chase near multiple
reachable surfaces. The room has more cover than wallpaper mode. The previous
**Right-click Bean → Come say hi** invitation remains a regression scenario.

- `npm test`: **208 passed**. Rest-to-walk and same-surface hunt regressions were
  observed failing before the walking fix, then pass. Both floor and ledge hunts
  and subsequent nap journeys have visible stepping cycles. Sit/loaf/curl/perched
  transitions wait before translating and can return to rest after arriving.
  The seated regression verifies actual foreleg/bib
  canvas paint order across eight seconds at seven affected/nearby angles, with
  visible breathing retained. Playback coverage includes 40 simulated one-hour
  Mind sessions across five title vibes, ten minutes of actual world simulation,
  offscreen rest, hidden-tab resumes, title/user changes, inactive toys and
  decoration cancellation. Menu targeting, keyboard/focus, dismissal and
  independent Aquarium behavior pass in the DOM fixture.
  Added flight/hit geometry, release trajectory,
  handling decision and three-level world courses. World tests cover complete
  chase, refused grab → ledges → hang → cover, real pointer throws and gentle
  placement, targets removed/moved during flight, removed wall/hang/hide cover,
  held-state cleanup and reduced-motion refusal. Previous invitation, Calm,
  playback, sync and lifecycle tests still pass.
  Pickup regressions cover real Mind acceptance for small fast pointer samples,
  repeated gentle handling, explicit refusal/retry feedback, pre-dodge acting,
  cancelled gestures, outside-page releases and all four screen-edge refusals.
- `npm run check`: **passed**, including Astro build, TypeScript and Wrangler
  deployment dry run. Publishing is a separate authorized release step.
- Agents owned rig/flight tests, Mind/handling tests and the pure release
  planner/tests. Parent integrated world choreography and input. Independent
  review exposed stale pursuit targets, projected-height recovery, held-state
  cleanup and detached wall climbs. All fixed with regression coverage.
- This follow-up used separate Mind/test and menu markup/CSS ownership. Parent
  integrated world policy/input and regressions. Independent review reproduced
  the inactive-toy rest leak; fixed with three regression scenarios.
- Direct native-canvas rendering of the actual CatBody was inspected. Sources:
  `scripts/render-bean-acrobatics.mjs`; 360 PNGs/contact sheet in parent
  `output/bean-acrobatics/`; animated preview in parent `output/bean-acrobatics.webp`.
  The study uses the actual rig and release planner with scripted cues. Frames
  of jumping, roll, hanging and recovery were inspected. It is not a site
  screenshot or capture of autonomous pursuit. The older cozy greeting study
  remains at `scripts/render-bean.mjs` and parent `output/bean-motion.webp`.
- The refusal follow-up is rendered from its actual shared generator by
  `scripts/render-bean-handling.mjs`; inspected PNGs/contact sheet are in parent
  `output/bean-handling/`, with parent `output/bean-handling.webp`. This uses a
  scripted cursor/dodge and is not browser verification.
- `scripts/render-bean-seated.mjs` rendered and compared 36,000 frames at 120
  angles before/after the seated fix. Inspected contact sheets and numerical
  reports are in parent `output/bean-seated-before/` and `bean-seated-after/`.
  The largest frame-to-frame torso jump fell from 95 high-contrast pixels to 4
  at 1× rig scale. The original sudden dark arm across the bib no longer occurs.
  This is direct rig rendering, not a site capture.
- `scripts/render-bean-walk.mjs` renders four actual rest-to-walk rig transitions.
  Inspected parent `output/bean-walk/contact-sheet.png`; `samples.json` records
  root travel and paw heights. It shows unfolding before translation followed
  by alternating steps; it is not a recording of the autonomous world.
- Local preview rebuilt for `http://127.0.0.1:8787/`.
- Publication target: GitHub `eZstah/partyplayback` main; Cloudflare Worker
  `partyplayback`, custom domain `youple.tv`. Previous live version before this
  release: `a9e4558d-9471-4b90-b8c7-31a8cdf2c071`.

## Remaining release gates

Browser UI access to localhost was explicitly blocked by the computer-use tool
in this session. **Do not route around it with another browser or indirect page
execution.** Full-page visual QA and real browser performance remain unverified.
Tests and direct rig frames do not substitute for those checks.

Before calling this shipped 1.0, verify home, active room and wallpaper layouts;
right-click/paw menu positioning, keyboard focus and the separate Aquarium button;
perching near controls; greeting, pet/boop/carry/drop, treat and laser; scrolling
and resizing during travel; sleep/wake; reduced motion; hidden-tab resume; and
long playback performance. These remain outstanding review work; the user has
explicitly requested publishing the current checkpoint. Local preview is
intended at `http://127.0.0.1:8787/`.

## Continuing the engine

Read VISION.md and ARCHITECTURE.md. Extend one bounded capability at a time;
retain invitation and the three-level pursuit course as regression scenarios.
The strongest next work is actual-page perch and landing review, then continued
in-air steering and richer catches using observed geometry failures. Give
agents separate file ownership.

Known limits: flights are bounded planned trajectories, not a general collision
solver; no wall-volume collisions or arbitrary DOM destruction; release catches
exclude word skylines; no continuous in-air retargeting; reachable geometry
limits pursuit, especially in wallpaper mode. No full foot IK during sharp turns;
no action-scoped cancellation
of every old delayed effect; memory needs validation/versioning before expansion;
away diary is invented flavor; rendering still computes hit/paw geometry. A seed
alone cannot replay calendar, layout, storage and input. Video uses title and
playback hints, not decoded audio or frames. Animation is local to each viewer.
The old dormant cast remains code/data only; never revive extra residents without
the user changing the one-Bean direction.
