-- CreateTable
CREATE TABLE "StudentPick" (
    "studentId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "isStretch" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshCycle" TEXT NOT NULL,

    PRIMARY KEY ("studentId", "opportunityId"),
    CONSTRAINT "StudentPick_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentPick_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpportunityFeedback" (
    "studentId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("studentId", "opportunityId"),
    CONSTRAINT "OpportunityFeedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "signInHash" TEXT,
    "recoveryHash" TEXT,
    "accessCode" TEXT,
    "grade" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "region" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "interests" TEXT NOT NULL DEFAULT '[]',
    "skills" TEXT NOT NULL DEFAULT '[]',
    "aiConsent" BOOLEAN NOT NULL DEFAULT true,
    "budget" TEXT NOT NULL DEFAULT 'any',
    "format" TEXT NOT NULL DEFAULT 'any',
    "settings" TEXT NOT NULL DEFAULT '{}',
    "provenance" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Student" ("accessCode", "aiConsent", "budget", "createdAt", "format", "grade", "id", "interests", "location", "name", "provenance", "recoveryHash", "settings", "signInHash", "skills", "timezone", "updatedAt") SELECT "accessCode", "aiConsent", "budget", "createdAt", "format", "grade", "id", "interests", "location", "name", "provenance", "recoveryHash", "settings", "signInHash", "skills", "timezone", "updatedAt" FROM "Student";
DROP TABLE "Student";
ALTER TABLE "new_Student" RENAME TO "Student";
CREATE UNIQUE INDEX "Student_signInHash_key" ON "Student"("signInHash");
CREATE UNIQUE INDEX "Student_recoveryHash_key" ON "Student"("recoveryHash");
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
    "isSample" BOOLEAN NOT NULL DEFAULT true,
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
INSERT INTO "new_Opportunity" ("category", "checks", "commitment", "cost", "deadline", "format", "gradeMax", "gradeMin", "id", "isSample", "minAge", "name", "organizer", "skills", "sourceCheckedAt", "tags", "url") SELECT "category", "checks", "commitment", "cost", "deadline", "format", "gradeMax", "gradeMin", "id", "isSample", "minAge", "name", "organizer", "skills", "sourceCheckedAt", "tags", "url" FROM "Opportunity";
DROP TABLE "Opportunity";
ALTER TABLE "new_Opportunity" RENAME TO "Opportunity";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Seed labels remain unverified; no cost check timestamp is manufactured.
UPDATE "Opportunity" SET "costType" = CASE WHEN lower("cost") = 'free' OR lower("cost") LIKE 'free (%' THEN 'free' WHEN lower("cost") LIKE '%fee%' OR lower("cost") LIKE '%dues%' OR "cost" LIKE '%$%' THEN 'paid' ELSE 'unknown' END;
