import { env } from '../lib/env.js';
import { searchConfigurationIssue, knowledgeIssue, KnowledgeIssue } from '../knowledge/readiness.js';

export async function discoveryAvailability(aiConsent: boolean): Promise<{ enabled: boolean; unavailable: KnowledgeIssue | null }> {
  if (!aiConsent) return { enabled: false, unavailable: knowledgeIssue('ai_consent_required') };
  const unavailable=searchConfigurationIssue(process.env,env.aiDisabled);
  return { enabled: !unavailable, unavailable };
}
