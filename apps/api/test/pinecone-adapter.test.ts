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
it('identifies an incompatible document index before attempting embeddings or writes',async()=>{
 state.describeIndex.mockResolvedValue({schema:{fields:{body:{type:'string'},semantic_vector:{type:'dense_vector',dimension:1024,metric:'cosine'}}}} as any);
 const error=await pineconeStore().dimension().catch(e=>e);
 expect(error.issue.code).toBe('index_api_mismatch');
 expect(knowledgeFailure(error,'vector','store_info').info).toMatchObject({code:'vector_index_type_mismatch',operation:'store_info'});
});
