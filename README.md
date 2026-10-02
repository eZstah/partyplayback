# PartyPlayback

Watch YouTube together in a shared room. Everyone with the same room link shares
a video queue, playback position, and play/pause controls.

## Run locally

Use Node.js 22 or newer.

```sh
npm ci
npm run preview
```

Open the address printed by Wrangler (normally http://localhost:8787) in two
browser tabs. Choose the same room name in both tabs and add a YouTube video.
Use `preview` for room testing: it builds the Astro app and runs its Cloudflare
Worker and Durable Object locally. `npm run dev` starts the same complete room
runtime. For Astro-only page development, use `npm run astro -- dev`; that mode
does not provide the complete room runtime. Stop the preview before rebuilding,
then restart it after code changes.

## Watching together

- Share the room URL with the other viewers.
- Paste a YouTube watch, short, live, embed, or youtu.be video link.
- Play, pause, and seek with the YouTube player. The buttons below the player also
  control playback for the room; Next moves to the next queued video.
- If your browser blocks autoplay, click **Enable playback**. This enables your
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
deployment dry run without publishing.

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

Deployment requires Cloudflare authentication. `wrangler.json` declares the
`ROOM` Durable Object binding and its existing SQLite migration.
`scripts/post-build.mjs` adds the RoomDO export to the generated Astro worker;
always build through the npm scripts.

Room names are shared spaces: anyone who knows a room URL can join and control
it. There are no accounts or private-room permissions yet.

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

The inherited blog pages and existing visual styling are still present.
