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

Four cats live on youple.tv: Miso (cream, the caretaker), Mochi (ginger tabby, the
instigator), Pixel (lavender, the critic) and Bean (tuxedo kitten, the apprentice).
Each has its own body shape, gait, voice and personality traits, and its own mind:
drives (sleepy, playful, lonely, curious, hungry) rise and fall with what it does
and the time of day, and a weighted choice picks what it wants next. Nothing runs
on a script.

The page is their world. They walk a perspective floor along the bottom of the
screen (smaller and slower further back), jump onto cards, headings, icon tiles
and even the letters of the wordmark, climb the sides of the create card or the
player, and hide behind the big panels so only their head and paws show over the
edge. They peek in from the sides and top of the screen, leave and come back
later, press their faces against the glass (leaving paw prints and fog), and knock
the little page decorations around. Routes are planned over the floor and every
ledge, so a cat that wants a high spot finds a way up or leaves the screen and
drops in from above.

What else they do: loaf, groom, stretch and yawn, nap (turning around before
lying down), cuddle up to friends, visit and boop noses, chase and play-fight,
hiss at someone they don't like, get the zoomies, stalk and pounce on a still
cursor, hunt butterflies, race for treats and follow each other around. In a room
they sit with their backs to you to watch the video, dance to music titles and
turn around when it pauses.

Viewers can stroke a cat with the cursor to pet it, click to boop, drag to pick it
up (and drop it onto a ledge), double-click empty space to drop a treat, or turn on
the laser pointer from the **Cats** panel. The panel shows what each cat is doing,
how it feels, how much it likes you and who its friends are, plus a short diary.
Trust, friendships and the diary are kept in `localStorage`, so the cats remember
returning visitors and notice long absences. **Aquarium** (`?wallpaper=1`) gives them
the whole screen with a deep floor to walk around on.

The living cats are desktop only. Phones and touch-first screens keep the static
mascots.

Video context comes from the current title and playback state only. It does not
listen to audio or inspect frames. Cat interactions are local to each viewer.

### Architecture

- `cats/cast.js`: looks, traits and voice lines for each cat.
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
motion rules out zoomies, chases and pounces; **Calm cats** puts everyone to sleep.
Add `?catdebug` to expose `window.youpleCats` for local testing.

