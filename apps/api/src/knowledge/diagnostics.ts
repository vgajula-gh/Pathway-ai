import {prisma,j} from '../lib/db.js';
import {safeModelId} from '../discovery/config.js';
import {initializeKnowledge,knowledgeUnavailable,knowledgeConnectionFailure,assertDimension} from './runtime.js';
import {knowledgeStep,knowledgeFailure} from './failures.js';
import {preparationAllowance,knowledgeSnapshot} from './preparation.js';
import {embeddingIdentity,vectorStoreIdentity} from './contracts.js';

export async function knowledgeDiagnostics(opportunityId?:string) {
  const base={checkedAt:new Date().toISOString(),namespace:'opportunities',embeddingRequests:0,searchRequests:0,
    index:process.env.VECTOR_STORE==='pinecone'&&/^[a-z0-9-]{1,45}$/.test(process.env.PINECONE_INDEX||'')?process.env.PINECONE_INDEX:null};
  try{
    const allowance=await knowledgeStep('database','chunk_read',()=>preparationAllowance());
    // Zero-row scalar reads catch schema drift before a paid embedding request.
    await knowledgeStep('database','chunk_read',()=>Promise.all([
      prisma.sourcePage.findMany({where:{id:'__knowledge_schema_check__'},take:1}),prisma.knowledgeChunk.findMany({where:{id:'__knowledge_schema_check__'},take:1}),
    ]));
    const rt=await initializeKnowledge();
    if(!rt)return {...base,allowance,configurationReady:false,issue:knowledgeUnavailable(),failure:knowledgeConnectionFailure()};
    const dimension=await knowledgeStep('vector','store_info',()=>rt.store.dimension());
    assertDimension(dimension,rt.embedder.dimension);
    const stats=rt.store.stats?await knowledgeStep('vector','store_info',()=>rt.store.stats!()):null;
    const [pages,chunks,runs]=await knowledgeStep('database','chunk_read',()=>Promise.all([
      prisma.sourcePage.groupBy({by:['opportunityId'],_count:true}),prisma.knowledgeChunk.count(),
      prisma.discoveryRun.findMany({where:{kind:{in:['knowledge','recheck']}},orderBy:[{startedAt:'desc'},{id:'desc'}],take:10}),
    ]));
    const programs=await knowledgeStep('database','source_read',()=>prisma.opportunity.findMany({where:{id:opportunityId||{in:pages.map(p=>p.opportunityId)}},take:10,
      select:{id:true,name:true,url:true,verificationStatus:true,sourceReadAt:true,sourceCheckedAt:true}}));
    let program:unknown=null;
    if(opportunityId){
      const s=await knowledgeSnapshot(opportunityId,rt),ids=s.chunks.filter(c=>c.embeddingModel===embeddingIdentity(rt.embedder)&&c.vectorStoreKey===vectorStoreIdentity(rt.store)&&s.pages.some(p=>p.sourceUrl===c.sourceUrl&&p.contentHash===c.contentHash)).map(c=>c.id);
      let found:number|null=null;
      if(rt.store.fetchIds&&ids.length){found=0;for(let i=0;i<ids.length;i+=100)found+=(await knowledgeStep('vector','vector_fetch',()=>rt.store.fetchIds!(ids.slice(i,i+100)))).length;}
      const attempt=await prisma.jobLease.findUnique({where:{key:s.key}});
      program={id:opportunityId,sqlReady:s.ready,sourcePages:s.pages.length,matchingChunks:ids.length,attempt:attempt?.owner||null,
        vectorConfirmation:found===null?'not_checked':found===ids.length?'confirmed':'pending_or_missing',vectorsFound:found};
    }
    return {...base,allowance,namespace:stats?.namespace||null,configurationReady:true,store:rt.store.kind,embedding:{provider:rt.embedder.provider||'unknown',model:safeModelId(rt.embedder.model),dimension:rt.embedder.dimension},
      indexDimension:dimension,namespaceRecords:stats?.recordCount??null,totalSourcePages:pages.reduce((n,p)=>n+p._count,0),totalChunks:chunks,
      programs:programs.map(p=>({...p,sourcePages:pages.find(s=>s.opportunityId===p.id)?._count||0})),program,
      recentRuns:runs.map(r=>{const usage=j<any>(r.usage,{});return {id:r.id,kind:r.kind,groupKey:r.groupKey,status:r.status,startedAt:r.startedAt,error:r.error,
        phase:usage.phase||null,indexing:usage.indexing||null,failures:usage.failures||[]};})};
  }catch(error){return {...base,configurationReady:false,failure:knowledgeFailure(error,'vector','store_info').info};}
}
