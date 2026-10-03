# youple.tv

Watch YouTube together in a shared room. Everyone with the same room link shares
a video queue, playback position, and play/pause controls.

## Run locally

Use Node.js 22.18 or newer (the regression suite uses native TypeScript loading).

```sh
npm ci
npm run preview
```

Open the address printed by Wrangler (normally http://localhost:8787) in two
browser tabs. Start a guest room, share its link, and add a YouTube video.
Use `preview` for room testing: it builds the Astro app and runs its Cloudflare
Worker and Durable Object locally. `npm run dev` starts the same complete room
runtime. For Astro-only page development, use `npm run astro -- dev`; that mode
does not provide the complete room runtime. Stop the preview before rebuilding,
then restart it after code changes.

## Watching together

- Share the room URL with the other viewers.
- Paste a YouTube watch, short, live, embed, or youtu.be video link into the
  playlist field, or anywhere on the room page (Ctrl+V / Cmd+V).
- Tap the playlist **+** to add the typed link, or a copied YouTube link when
  the field is empty. If clipboard access is unavailable, paste into the field.
- Use the large Play/Pause button, the timeline to seek, and Next to skip.
- Space or K: play/pause. Left/right: seek 5 seconds. J/L: seek 10 seconds.
  N: next. F: fullscreen. T: theater. M: local mute. ?: shortcuts.
  Shortcuts stay inactive in inputs and dialogs. Esc closes dialogs/fullscreen.
- Sponsor reads, self-promotion and subscribe reminders are skipped once for
  the whole room, using [SponsorBlock](https://sponsor.ajay.app/) segments. The
  skip button next to the YouTube controls turns this off or picks other
  categories (intros, endcards, previews, non-music parts, filler). Seeking
  into a segment watches it.
- If your browser blocks autoplay, click **Join playback**. This enables your
  own player without pausing or seeking everyone else.
- Removing an upcoming video preserves the current position. Removing the
  current video loads its replacement; emptying the queue stops playback.
- When the last viewer leaves, playback pauses. The queue and position are kept
  so the room can be rejoined.

Some YouTube videos cannot be embedded, and browser/network restrictions can
prevent an individual player from loading. An error in one player does not
automatically skip the video for everyone; use Next or remove that queue item.

## Sharing a browser tab

In the main room, choose **Share a tab**, then **Choose a tab**. Select a browser
tab containing TikTok, Instagram Reels, Shorts, or another video and enable
**Share tab audio** in the browser picker. Start sharing from desktop Chrome or
Edge over HTTPS (localhost also works). Other browsers may support picture but
not tab audio; viewers can use any browser with WebRTC playback support.

On supported desktop Chromium browsers, a private preview then lets the sharer
frame the video area: draw, move, resize, or start with a portrait/wide preset.
Arrow keys move the box; Shift + arrows resize it. Nothing is broadcast before
**Share selected area** (or the explicit **Share whole tab** option). Unsupported
browsers are told before capture that only whole-tab sharing is available.

Cropping uses a frame-driven worker with transferable processor/generator streams,
not a canvas animation loop that pauses when the room tab is in the background.
Only cropped pixels (at most 1280 × 720, no upscaling) and the original tab audio
are attached to WebRTC. The full source is still captured locally and cropping
adds device processing; fewer encoded pixels do not guarantee a fixed bandwidth
saving. No extension or media server is required. Source dimension changes stop
the share rather than silently moving the crop. Layout changes within the same
size, overlays, and other content inside the selected area remain visible; stop
and share again to reframe. Crop failures never fall back to sending the full tab.

One person shares with up to four viewers. The main player shows the shared tab;
YouTube pauses and the playlist remains editable. After **Stop sharing**, the
playlist stays paused until someone presses Play. Browser Stop sharing, leaving
the room, and losing the room connection release capture and peer connections.
Viewers may need **Join shared tab** for autoplay, or **Reconnect** after a network
failure. The sharer's preview is muted to avoid echo; viewers control their own
sound with the shared video's controls. Aquarium sharing and remote scrolling
are outside this first version. Sharing captures the selected surface, including
any other content shown there; this app does not record it.

Media goes over WebRTC, not the room WebSocket. The existing Durable Object routes
bounded SDP/ICE messages between the sharer and subscribed viewers only. Per-socket
server-generated identities and share generations reject spoofed or stale signals.
Ownership/subscriptions survive hibernation as socket attachments; SDP is not saved.

Sharing is peer-to-peer only, using [Cloudflare STUN](https://developers.cloudflare.com/realtime/turn/faq/)
to discover network addresses. No TURN relay is configured or provisioned, even
if old relay secrets exist. Picture and sound travel from the sharer to each
viewer, so Youple carries no media bandwidth. Normal website and room-signaling
usage still applies. The sharer's upload bandwidth grows with each viewer;
the four-viewer limit keeps this a small-room feature.

Some networks cannot connect directly. Those viewers see a connection error and
can try Reconnect or another network; sharing never falls back to a paid relay.

Manual checks: two browsers, tab picture + sound, autoplay recovery, picker cancel,
browser Stop sharing, simultaneous sharers, a late viewer, host departure, viewer
reconnect, and YouTube pause/resume. Also test two separate networks; a localhost
pass alone does not verify direct NAT traversal.

## Validation

```sh
npm test
npm run check
```

The regression suite covers shared playback, seeking, asynchronous player
events, queue edits, duplicate end reports, and recovery after Durable Object
hibernation. Check builds the app, checks TypeScript, and performs a Wrangler
deployment dry run without publishing. GitHub Actions runs both on every pull
request and on pushes to `main`.

With `npm run preview` running in another terminal:

```sh
npm run test:integration
```

This connects real WebSocket viewers to the local Worker and checks shared
controls, late joins, reconnects, queue updates, room isolation, and request
validation. Set `TEST_BASE_URL` to test a different **test environment**; the
script creates temporary rooms and changes their queues.

For a manual browser check:

1. Open the same room in two browsers and enable playback where requested.
2. Pause and resume from each browser.
3. Seek forwards and backwards, both while playing and while paused.
4. Add and remove upcoming videos; the current video should keep its position.
5. Queue the same video twice and check that it restarts on Next.
6. Refresh a viewer or briefly disconnect it; it should rejoin at the room's position.
7. Let a video finish in both viewers; the queue should advance only once.

Local Wrangler does not reproduce every production hibernation condition.
The regression suite reconstructs the object with saved state and socket
attachments. Also check idle-room recovery on Cloudflare before merging a
production release.

## Deployment

```sh
npm run build
npm run deploy
```

Deployment requires Cloudflare authentication. `wrangler.json` attaches the
`youple.tv` custom domain to the existing `partyplayback` Worker. Keep that Worker
name and its existing Durable Object binding/migration to retain room storage.
Cloudflare manages the custom domain's DNS and HTTPS certificate. The purchased
domain must be active in the same Cloudflare account as the Worker.

`wrangler.json` declares the
`ROOM` Durable Object binding and its existing SQLite migration.
`scripts/post-build.mjs` adds the RoomDO export to the generated Astro worker;
always build through the npm scripts.

Guest rooms are shared spaces: anyone with the link can join and control them.
Member rooms are saved to their creator's account and require every viewer to
sign in. They are not invite-only; any signed-in user with the link can join.

## Connect Supabase sign-in

Guest playback needs no authentication settings. Google, Discord and email magic
links are prepared with Supabase Auth; they need your project and provider setup.
No Supabase database tables or service-role key are needed. Room storage and the
account's saved-room catalog stay in Cloudflare Durable Objects.

1. Create a Supabase project. Copy `.dev.vars.example` to `.dev.vars` and set
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from its API settings. Keep
   `AUTH_REDIRECT_ORIGIN` in `.dev.vars` only: local preview rewrites request URLs
   to the youple.tv route, so this sends sign-in redirects back to localhost.
   For production, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the
   `partyplayback` Worker under Settings → Variables and Secrets (or with
   `npx wrangler secret put`). They are read at runtime, so no rebuild is needed;
   `keep_vars` stops later deploys from removing them.
2. In Supabase Auth URL configuration, set `https://youple.tv` as your Site URL and allow
   `https://youple.tv/auth/callback**` and, for local preview,
   `http://localhost:8787/auth/callback**`. Keep the allowlist limited to
   domains you own. If a redirect is ever rejected, Supabase falls back to the
   Site URL and the home page forwards its `code` to the callback.
3. Enable [Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
   and [Discord](https://supabase.com/docs/guides/auth/social-login/auth-discord)
   in Supabase. Create each provider's OAuth app and configure its credentials
   in Supabase, using the Supabase callback URL shown in the provider settings
   (`https://YOUR_PROJECT.supabase.co/auth/v1/callback`).
4. Enable email authentication and magic links. Keep the Magic Link email
   template's `{{ .ConfirmationURL }}` link. Supabase's built-in mailer only
   sends to your project's team members and a few emails per hour, so
   configure custom SMTP before inviting others.
   Open the magic link in the same browser that requested it (PKCE).
5. Restart preview. Test each provider, sign-out, creating a member room, its
   saved home-page entry, and joining its link in a signed-out browser. Complete
   sign-in from that invite and confirm it returns to the original room.

Sessions use server-managed HttpOnly cookies and verified `getUser()` identities.
Authentication and account responses disable caching. Mutation endpoints check
the request origin; the WebSocket proxy strips any client-supplied identity
headers before supplying the verified identity. OAuth callbacks constrain the
return path to this site. Missing configuration shows a guest-friendly message.
Actual OAuth and email delivery require a configured project to validate.

## How sync works

Astro serves the pages and proxies `/api/ws/:room` to one Durable Object per room.
The object stores the queue and room timeline in durable storage, and socket
identities in WebSocket attachments. It broadcasts an authoritative snapshot
after accepted changes, with an elapsed-time-adjusted position.

Queue items and playback loads have separate identities. A late event from an
old load cannot advance a new video, even when the same YouTube video appears
twice. Revision checks reject outdated play, pause, and seek commands.

The browser keeps the latest room state while YouTube loads, detects native seeks,
requests periodic snapshots to correct drift, and reconnects after connection
loss. Remote player events settle against the desired room state instead of
being suppressed for a fixed number of milliseconds.

## The cats

Bean is an ongoing character-engine project. Start with the
[project guide](docs/bean/README.md) for its vision, architecture, roadmap and
current agent handoff. The page integration boundary is `cats/index.js`.

Bean, a curious black tuxedo kitten, is the only resident on youple.tv. His
sleepy, playful, lonely, curious and hungry drives rise and fall with what he
does and the time of day. Weighted choices decide what he wants to do next.
He is calm by default: you usually find him asleep or loafing, and his trips
across the screen are rare enough to feel like events.

The page is his world. Bean walks a perspective floor, jumps onto cards and
headings, climbs panels, hides behind them, peeks around screen edges, leaves
and returns, and presses his face against the glass. He can groom, nap, get
the zoomies, stalk the cursor, hunt butterflies and knock decorations around.
In rooms he watches the video and responds to playback and title hints.

Stroke Bean with the cursor to pet him, click to boop, drag to pick him up or
double-click empty space to drop a treat. The small **Bean** menu has four
actions: come say hi, give a treat, the laser pointer, and let Bean sleep (or
wake him). His trust and counters are saved in `localStorage`, per browser.

**Aquarium** (`?wallpaper=1`) is Bean's own cozy room: fairy lights, a lamp, a
cat tree, a sofa, a window whose sky follows your time of day and drifting
weather, a TV, and a turntable with five records (Ambient, Lo-fi, Piano, Jazz,
Sleep) that play on the TV. One record glows as Bean's pick for the hour and
weather, and Bean sometimes paws it. While a record plays he listens: he
sways a little to lo-fi and jazz, and dozes off to piano or sleep music. In a watch room the player sits on that
TV, with fullscreen still available. Bean climbs, naps and watches from the
furniture, and stays quiet while a video plays. **Back to site** or **Back to
room** leaves it, and so does narrowing the window to phone width.

The roaming cat is desktop only. Phones and touch-first screens show one
static black cat instead.

Video context comes from the current title and playback state only. It does not
listen to audio or inspect frames. Cat interactions are local to each viewer.

### Architecture

- `cats/index.js`: versioned page facade for mounting Bean, context, controls,
  detached debug snapshots and disposal.
- `cats/runtime.js`: one clock and frame loop, seeded randomness, simulated-time
  effects and lifecycle cleanup, tested in `test/cat-runtime.test.js`.

- `cats/cast.js`: character definitions and `ACTIVE_KINDS`, which limits the
  world and panel to Bean. Dormant definitions preserve older saved memories.
- `cats/mind.js`: DOM-free drives, moods, trust, friendships and the weighted
  choice of what to do next. Tested in `test/cats.test.js`.
- `cats/body.js`: a small 3D rig (spheres, sticks, a lagging tail chain and face
  decals mapped onto the head) drawn to canvas through a tilted camera, so a cat
  can turn all the way round. Pose targets ease, gait drives the legs.
- `cats/world.js`: one full-screen canvas with `pointer-events: none`. It measures
  the page into a floor, ledges (cards, tiles, glyph skylines of headings),
  hideouts and toys, plans routes between them, runs behaviours as generator
  functions, and draws cats that are behind a panel into a masked layer so the
  panel covers them. Also interactions, the panel and persistence. Exposes `observe`, `linkError` and `inviteCopied` for the pages.

Cats never take clicks from the page: the canvas ignores pointer events, cat
interactions are ignored over links, buttons, inputs and the player, cats avoid
resting over text and controls. Reduced
motion rules out zoomies, chases and pounces; **Calm Bean** puts him to sleep.
Add `?catdebug&catseed=42` to expose `window.youpleCats` with a fixed random seed
for local testing. `youpleCats.snapshot()` reports current runtime and character
state. Full browser replay is not yet implemented.

