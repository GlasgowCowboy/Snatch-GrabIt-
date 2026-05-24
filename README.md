# Snatch&GrabIt!

Fast-paced multiplayer competitive solitaire. Race opponents to empty your "bone pile" by playing onto shared foundations and your tableau, with optional virtual betting on the side.

- React + Vite client (TypeScript, Tailwind, shadcn/ui)
- Express + WebSocket server (server-authoritative game state)
- Postgres via Drizzle ORM (dual-driver: `pg` for local, `@neondatabase/serverless` for Neon)
- Resend for transactional email (optional — falls back to console logs when unset)

## Quick start (local dev)

```bash
# 1. Postgres — Homebrew, Postgres.app, Docker, whatever.
createdb snatchgrab_dev

# 2. Apply the schema.
DATABASE_URL="postgresql://$USER@localhost:5432/snatchgrab_dev" npm run db:migrate

# 3. Run the dev server (Vite middleware mode, HMR enabled).
DATABASE_URL="postgresql://$USER@localhost:5432/snatchgrab_dev" npm run dev
```

Then open <http://localhost:3000>.

## Environment variables

| Variable           | Required        | Default                                       | Notes                                                                                          |
| ------------------ | --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | Yes (prod, dev) | unset → in-memory storage in dev              | Standard Postgres connection string. Neon URLs auto-detected; everything else uses `pg`.       |
| `SESSION_SECRET`   | **Yes in prod** | `dev-secret-change-in-production` (dev only)  | Server refuses to boot in production without a real value. `openssl rand -hex 32` is fine.     |
| `APP_URL`          | Recommended     | `http://localhost:3000`                       | Public origin used in email links (password reset, verification, invite).                      |
| `RESEND_API_KEY`   | Optional        | unset → emails log to console                 | Resend API key. With it, real emails ship; without it, the body prints to the server log.      |
| `EMAIL_FROM`       | Optional        | `Snatch&GrabIt! <onboarding@resend.dev>`      | Override sender. Use a verified domain in Resend before going live.                            |
| `PORT`             | Optional        | `3000`                                        | HTTP port to bind.                                                                             |
| `NODE_ENV`         | Optional        | `development`                                 | `production` switches Express to its prod path and enables rate limiting.                      |

## npm scripts

| Script                   | What it does                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `npm run dev`            | Dev server: Express + Vite middleware, HMR, tsx runtime.                              |
| `npm run build`          | Production build: Vite → `dist/public/`, esbuild bundles server → `dist/index.js`.    |
| `npm start`              | Run the production build (`NODE_ENV=production node dist/index.js`).                  |
| `npm run check`          | TypeScript typecheck (no emit).                                                       |
| `npm test`               | Vitest run (engine + integration + auth + persist + bet-settlement).                  |
| `npm run db:migrate`     | Apply pending Drizzle migrations from `migrations/`. **Run this before each deploy.** |
| `npm run db:generate`    | Generate a new migration from schema changes (commit the result).                     |
| `npm run db:push`        | Dev only: push schema straight to the DB without a migration. Don't use in prod.      |

## Schema changes workflow

1. Edit `shared/schema.ts`.
2. `npm run db:generate -- --name <short-name>` (creates a new file in `migrations/`).
3. Inspect the generated SQL — commit it.
4. `DATABASE_URL=... npm run db:migrate` to apply locally.
5. On deploy, `npm run db:migrate` runs before the app starts so the DB matches the new code.

`db:push` is still available for fast iteration on the local DB but bypasses migrations entirely — never run it against production.

## Architecture cheatsheet

```
client/src/
  pages/         Wouter route components (Home, AuthPage, StatsPage, …)
  components/   UI: GameLobby, GameBoardInteractive, BurnVoteModal, PendingInvites, …
  hooks/        use-auth, use-game-sync (WebSocket), use-mouse-position
  lib/          queryClient (TanStack Query), protected-route

server/
  index.ts      Express bootstrap + Vite middleware/static
  routes.ts     HTTP endpoints (auth, rooms, invites, bets, admin, history)
  auth.ts       Passport LocalStrategy + register / login / password-reset / email-verify
  rooms.ts      In-memory RoomManager (lobby state, AI players, host promotion)
  gameSocket.ts WebSocket server: move sync, AI driving, finalize, settlement
  invites.ts    In-memory pending invite store (TTL 30 min)
  email.ts      sendEmail() — Resend in prod, console log in dev
  storage.ts    IStorage interface + DatabaseStorage (Drizzle)
  storage-memory.ts  MemoryStorage fallback when DATABASE_URL is unset
  migrate.ts    Apply Drizzle migrations (`npm run db:migrate`)

shared/
  schema.ts     Drizzle tables + Zod schemas + TS types
  gameEngine.ts Pure rules engine (executeMove, scoring, burn vote resolution)
  aiPlayer.ts   AIPlayer with seeded-RNG support for deterministic tests
  rooms.ts      Room/RoomPlayer types + Zod request schemas
  wsMessages.ts WebSocket client↔server message types
  betSettlement.ts  determineBetOutcome (pure)
```

## Deploy notes

- **Render**: connect the repo. Set `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, optionally `RESEND_API_KEY` + `EMAIL_FROM`. Build command `npm install && npm run db:migrate && npm run build`. Start command `npm start`. Use a managed Postgres instance (Neon free tier works — the driver auto-switches).
- **Railway / Fly.io / Docker**: same env vars; ensure the run command applies migrations before booting the app (`db:migrate && start`).
- **Production rate limits are active** on auth, room creation, invites, and password reset. Only kicks in when `NODE_ENV=production`.

## Tests

```bash
npm test               # one-shot
npm run test:watch     # watch
```

Engine tests are deterministic (seeded RNG). Integration tests spin up Express + WebSocket on an ephemeral port; rate limits and email sending are bypassed/stubbed under `NODE_ENV=test` (which Vitest sets automatically).
