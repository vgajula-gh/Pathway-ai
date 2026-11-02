-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "activityDate" TEXT,
ADD COLUMN     "applicationStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "applicationStatusCheckedAt" TIMESTAMP(3),
ADD COLUMN     "opportunityType" TEXT NOT NULL DEFAULT 'program';

-- CreateTable
CREATE TABLE "OpportunitySearchRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "groupBindings" TEXT NOT NULL DEFAULT '[]',
    "resultIds" TEXT NOT NULL DEFAULT '[]',
    "manualSlot" TEXT,
    "cycleStartedAt" TIMESTAMP(3),
    "countedAt" TIMESTAMP(3),
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "OpportunitySearchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpportunitySearchRequest_studentId_createdAt_idx" ON "OpportunitySearchRequest"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "OpportunitySearchRequest" ADD CONSTRAINT "OpportunitySearchRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

