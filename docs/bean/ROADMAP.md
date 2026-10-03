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
