# Bean: iterative roadmap

Read [VISION.md](./VISION.md) before choosing work. This is a prioritized backlog,
not a promise that all stages are implemented. Keep each task small enough to
demonstrate and review. Develop one complete behavior or supporting capability
at a time instead of accumulating disconnected effects.

## 1. Make behavior reproducible and explainable

Build on the current mind, body and world. The first checkpoint is a runtime that
owns one animation loop, simulation-time cancellable delays, pause/resume and
destroy cleanup. Pass seeded randomness through world, body and mind, and expose
useful debug inspection. Preserve the existing rig and choreography while making
their execution easier to control. Extract only the seams needed for this work.

**Checkpoint acceptance:** pausing freezes simulation-time work; resuming does
not create another loop or a large time jump; destroying prevents pending work
from running; a seed reaches all three layers; startup and room tests still
pass. Debug state should help explain the currently selected action and runtime
status. Record actual delivery and validation in the work notes.

A complete deterministic replay and scenario lab remain follow-up work. Their
first scenarios should cover idle company, approaching a stationary cursor,
petting, sleep/wake, playback starting and stopping, and an interrupted travel
or peek. Fixed input and geometry must be controlled as well as randomness;
a seed alone is not a reproducible browser session.

**Follow-up acceptance:** the relevant decisions repeat under the same scenario,
an interrupted behavior releases its temporary pose/state, and recorded context
explains a surprising choice. Demonstrate the extension point through one
working behavior rather than a general-purpose framework.

## 2. Make the quiet cat convincing

Polish a small core motion set: breathing rest, slow blink, listening, standing
up, walking, turning, settling and sleep. Add anticipation, weight transfer,
paw contact and overlapping head/ear/tail motion. Give major actions clear
beginnings and endings; blend reactions without snapping the entire body.

Use a short reference scenario to compare Bean from front, side and back,
including both small on-page scale and a close view. Improve the current rig
where it helps; replace a rendering technique only with demonstrated benefit.

**Accept when:** the same motion reads as feline at both scales, feet do not
visibly slide during planted phases, stopping and changing direction look
intentional, and a quiet observation period contains comfortable stillness.
Include visual evidence when the available tools allow it; report any gap.

## 3. Give curiosity a beginning, middle and end

Introduce focused attention, behavior commitments, cooldowns and interruption
rules as needed. Build one coherent sequence, for example: Bean notices a
cursor, cautiously approaches, sniffs, offers a paw, then settles or loses
interest. Vary pace and outcome using mood, trust and recent interactions.

**Accept when:** the trigger and motivation are legible, repeated input does not
restart the same performance indefinitely, a higher-priority event interrupts
cleanly, and unattended Bean returns to a stable resting or exploring state.
Variation should change acting, not merely choose a different bubble.

## 4. Turn the page into a reliable place to live

Improve explicit affordances for safe perches, hiding edges, open floor and
decorative toys. Keep geometry robust when the viewport, room queue or layout
changes. Add one carefully staged fourth-wall interaction using these surfaces.

The eventual interface-mischief direction can use reversible visual illusions:
Bean bats a decoration, bends a decorative edge, or appears to push a panel.
Actual playback, queue data, navigation and form input must remain functional.

**Accept when:** resizing, scrolling and replacing a target during an action
leave Bean in a valid position; decorative changes clean up; real controls
remain usable; the effect has setup, payoff and recovery.

### 4a. Grow Aquarium into a place to play

Aquarium is now a furnished room (see "Aquarium furniture" in ARCHITECTURE.md).
Small next steps, one per pull request:

1. **Cubby hideout.** Let Bean go *into* the cat tree's cubby: walk in through
   the hole, curl up inside with only the eyes or tail showing, and come out.
   *Done when* `youpleCats.play('Bean', 'hide')` can pick the cubby and the
   entry, the stay and the exit each read clearly in a clip.
2. **Sofa nap spot.** Make the sofa seat a favourite place to nap, for example
   on the cushions. *Done when* an unscripted 10-minute Aquarium session ends up
   with Bean napping on the sofa at least once, and calm pacing still passes.
3. **Toys that react.** The yarn ball rolls and the toy mouse slides when Bean
   bats them, then they come back. *Done when* knocking either toy plays a short
   reversible animation and the toy returns to its place.
4. **Window watching.** Bean sits on the sill and watches something outside
   (a bird or a passing light), with ears and head following. *Done when* this
   happens on its own now and then, rarely, and is visible in a clip.
5. **Layout check.** Furniture stays reachable and on screen at 1280×720,
   1440×900 and 1920×1080. *Done when* screenshots at those sizes show every
   platform reachable (`youpleCats.measure()`) and nothing overlapping the dock.
6. **More rooms later.** Only after the above: a second layout (for example a
   kitchen or a sunny afternoon), chosen per visit. Keep one room at a time.

### 4c. Make the room feel alive (lofi)

The room is a cozy lofi room: fairy lights, a lamp, the player on the TV, and
a window that follows the time of day and the weather (see the end of
"Aquarium furniture" in ARCHITECTURE.md). Each step is one small pull request,
reduced motion keeps still, and nothing may slow the player.

1. **More weather.** Add `snow` and `fog` to `habitat-scene.js` and style them
   in the window. *Done when* `?scene=night,snow` shows it and the weather
   still changes on its own.
