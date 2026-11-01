-- AlterTable
ALTER TABLE "SavedOpportunity" ADD COLUMN     "checklist" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "deadline" TEXT,
ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "status" SET DEFAULT 'interested';
UPDATE "SavedOpportunity" SET "status" = 'interested' WHERE "status" = 'saved';
UPDATE "SavedOpportunity" SET "status" = 'result' WHERE "status" = 'done';
