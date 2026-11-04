-- CreateTable
CREATE TABLE "GrowthLetter" (
    "studentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '{}',
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'empty',
    "attemptedAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "leaseToken" TEXT NOT NULL DEFAULT '',
    "leaseUntil" TIMESTAMP(3),
    "retryAt" TIMESTAMP(3),
    "portfolioId" TEXT,
    "savedFingerprint" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthLetter_pkey" PRIMARY KEY ("studentId","month")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrowthLetter_portfolioId_key" ON "GrowthLetter"("portfolioId");

-- AddForeignKey
ALTER TABLE "GrowthLetter" ADD CONSTRAINT "GrowthLetter_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthLetter" ADD CONSTRAINT "GrowthLetter_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "PortfolioEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
