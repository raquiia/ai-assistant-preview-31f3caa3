-- Wave 2 — usage tracking + budgets schema additions.
-- Apply via Prisma: `prisma migrate dev --name wave2_usage_budgets`.

CREATE TABLE IF NOT EXISTS "UsageEvent" (
  "id"            TEXT PRIMARY KEY,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "userId"        TEXT NOT NULL,
  "orgId"         TEXT,
  "role"          TEXT NOT NULL,
  "route"         TEXT NOT NULL,
  "provider"      TEXT NOT NULL,
  "model"         TEXT NOT NULL,
  "inputTokens"   INTEGER NOT NULL DEFAULT 0,
  "outputTokens"  INTEGER NOT NULL DEFAULT 0,
  "units"         INTEGER NOT NULL DEFAULT 0,
  "costUsd"       NUMERIC(12, 6) NOT NULL DEFAULT 0,
  "latencyMs"     INTEGER,
  "requestId"     TEXT
);

CREATE INDEX IF NOT EXISTS "UsageEvent_user_date" ON "UsageEvent" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "UsageEvent_org_date"  ON "UsageEvent" ("orgId",  "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "UsageEvent_route"     ON "UsageEvent" ("route",  "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "Budget" (
  "id"          TEXT PRIMARY KEY,
  "scope"       TEXT NOT NULL CHECK ("scope" IN ('user','role','org','global')),
  "userId"      TEXT,
  "orgId"       TEXT,
  "role"        TEXT,
  "monthlyUsd"  NUMERIC(10, 2) NOT NULL,
  "softRatio"   NUMERIC(3, 2) NOT NULL DEFAULT 0.80,
  "hardRatio"   NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One budget per (userId | role | orgId) combination — partial unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS "Budget_user_uq" ON "Budget" ("userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Budget_role_uq" ON "Budget" ("role")   WHERE "role"   IS NOT NULL AND "userId" IS NULL AND "orgId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Budget_org_uq"  ON "Budget" ("orgId")  WHERE "orgId"  IS NOT NULL AND "userId" IS NULL;
