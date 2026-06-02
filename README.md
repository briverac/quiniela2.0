# Quiniela 2.0

Full-stack prediction pool (“quiniela”) for tournament **WC26** (FIFA World Cup 2026), ported from the original [Rails app](../quiniela): React SPA + **Cloudflare Workers** + **D1** (SQLite). Auth is **Google OAuth only**.

## Stack

- **Frontend:** Vite, React 19, React Router, Recharts
- **Backend:** Hono worker (see [`worker/app.ts`](worker/app.ts))
- **Data:** Drizzle ORM + D1; schema in [`migrations/0001_initial.sql`](migrations/0001_initial.sql); seed from [`data/wc26.yml`](data/wc26.yml) via [`scripts/build-seed.mjs`](scripts/build-seed.mjs) → [`migrations/0002_seed.sql`](migrations/0002_seed.sql). Kickoff times in `wc26.yml` are checked against the **FIFA calendar API** (`npm run db:check-wc26-fifa`). You can still regenerate structure from Wikipedia + Hiraoka with [`scripts/gen-wc26-from-sources.mjs`](scripts/gen-wc26-from-sources.mjs) (`npm run db:gen-wc26-yml`, set `WC26_WIKI_MD` if the default path is wrong); then fix any time drift the check reports.

## Prerequisites

- Node 20+
- A [Cloudflare](https://dash.cloudflare.com/) account
- A [Google Cloud](https://console.cloud.google.com/) OAuth client (Web application) — redirect URIs in [Setup](#setup) below

## Setup

Production is **one Cloudflare Worker**: React static assets, `/api/*` on Hono, and D1 bound in [`wrangler.jsonc`](wrangler.jsonc). Local dev uses the same config via the Vite + Wrangler plugin (`npm run dev`).

### One-time (shared by local and production)

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Log in to Cloudflare:

   ```bash
   npx wrangler login
   ```

3. Create a D1 database (once per account):

   ```bash
   npx wrangler d1 create quiniela2
   ```

   Put the returned `database_id` into [`wrangler.jsonc`](wrangler.jsonc) → `d1_databases[0].database_id` (replace the placeholder UUID).

4. Copy [`.dev.vars.example`](.dev.vars.example) to `.dev.vars` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and comma-separated `ADMIN_EMAILS`.

5. In Google Cloud Console, add **Authorized redirect URIs** for sign-in. The app always uses `{origin}/api/auth/google/callback`:

   | Environment | When you know the URL | Example |
   |---------------|------------------------|---------|
   | Local | After `npm run dev` | `http://localhost:5173/api/auth/google/callback` (or the port Vite prints) |
   | Production | After the first `npm run deploy` | `https://<your-worker-host>/api/auth/google/callback` |

### Local development

```bash
npm run db:migrate:local
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Secrets come from `.dev.vars` only; nothing is deployed to Cloudflare yet.

### Production deploy

```bash
npm run db:migrate:remote
npm run deploy
```

1. **`db:migrate:remote`** — schema and WC26 seed on your remote D1 (before or with the first deploy).
2. **`npm run deploy`** — creates the Worker, uploads the app, prints the public URL.
3. **Production secrets** — after the Worker exists:

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put ADMIN_EMAILS
   ```

   Or set them under **Workers & Pages** → your Worker → **Settings** → **Variables**.

4. Add the **production** redirect URI in Google (see table above) if you have not already.
5. Open the Worker URL and sign in with Google.

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
| `npm run db:emit-date-migration -- migrations/0005_....sql` | Emit `UPDATE matches ... date` only from `data/wc26.yml` (after `--`, path to the new `.sql` file) |
| `npm run test` | Vitest (scoring + match close rules) |
| `npm run check` | TypeScript `tsc --noEmit` |

### Advanced: Cloudflare Worker Versions

Only if you use Cloudflare’s **Versions** workflow (`wrangler versions secret put` / `wrangler versions deploy`) instead of `npm run deploy`: run `npm run build` first, then deploy with the built config so the worker name and D1 binding match production:

```bash
npx wrangler versions deploy --config dist/mismo_quiniela/wrangler.json
```

The default documented path is `npm run deploy` (`wrangler deploy`).

## Troubleshooting: `Tournament not found`

The worker resolves the tournament by **code in D1** (the app uses `WC26`). That 404 usually means either **migrations were never applied** to the database your dev server uses, or the DB still has the **old CA24 seed** from an earlier `0002_seed.sql` (Cloudflare does **not** re-run `0002` after it was already applied).

**Fix:** run **`npm run db:migrate:local`** (or **`db:migrate:remote`** for production). Migration **`0003_wc26_reseed.sql`** runs after `0002`: it **`DELETE`s tournament `id = 1`** (CASCADE clears phases, teams, matches, and prediction data tied to that tournament) and re-inserts the WC26 fixture—the same rows as `0002`, so new installs get WC26 from `0002` and upgraded DBs get corrected by `0003`.

`npm run db:generate-seed` regenerates both **`0002_seed.sql`** and **`0003_wc26_reseed.sql`** so they stay in sync. **Remote D1:** migration SQL must not use `BEGIN TRANSACTION` / `COMMIT` (Wrangler wraps each file; explicit transactions return error 7500).

### Fixture already migrated: only kickoff times changed in `wc26.yml`

Wrangler **does not re-run** `0002` or `0003` once they have been applied. To apply new dates to a database that already has data (predictions, etc.) without wiping it:

1. After editing `data/wc26.yml`, generate a **new** migration with `UPDATE` statements only (or use **`0004`** from the repo if you have not applied it yet):
   ```bash
   node scripts/emit-match-date-migration.mjs migrations/0005_wc26_match_dates.sql
   ```
   (Bump the migration number if `0004` is already applied in that environment.)

2. Apply migrations:
   ```bash
   npm run db:migrate:local
   # or
   npm run db:migrate:remote
   ```

`0004_wc26_match_dates.sql` updates all **104** `matches.date` values for tournament `WC26` by `number`; it does not change scores or predictions. To generate the **next** migration after `0004` is already applied:

```bash
npm run db:emit-date-migration -- migrations/0005_wc26_match_dates.sql
```

## Features (parity with Rails)

- Google sign-in, sessions (D1 `sessions` table + httpOnly cookie)
- Predictions grid, save, 5-minute-before-kickoff close rule, admin scores + recalc points + lock
- Aggregate “crowd” stats per match (percent team1 / tie / team2)
- General leaderboard + mini-leagues, create board, invite / accept / reject, leave
- Group standings (phase level 1)
- FAQ (static copy + knockout phase points table from bootstrap)
- Admin: matches, users, leaderboards

## License & attribution

Copyright © Bryan Rivera. All rights reserved.

This repository is not open-source by default. If you received this code from someone else, keep this notice and credit **Bryan Rivera** as the author of Quiniela 2.0 (including in forks, internal docs, or “about” pages if you ship a public instance).

Tournament data and scripts may incorporate third-party sources (FIFA API, Wikipedia, etc.); those remain subject to their own terms.
