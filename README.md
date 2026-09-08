# Mini Duel

A Vercel-ready, head-to-head mini crossword game built with **Next.js 16, React 19, and PostgreSQL**. Visitors automatically enter a waiting room, pair with the next player, and race on the same original pop-culture puzzle. Includes a timer, live opponent progress, server-checked wins, and a persistent leaderboard.

The repository contains **100 generated 5×5 puzzles**.

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
