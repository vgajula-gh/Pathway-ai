import {expect,it} from 'vitest';
import {chunkText,supportedClaims} from '../src/domain/knowledge.js';
import {memoryStore} from '../src/knowledge/adapters/memory.js';
import {assertDimension} from '../src/knowledge/runtime.js';
it('chunks with overlap and keeps final words exactly once in the last chunk',()=>{
 const words=Array.from({length:1001},(_,i)=>`word${i}`),chunks=chunkText(words.join(' '));expect(chunks).toHaveLength(3);expect(chunks[0].split(' ')).toHaveLength(500);expect(chunks[1].split(' ').slice(0,50)).toEqual(words.slice(450,500));expect(chunks.at(-1)?.endsWith('word1000')).toBe(true);expect(chunkText('')).toEqual([]);
});
it('memory vector contract scopes all queries, replaces IDs and supports orphan listing/deletion',async()=>{
 const store=memoryStore(2),record=(id:string,opportunityId:string,values:number[])=>({id,values,metadata:{chunkId:id,opportunityId,sourceUrl:'https://example.edu',pageTitle:'Page',checkedAt:new Date().toISOString()}});
 await store.upsert([record('a','one',[1,0]),record('b','two',[1,0]),record('c','one',[0,1])]);expect((await store.query([1,0],'one',10)).map(r=>r.id)).toEqual(['a','c']);
 await store.upsert([record('a','one',[0,1])]);await store.delete(['c']);expect((await store.list()).ids.sort()).toEqual(['a','b']);expect((await store.query([1,0],'one',1))[0].score).toBe(0);
});
it('only accepts exact source excerpts tied to a returned passage, with a safe no-answer path',()=>{
 const passages=[{id:'a',opportunityId:'one',text:'Applications require a teacher recommendation.',sourceUrl:'https://example.edu',pageTitle:'Rules',checkedAt:new Date()}];
 expect(supportedClaims({claims:[{chunkId:'a',quote:'Applications require a teacher recommendation.'},{chunkId:'a',quote:'Everyone gets a scholarship.'},{chunkId:'other',quote:passages[0].text}]},passages)).toHaveLength(1);expect(supportedClaims({claims:[]},passages)).toEqual([]);expect(()=>assertDimension(1024,1536)).toThrow('turned off');
});
