export type OpportunitySearchStatus = {
  discoveryEnabled: boolean;
  catalog?:{complete:boolean;free:number;paid:number;missingInterests:string[]};
  unavailable?: { code: string; message: string } | null;
  monthlyAllowance?: { limited: boolean; reasons: ('discovery_monthly_limit'|'ai_monthly_limit')[]; resetsAt: string };
  finding: boolean; limited: boolean; error: string | null;
  search?: { phase: string; found: number; detail: string | null; startedAt?:string|null };
  diagnostics?:{searchAttempts:number;candidates:{found:number;queued:number;filtered:number}|null;steps:{fetch:{completed:number;failed:number};extract:{completed:number;failed:number};verify:{completed:number;failed:number}};programsSaved:number};
  refresh: { available: boolean; remaining: number; nextAvailableAt: string };
};
export default function OpportunitySearch({status,interests,onRefresh,busy=false,error}:{status:OpportunitySearchStatus;interests:string[];onRefresh:()=>void;busy?:boolean;error?:string|null}) {
  const searching=status.finding||busy,cached=!!status.catalog?.complete;
  const reasons=status.monthlyAllowance?.reasons;
  const limitMessage=reasons?.length===2?'The shared monthly search and AI allowances have been reached.':
    reasons?.includes('ai_monthly_limit')?'The shared monthly AI allowance has been reached.':
    reasons?.includes('discovery_monthly_limit')?'The shared monthly search allowance has been reached.':
    'The shared monthly search or AI allowance has been reached.';
  return <div className="search-status" aria-busy={searching}>
    <p id="opportunity-search-status" role="status" className="note">{
      !interests.length?'Add an interest to find opportunities that fit you.':
      searching?({searching:'Searching the web for missing matches…',reading_sources:'Reading program pages…',checking_facts:'Checking source evidence…',queued:'Your search is queued…'}[status.search?.phase as string]||'Checking your program library…'):
      cached?'Current matches are available in the shared program library. Search reuses them without a new web search.':
      !status.discoveryEnabled?status.unavailable?.message||"Opportunity search isn't available right now.":
      status.limited?limitMessage+' Your existing programs are still available.':
      status.error?'The search could not finish. A failed search does not use your search allowance.':
      !status.refresh.available?`Next search available on ${new Date(status.refresh.nextAvailableAt).toLocaleDateString()}`:
      status.search?.phase==='cached'?'Found in the shared program library. No new web search was needed.':
      !status.search?.startedAt?'Choose Search for opportunities. We’ll check the shared library first and search only for missing matches.':
      'Search checks the shared library first. New web searches are limited to one each month, plus one extra after your interests change.'}</p>
    {!cached&&status.discoveryEnabled&&status.limited&&status.monthlyAllowance?.resetsAt&&<p className="note">Monthly usage resets on {new Date(status.monthlyAllowance.resetsAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}.</p>}
    {(error||!cached&&status.error)&&<p className="note" role="alert">{error||status.error}</p>}
    {!searching&&!status.error&&status.search?.phase==='empty'&&status.search.detail&&<p className="note">{status.search.detail}</p>}
    {searching&&status.diagnostics&&<p className="note" aria-live="polite">{status.diagnostics.candidates?.found??0} candidates found · {status.diagnostics.steps.fetch.completed} pages read · {status.diagnostics.steps.verify.completed} qualified. Keep Explore open to continue; completed results are saved.</p>}
    <button className="btn" disabled={!interests.length||searching||(!cached&&(!status.discoveryEnabled||status.limited||!status.refresh.available&&!!status.search?.startedAt))} aria-describedby="opportunity-search-status" onClick={onRefresh}>{busy?'Starting search…':status.error&&!cached?'Try again':cached?'Refresh library picks':status.search?.startedAt?'Search for more':'Search for opportunities'}</button>
  </div>;
}
