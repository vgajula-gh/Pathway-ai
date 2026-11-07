import { DiscoveryFailure, type FailureInfo } from '../discovery/failures.js';

type Component = NonNullable<FailureInfo['component']>;
type Operation = NonNullable<FailureInfo['operation']>;
/** Keep vendor/database exception text, request bodies and credentials out of diagnostics. */
export function knowledgeFailure(error: unknown, component: Component, operation: Operation): DiscoveryFailure {
  if (error instanceof DiscoveryFailure) return error;
  const value = error as { code?: unknown; name?: unknown; status?: unknown; statusCode?: unknown; cause?: { status?: unknown };
    issue?:{code?:string};dimensions?:{expectedDimension:number;actualDimension:number};meta?:{modelName?:unknown;column?:unknown} } | null;
  const candidate = value?.status ?? value?.statusCode ?? value?.cause?.status;
  const httpStatus = typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : undefined;
  const databaseCode = ['P2021', 'P2022', 'P2002', 'P2024'].includes(String(value?.code)) ? value!.code as FailureInfo['databaseCode'] : undefined;
  const code: FailureInfo['code'] = value?.issue?.code==='index_api_mismatch'?'vector_index_type_mismatch':value?.issue?.code==='index_dimension_mismatch'?'vector_dimension_mismatch':component === 'database'
    ? databaseCode === 'P2021' || databaseCode === 'P2022' ? 'knowledge_storage_unready' : 'knowledge_storage_failed'
    : component === 'embedding' ? 'embedding_failed'
    : component === 'source' ? 'program_source_unavailable'
    : operation === 'upsert' ? 'vector_write_failed' : 'vector_read_failed';
  const name=error instanceof Error?error.constructor.name:String(value?.name||'');
  const providerError:FailureInfo['providerError']=name==='PineconeAuthorizationError'?'authorization':name==='PineconeNotFoundError'?'not_found':
    ['PineconeArgumentError','PineconeBadRequestError'].includes(name)?'invalid_request':name==='PineconeConnectionError'?'connection':undefined;
  const table=['SourcePage','KnowledgeChunk'].includes(String(value?.meta?.modelName))?value!.meta!.modelName as FailureInfo['databaseTable']:undefined;
  const column=typeof value?.meta?.column==='string'?value.meta.column.replaceAll('"','').split('.').at(-1):undefined;
  const field=column&&['id','scope','localEmbedding','vectorStoreKey','embeddingModel','sourceUrl','pageTitle','checkedAt','contentHash','text','opportunityId'].includes(column)?column:undefined;
  return new DiscoveryFailure({ stage: 'index', code, component, operation,
    ...(providerError?{providerError}:{}),...(table?{databaseTable:table}:{}),...(field?{databaseField:field}:{}),
    ...(value?.issue?.code==='index_dimension_mismatch'&&value.dimensions?value.dimensions:{}),
    ...(httpStatus ? { httpStatus } : {}), ...(databaseCode ? { databaseCode } : {}) });
}

export async function knowledgeStep<T>(component: Component, operation: Operation, work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { throw knowledgeFailure(error, component, operation); }
}
