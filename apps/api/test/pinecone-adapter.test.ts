import {afterEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({index:vi.fn(),query:vi.fn().mockResolvedValue({matches:[{id:'chunk',score:.9}]}),upsert:vi.fn(),deleteMany:vi.fn(),listPaginated:vi.fn().mockResolvedValue({vectors:[{id:'chunk'}],pagination:{next:'next-page'}}),describeIndex:vi.fn().mockResolvedValue({dimension:1536,metric:'cosine'})}));
vi.mock('@pinecone-database/pinecone',()=>({Pinecone:class{index=state.index.mockReturnValue(state);describeIndex=state.describeIndex;}}));
import {pineconeStore} from '../src/knowledge/adapters/pinecone.js';
import {knowledgeFailure} from '../src/knowledge/failures.js';
afterEach(()=>vi.unstubAllEnvs());
it('uses the opportunities namespace, opportunity metadata filters and bounded pagination through the official SDK',async()=>{
 vi.stubEnv('PINECONE_API_KEY','test');vi.stubEnv('PINECONE_INDEX','pathway');try{const store=pineconeStore();expect(await store.dimension()).toBe(1536);expect(state.index).toHaveBeenCalledWith({name:'pathway',namespace:'opportunities'});expect(await store.query([1,0],'selected-program',10)).toEqual([{id:'chunk',score:.9}]);expect(state.query).toHaveBeenCalledWith({vector:[1,0],topK:10,filter:{opportunityId:{$eq:'selected-program'}},includeMetadata:false});expect(await store.list()).toEqual({ids:['chunk'],cursor:'next-page'});await store.delete(['chunk']);expect(state.deleteMany).toHaveBeenCalledWith({ids:['chunk']});}finally{vi.unstubAllEnvs();}
});
it('filters a server-owned multi-program scope with IN and includes index identity in freshness',async()=>{
 vi.stubEnv('PINECONE_API_KEY','test');vi.stubEnv('PINECONE_INDEX','pathway-two');try{const store=pineconeStore();await store.query([1,0],['one','two'],10);expect(state.query).toHaveBeenLastCalledWith({vector:[1,0],topK:10,filter:{opportunityId:{$in:['one','two']}},includeMetadata:false});expect(store.identity).toBe('pinecone:pathway-two:opportunities');}finally{vi.unstubAllEnvs();}
});
it('reads classic dense index dimensions from the SDK schema without invoking legacy getters',async()=>{
 vi.stubEnv('PINECONE_INDEX','public-programs');
 state.describeIndex.mockResolvedValue({schema:{fields:{_values:{type:'dense_vector',dimension:1024,metric:'cosine'}}},get dimension(){throw new Error('legacy getter');},get metric(){throw new Error('legacy getter');}} as any);
 expect(await pineconeStore().dimension()).toBe(1024);
});
it('identifies ambiguous dense document fields before attempting embeddings or writes',async()=>{
 state.describeIndex.mockResolvedValue({schema:{fields:{one:{type:'dense_vector',dimension:1024,metric:'cosine'},two:{type:'dense_vector',dimension:1024,metric:'cosine'}}}} as any);
 const error=await pineconeStore().dimension().catch(e=>e);
 expect(error.issue.code).toBe('index_api_mismatch');
 expect(knowledgeFailure(error,'vector','store_info').info).toMatchObject({code:'vector_index_type_mismatch',operation:'store_info'});
});

it('uses documents operations for a caller-named dense vector field',async()=>{
 const docs={upsert:vi.fn().mockResolvedValue({upsertedCount:1}),search:vi.fn().mockResolvedValue({matches:[{_id:'chunk',_score:.8}]}),fetch:vi.fn().mockResolvedValue({documents:{chunk:{_id:'chunk'},unexpected:{_id:'unexpected'}}}),list:vi.fn().mockResolvedValue({documents:[{_id:'chunk'}],pagination:{next:'next'}}),delete:vi.fn().mockResolvedValue({matchedRecords:1})};
 state.index.mockReturnValueOnce({documents:docs});state.describeIndex.mockResolvedValue({schema:{fields:{embedding:{type:'dense_vector',dimension:2,metric:'cosine'}}}} as any);
 const store=pineconeStore();expect(await store.dimension()).toBe(2);
 const metadata={chunkId:'chunk',opportunityId:'one',sourceUrl:'https://example.edu',pageTitle:'Public page',checkedAt:'2030-01-01T00:00:00Z'};
 await store.upsert([{id:'chunk',values:[1,0],metadata}]);
 expect(docs.upsert).toHaveBeenCalledWith({documents:[{_id:'chunk',...metadata,embedding:[1,0]}]});
 expect(await store.query([1,0],['one'],10)).toEqual([{id:'chunk',score:.8}]);
 expect(docs.search).toHaveBeenCalledWith({topK:10,scoreBy:[{type:'dense_vector',field:'embedding',values:[1,0]}],filter:{opportunityId:{$in:['one']}},includeFields:[]});
 expect(await store.fetchIds!(['chunk'])).toEqual(['chunk']);expect(await store.list()).toEqual({ids:['chunk'],cursor:'next'});await store.delete(['chunk']);expect(docs.delete).toHaveBeenCalledWith({ids:['chunk']});
});
