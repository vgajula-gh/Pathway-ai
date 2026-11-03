const messages = {
  ai_consent_required: 'Turn on “Use AI to help me” in You → Privacy to search for new opportunities.',
  discovery_disabled: 'Live opportunity search is turned off for this website. Catalog picks still work.',
  ai_unavailable: 'AI is not configured for this website yet. Catalog picks still work.',
  search_not_configured: 'The website owner needs to connect opportunity search. Catalog picks still work.',
  extraction_not_configured:'The website owner needs to set a program-reading AI model. Catalog picks still work.',
  embedding_not_configured: 'The website owner needs to finish setting up the program library. Catalog picks still work.',
  vector_not_configured: 'The website owner needs to finish connecting the program library. Catalog picks still work.',
  pinecone_authorization_failed: 'The program library could not authenticate. The website owner needs to check its connection.',
  pinecone_index_not_found: 'The configured program library could not be found. The website owner needs to check its connection.',
  index_metric_mismatch: 'The program library settings do not match what Pathway needs. The website owner needs to check its setup.',
  index_dimension_mismatch: 'The program library and embedding settings do not match. The website owner needs to check its setup.',
  vector_unavailable: 'The program library cannot connect right now. Catalog picks still work.',
};
export type KnowledgeIssue = {
  code: keyof typeof messages;
  message: string;
  settings: string[];
};
export const knowledgeIssue = (code: KnowledgeIssue['code'], settings: string[] = []): KnowledgeIssue =>
  ({ code, message: messages[code], settings });

/** Only setting names and fixed messages leave the server, never values or SDK errors. */
export function searchConfigurationIssue(values: NodeJS.ProcessEnv, aiDisabled: boolean): KnowledgeIssue | null {
  if (values.DISCOVERY_ENABLED !== 'true') return knowledgeIssue('discovery_disabled', ['DISCOVERY_ENABLED']);
  if (aiDisabled || values.AI_DISABLED === 'true')
    return knowledgeIssue('ai_unavailable', ['AI_DISABLED', 'LLM_PROVIDER']);
  const searchKey = values.SEARCH_PROVIDER === 'openai' ? 'OPENAI_API_KEY'
    : values.SEARCH_PROVIDER === 'anthropic' ? 'ANTHROPIC_API_KEY' : null;
  if (!searchKey) return knowledgeIssue('search_not_configured', ['SEARCH_PROVIDER']);
  if (!values[searchKey]) return knowledgeIssue('search_not_configured', [searchKey]);
  if(values.SCOUT_SOURCE_MODE==='fetch_and_extract'&&values.LLM_PROVIDER?.toLowerCase()==='openai'&&!values.AI_MODEL_EXTRACTION?.trim()&&!values.OPENAI_MODEL?.trim())
    return knowledgeIssue('extraction_not_configured',['AI_MODEL_EXTRACTION','OPENAI_MODEL']);
  return null;
}
export function knowledgeConfigurationIssue(values:NodeJS.ProcessEnv,aiDisabled:boolean):KnowledgeIssue|null {
  if(aiDisabled||values.AI_DISABLED==='true')return knowledgeIssue('ai_unavailable',['AI_DISABLED','LLM_PROVIDER']);

  const embeddingKeys: Record<string, string | null> = {
    openai: 'OPENAI_API_KEY', pinecone: 'PINECONE_API_KEY', voyage: 'VOYAGE_API_KEY', ollama: null,
  };
  const provider = values.EMBEDDING_PROVIDER || 'none';
  if (!Object.hasOwn(embeddingKeys, provider))
    return knowledgeIssue('embedding_not_configured', ['EMBEDDING_PROVIDER']);
  const embeddingKey = embeddingKeys[provider];
  if (embeddingKey && !values[embeddingKey]) return knowledgeIssue('embedding_not_configured', [embeddingKey]);

  const kind = values.DATABASE_URL?.startsWith('file:') ? 'memory'
    : values.VECTOR_STORE || 'memory';
  if (!['memory', 'pinecone', 'pgvector'].includes(kind))
    return knowledgeIssue('vector_not_configured', ['VECTOR_STORE']);
  if (kind === 'pinecone') {
    const missing = ['PINECONE_API_KEY', 'PINECONE_INDEX'].filter(name => !values[name]);
    if (missing.length) return knowledgeIssue('vector_not_configured', missing);
  }
  return null;
}
export function configurationIssue(values:NodeJS.ProcessEnv,aiDisabled:boolean):KnowledgeIssue|null {
  return searchConfigurationIssue(values,aiDisabled)||knowledgeConfigurationIssue(values,aiDisabled);
}

export class KnowledgeSetupError extends Error {
  constructor(public issue: KnowledgeIssue, message: string) { super(message); }
}

export function connectionIssue(error: unknown, kind: string): KnowledgeIssue {
  if (error instanceof KnowledgeSetupError) return error.issue;
  if (kind === 'pinecone' && error instanceof Error) {
    if (error.name === 'PineconeAuthorizationError')
      return knowledgeIssue('pinecone_authorization_failed', ['PINECONE_API_KEY']);
    if (error.name === 'PineconeNotFoundError')
      return knowledgeIssue('pinecone_index_not_found', ['PINECONE_INDEX', 'PINECONE_API_KEY']);
  }
  return knowledgeIssue('vector_unavailable');
}
