# Working on youple.tv

youple.tv is an Astro app on a Cloudflare Worker (rooms are Durable Objects).
Konstantin owns it. Claude and Codex both work here, so keep changes small and
reviewable.

## Commands

```sh
npm ci
npm run preview   # build and serve on http://localhost:8787 (stop it before rebuilding)
npm test          # unit and simulation tests
npm run check     # build, TypeScript and a Wrangler dry run (what CI runs)
```

## Pull requests

- Every merge to `main` deploys youple.tv automatically. Never push to `main`:
  open a pull request from your own branch and let Konstantin merge it.
- One focused change per pull request, with `npm test` and `npm run check` passing.
- Before branching, fetch `main` and look at open pull requests, because others
  may be changing the same files.
- Say in the description what you checked by hand and what you could not check.

## Bean, the cat

Bean is a long-running character engine, improved one small step at a time and
never rebuilt from scratch. Before touching `src/scripts/cats/`, read
`src/scripts/cats/AGENTS.md` and the docs in `docs/bean/` (start with
`VISION.md`, then `ARCHITECTURE.md`, `ROADMAP.md` and `HANDOFF.md`). Bean is calm
by default: mostly asleep, loafing or out of sight, with rare trips across the
screen. Try things in the browser with `?catdebug`, for example
`youpleCats.snapshot()` or `youpleCats.play('Bean', 'groom')`.
