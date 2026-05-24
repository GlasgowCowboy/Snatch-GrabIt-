# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Express + Vite middleware (HMR). Sources .env if present.
npm run check        # tsc --noEmit
npm test             # Vitest, one-shot. ~94 tests across shared/ + server/.
npm run test:watch   # Vitest watch mode
npm run build        # Vite → dist/public/, esbuild server → dist/index.js
npm start            # Run the production build

npm run db:migrate   # Apply migrations from migrations/ (reads _journal.json)
npm run db:generate  # Diff shared/schema.ts vs latest snapshot → new migration
npm run db:push      # Dev-only: sync schema directly to DB. Skips migrations table.
```

**Single test:** `npx vitest run shared/__tests__/gameEngine.test.ts` or `npx vitest run -t "fullHand: +1 per foundation"`.

**Tests assume MemoryStorage** — leave `DATABASE_URL` unset when running them. Vitest sets `NODE_ENV=test`, which also bypasses rate limiters and email sending.

## Storage mode switch

`server/storage.ts` exports a single `storage` instance. If `DATABASE_URL` is set it's `DatabaseStorage` (Drizzle); otherwise it's `MemoryStorage`. The dev script now auto-sources a gitignored `.env`, so a one-line `.env` containing `DATABASE_URL=...` is enough to flip the app onto Postgres.

`server/db.ts` picks the driver from the URL: `pg` for `localhost` / `127.0.0.1`, `@neondatabase/serverless` (WebSocket) for everything else.

## Migration gotcha

`db:migrate` expects a `__drizzle_migrations` tracking table. Any DB originally set up via `db:push` won't have it — running `db:migrate` will then fail on `relation already exists` for the baseline tables. In that case either bootstrap the tracking table manually, or apply just the new migration's SQL directly via `psql` (the indexes in `0002_peaceful_randall.sql` are pure `CREATE INDEX`, so idempotent and safe to apply that way).

When editing `shared/schema.ts`, run `db:generate` and commit both the new `migrations/NNNN_*.sql` and the corresponding `migrations/meta/NNNN_snapshot.json`. The snapshot chain (`prevId` in each snapshot) is what drizzle-kit uses to compute the next diff — don't hand-edit migrations without also updating the journal + snapshot, or future generates will create duplicates.

## Architecture: how live game state flows

Live games are **not persisted** — only durable records (users, game history, bets) live in Postgres. The flow:

1. `POST /api/rooms` → `RoomManager.createRoom()` in `server/rooms.ts` creates an in-memory `Room` and a `games` row (so bets placed during the lobby can FK to it).
2. Players join via REST; once host calls `/start`, `Room.gameState` is populated by `createInitialGameState()` from `shared/gameEngine.ts`.
3. Clients connect to `ws://.../ws?code=ROOM&playerId=PID`. `server/gameSocket.ts` validates, adds the conn to `connectionsByRoom`, and pushes `{type:'state', state}` on every change.
4. `{type:'move'}` messages from clients (and synthetic moves from AI timers) call `executeMove(state, playerId, move)` — a pure function in `shared/gameEngine.ts`. The result replaces `room.gameState` and gets broadcast.
5. When `status` becomes `gameOver`, `finalizeFinishedGame()` writes `game_participants` rows, grants persistent credits via `storage.grantCredits()`, then `settleGameBets()` pays out chips.

**Why this matters for Claude:**
- The game engine has **no I/O** — `executeMove` takes a state, returns a new state. All persistence is bolted on at the WS boundary in `gameSocket.ts`. Don't push DB calls into `shared/`.
- AI moves are driven by per-room `setTimeout` chains stored in `aiTimersByRoom`. Clearing them on round transitions (`clearAITimers`) is load-bearing — without it, old timers reschedule themselves and pile up exponentially across rounds (was the cause of a prior server-hang bug).
- `shared/` is imported by both client and server (path alias `@shared`). Anything you put there must be runtime-safe in the browser (no Node built-ins, no DB code).

## Game constants

Numeric game rules are named constants in `shared/deckUtils.ts` and `shared/gameEngine.ts`:
- `BONE_PILE_SIZE = 13`, `TABLEAU_COLUMN_COUNT = 4`, `DRAW_PILE_SIZE = 35`, `DRAW_TURN_COUNT = 3`
- `DECLARE_OUT_SCORE_BONUS = 5`, `BONE_PILE_PENALTY = 2`, `BURNED_CARD_PENALTY = 2`
- `NEW_FOUNDATION_INDEX = -1` (sentinel in `GameMove.foundationIndex` for "make a new pile")

Don't reintroduce raw numbers — use the constants. Same for `DAILY_CHIP_RESET_AMOUNT` / `DAILY_CHIP_RESET_INTERVAL_MS` in `server/storage.ts`.

## Deep cloning

`shared/gameEngine.ts:cloneState` uses `structuredClone`, not `JSON.parse(JSON.stringify())`. Game state is plain JSON-shaped (no Dates, Maps, class instances) so this is safe. Keep it that way — adding non-cloneable values to `GameState` will break the engine.

## Conventions worth knowing

- **Auth**: `passport-local` with scrypt password hashing; sessions stored in Postgres (`connect-pg-simple`) when DB is available, in memory otherwise. Rate limiters on `/api/login`, `/api/register`, `/api/forgot-password`, `/api/rooms`, `/api/invite` — all skipped unless `NODE_ENV=production`.
- **Validation**: All HTTP bodies are parsed through Zod schemas (`shared/rooms.ts` for room ops, inline in `server/routes.ts` for the rest). Errors are mapped to `{message, errors}` shape — match that contract.
- **Two currencies**: `virtualChips` reset daily, used for bets; `earnedCredits` are persistent, granted by placement/declare-out. Distinct API endpoints (`/api/betting/balance` vs `/api/credits/balance`).
- **Card IDs include player ID** (`${playerId}-${suit}-${rank}-${random}`) so the same physical card has different IDs in different players' decks — prevents conflicts during multiplayer state diffing.
- **Game rooms have 6-hour TTL** (`ROOM_TTL_MS` in `server/rooms.ts`), eviction is lazy (on next `createRoom`).

## What to ignore

- `replit.md` is **stale** — it describes a pre-WebSocket, pre-auth, MemStorage-only architecture that no longer matches the code. Treat the actual source + README + this file as authoritative.
- `attached_assets/` holds intentional reference images; the dozens of `after_*.png` / `step*.png` files that used to sit in the repo root were debug screenshots and have been removed.
