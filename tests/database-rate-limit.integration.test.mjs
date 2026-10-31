import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout } from "node:timers/promises";

// Explicit opt-in: this test only writes disposable counters under a unique scope.
test("PostgreSQL limits survive independent clients, concurrency, expiry, and cleanup", {
  skip: process.env.RUN_DATABASE_RATE_LIMIT_TESTS !== "true",
}, async t => {
  const require = createRequire(import.meta.url);
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(process.cwd(), false);
  const { PrismaClient } = require("../generated/prisma");
  const { rateLimitDatabase } = await import("../lib/database-rate-limit.ts");
  const clients = [new PrismaClient(), new PrismaClient()];
  const prefix = `rate-limit-integration:${randomUUID()}:`;
  const key = `${prefix}concurrent`;
  const options = { limit: 5, windowMs: 60_000 };

  try {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      rateLimitDatabase(key, options, clients[i % clients.length]),
    ));
    assert.equal(results.filter(result => result.allowed).length, 5);
    assert.equal(results.filter(result => !result.allowed).length, 15);
    assert.ok(results.filter(result => !result.allowed).every(result => result.retryAfter > 0));

    await clients[0].$disconnect();
    clients[0] = new PrismaClient();
    assert.equal((await rateLimitDatabase(key, options, clients[0])).allowed, false);
    assert.equal((await rateLimitDatabase(`${prefix}other`, options, clients[1])).allowed, true);

    // Expire the disposable bucket using the same database clock as production.
    await clients[1].$executeRaw`
      UPDATE "RequestRateLimit" SET "resetAt" = statement_timestamp() - INTERVAL '1 second'
      WHERE "key" = ${key}
    `;
    const reset = await rateLimitDatabase(key, options, clients[0]);
    assert.deepEqual(reset, { allowed: true, remaining: 4, retryAfter: 0 });

    const shortKey = `${prefix}short`;
    const shortOptions = { limit: 1, windowMs: 1000 };
    assert.equal((await rateLimitDatabase(shortKey, shortOptions, clients[0])).allowed, true);
    assert.equal((await rateLimitDatabase(shortKey, shortOptions, clients[1])).allowed, false);
    await setTimeout(1100);
    assert.equal((await rateLimitDatabase(shortKey, shortOptions, clients[1])).allowed, true);

    // Advance only the cleanup scheduler; expiry still uses PostgreSQL time.
    const expiredKey = `${prefix}expired`;
    await clients[0].$executeRaw`
      INSERT INTO "RequestRateLimit" ("key", "count", "resetAt")
      VALUES (${expiredKey}, 1, statement_timestamp() - INTERVAL '1 second')
    `;
    const appNow = Date.now();
    t.mock.method(Date, "now", () => appNow + 120_000);
    assert.equal((await rateLimitDatabase(key, options, clients[1])).allowed, true);
    const expired = await clients[0].$queryRaw`
      SELECT "key" FROM "RequestRateLimit" WHERE "key" = ${expiredKey}
    `;
    assert.equal(expired.length, 0);
  } finally {
    await clients[0].$executeRaw`DELETE FROM "RequestRateLimit" WHERE "key" LIKE ${`${prefix}%`}`;
    await Promise.all(clients.map(client => client.$disconnect()));
  }
});
