import {it,expect,vi} from 'vitest';
vi.mock('../src/knowledge/adapters/pinecone.js',()=>({pineconeStore:()=>({kind:'pinecone',dimension:async()=>1024})}));
vi.mock('../src/knowledge/embeddings/providers.js',()=>({getEmbedder:()=>({dimension:1536,model:'test'})}));
it('disables program questions on dimension mismatch without failing startup',async()=>{
 const {env}=await import('../src/lib/env.js');const disabled=env.aiDisabled;env.aiDisabled=false;
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 try{for(const [k,v] of Object.entries({DISCOVERY_ENABLED:'true',AI_DISABLED:'false',SEARCH_PROVIDER:'openai',OPENAI_API_KEY:'test',VECTOR_STORE:'pinecone',PINECONE_API_KEY:'test',PINECONE_INDEX:'test',DATABASE_URL:'postgresql://localhost/test'}))vi.stubEnv(k,v);
 const {initializeKnowledge}=await import('../src/knowledge/runtime.js');expect(await initializeKnowledge()).toBeNull();expect(warn).toHaveBeenCalledWith(expect.stringContaining('unavailable'),expect.stringContaining('dimensions'));
 }finally{env.aiDisabled=disabled;vi.unstubAllEnvs();warn.mockRestore();}
});
