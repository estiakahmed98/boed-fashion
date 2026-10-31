# Phase 0 operations

## Required secrets

- `NEXTAUTH_SECRET` (or `AUTH_SECRET`) signs short-lived guest payment-init tokens.
- `CRON_SECRET` protects inventory-reservation cleanup.
- `BLOB_READ_WRITE_TOKEN` enables durable Vercel Blob upload storage and is required
  in production.
- `DATABASE_URL` also provides shared production rate limiting; no separate Redis
  service or new credentials are required. Optional existing Redis installations
  can still set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the
  compatible `KV_REST_API_URL` and `KV_REST_API_TOKEN` aliases).
- `MAILBOX_API_KEY` is optional. Without it, email checks fall back to format validation.

Rotate the old MailboxLayer key that previously existed in Git history. Removing it
from the current source does not revoke the credential or erase earlier commits.

## Inventory cleanup schedule

Call `GET /api/cron/release-expired-inventory` every 5 minutes with either:

```text
Authorization: Bearer <CRON_SECRET>
```

or:

```text
x-cron-secret: <CRON_SECRET>
```

The job releases expired SSLCommerz reservations, fails unfinished payment attempts,
and returns coupon usage when an unpaid order expires.

## Verification

```bash
npm audit --omit=dev
npm run test:phase0
npm run test:request-security
# Optional integration check against DATABASE_URL; only disposable counters are written.
npm run test:request-security-db
npm run lint
npm run typecheck
```

`npm run typecheck` must pass before deployment. Next.js build error suppression has
been removed, so production builds enforce the same TypeScript gate.

## Deployment note

Uploads use local `public/upload` storage only during development. Production fails
closed unless Vercel Blob is configured. Protected SCM, investor, payment, delivery,
and digital-asset objects are stored as private blobs and remain behind the existing
route-level token/RBAC controls.

Without Redis credentials, production rate limiting uses the existing PostgreSQL
database through `DATABASE_URL`. The `RequestRateLimit` table stores hashed client
identities with their scope, count, and expiry. A single atomic upsert shares limits
across instances and uses the database clock for expiry. Expired counters are
cleaned up in indexed batches of up to 1,000, at most once per minute per process.
Database failures do not bypass rate limiting.

The current Vercel build command runs `prisma db push` before building, which
creates this additive table. Migration-based deployments can instead apply
`prisma/migrations-release/20261031000000_database_rate_limits/migration.sql`
through their normal release process. No existing order or customer tables change.

For local single-process production testing (`npm run build` followed by
`npm start`) without database-backed limits, create a gitignored
`.env.production.local` containing:

```dotenv
RATE_LIMIT_ALLOW_IN_MEMORY=true
```

This optional override keeps checkout rate limiting active in process memory if a
local database is unavailable. Limits reset on restart and are not shared across
server instances, so leave it unset or false on Vercel. Configured Redis still
takes priority; incomplete Redis credentials and Redis request failures do not
silently fall back. Rebuild after updating the limiter code and restart the server
after changing runtime environment values.
