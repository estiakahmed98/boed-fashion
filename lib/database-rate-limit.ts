import { prisma } from "./prisma";

type RateLimitDatabase = Pick<typeof prisma, "$queryRaw" | "$executeRaw">;
type RateLimitRow = { count: number; retryAfter: number };

let nextCleanupAt = 0;

export async function rateLimitDatabase(
  key: string,
  options: { limit: number; windowMs: number },
  db: RateLimitDatabase = prisma,
) {
  const windowMs = Math.max(1_000, Math.ceil(options.windowMs));
  // One atomic upsert serializes competing requests for the same bucket.
  // Use the database clock so independent Vercel instances agree on expiry.
  const rows = await db.$queryRaw<RateLimitRow[]>`
    INSERT INTO "RequestRateLimit" ("key", "count", "resetAt")
    VALUES (
      ${key}, 1,
      statement_timestamp() + ${windowMs}::double precision * INTERVAL '1 millisecond'
    )
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RequestRateLimit"."resetAt" <= statement_timestamp() THEN 1
        ELSE LEAST("RequestRateLimit"."count", ${options.limit}::integer) + 1
      END,
      "resetAt" = CASE
        WHEN "RequestRateLimit"."resetAt" <= statement_timestamp() THEN EXCLUDED."resetAt"
        ELSE "RequestRateLimit"."resetAt"
      END
    RETURNING "count",
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("resetAt" - statement_timestamp()))))::integer AS "retryAfter"
  `;
  const row = rows[0];
  if (!row) throw new Error("Database rate limiter did not return a counter.");

  // Bounded, indexed cleanup. Await it so serverless teardown cannot interrupt it.
  // SKIP LOCKED avoids waiting on buckets another request is currently updating.
  const now = Date.now();
  if (now >= nextCleanupAt) {
    nextCleanupAt = now + 60_000;
    try {
      await db.$executeRaw`
        DELETE FROM "RequestRateLimit"
        WHERE "key" IN (
          SELECT "key" FROM "RequestRateLimit"
          WHERE "resetAt" <= statement_timestamp() AND "key" <> ${key}
          ORDER BY "resetAt"
          LIMIT 1000
          FOR UPDATE SKIP LOCKED
        )
      `;
    } catch (error) {
      // Retention failure must not invalidate a successfully consumed limit.
      console.warn("Expired rate-limit counter cleanup failed:", error);
    }
  }

  const allowed = row.count <= options.limit;
  return {
    allowed,
    remaining: allowed ? Math.max(0, options.limit - row.count) : 0,
    retryAfter: allowed ? 0 : row.retryAfter,
  };
}
