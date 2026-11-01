-- CreateTable
CREATE TABLE "CalendarLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maskedUrl" TEXT NOT NULL,
    "encryptedUrl" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'class',
    "lastSync" DATETIME,
    "syncAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" DATETIME,
    "error" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "CalendarLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "recurDays" TEXT NOT NULL DEFAULT '',
    "recurUntil" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "calendarId" TEXT,
    "importKey" TEXT,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "proposalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "CalendarLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("confidence", "createdAt", "done", "end", "id", "location", "proposalId", "recurDays", "recurUntil", "source", "start", "studentId", "title", "type") SELECT "confidence", "createdAt", "done", "end", "id", "location", "proposalId", "recurDays", "recurUntil", "source", "start", "studentId", "title", "type" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_studentId_idx" ON "Event"("studentId");
CREATE UNIQUE INDEX "Event_calendarId_importKey_key" ON "Event"("calendarId", "importKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CalendarLink_syncAfter_idx" ON "CalendarLink"("syncAfter");

-- CreateIndex
CREATE INDEX "CalendarLink_studentId_idx" ON "CalendarLink"("studentId");
