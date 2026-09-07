# Mini Duel

A Vercel-ready, head-to-head mini crossword game built with **Next.js 16, React 19, and PostgreSQL**. Visitors automatically enter a waiting room, pair with the next player, and race on the same original pop-culture puzzle. Includes a timer, live opponent progress, server-checked wins, and a persistent leaderboard.

The repository contains **100 generated 5×5 puzzles**. No AI API key or external puzzle service is needed.

## Push this project to GitHub

The existing checkout is on `main`, with `origin` pointing to `https://github.com/reidcastillo/mini-rival-.git`. From a terminal:

```sh
cd /Users/reidcastillo/Mini
git status
git add -A
git commit -m "Make Mini Duel ready for Vercel and Postgres"
git push -u origin main
```

No `git init` or new remote is needed. Do not force-push if Git reports newer remote commits; pull and reconcile them first. `.env.local` is ignored; `.env.example` contains placeholders only.

## Set up Vercel and Neon

1. Sign in to Vercel with the GitHub account that can access your repository.
2. Choose **Add New → Project**, then import **mini-rival-**.
3. Use framework **Next.js**, root directory **./**, Node.js **24.x**, install command **npm ci**, and build command **npm run build**. Leave the output-directory override blank. Most settings are detected automatically; `vercel.json` supplies the build/install commands.
4. Deploy to create the project. The site can build without a database, but matches cannot start until steps 5–8 are complete.
5. In the project's **Storage** area or Vercel Marketplace, install **Neon**, create a Postgres database, and connect it to this project. Choose a database region near your Vercel Functions region. Choose the plan appropriate for you.
6. Under **Settings → Environment Variables**, ensure **DATABASE_URL** contains Neon's **pooled Postgres connection string**, including the SSL query parameters from Neon. It must be available to **Production**. Use a separate database/Neon branch for Preview deployments if you enable them. Never name this variable `NEXT_PUBLIC_DATABASE_URL`.
7. Initialize the production database once from your local project. Use Node.js 24. Create `.env.local` if needed:

   ```sh
   cd /Users/reidcastillo/Mini
   npm ci
   cp -n .env.example .env.local
   ```

   Open `.env.local` in VS Code and replace the placeholder DATABASE_URL with the same Neon connection string. Do not commit this file. Then run:

   ```sh
   npm run db:migrate
   ```

   It should print **Database ready.** The migration is transactional, tracks checksums, and can be safely run again. Builds intentionally do not migrate a database.
8. In Vercel's **Deployments** tab, redeploy after the environment variables are set. Environment changes apply to new deployments.
9. Open the production `vercel.app` link on two devices or in two independently opened browser tabs. Both players should pair, receive the same countdown and puzzle, and see each other's progress. Use the production URL for public play; if Vercel deployment protection requests sign-in, configure the intended public audience in the project's Deployment Protection settings.
10. A custom domain is optional. To use a registered domain, add it under **Settings → Domains** and follow Vercel's DNS instructions. The older pending Sites domain configuration does not transfer automatically.

Official references: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel storage integrations](https://vercel.com/docs/marketplace-storage), [environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

## Run locally

Install Node.js 24 (`nvm install && nvm use` if you use nvm). Set a local or Neon development database URL in `.env.local`, then:

```sh
npm ci
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. A regular local PostgreSQL URL also works, for example `postgresql://USER:PASSWORD@localhost:5432/mini_duel`. Use the connection string and TLS settings supplied by your provider for hosted databases; certificate verification is not disabled in application code.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
```

`npm test` checks all 100 grids. `npm run test:integration` also builds the app, starts a temporary real PostgreSQL database and production Next.js server on unused local ports, applies migrations twice to check idempotency, and tests real API races. It uses random local credentials, never your DATABASE_URL, and removes the temporary database afterward. Embedded Postgres requires its npm install scripts and a supported OS. It is a development test dependency, not the hosted database. Do not run the integration runner as root.

## Where to edit

- `app/page.tsx`: waiting room, board, input, timer, progress, results, leaderboard.
- `app/globals.css`: styling and responsive layout.
- `app/api/game/route.ts`: player sessions, matchmaking, submissions, results.
- `db/database.ts` and `db/pool.ts`: Postgres transactions and server-only pool.
- `db/migrations/`: versioned SQL migrations. Never edit an already-applied migration; add a new file.
- `data/pop-culture-words.json`: original word-and-clue library.
- `data/pop-culture-puzzles.json`: generated puzzles, served only through the backend.
- `scripts/generate-pop-puzzles.mjs`: constraint-based crossword generator.

## Generate more pop-culture puzzles

```sh
npm run puzzles:generate -- 150
```

This grows the library to the requested total, up to 500. Existing order is preserved because saved matches reference puzzle indices. The first legacy puzzle stays at index zero; new races choose generated puzzles and avoid the waiting player's last 20 grids. Extend the curated dictionary for more variety. Each generated puzzle has 17 playable squares, two five-letter entries, and no repeated word within the grid. Individual words and clues can recur across different grids. All words cross correctly and every white square belongs to an across and a down entry. Commit the generated JSON and redeploy to make additions available.

## Game behavior

Click a square and type; click it again or press Enter to switch direction. Arrow keys move; Tab/Shift+Tab inside the grid select clues; Backspace erases. The on-screen keyboard supports phones. Each fresh tab receives an anonymous guest session, and reloading that tab resumes it. Browser “Duplicate tab” can copy session storage; open a fresh tab via the URL for a separate player.

A shared 4-second countdown precedes each race. Opponent progress means filled squares, not confirmed correct letters. Solutions stay server-side. Changes synchronize roughly every 850 ms. Postgres advisory locks serialize matchmaking, and a conditional row update records exactly one winner when finishes compete. Network latency can affect close races.

Players expire after 45 seconds without a heartbeat. Abandoned or 15-minute matches cancel without awarding a win. Leaderboards rank guest sessions by wins, then best winning time. Closing a tab can lose access to that guest identity. This prototype has no accounts or anti-bot ranking system.

## Migration from the original hosted version

This checkout no longer depends on Cloudflare Workers, D1, Vinext, or Sites. PostgreSQL starts with an empty leaderboard; existing D1 players, matches, and scores are **not** automatically transferred. The old hosted site remains separate until you retire it. No automatic deployment or Git push is performed by the migration scripts.

The interface, clues, and puzzle library are original. Mini Duel is not affiliated with The New York Times. A feature-detected WebMCP read-status tool remains available in compatible browsers; its registration has not been browser-tested here.
