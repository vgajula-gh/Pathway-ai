export type OpportunitySearchStatus = {
  discoveryEnabled: boolean;
  unavailable?: { code: string; message: string } | null;
  finding: boolean; limited: boolean; error: string | null;
  search?: { phase: string; found: number; detail: string | null };
  refresh: { available: boolean; remaining: number; nextAvailableAt: string };
};
export default function OpportunitySearch({status,interests,onRefresh,busy=false,error}:{status:OpportunitySearchStatus;interests:string[];onRefresh:()=>void;busy?:boolean;error?:string|null}) {
  const searching=status.finding||busy;
  return <div className="search-status" aria-busy={searching}>
    <p id="opportunity-search-status" role="status" className="note">{
      !interests.length?'Add an interest to find opportunities that fit you.':
      !status.discoveryEnabled||status.limited?"Opportunity search isn't available right now.":
      searching?'Searching for opportunities that fit your interests… this can take a minute':
      status.error?'The search could not finish. A failed search does not use your search allowance.':
      !status.refresh.available?`Next search available on ${new Date(status.refresh.nextAvailableAt).toLocaleDateString()}`:
      status.search?.phase==='cached'?'Found in the shared, verified program library. No new web search was needed.':
      'One search each month, plus one extra after your interests change. Shared library replacements are always free.'}</p>
    {!status.discoveryEnabled&&status.unavailable&&<p className="note">{status.unavailable.message}</p>}
    {(error||status.error)&&<p className="note" role="alert">{error||status.error}</p>}
    {searching&&<div className="search-skeletons" aria-hidden="true">{[0,1,2].map(n=><div key={n} className="search-skeleton"><i/><i/><i/></div>)}</div>}
    <button className="btn" disabled={!interests.length||!status.discoveryEnabled||status.limited||searching||!status.refresh.available} aria-describedby="opportunity-search-status" onClick={onRefresh}>{busy?'Starting search…':status.error?'Try again':'Search again'}</button>
  </div>;
}
