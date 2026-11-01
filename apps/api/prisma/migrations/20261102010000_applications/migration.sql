-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SavedOpportunity" (
    "studentId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "deadline" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "checklist" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'interested',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("studentId", "opportunityId"),
    CONSTRAINT "SavedOpportunity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SavedOpportunity" ("createdAt", "opportunityId", "status", "studentId") SELECT "createdAt", "opportunityId", "status", "studentId" FROM "SavedOpportunity";
DROP TABLE "SavedOpportunity";
ALTER TABLE "new_SavedOpportunity" RENAME TO "SavedOpportunity";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
UPDATE "SavedOpportunity" SET "status" = 'interested' WHERE "status" = 'saved';
UPDATE "SavedOpportunity" SET "status" = 'result' WHERE "status" = 'done';
