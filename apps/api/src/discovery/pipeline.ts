import { createDiscoveryGraph, VerifiedOpportunity } from './graph.js';
import { privateWorkflow, workflowConfig } from '../workflows/privacy.js';
import { createHash } from 'node:crypto';
import { prisma, j } from '../lib/db.js';
import { OPPORTUNITIES } from '../data/opportunities.js';
import { RunBudget, discoveryConfigured } from './config.js';
import { getSearch } from './search/index.js';
import { extract } from './extraction.js';
import { fetchOfficialPage, Page } from './pages.js';
import { verifyOpportunity } from '../domain/opportunity-verification.js';
import { identity, interestGroups } from './groups.js';
export const trustedDomains = () =>
  new Set([
    ...OPPORTUNITIES.map((o) => new URL(o.url).hostname.replace(/^www\./, '')),
    ...(process.env.DISCOVERY_TRUSTED_DOMAINS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ]);
export type Group = ReturnType<typeof interestGroups>[number];
export type PipelineDependencies = {
  search: NonNullable<ReturnType<typeof getSearch>>;
  fetch: typeof fetchOfficialPage;
  extract: typeof extract;
  ingest?: (id: string, budget: RunBudget) => Promise<void>;
};
async function storeCandidate(data: VerifiedOpportunity, pages: Page[], group: Group) {
  // Do not silently attribute opportunities to this group's age/region when pages omit them.
  const existing = (await prisma.opportunity.findMany()).find(
    (o) =>
      identity(o.officialDomain || new URL(o.url).hostname, o.name) ===
      identity(data.officialDomain, data.name),
  );
  const id =
    existing?.id ||
    'discovered-' +
      createHash('sha256').update(identity(data.officialDomain, data.name)).digest('hex').slice(0, 24);
  const discoveredFor = JSON.stringify([
    ...new Set([...j<string[]>(existing?.discoveredFor, []), group.key]),
  ]);
  await prisma.$transaction(async (tx) => {
    await tx.opportunity.upsert({
      where: { id },
      create: { id, ...data, discoveredFor, source: 'discovery' },
      update: { ...data, discoveredFor, source:'discovery' },
    });
    await tx.sourcePage.deleteMany({
      where: { opportunityId: id, sourceUrl: { notIn: pages.map((p) => p.sourceUrl) } },
    });
    for (const page of pages)
      await tx.sourcePage.upsert({
        where: { opportunityId_sourceUrl: { opportunityId: id, sourceUrl: page.sourceUrl } },
        create: {
          opportunityId: id,
          sourceUrl: page.sourceUrl,
          pageTitle: page.pageTitle,
          text: page.text,
          contentHash: page.contentHash,
          checkedAt: page.checkedAt,
        },
        update: {
          text: page.text,
          contentHash: page.contentHash,
          pageTitle: page.pageTitle,
          checkedAt: page.checkedAt,
        },
      });
  });
  return id;
}
export async function discover(
  group: Group,
  buckets: ('free' | 'paid')[],
  budget = new RunBudget(),
  deps?: PipelineDependencies,
) {
  if (!deps && !discoveryConfigured()) return [];
  const search = deps?.search || getSearch();
  if (!search) return [];
  const graph = createDiscoveryGraph(
    {
      search,
      fetch: deps?.fetch || fetchOfficialPage,
      extract: deps?.extract || extract,
      verify: (facts, pages) => verifyOpportunity(facts, pages, trustedDomains()),
      save: storeCandidate,
      ingest: deps?.ingest,
    },
    budget,
  );
  const result = await privateWorkflow(() =>
    graph.invoke({ group, buckets }, workflowConfig('opportunity-discovery')),
  );
  budget.usage.estimatedCost = budget.usage.searches * 0.03 + (budget.usage.tokens / 1e6) * 4;
  return result.saved;
}
