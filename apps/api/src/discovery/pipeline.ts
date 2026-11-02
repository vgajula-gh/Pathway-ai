import { createHash } from 'node:crypto';
import { prisma, j } from '../lib/db.js';
import { OPPORTUNITIES } from '../data/opportunities.js';
import { CAPS, RunBudget, discoveryConfigured } from './config.js';
import { getSearch } from './search/index.js';
import { extract } from './extraction.js';
import { fetchOfficialPage, Page } from './pages.js';
import { verifyOpportunity } from '../domain/opportunity-verification.js';
import { discoveryQuery, identity, interestGroups } from './groups.js';
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
export async function discover(
  group: Group,
  buckets: ('free' | 'paid')[],
  budget = new RunBudget(),
  deps?: PipelineDependencies,
) {
  if (!deps && !discoveryConfigured()) return [];
  const search = deps?.search || getSearch();
  if (!search) return [];
  const fetchPage = deps?.fetch || fetchOfficialPage,
    extractFacts = deps?.extract || extract;
  const urls = new Set<string>(),
    saved: string[] = [];
  for (const bucket of buckets.slice(0, 2)) {
    budget.take('searches');
    const result = await search.search(discoveryQuery(group, bucket, new Date().getUTCFullYear()));
    budget.usage.tokens += result.tokens;
    result.urls.slice(0, CAPS.candidates).forEach((u) => urls.add(u));
  }
  for (const url of [...urls].slice(0, CAPS.candidates)) {
    if (budget.extractionCalls >= CAPS.extractionCalls) break;
    try {
      const main = await fetchPage(url, budget);
      const pages: Page[] = [main];
      for (const related of main.links.slice(0, 3)) {
        try {
          pages.push(await fetchPage(related, budget));
        } catch {
          /* Missing supporting pages remain unknown. */
        }
      }
      budget.check();
      budget.extractionCalls++;
      budget.usage.tokens += Math.ceil(pages.reduce((n, p) => n + p.text.length, 0) / 3) + 6500; // Conservative extraction token reservation, including reasoning headroom.
      const facts = await extractFacts(pages),
        data = verifyOpportunity(facts, pages, trustedDomains());
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
          update: { ...data, discoveredFor },
        });
        await tx.sourcePage.deleteMany({where:{opportunityId:id,sourceUrl:{notIn:pages.map(p=>p.sourceUrl)}}});
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
      if (deps?.ingest) await deps.ingest(id, budget);
      saved.push(id);
    } catch (error) {
      console.info('Opportunity candidate skipped', {
        reason:
          error instanceof Error &&
          /Run limit|page|grade|deadline|name|organizer|rules|redirect|network/i.test(error.message)
            ? error.message
            : 'Source could not be confirmed',
      });
    }
  }
  // Estimates are conservative reservations, not a provider invoice.
  budget.usage.estimatedCost = budget.usage.searches * 0.03 + (budget.usage.tokens / 1e6) * 4;
  return saved;
}
