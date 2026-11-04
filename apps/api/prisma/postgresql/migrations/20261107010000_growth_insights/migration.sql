-- CreateTable
CREATE TABLE "GrowthInsightState" (
    "studentId" TEXT NOT NULL,
    "cards" TEXT NOT NULL DEFAULT '[]',
    "generatedAt" TIMESTAMP(3),
    "automaticAt" TIMESTAMP(3),
    "manualDay" TEXT NOT NULL DEFAULT '',
    "leaseToken" TEXT NOT NULL DEFAULT '',
    "leaseUntil" TIMESTAMP(3),
    "retryAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'empty',

    CONSTRAINT "GrowthInsightState_pkey" PRIMARY KEY ("studentId")
);

-- CreateTable
CREATE TABLE "GrowthInsightDismissal" (
    "studentId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthInsightDismissal_pkey" PRIMARY KEY ("studentId","signature")
);

-- AddForeignKey
ALTER TABLE "GrowthInsightState" ADD CONSTRAINT "GrowthInsightState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthInsightDismissal" ADD CONSTRAINT "GrowthInsightDismissal_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
