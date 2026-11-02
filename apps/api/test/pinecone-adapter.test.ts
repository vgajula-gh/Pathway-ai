import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({index:vi.fn(),query:vi.fn().mockResolvedValue({matches:[{id:'chunk',score:.9}]}),upsert:vi.fn(),deleteMany:vi.fn(),listPaginated:vi.fn().mockResolvedValue({vectors:[{id:'chunk'}],pagination:{next:'next-page'}}),describeIndex:vi.fn().mockResolvedValue({dimension:1536,metric:'cosine'})}));
vi.mock('@pinecone-database/pinecone',()=>({Pinecone:class{index=state.index.mockReturnValue(state);describeIndex=state.describeIndex;}}));
import {pineconeStore} from '../src/knowledge/adapters/pinecone.js';
it('uses the opportunities namespace, opportunity metadata filters and bounded pagination through the official SDK',async()=>{
 vi.stubEnv('PINECONE_API_KEY','test');vi.stubEnv('PINECONE_INDEX','pathway');try{const store=pineconeStore();expect(await store.dimension()).toBe(1536);expect(state.index).toHaveBeenCalledWith({name:'pathway',namespace:'opportunities'});expect(await store.query([1,0],'selected-program',10)).toEqual([{id:'chunk',score:.9}]);expect(state.query).toHaveBeenCalledWith({vector:[1,0],topK:10,filter:{opportunityId:{$eq:'selected-program'}},includeMetadata:false});expect(await store.list()).toEqual({ids:['chunk'],cursor:'next-page'});await store.delete(['chunk']);expect(state.deleteMany).toHaveBeenCalledWith({ids:['chunk']});}finally{vi.unstubAllEnvs();}
});
