-- AlterTable
ALTER TABLE "SavedOpportunity" ADD COLUMN     "citations" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "citedDeadline" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "opportunityId" TEXT;

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "pageTitle" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'opportunity',
    "localEmbedding" TEXT NOT NULL DEFAULT '[]',
    "embeddingModel" TEXT NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeChunk_opportunityId_sourceUrl_idx" ON "KnowledgeChunk"("opportunityId", "sourceUrl");

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

