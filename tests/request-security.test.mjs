import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rateLimitRequest } from "../lib/request-security.ts";
import { prisma } from "../lib/prisma.ts";

const envKeys = [
  "NODE_ENV",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "RATE_LIMIT_ALLOW_IN_MEMORY",
];
let previousEnv;
const originalQueryRaw = prisma.$queryRaw;
const originalExecuteRaw = prisma.$executeRaw;

beforeEach(t => {
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  process.env.NODE_ENV = "production";
  // Prisma exposes methods through a proxy rather than own method descriptors.
  prisma.$queryRaw = t.mock.fn(async () => [{ count: 1, retryAfter: 60 }]);
  prisma.$executeRaw = t.mock.fn(async () => 0);
});

afterEach(() => {
  prisma.$queryRaw = originalQueryRaw;
  prisma.$executeRaw = originalExecuteRaw;
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

const request = new Request("http://localhost:3000/api/orders");
const options = () => ({ scope: `checkout-test:${randomUUID()}`, limit: 2, windowMs: 60_000 });

test("production without Redis uses the existing database by default", async () => {
  for (const value of [undefined, "false", "1", "TRUE"]) {
    if (value === undefined) delete process.env.RATE_LIMIT_ALLOW_IN_MEMORY;
    else process.env.RATE_LIMIT_ALLOW_IN_MEMORY = value;
    assert.deepEqual(await rateLimitRequest(request, options()), { allowed: true, remaining: 1, retryAfter: 0 });
  }
  assert.equal(prisma.$queryRaw.mock.callCount(), 4);
});

test("production database failures do not bypass rate limiting", async () => {
  prisma.$queryRaw.mock.mockImplementation(async () => { throw new Error("Database unavailable"); });
  await assert.rejects(rateLimitRequest(request, options()), /Database unavailable/);
});

test("production database decisions enforce limits and return Retry-After", async () => {
  prisma.$queryRaw.mock.mockImplementation(async () => [{ count: 3, retryAfter: 42 }]);
  assert.deepEqual(await rateLimitRequest(request, options()), { allowed: false, remaining: 0, retryAfter: 42 });
});

test("database keys contain a hashed identity, not the raw client IP", async () => {
  const ip = "198.51.100.42";
  const limitOptions = options();
  await rateLimitRequest(new Request(request, { headers: { "x-real-ip": ip } }), limitOptions);
  const key = prisma.$queryRaw.mock.calls[0].arguments[1];
  assert.match(key, new RegExp(`^${limitOptions.scope}:[a-f0-9]{64}$`));
  assert.equal(key.includes(ip), false);
});

test("local production memory limiter allows checkout, blocks excess attempts, and resets after expiry", async t => {
  process.env.RATE_LIMIT_ALLOW_IN_MEMORY = "true";
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const limitOptions = options();
  assert.deepEqual(await rateLimitRequest(request, limitOptions), { allowed: true, remaining: 1, retryAfter: 0 });
  assert.deepEqual(await rateLimitRequest(request, limitOptions), { allowed: true, remaining: 0, retryAfter: 0 });
  assert.deepEqual(await rateLimitRequest(request, limitOptions), { allowed: false, remaining: 0, retryAfter: 60 });
  now += limitOptions.windowMs;
  assert.deepEqual(await rateLimitRequest(request, limitOptions), { allowed: true, remaining: 1, retryAfter: 0 });
});

test("memory limits are isolated by client identity and scope", async () => {
  process.env.RATE_LIMIT_ALLOW_IN_MEMORY = "true";
  const limitOptions = { ...options(), limit: 1 };
  const first = { ...limitOptions, identifier: "customer-a" };
  assert.equal((await rateLimitRequest(request, first)).allowed, true);
  assert.equal((await rateLimitRequest(request, first)).allowed, false);
  assert.equal((await rateLimitRequest(request, { ...limitOptions, identifier: "customer-b" })).allowed, true);
  assert.equal((await rateLimitRequest(request, { ...first, scope: `${first.scope}:other` })).allowed, true);
});

test("memory opt-in does not conceal incomplete Redis credentials", async () => {
  process.env.RATE_LIMIT_ALLOW_IN_MEMORY = "true";
  for (const key of envKeys.filter(key => /^(UPSTASH|KV)_/.test(key))) {
    process.env[key] = "incomplete-config";
    await assert.rejects(rateLimitRequest(request, options()), /incomplete credentials/);
    delete process.env[key];
  }
});

test("development retains its memory fallback without an opt-in", async () => {
  process.env.NODE_ENV = "development";
  const limitOptions = { ...options(), limit: 1 };
  assert.equal((await rateLimitRequest(request, limitOptions)).allowed, true);
  assert.equal((await rateLimitRequest(request, limitOptions)).allowed, false);
});

test("configured Redis takes priority and Redis errors never fall back to memory", async t => {
  process.env.RATE_LIMIT_ALLOW_IN_MEMORY = "true";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  let unavailable = false;
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(new URL(url).origin, "https://redis.example.test");
    const body = JSON.parse(init.body);
    const pipelined = Array.isArray(body[0]);
    assert.equal(String(pipelined ? body[0][0] : body[0]).toLowerCase(), "eval");
    if (unavailable) return Response.json({ error: "Redis unavailable" }, { status: 503 });
    return Response.json(pipelined ? [{ result: 3 }] : { result: 3 });
  });
  const result = await rateLimitRequest(request, options());
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.ok(result.retryAfter > 0);
  assert.equal(fetchMock.mock.callCount(), 1);
  unavailable = true;
  await assert.rejects(rateLimitRequest(request, options()), /Redis unavailable/);
});
