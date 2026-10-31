CREATE TABLE IF NOT EXISTS "RequestRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RequestRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RequestRateLimit_resetAt_idx" ON "RequestRateLimit"("resetAt");
