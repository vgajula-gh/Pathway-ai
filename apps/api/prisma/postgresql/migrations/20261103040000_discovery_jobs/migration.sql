-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "lastRecheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DiscoveryGroup" ADD COLUMN     "pendingBuckets" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "requestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PickRefreshState" (
    "studentId" TEXT NOT NULL,
    "cycleStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualUsed" INTEGER NOT NULL DEFAULT 0,
    "extraEarned" BOOLEAN NOT NULL DEFAULT false,
    "extraUsed" BOOLEAN NOT NULL DEFAULT false,
    "interestSignature" TEXT NOT NULL,

    CONSTRAINT "PickRefreshState_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE "JobLease" (
    "key" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLease_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DiscoveryUsage" (
    "month" TEXT NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "rechecks" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "embeddings" INTEGER NOT NULL DEFAULT 0,
    "vectorUpserts" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "DiscoveryUsage_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "usage" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryRun_startedAt_idx" ON "DiscoveryRun"("startedAt");

-- AddForeignKey
ALTER TABLE "PickRefreshState" ADD CONSTRAINT "PickRefreshState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;


UPDATE "SavedOpportunity" SET "citedDeadline" = (SELECT "deadline" FROM "Opportunity" WHERE "Opportunity"."id" = "SavedOpportunity"."opportunityId" AND "sourceCheckedAt" IS NOT NULL) WHERE "citedDeadline" IS NULL;
