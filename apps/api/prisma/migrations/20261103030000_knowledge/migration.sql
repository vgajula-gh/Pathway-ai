-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "opportunityId" TEXT;

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "pageTitle" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL,
    "contentHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'opportunity',
    "localEmbedding" TEXT NOT NULL DEFAULT '[]',
    "embeddingModel" TEXT NOT NULL,
    CONSTRAINT "KnowledgeChunk_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SavedOpportunity" (
    "studentId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "deadline" TEXT,
    "citedDeadline" TEXT,
    "citations" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'interested',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("studentId", "opportunityId"),
    CONSTRAINT "SavedOpportunity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedOpportunity" ("checklist", "createdAt", "deadline", "notes", "opportunityId", "status", "studentId") SELECT "checklist", "createdAt", "deadline", "notes", "opportunityId", "status", "studentId" FROM "SavedOpportunity";
DROP TABLE "SavedOpportunity";
ALTER TABLE "new_SavedOpportunity" RENAME TO "SavedOpportunity";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "KnowledgeChunk_opportunityId_sourceUrl_idx" ON "KnowledgeChunk"("opportunityId", "sourceUrl");

