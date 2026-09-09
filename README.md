# Mini Duel

Visitors automatically enter a waiting room, pair with the next player, and race on the same puzzle. Includes a timer, live opponent progress, server-checked wins, and a persistent leaderboard.

The repository contains **500 generated 5×5 puzzles**.

## Program breakdown

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
npm run puzzles:generate -- 500
```

Existing puzzle order is preserved because saved matches reference puzzle indices. The legacy puzzle stays at index zero. New races choose from 500 generated grids, avoid grids in recent match history, and favor answers that have not appeared in the last few races. Both players’ histories are considered when pairing. Common short answers can still recur, with alternate clues providing additional variety.

The generator uses several layouts, checks every crossing, and prevents repeated answers within a grid. `data/clue-variants.json` contains alternate clues. Extend the dictionary and regenerate to add variety. Commit generated data and redeploy to publish it.

Robot practice starts with a difficulty selection: Novice takes 45–60 seconds and Intermediate takes 30–45 seconds. Each rematch returns to setup. Apply new database migrations with `npm run db:migrate` before deploying changes to database fields.

## Rumble

Choose 1 V 1 Rumble for public or private friend races with powers. Correct-letter milestones at 25%, 50%, and 75% unlock the three powers in a random order for each player: Freeze (three seconds with a blue frost overlay and icicles), Mirror (ten seconds of reversed entry with an animated board flip and a shiny screen), and Check (slashes on your current incorrect letters). Each power can be activated once per race. Classic and Rumble queues are separate; robot practice uses Classic. Rematches preserve the rules and reset powers. Apply the new migration before deploying.
