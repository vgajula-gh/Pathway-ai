-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "region" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "costAmount" TEXT,
ADD COLUMN     "costType" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "costVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "discoveredFor" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "evidence" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "feeFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "financialAidNote" TEXT,
ADD COLUMN     "officialDomain" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "region" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "requirements" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'seed',
ADD COLUMN     "verificationStatus" TEXT NOT NULL DEFAULT 'new_find',
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ALTER COLUMN "gradeMin" DROP NOT NULL,
ALTER COLUMN "gradeMax" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StudentPick" (
    "studentId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "isStretch" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshCycle" TEXT NOT NULL,

    CONSTRAINT "StudentPick_pkey" PRIMARY KEY ("studentId","opportunityId")
);

-- CreateTable
CREATE TABLE "OpportunityFeedback" (
    "studentId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityFeedback_pkey" PRIMARY KEY ("studentId","opportunityId")
);

-- AddForeignKey
ALTER TABLE "StudentPick" ADD CONSTRAINT "StudentPick_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPick" ADD CONSTRAINT "StudentPick_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityFeedback" ADD CONSTRAINT "OpportunityFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed labels remain unverified; no cost check timestamp is manufactured.
UPDATE "Opportunity" SET "costType" = CASE WHEN lower("cost") = 'free' OR lower("cost") LIKE 'free (%' THEN 'free' WHEN lower("cost") LIKE '%fee%' OR lower("cost") LIKE '%dues%' OR "cost" LIKE '%$%' THEN 'paid' ELSE 'unknown' END;
