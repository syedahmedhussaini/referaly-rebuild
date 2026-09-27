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
| `npm run db:geocode`  | Backfill `locations.geom` via the Google Geocoding API (needs `GOOGLE_MAPS_API_KEY`) |
| `npm run db:enrich-reviews` | Fetch Google review snapshots via Places API (New) (needs `GOOGLE_MAPS_API_KEY`) |
| `npm run test`         | Unit tests (vitest) |

## Seeding demo data

`npm run db:seed` imports the 10 demo clinics in `../seed-data/clinics.json`
into `clinics`, `locations`, and `services`. It is safe to re-run: clinics
already present (matched by name + address) are skipped.

> **Before the map is useful:** the seed leaves `locations.geom` NULL. Run
> `npm run db:geocode` (needs `GOOGLE_MAPS_API_KEY`) — see
> "Geocoding clinic locations" below.

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

## Google Maps setup

The map search and review enrichment need a Google Cloud project with billing
enabled (the free monthly allowances per SKU cover this project's scale —
see "Google reviews enrichment" below). Enable these three APIs:

- **Maps JavaScript API** — the clinic map on the directory page
- **Places API (New)** — clinic → Place ID lookup and review snapshots
- **Geocoding API** — one-time backfill of clinic coordinates

Create **two** API keys and restrict them in
[Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials):

| Key | Used by | Restriction |
| --- | ------- | ----------- |
| `GOOGLE_MAPS_API_KEY` | `db:geocode`, `db:enrich-reviews` (server-side) | IP address |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JavaScript API (browser) | HTTP referrer (your domain) |

The server key must never be exposed to the browser. If
`VITE_GOOGLE_MAPS_API_KEY` is unset, the directory shows a "map unavailable"
fallback instead of crashing.

## Geocoding clinic locations

The seed leaves `locations.geom` NULL. Backfill it before the map is useful:

```bash
npm run db:geocode
```

Idempotent (skips already-geocoded rows), rate-limited, and fails fast on
API-key problems. The map's viewport query
(`ST_Intersects` against the `locations_geom_gist_idx` GiST index) depends on
this.

## Google reviews enrichment

```bash
npm run db:enrich-reviews
```

For each clinic: Text Search (New) resolves the Google Place ID from name +
address, then Place Details (New) fetches a snapshot (rating, review count,
up to 5 reviews) into `clinic_google_reviews`. The clinic detail page renders
it as "What patients say" with author attribution, per Google's policy.

Compliance notes (Google Maps Platform terms):

- Place Details returns **at most 5 reviews** — no pagination, no full feed.
- **Place content may not be cached longer than 30 days** (place IDs may be
  stored indefinitely). Refresh weekly, e.g. a cron job:
  `0 3 * * 0 cd /path/to/app && npm run db:enrich-reviews`
- The Places API (New) free monthly allowances per SKU cover a few hundred
  clinics refreshed weekly; monitor usage in the Cloud Console and set budget
  alerts from day one.

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
  db/seed.ts       # demo clinic import (npm run db:seed)
  db/geocode.ts    # Geocoding API backfill of locations.geom
  db/enrich-reviews.ts  # Places API (New) Google-reviews snapshots
  lib/
    auth.ts        # Better Auth server config (roles, Google env-gating)
    auth-client.ts # React client (signIn/signUp/signOut/useSession)
    session.ts     # Server helpers: getSession, requireUser
    clinics.ts     # directory/detail server fns + scan-type helpers
    map.ts         # viewport (bbox) server fn for the map
    reviews.ts     # cached Google-reviews server fn
    geo.ts         # pure bbox validation (unit-tested)
    google-places.ts  # pure Places/Geocoding helpers (unit-tested)
  components/
    ClinicMap.tsx  # Airbnb-style map (js-api-loader + markerclusterer)
  routes/
    __root.tsx     # HTML shell
    index.tsx      # Directory (SSR list + scan-type filters + map)
    clinic.$clinicId.tsx  # Clinic detail (contact, services, wait times, Google reviews, JSON-LD)
    api/auth/$.ts  # Better Auth handler
drizzle/           # SQL migrations
.github/workflows/ci.yml  # install → typecheck → lint → test → build
```
