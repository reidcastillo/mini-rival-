# Mini Duel

A small multiplayer crossword race built with React, Vinext, and Cloudflare D1. Opening the site automatically joins the waiting room. The next visitor is paired with you; both get the same puzzle and server start time. The first complete, correct submission wins.

## Open and run in VS Code

Open `/Users/reidcastillo/Mini` as a folder in VS Code. Use **Node.js 24** (`nvm install && nvm use` if you use nvm), then run:

```sh
npm install
npm run db:local
npm run dev -- --host 0.0.0.0
```

Open the URL printed by the server. Use two separate browser windows with fresh tabs, or two browsers, to try a duel. Each tab creates an anonymous guest session. Reloading that tab reconnects to the same race; copying a tab with the browser's Duplicate command may copy its session, so open the link in a fresh tab instead. To play on two devices locally, both must use the same server on your network; HTTPS hosting is the easiest option because guest session creation uses browser secure-context APIs.

## Where to edit

- `app/page.tsx`: waiting room, crossword controls, timer, results, opponent grid, leaderboard.
- `app/globals.css`: typography, colors, responsive layout, grid styling.
- `lib/puzzles.ts`: original server-only puzzle bank. The prototype includes one 5×5 puzzle. Add grids and matching across/down clues here. Clues are numbered automatically in row order.
- `app/api/game/route.ts`: guest sessions, pairing, progress, completion validation, and leaderboard queries.
- `db/schema.ts` and `drizzle/`: persistent data schema and migrations.
- `.openai/hosting.json`: Sites project and database binding.

## Controls

Click a square and type. Click it again, or press Enter, to switch across/down. Arrow keys move between cells; Tab/Shift+Tab within the grid move through clues. Backspace erases. The on-screen keyboard works on phones.

## Rules and implementation

- A 4-second shared countdown starts each match. Clues remain hidden until the server start time.
- Opponent progress means **filled squares**, not confirmed correct answers. Letters and solutions are never sent to the opponent.
- Updates are sent as you type and synchronized roughly every 850 ms. The server clock determines race time; network latency can affect close finishes.
- A conditional database update records exactly one winner. Stale submissions cannot overwrite newer edits or a finished race.
- Waiting players expire after 45 seconds without a heartbeat. Active matches cancel without awarding a win when an opponent has been gone for 45 seconds, or after 15 minutes.
- Leaderboards persist in D1 and rank anonymous sessions by wins, then fastest winning time. No account system yet; closing a tab loses that guest's session. Repeated play currently uses the same starter puzzle.
- This is a playable prototype, not a cheat-resistant ranked platform. It does not include accounts, skill-based pairing, moderation, or protection against automated solvers.
- The visual layout is inspired by compact newspaper crosswords. Branding and clues are original; this is not affiliated with The New York Times.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

The integration test requires a **fresh, isolated local database**, because it asserts an empty leaderboard and queue. After a build, start a separate server with `npx wrangler dev --config dist/server/wrangler.json --port 3001 --persist-to .wrangler/test-state`, apply the schema to that same test state using `npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc --persist-to .wrangler/test-state`, then run `MINI_TEST_URL=http://localhost:3001 npm test`. Use a fresh test-state directory for subsequent runs. Tests cover matchmaking, countdown, private progress, invalid grids, stale revisions, concurrent finishes, replay, and origin validation.

## Hosting

The project is configured for Sites with the logical D1 binding `DB`. Generate a new migration with `npm run db:generate` after changing the schema. Build before publishing; Sites applies the saved migrations to the hosted database. Local data and hosted data are separate. The public game must run with its backend; a static file host alone will not support multiplayer.

WebMCP: a feature-detected `read_duel_status` tool exposes race status and filled-square counts where supported. Its browser registration was not tested in this environment.
