-- CreateTable
CREATE TABLE "GrowthLetter" (
    "studentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '{}',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'empty',
    "attemptedAt" DATETIME,
    "generatedAt" DATETIME,
    "leaseToken" TEXT NOT NULL DEFAULT '',
    "leaseUntil" DATETIME,
    "retryAt" DATETIME,
    "portfolioId" TEXT,
    "savedFingerprint" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("studentId", "month"),
    CONSTRAINT "GrowthLetter_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GrowthLetter_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GrowthLetter_portfolioId_key" ON "GrowthLetter"("portfolioId");
