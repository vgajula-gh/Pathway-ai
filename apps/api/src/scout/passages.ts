import type {Page} from '../discovery/pages.js';
import type {ScoutFacts} from './schema.js';
export type SourcePassage={id:string;sourceUrl:string;text:string};
/** Exact slices of fetched text, not model-generated quotations. */
export function sourcePassages(pages:Page[]):SourcePassage[] {
  return pages.slice(0,4).flatMap((page,p)=>{
    const result:SourcePassage[]=[];
    let start=0,index=0;
    while(start<page.text.length&&index<80) {
      let end=Math.min(start+600,page.text.length);
      if(end<page.text.length){const at=page.text.lastIndexOf(' ',end);if(at>start+300)end=at;}
      const text=page.text.slice(start,end).trim();if(text)result.push({id:`p${p}-s${index++}`,sourceUrl:page.sourceUrl,text});
      start=end;while(page.text[start]===' ')start++;
    }
    return result;
  });
}
export function resolveEvidence(facts:ScoutFacts,passages:SourcePassage[]) {
  const byId=new Map(passages.map(p=>[p.id,p]));
  return Object.fromEntries(Object.entries(facts.evidence).flatMap(([field,ids])=>{
    if(!ids?.length)return [];
    const found=ids.map(id=>byId.get(id));
    // Unknown references never acquire a fabricated quote or cross-page concatenation.
    if(found.some(p=>!p)||new Set(found.map(p=>p!.sourceUrl)).size!==1)return [];
    const ordered=found.map(p=>p!);const text=ordered.map(p=>p.text).join(' ');
    const source=passages.filter(p=>p.sourceUrl===ordered[0].sourceUrl).map(p=>p.text).join(' ');
    return source.includes(text)?[[field,{sourceUrl:ordered[0].sourceUrl,quote:text}]]:[];
  }));
}
