import { pineconeClient } from './pinecone-client.js';
import {VectorStore,IntegratedEmbedding} from '../contracts.js';
import {knowledgeIssue,KnowledgeSetupError} from '../readiness.js';
import {publicProgramQuery} from '../../domain/knowledge.js';

type Configuration={api:'vectors'|'documents';input:'vectors'|'text';field:string;dimension:number;metric:string;embedding?:IntegratedEmbedding};
const incompatible=()=>new KnowledgeSetupError(knowledgeIssue('index_api_mismatch',['PINECONE_INDEX','VECTOR_STORE']),'A single supported dense ranking field is required');
const scopeFilter=(ids:string|string[])=>({opportunityId:Array.isArray(ids)?{$in:ids}:{$eq:ids}});
const metadataKeys=new Set(['_id','chunkId','opportunityId','sourceUrl','pageTitle','checkedAt']);

export function pineconeStore():VectorStore {
  const pc=pineconeClient(),name=process.env.PINECONE_INDEX!,index=pc.index({name,namespace:'opportunities'});
  let configuration:Configuration|undefined,pending:Promise<Configuration>|undefined;
  const describe=async():Promise<Configuration>=>{
    if(configuration)return configuration;
    if(pending)return pending;
    pending=(async()=>{
      const d=await pc.describeIndex(name),fields=d.schema?.fields;
      let c:Configuration;
      if(!fields)c={api:'vectors',input:'vectors',field:'_values',dimension:d.dimension||0,metric:d.metric||''};
      else {
        const entries=Object.entries(fields);
        const vectors=entries.filter(([,f])=>'type' in f&&['dense_vector','sparse_vector'].includes(f.type));
        const embedded=entries.filter(([,f])=>'type' in f&&f.type==='string'&&!!f.embed);
        const legacySemantic=entries.some(([,f])=>'type' in f&&f.type==='semantic_text');
        const dense=vectors.filter(([,f])=>'type' in f&&f.type==='dense_vector');
        if(legacySemantic||dense.length+embedded.length!==1)throw incompatible();
        if(embedded.length){
          const [field,f]=embedded[0];
          if(metadataKeys.has(field)||!('embed' in f)||!f.embed?.model||!f.embed.dimension||!f.embed.metric)throw incompatible();
          c={api:'documents',input:'text',field,dimension:f.embed.dimension,metric:f.embed.metric,
            embedding:{field,model:f.embed.model,dimension:f.embed.dimension}};
        }else{
          const [field,f]=dense[0];if(!('dimension' in f)||!f.dimension||!('metric' in f)||!f.metric)throw incompatible();
          const reserved=vectors.filter(([key])=>['_values','_sparse_values'].includes(key));
          if(reserved.length&&reserved.length!==vectors.length||metadataKeys.has(field))throw incompatible();
          c={api:field==='_values'?'vectors':'documents',input:'vectors',field,dimension:f.dimension,metric:f.metric};
        }
      }
      if(c.metric!=='cosine')throw new KnowledgeSetupError(knowledgeIssue('index_metric_mismatch',['PINECONE_INDEX']),'Cosine similarity is required');
      configuration=c;return c;
    })();
    try{return await pending;}finally{pending=undefined;}
  };
  return {
    kind:'pinecone',
    get identity(){return !configuration||configuration.api==='vectors'?`pinecone:${name}:opportunities`:
      `pinecone:${name}:opportunities:documents:${configuration.input}:${configuration.field}:${configuration.embedding?.model||''}:${configuration.dimension}`;},
    get integratedEmbedding(){return configuration?.embedding;},
    get indexDetails(){return configuration?{api:configuration.api,input:configuration.input,field:configuration.field}:undefined;},
    async dimension(){return (await describe()).dimension;},
    async stats(){const stats=await index.describeIndexStats();return {namespace:'opportunities',recordCount:stats.namespaces?.opportunities?.recordCount||0};},
    async fetchIds(ids){
      if(!ids.length)return [];
      const c=await describe();
      const found=c.api==='documents'?Object.keys((await index.documents.fetch({ids})).documents):Object.keys((await index.fetch({ids})).records);
      return found.filter(id=>ids.includes(id));
    },
    async upsert(records){
      if(!records.length)return;
      const c=await describe();if(c.input==='text')throw incompatible();
      if(c.api==='vectors')await index.upsert({records});
      else {
        const r=await index.documents.upsert({documents:records.map(r=>({_id:r.id,...r.metadata,[c.field]:r.values}))});
        if(r.upsertedCount!==records.length)throw new Error('Incomplete document write');
      }
    },
    async upsertText(records){
      if(!records.length)return {acknowledged:0};
      const c=await describe();if(c.input!=='text'||records.length>96)throw incompatible();
      const r=await index.documents.upsert({documents:records.map(r=>({_id:r.id,...r.metadata,title:r.metadata.pageTitle,[c.field]:r.text}))});
      if(!Number.isInteger(r.upsertedCount)||r.upsertedCount<0||r.upsertedCount>records.length)throw new Error('Invalid document acknowledgement');
      return {acknowledged:r.upsertedCount};
    },
    async query(vector,opportunityId,topK){
      const c=await describe();if(c.input==='text')throw incompatible();
      if(c.api==='documents'){
        const r=await index.documents.search({topK,scoreBy:[{type:'dense_vector',field:c.field,values:vector}],filter:scopeFilter(opportunityId),includeFields:[]});
        return r.matches.map(m=>({id:m._id,score:m._score||0}));
      }
      const r=await index.query({vector,topK,filter:scopeFilter(opportunityId),includeMetadata:false});
      return r.matches.map(m=>({id:m.id,score:m.score||0}));
    },
    async queryText(query,opportunityId,topK){
      const c=await describe();if(c.input!=='text')throw incompatible();
      const r=await index.documents.search({topK,scoreBy:[{type:'embed',field:c.field,query:publicProgramQuery(query)}],filter:scopeFilter(opportunityId),includeFields:[]});
      return r.matches.map(m=>({id:m._id,score:m._score||0}));
    },
    async delete(ids){
      if(!ids.length)return;
      if((await describe()).api==='documents')await index.documents.delete({ids});
      else await index.deleteMany({ids});
    },
    async list(cursor){
      if((await describe()).api==='documents'){
        const r=await index.documents.list({limit:100,paginationToken:cursor});
        return {ids:r.documents.map(d=>d._id),cursor:r.pagination?.next};
      }
      const r=await index.listPaginated({limit:100,paginationToken:cursor});
      return {ids:r.vectors?.flatMap(v=>v.id?[v.id]:[])||[],cursor:r.pagination?.next};
    },
  };
}
