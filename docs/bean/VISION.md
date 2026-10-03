# Bean: an ongoing character project

## The goal

Build one memorable, cozy black cat who appears to live on youple.tv. Bean should
reward both quiet company and active play: a convincing little creature while
people watch together, and a surprisingly expressive companion when they engage
with him. Wallpaper mode should be enjoyable to leave running.

This is a continuing engine and character project. Each improvement should make
the next one easier. Evolve the existing implementation in small, reviewable
steps; a new animation request should not trigger a new mascot implementation.
The current renderer and module boundaries are a useful starting point, not a
permanent technical requirement.

## Character direction

- **Identity:** Bean, the only resident. A small black tuxedo kitten with a readable
  feline silhouette, soft volume, expressive ears and tail, and recognizable
  proportions from the front, side and back. Preserve the plain youple.tv logo.
- **Temperament:** curious, affectionate and gently mischievous. A cozy companion
  with occasional bursts of kitten energy. He can decline attention, get
  distracted, retreat, nap, and come back on his own.
- **Acting:** show an intention before its payoff. Eyes notice something, ears
  follow, weight shifts, then paws move. A failed pounce can turn into grooming;
  a long look can end in a slow blink. Whole-body performance matters more than
  adding another facial expression.
- **Relationship:** recognize familiar interaction patterns and develop small
  habits. Returning should feel welcoming. Absence should not become a chore or
  a punishment for the viewer.
- **Voice:** brief, infrequent and recognizably Bean. Body language should carry
  most of the performance; speech bubbles should not narrate every action.
- **Surprise:** edge peeks, apparent closeness to the glass, cursor games and
  playful interaction with the page are welcome. Their timing should follow his
  attention, mood and circumstances rather than an endless random effects loop.

Quiet is part of his range. The aim is a character worth watching, not constant
motion. While a video is playing, the video and its controls remain easy to use.
More theatrical antics can belong to invited play and wallpaper mode.

## Baseline we can build on

The local single-Bean implementation already includes:

| Area | Current implementation |
| --- | --- |
| Body | Procedural 3D rig rendered on a 2D canvas, turning body and head, articulated legs, easing poses, a lagging tail, face decals and a perspective floor. |
| Mind | Drives, moods, trust, personality-weighted choices, recent-action penalties and short voice lines. |
| World | Measured page ledges and hideouts, travel, jumping, climbing, hiding, edge peeking, entering/leaving, a close-up glass routine and decorative toys. |
| Viewer play | Petting, booping, carrying, treats, laser, cursor reactions and a calm control. |
| Context | Playback state, video-title hints and page events such as a copied invite or a new viewer. |
| Continuity | Browser-local trust, interaction counts, visits, settings and a short diary. |
| Presentation | One active black cat, a plain logo, a Bean panel and wallpaper mode. Desktop roaming; static black-cat fallback on phones/touch-first screens. |
| Verification | Pure mind/rig tests and a minimal DOM fixture for world startup, single-resident behavior, page events and saved memory. |

These are implemented features, not a claim that their animation quality or
believability is finished. Read the source and current architecture notes before
changing them; this table describes a baseline, not a frozen interface.

## Limits to describe honestly

- Bean does **not** hear YouTube audio or inspect video frames. A title may hint
  at music, talk or action; it does not supply beats or an understanding of the
  content. Unknown titles should remain unknown.
- The cat is local to each viewer. Shared video playback does not synchronize
  Bean's movements, memory or interactions between participants.
- Saved memory is small and browser-local. It is not a model of a person's
  identity, an account-wide pet, or an autonomous AI conversation.
- Away-diary entries currently use invented flavor events. They are not a replay
  of actions performed while the viewer was absent.
- Seeded mind tests exist; the complete world and body do not yet provide a
  deterministic replay. Passing tests alone does not establish visual quality.
- The mobile fallback is static. Mobile animated parity is future work.

## Decisions already made

Keep one roaming black cat and the plain wordmark. Earlier experiments placing
eyes inside the logo's O/P counters produced distorted, mouse-like or creepy
faces and were rejected. Do not revive that direction as part of a motion or
engine task. Dormant cast definitions and old saved memories are compatibility
data, not permission to bring the other cats back.

Prefer the existing site's cozy colors and soft visual character. Improve
silhouette, volume, expression and motion through visible comparisons rather
than swapping in unrelated GIFs, a new art style, or photorealistic eyes.

The current work is **local only**. Do not commit, push or deploy without a new
user instruction authorizing it.

## How to judge an improvement

A good increment has a visible reason to exist, can be reproduced for review,
and leaves a reusable capability behind. Bean should still be recognizable,
exactly one resident should run, and watching together should still work.
Review starts, transitions, interruptions and recovery as well as the best
animation frame. Check calm/reduced-motion behavior and the mobile fallback.

Record what was actually verified, what remains rough, and the next useful
increment. Distinguish implemented behavior, proposed behavior and blocked
verification so another agent can continue without guessing or starting over.
