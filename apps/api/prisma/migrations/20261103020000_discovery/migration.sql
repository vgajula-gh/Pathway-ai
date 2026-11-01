-- CreateTable
CREATE TABLE "SourcePage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "pageTitle" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourcePage_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscoveryGroup" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "gradeBand" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "lastDiscoveredAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error" TEXT NOT NULL DEFAULT ''
);

-- CreateIndex
CREATE UNIQUE INDEX "SourcePage_opportunityId_sourceUrl_key" ON "SourcePage"("opportunityId", "sourceUrl");

