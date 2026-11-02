-- CreateTable
CREATE TABLE "SourcePage" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "pageTitle" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcePage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveryGroup" (
    "key" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "gradeBand" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "lastDiscoveredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "DiscoveryGroup_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourcePage_opportunityId_sourceUrl_key" ON "SourcePage"("opportunityId", "sourceUrl");

-- AddForeignKey
ALTER TABLE "SourcePage" ADD CONSTRAINT "SourcePage_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

