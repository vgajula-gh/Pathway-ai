-- CreateTable
CREATE TABLE "GrowthInsightState" (
    "studentId" TEXT NOT NULL PRIMARY KEY,
    "cards" TEXT NOT NULL DEFAULT '[]',
    "generatedAt" DATETIME,
    "automaticAt" DATETIME,
    "manualDay" TEXT NOT NULL DEFAULT '',
    "leaseToken" TEXT NOT NULL DEFAULT '',
    "leaseUntil" DATETIME,
    "retryAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'empty',
    CONSTRAINT "GrowthInsightState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GrowthInsightDismissal" (
    "studentId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("studentId", "signature"),
    CONSTRAINT "GrowthInsightDismissal_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
