import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';
import { CharacterTextSplitter } from '@langchain/textsplitters';
import type { Page } from '../discovery/pages.js';
import { privateWorkflow, workflowConfig } from '../workflows/privacy.js';

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
function wordSplitter(size = 500, overlap = 50) {
  if (!Number.isInteger(size) || size <= 0 || !Number.isInteger(overlap) || overlap < 0 || size <= overlap)
    throw new Error('Invalid chunk overlap');
  // Word counting and an explicit separator preserve the existing 500/50 chunk boundaries.
  return new CharacterTextSplitter({
    chunkSize: size,
    chunkOverlap: overlap,
    separator: ' ',
    keepSeparator: true,
    lengthFunction: words,
  });
}
export async function chunkText(text: string, size = 500, overlap = 50): Promise<string[]> {
  return privateWorkflow(async () =>
    (await wordSplitter(size, overlap).splitText(text.trim().replace(/\s+/g, ' ')))
      .map((chunk) => chunk.trim())
      .filter(Boolean),
  );
}
export function documentPipeline() {
  return RunnableLambda.from((pages: Page[]) =>
    pages.map(
      (page) =>
        new Document({
          pageContent: page.text.trim().replace(/\s+/g, ' '),
          metadata: {
            sourceUrl: page.sourceUrl,
            pageTitle: page.pageTitle,
            checkedAt: page.checkedAt.toISOString(),
            contentHash: page.contentHash,
          },
        }),
    ),
  ).pipe(wordSplitter());
}
export async function splitOfficialPages(pages: Page[]) {
  return privateWorkflow(() => documentPipeline().invoke(pages, workflowConfig('split-official-pages')));
}
