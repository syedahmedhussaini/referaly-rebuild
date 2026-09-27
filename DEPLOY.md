# Deploying to Vercel

Stack: TanStack Start (Nitro) + Neon Postgres/PostGIS + Drizzle + Better Auth.

## 1. Create the Neon database

Easy path: in Vercel, go to **Storage → Create → Neon** (Marketplace integration).
It provisions a Neon Postgres and injects `DATABASE_URL` (pooled) plus the
direct connection vars into your project automatically.

Manual path: create a project at [neon.tech](https://neon.tech), then add its
**pooled** connection string as `DATABASE_URL` in Vercel (Project → Settings →
Environment Variables). The pooled hostname contains `-pooler` — required on
serverless, where functions can't hold open DB connections.

Then enable PostGIS once, in the Neon SQL editor:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection string | Auto-set by the Neon integration |
| `BETTER_AUTH_SECRET` | random 32-byte secret | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` | Must match the real URL or auth callbacks break |
| `VITE_GOOGLE_MAPS_API_KEY` | public Maps browser key | **Set before the first build** — baked into the client bundle at build time. Restrict by HTTP referrer to your Vercel domain |
| `GOOGLE_MAPS_API_KEY` | server Maps key | Only used by the offline `db:geocode` / `db:enrich-reviews` scripts, not by the running app. Optional on Vercel |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials | Optional — app runs on email/password without them |

Apply to **Production** (and Preview if you want the map working in previews).

## 3. Build settings

Vercel should detect the repo and build with `npm run build`. Nitro
auto-detects the Vercel environment during the build and emits Vercel-native
output (`.vercel/output`) — no `vercel.json` needed. If the build ever produces
a plain static output instead, set env var `NITRO_PRESET=vercel` as a fallback.

## 4. Migrate + seed the production database

Run once from your machine, pointed at Neon. Use the **direct** (non-pooled)
connection string for migrations:

```bash
cd app
DATABASE_URL="<neon-direct-url>" npm run db:migrate
DATABASE_URL="<neon-direct-url>" npm run db:seed
# Optional: geocode + reviews (needs GOOGLE_MAPS_API_KEY in your local .env)
DATABASE_URL="<neon-direct-url>" npm run db:geocode
DATABASE_URL="<neon-direct-url>" npm run db:enrich-reviews
```

## 5. Deploy

Push to `main` (or hit **Deploy** in Vercel). After the first deploy, confirm
the real URL matches `BETTER_AUTH_URL` — update and redeploy if it doesn't.

## 6. Verify

- `/` — directory loads with clinic cards
- Filter by scan type, toggle map (needs `VITE_GOOGLE_MAPS_API_KEY`)
- `/clinic/<id>` — detail page renders with JSON-LD
- Sign up with email/password (Better Auth + Neon)

## Notes

- `VITE_*` vars are build-time: changing them requires a redeploy.
- Preview deployments get unique URLs, so `BETTER_AUTH_URL` won't match them —
  email/password auth on previews will fail at the callback step. Production is
  unaffected.
- The `pg` Pool in `src/db/client.ts` is module-level, so warm serverless
  instances reuse connections through Neon's pooler. No code changes needed.
- Weekly Google-reviews refresh (`db:enrich-reviews`) isn't scheduled yet —
  run it manually or add a Vercel Cron later.
