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
- Use the large Play/Pause button, the timeline to seek, and Next to skip.
- Space or K: play/pause. Left/right: seek 5 seconds. J/L: seek 10 seconds.
  N: next. F: fullscreen. T: theater. M: local mute. ?: shortcuts.
  Shortcuts stay inactive in inputs and dialogs. Esc closes dialogs/fullscreen.
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

The home page puts an inline Create room form beneath the youple.tv wordmark,
with three animated mascot characters and a short explanation below. The home
and room pages use larger readable labels, no navigation arrows or eyebrow
labels, native accessible dialogs, local fonts and reduced-motion support.
Mascot eyes follow pointer movement; playlist additions use the Web
Animations API without replacing unchanged rows on every sync.