2. **Something outside.** Now and then a bird lands on the window ledge
   outside, or a plane's light crosses the night sky. *Done when* it is rare
   and Bean's head turns to follow it (see 4a.4 window watching).
3. **Rain on the glass.** Drops slide down the window pane when it rains.
   *Done when* it reads at 1280×720 and costs no noticeable CPU.
4. **Lamp switch.** The lamp turns on at dusk and off by day with a soft fade,
   and Bean sometimes naps under it. *Done when* the change is visible in a
   dusk clip.
5. **Seasons.** A plant that grows, a pumpkin in October, lights in December,
   from the visitor's date. *Done when* each one is a small markup and CSS
   change behind a date check, with a test for the date logic.
6. **A record player.** A small turntable on the console that spins while a
   video plays. *Done when* it only spins during playback.

### 4b. Grow Bean's moves

Bean has a wind-up before big jumps, a big leap between pieces of furniture,
a high jump to bat at a dust speck, and mid-air twists and rolls (see "Moves"
in ARCHITECTURE.md). Each next move is one small pull request, built from
`moves.js`, `springUp()`, `jumpTo()` and existing pose channels. Each must be
rare outside Aquarium and invited play, and must keep `test/cat-pacing.test.js`
passing.

1. **Pounce on a toy.** In Aquarium, Bean stalks the yarn or the mouse on the
   floor, winds up and lands on it with both paws, then bats it. *Done when*
   `youpleCats.play('Bean', 'pounce')` lands on a toy and the toy wobbles.
2. **Wall kick.** On a jump that is too high, Bean kicks off the side of a solid
   (the bookshelf or the player) and up onto the top. *Done when* a clip shows
   the kick and `route()` can use it for one height step above the normal limit.
3. **Halloween hop.** Startled or playful, Bean arches his back, puffs his tail
   and hops sideways a few times. Needs an arched-back pose channel in
   `CatBody`. *Done when* the pose reads clearly from the side and the front.
4. **Tail chase.** Bean spins after his own tail a few turns, then sits as if
   nothing happened. *Done when* it is rare, short and ends with a groom.
5. **Belly flop.** Bean rolls onto his side or back and wiggles, then gets up.
   Needs a lying-on-side pose. *Done when* the roll and the getting up both read
   in a clip.
6. **Missed landing.** Very rarely, a big leap ends with his back paws
   scrambling at the edge before he pulls himself up (reuse `hang`). *Done when*
   it happens at most a few percent of big leaps and never on the floor.

## 5. Let familiarity create individuality

Build small persistent preferences and habits from observed interactions, such
as a favored perch or greeting style. Version and validate saved memory before
expanding it. Separate recorded events from imagined diary flavor; do not
present invented off-screen activity as an observed event.

**Accept when:** a saved habit affects a demonstrated future choice, older data
migrates safely, unavailable storage degrades gracefully, and returning after a
long absence is welcoming. Memory should add character without requiring care
tasks or continuous attendance.

## 6. Deepen video response with real signals

First refine the context already available: title, playing/paused state,
transitions and explicit viewer choices. Let energy build and decay over time
instead of flipping an animation immediately for every event. Keep unknown
content neutral and make event precedence clear.

Treat actual audio analysis, visual analysis and a shared room-wide cat as
separate future investigations. Establish a permitted, technically available
signal before designing beat-synchronized motion. The current YouTube embed
does not provide decoded audio or frames to this engine.

**Accept when:** title hints remain labeled as hints, stale/repeated playback
events do not produce repeated reactions, pause/resume transitions feel natural,
and no claim of listening or content understanding exceeds available inputs.

## 7. Make long sessions and more devices feel good

Measure the animation's cost during real playback and wallpaper sessions before
setting an evidence-based performance budget. Improve hidden-tab lifecycle,
cleanup, frame pacing and adaptive detail where measurements show a need.
Develop touch interactions only once their gestures and cost are understood.

**Accept when:** long sessions show bounded resources, page teardown removes
listeners/timers/temporary visuals, video remains smooth, and calm/reduced-motion
controls work throughout. Keep the static mobile fallback until a tested
animated replacement is ready.

## Task and handoff format

Every agent task should identify:

1. **Outcome:** one user-visible change, the motivating scenario and the current
   code to extend.
2. **Scope:** owned files, dependencies, and which existing contracts matter.
3. **Acceptance:** observable behavior, interruption/recovery cases, relevant
   regression checks and visual review where possible.
4. **Evidence:** changes made, exact checks run, limitations, and a reproducible
   route to the result.
5. **Continuation:** known rough edges and the next small, useful task.

Parallel work should have separate file ownership. Integrate and review the
combined result before claiming completion. Keep current architecture and work
notes aligned with actual code so a new agent can continue the same project.

Run the relevant focused tests during development, then the repository checks
for the finished increment. Stop the local preview before rebuilding and restart
it afterward, as described in the root README. A successful build is not a
visual review. Respect any browser-access restriction and state when a review
could not be performed.

Current publication boundary (2026-10-03): **the user authorized committing all
accumulated changes, pushing main to GitHub and deploying this checkpoint live.**
Later increments need their own publication authorization.
