import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import OpportunitySearch,{type OpportunitySearchStatus} from '../../web/src/components/OpportunitySearch';
const status:OpportunitySearchStatus={discoveryEnabled:true,finding:false,limited:false,error:null,refresh:{available:true,remaining:1,nextAvailableAt:'2030-01-01'},search:{phase:'complete',found:0,detail:null,startedAt:'2029-01-01'}};
it('shows real stage counts while searching and a clear Search for more action afterward',()=>{
 const searching=renderToStaticMarkup(createElement(OpportunitySearch,{status:{...status,finding:true,search:{...status.search!,phase:'reading_sources'},diagnostics:{searchAttempts:1,candidates:{found:8,filtered:0,queued:8},steps:{fetch:{completed:2,failed:0},extract:{completed:1,failed:0},verify:{completed:1,failed:0}},programsSaved:1}},interests:['coding'],onRefresh:()=>{}}));
 expect(searching).toContain('Reading program pages');expect(searching).toContain('8 candidates found');expect(searching).toContain('2 pages read');expect(searching).toContain('disabled');
 const completed=renderToStaticMarkup(createElement(OpportunitySearch,{status,interests:['coding'],onRefresh:()=>{}}));expect(completed).toContain('Search for more');expect(completed).not.toContain('disabled');
});
it('keeps catalog refresh available after the web cap and explains the cap when the catalog has gaps',()=>{
 const limited={...status,limited:true,monthlyAllowance:{limited:true,reasons:['discovery_monthly_limit' as const],resetsAt:'2030-02-01'}};
 const cached=renderToStaticMarkup(createElement(OpportunitySearch,{status:{...limited,catalog:{complete:true,free:3,paid:3,missingInterests:[]}},interests:['coding'],onRefresh:()=>{}}));expect(cached).toContain('Refresh library picks');expect(cached).not.toContain('disabled');
 const gaps=renderToStaticMarkup(createElement(OpportunitySearch,{status:limited,interests:['coding'],onRefresh:()=>{}}));expect(gaps).toContain('monthly search allowance');expect(gaps).toContain('disabled');
});
