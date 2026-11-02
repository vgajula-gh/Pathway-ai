-- CreateTable
CREATE TABLE "OpportunitySearchRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "groupBindings" TEXT NOT NULL DEFAULT '[]',
    "resultIds" TEXT NOT NULL DEFAULT '[]',
    "manualSlot" TEXT,
    "cycleStartedAt" DATETIME,
    "countedAt" DATETIME,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "OpportunitySearchRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "organizer" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "gradeMin" INTEGER,
    "gradeMax" INTEGER,
    "minAge" INTEGER,
    "format" TEXT NOT NULL,
    "cost" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "skills" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "checks" TEXT NOT NULL DEFAULT '[]',
    "deadline" TEXT,
    "sourceCheckedAt" DATETIME,
    "applicationStatus" TEXT NOT NULL DEFAULT 'unknown',
    "applicationStatusCheckedAt" DATETIME,
    "activityDate" TEXT,
    "opportunityType" TEXT NOT NULL DEFAULT 'program',
    "isSample" BOOLEAN NOT NULL DEFAULT true,
    "lastRecheckedAt" DATETIME,
    "verificationStatus" TEXT NOT NULL DEFAULT 'new_find',
    "verifiedAt" DATETIME,
    "officialDomain" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '[]',
    "costType" TEXT NOT NULL DEFAULT 'unknown',
    "costAmount" TEXT,
    "costVerifiedAt" DATETIME,
    "financialAidNote" TEXT,
    "feeFlag" BOOLEAN NOT NULL DEFAULT false,
    "discoveredFor" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'seed',
    "evidence" TEXT NOT NULL DEFAULT '{}',
    "requirements" TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO "new_Opportunity" ("category", "checks", "commitment", "cost", "costAmount", "costType", "costVerifiedAt", "deadline", "discoveredFor", "evidence", "feeFlag", "financialAidNote", "format", "gradeMax", "gradeMin", "id", "isSample", "lastRecheckedAt", "minAge", "name", "officialDomain", "organizer", "region", "requirements", "skills", "source", "sourceCheckedAt", "tags", "url", "verificationStatus", "verifiedAt") SELECT "category", "checks", "commitment", "cost", "costAmount", "costType", "costVerifiedAt", "deadline", "discoveredFor", "evidence", "feeFlag", "financialAidNote", "format", "gradeMax", "gradeMin", "id", "isSample", "lastRecheckedAt", "minAge", "name", "officialDomain", "organizer", "region", "requirements", "skills", "source", "sourceCheckedAt", "tags", "url", "verificationStatus", "verifiedAt" FROM "Opportunity";
DROP TABLE "Opportunity";
ALTER TABLE "new_Opportunity" RENAME TO "Opportunity";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "OpportunitySearchRequest_studentId_createdAt_idx" ON "OpportunitySearchRequest"("studentId", "createdAt");

