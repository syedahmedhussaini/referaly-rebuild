# Referaly Rebuild — Phase 0

Foundation for the Referaly reimplementation (GTA imaging-clinic wait-time
directory): TanStack Start (SSR), Postgres + PostGIS via Drizzle, Better Auth
(email/password + Google OAuth), Tailwind CSS.

Full project plan: [`../PLAN.md`](../PLAN.md).

## Prerequisites

- Node.js 22+
- npm 10+
- Docker (for the local Postgres + PostGIS database)

## Setup

```bash
cp .env.example .env
# 1. Start the database (PostGIS 17)
docker compose up -d

# 2. Install dependencies
npm install

# 3. Run migrations (creates the PostGIS extension + all tables)
npm run db:migrate

# 4. Start the dev server
npm run dev
# → http://localhost:3000
```

Useful scripts:

| Script                | What it does                              |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | Dev server (port 3000)                    |
| `npm run typecheck`   | `tsc --noEmit`                            |
| `npm run lint`        | Biome check on `src/`                     |
| `npm run build`       | Production build (Nitro, node-server)     |
| `npm run start`       | Run the production build (`--env-file=.env`) |
| `npm run db:generate` | Generate a migration from schema changes  |
| `npm run db:migrate`  | Apply migrations to `DATABASE_URL`        |
| `npm run db:push`     | Push schema directly (dev only, no migration file) |
| `npm run db:seed`     | Idempotent import of demo clinics from `../seed-data/clinics.json` |

## Seeding demo data

`npm run db:seed` imports the 10 demo clinics in `../seed-data/clinics.json`
into `clinics`, `locations`, and `services`. It is safe to re-run: clinics
already present (matched by name + address) are skipped.

> **Before Phase 2 (map search):** `locations.geom` is left `NULL` by the seed.
> Geocode every `locations.address` with the Google Geocoding API and backfill
> `geom` — viewport map queries depend on it. See the TODO in `src/db/seed.ts`.

## Database schema

Drizzle schemas live in `src/db/`:

- `schema.ts` — `clinics`, `locations` (PostGIS `geometry(Point, 4326)` + GiST
  index for the Phase 2 map search), `services` (scan types), `wait_times`,
  `clinic_claims`
- `auth-schema.ts` — Better Auth tables (`user`, `session`, `account`,
  `verification`), hand-maintained (the `@better-auth/cli` package is
  deprecated). If you add Better Auth plugins that need tables, add them here.

Migrations are in `drizzle/`. The first migration enables the `postgis`
extension before creating the `locations.geom` column.

## Auth

Better Auth is mounted at `/api/auth/*` (`src/routes/api/auth/$.ts`).
Email/password sign-up/sign-in works out of the box. Client usage:

```ts
import { signIn, signUp, signOut, useSession } from '#/lib/auth-client'
await signIn.email({ email, password })
```

Roles (`patient` | `clinic` | `admin`) live on `user.role` (defaults to
`patient`, not settable at sign-up). Server-side:

```ts
import { requireUser } from '#/lib/session'
const { user, role } = await requireUser(['clinic', 'admin'])
```

## Connecting Neon (managed Postgres)

Local dev uses Docker, but any Postgres with PostGIS works — including Neon:

1. Create a project at [neon.tech](https://neon.tech) and copy the pooled
   connection string.
2. Enable PostGIS on the database (Neon supports extensions — run once):
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Set `DATABASE_URL` in `.env` to the Neon connection string.
4. Run `npm run db:migrate` — the migration is idempotent (`IF NOT EXISTS`).

## Enabling Google OAuth

Google sign-in is wired but dormant: it activates automatically when both
variables below are set. Until then the app runs on email/password only —
no Google Cloud account is required to develop.

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth client ID** (type: Web application).
3. Add the authorized redirect URI:
   `https://<your-domain>/api/auth/callback/google`
   (for local dev: `http://localhost:3000/api/auth/callback/google`).
4. Copy the client ID and client secret into `.env`:
   ```bash
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
5. Restart the dev server. A "Continue with Google" option becomes available
   via `signIn.social({ provider: 'google' })`.

## Project structure

```
src/
  db/            # Drizzle schemas (schema.ts, auth-schema.ts) + client.ts
  lib/
    auth.ts        # Better Auth server config (roles, Google env-gating)
    auth-client.ts # React client (signIn/signUp/signOut/useSession)
    session.ts     # Server helpers: getSession, requireUser
  routes/
    __root.tsx     # HTML shell
    index.tsx      # Directory (SSR listing + scan-type filters)
    clinic.$clinicId.tsx  # Clinic detail (contact, services, wait times, JSON-LD)
    api/auth/$.ts  # Better Auth handler
drizzle/           # SQL migrations
.github/workflows/ci.yml  # install → typecheck → lint → build
```
