-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "lastRecheckedAt" DATETIME;

-- CreateTable
CREATE TABLE "PickRefreshState" (
    "studentId" TEXT NOT NULL PRIMARY KEY,
    "cycleStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoRefreshedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualUsed" INTEGER NOT NULL DEFAULT 0,
    "extraEarned" BOOLEAN NOT NULL DEFAULT false,
    "extraUsed" BOOLEAN NOT NULL DEFAULT false,
    "interestSignature" TEXT NOT NULL,
    CONSTRAINT "PickRefreshState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobLease" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL DEFAULT '',
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DiscoveryUsage" (
    "month" TEXT NOT NULL PRIMARY KEY,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "rechecks" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "embeddings" INTEGER NOT NULL DEFAULT 0,
    "vectorUpserts" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "usage" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DiscoveryGroup" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "gradeBand" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "pendingBuckets" TEXT NOT NULL DEFAULT '[]',
    "requestedAt" DATETIME,
    "lastDiscoveredAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_DiscoveryGroup" ("error", "gradeBand", "key", "lastDiscoveredAt", "region", "status", "topic") SELECT "error", "gradeBand", "key", "lastDiscoveredAt", "region", "status", "topic" FROM "DiscoveryGroup";
DROP TABLE "DiscoveryGroup";
ALTER TABLE "new_DiscoveryGroup" RENAME TO "DiscoveryGroup";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DiscoveryRun_startedAt_idx" ON "DiscoveryRun"("startedAt");


UPDATE "SavedOpportunity" SET "citedDeadline" = (SELECT "deadline" FROM "Opportunity" WHERE "Opportunity"."id" = "SavedOpportunity"."opportunityId" AND "sourceCheckedAt" IS NOT NULL) WHERE "citedDeadline" IS NULL;
