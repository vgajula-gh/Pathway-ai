-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "calendarId" TEXT,
ADD COLUMN     "importKey" TEXT,
ADD COLUMN     "readOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CalendarLink" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maskedUrl" TEXT NOT NULL,
    "encryptedUrl" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'class',
    "lastSync" TIMESTAMP(3),
    "syncAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "error" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CalendarLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarLink_syncAfter_idx" ON "CalendarLink"("syncAfter");

-- CreateIndex
CREATE INDEX "CalendarLink_studentId_idx" ON "CalendarLink"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_calendarId_importKey_key" ON "Event"("calendarId", "importKey");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "CalendarLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarLink" ADD CONSTRAINT "CalendarLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
