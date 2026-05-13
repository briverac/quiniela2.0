# Quiniela 2.0

Full-stack prediction pool (“quiniela”) for tournament **WC26** (FIFA World Cup 2026), ported from the original [Rails app](../quiniela): React SPA + **Cloudflare Workers** + **D1** (SQLite). Auth is **Google OAuth only**.

## Stack

- **Frontend:** Vite, React 19, React Router, Recharts
- **Backend:** Hono worker (see [`worker/app.ts`](worker/app.ts))
- **Data:** Drizzle ORM + D1; schema in [`migrations/0001_initial.sql`](migrations/0001_initial.sql); seed from [`data/wc26.yml`](data/wc26.yml) via [`scripts/build-seed.mjs`](scripts/build-seed.mjs) → [`migrations/0002_seed.sql`](migrations/0002_seed.sql). Regenerate `wc26.yml` from Wikipedia + Hiraoka with [`scripts/gen-wc26-from-sources.mjs`](scripts/gen-wc26-from-sources.mjs) (`npm run db:gen-wc26-yml`, set `WC26_WIKI_MD` if the default path is wrong).

## Prerequisites

- Node 20+
- A [Cloudflare](https://dash.cloudflare.com/) account (for D1 + Workers + deployment)
- Google Cloud OAuth client (Web application) with authorized redirect URI:  
  `https://<your-worker-host>/api/auth/google/callback`  
  and for local dev with Vite:  
  `http://localhost:5173/api/auth/google/callback` (or the port Vite prints)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a D1 database (once per Cloudflare account / name):

   ```bash
   npx wrangler d1 create quiniela2
   ```

   Put the returned `database_id` into [`wrangler.jsonc`](wrangler.jsonc) under `d1_databases[0].database_id` (replace the placeholder UUID).

3. Copy secrets for dev:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (any long random string; reserved for future use), and comma-separated `ADMIN_EMAILS` for users who should receive `admin: true` on first Google login.

4. Apply migrations to the **local** D1 emulator:

   ```bash
   npm run db:migrate:local
   ```

5. Run the app (Cloudflare Vite plugin — Worker + D1 + static assets):

   ```bash
   npm run dev
   ```

   Open the printed URL (usually `http://localhost:5173`). Sign in with Google; a prediction set and empty predictions for all matches are created automatically.

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Vite dev + local Worker + D1 |
| `npm run build` | Production client + worker bundle; copies SQL migrations into `dist/mismo_quiniela/migrations/` |
| `npm run deploy` | Build then `wrangler deploy --config dist/mismo_quiniela/wrangler.json` |
| `npm run db:migrate:local` | Apply migrations to local D1 |
| `npm run db:migrate:remote` | Apply migrations to **remote** D1 (needs valid `database_id`) |
| `npm run db:generate-seed` | Regenerate `migrations/0002_seed.sql` from `data/wc26.yml` (override with `SEED_YAML=...`) |
| `npm run db:gen-wc26-yml` | Rebuild `data/wc26.yml` from the Spanish Wikipedia annex markdown + Lima fixups |
| `npm run test` | Vitest (scoring + match close rules) |
| `npm run check` | TypeScript `tsc --noEmit` |

**Worker Versions:** after `wrangler versions secret put`, deploy with the same config as prod, e.g. `npx wrangler versions deploy --config dist/mismo_quiniela/wrangler.json` (run `npm run build` first). Running `versions deploy` without `--config` can follow an old redirect to `dist/quiniela2/` and target a non-existent worker name.

## Troubleshooting: `Tournament not found`

The worker resolves the tournament by **code in D1** (the app uses `WC26`). That 404 usually means either **migrations were never applied** to the database your dev server uses, or the DB still has the **old CA24 seed** from an earlier `0002_seed.sql` (Cloudflare does **not** re-run `0002` after it was already applied).

**Fix:** run **`npm run db:migrate:local`** (or **`db:migrate:remote`** for production). Migration **`0003_wc26_reseed.sql`** runs after `0002`: it **`DELETE`s tournament `id = 1`** (CASCADE clears phases, teams, matches, and prediction data tied to that tournament) and re-inserts the WC26 fixture—the same rows as `0002`, so new installs get WC26 from `0002` and upgraded DBs get corrected by `0003`.

`npm run db:generate-seed` regenerates both **`0002_seed.sql`** and **`0003_wc26_reseed.sql`** so they stay in sync. **Remote D1:** migration SQL must not use `BEGIN TRANSACTION` / `COMMIT` (Wrangler wraps each file; explicit transactions return error 7500).

## Remote D1 migrations

After `wrangler d1 create` and updating `database_id`, run:

```bash
npm run db:migrate:remote
```

Then configure the same secrets in the Cloudflare dashboard (Workers → Settings → Variables) or use `wrangler secret put`.

## Google OAuth callback

The app builds the redirect URI from the request origin (`/api/auth/google/callback`). Ensure your Google client allows exactly that origin + path for each environment (local and production).

## Features (parity with Rails)

- Google sign-in, sessions (D1 `sessions` table + httpOnly cookie)
- Predictions grid, save, 5-minute-before-kickoff close rule, admin scores + recalc points + lock
- Aggregate “crowd” stats per match (percent team1 / tie / team2)
- General leaderboard + mini-leagues, create board, invite / accept / reject, leave
- Group standings (phase level 1)
- FAQ (static copy + knockout phase points table from bootstrap)
- Admin: matches, users, leaderboards

## License

Private / same as your monorepo preference.
