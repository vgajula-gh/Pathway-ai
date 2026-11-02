import { initializeKnowledge, knowledgeUnavailable } from '../knowledge/runtime.js';
import { knowledgeIssue, KnowledgeIssue } from '../knowledge/readiness.js';

export async function discoveryAvailability(aiConsent: boolean): Promise<{ enabled: boolean; unavailable: KnowledgeIssue | null }> {
  if (!aiConsent) return { enabled: false, unavailable: knowledgeIssue('ai_consent_required') };
  const enabled = !!await initializeKnowledge();
  return { enabled, unavailable: enabled ? null : knowledgeUnavailable() };
}
