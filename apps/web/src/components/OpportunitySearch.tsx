export type OpportunitySearchStatus = {
  discoveryEnabled: boolean;
  unavailable?: { code: string; message: string } | null;
  finding: boolean;
  limited: boolean;
  error: string | null;
  refresh: { available: boolean; remaining: number; nextAvailableAt: string };
};

export default function OpportunitySearch({ status, interests, onRefresh }: {
  status: OpportunitySearchStatus;
  interests: string[];
  onRefresh: () => void;
}) {
  return <div className="card" style={{ marginTop: 16 }}>
    <h2>Opportunity search</h2>
    <p className="muted small" style={{ marginTop: 6 }}>
      {interests.length ? `Your interests: ${interests.join(', ')}.` : 'Add interests in You to personalize your picks.'}
    </p>
    <button className="btn" style={{ marginTop: 12 }}
      disabled={!status.discoveryEnabled || status.finding || !status.refresh.available}
      aria-describedby="opportunity-search-status" onClick={onRefresh}>
      Find new opportunities
    </button>
    <p className="note" id="opportunity-search-status" role="status">
      {!status.discoveryEnabled
        ? status.unavailable?.message || 'Showing catalog picks. Live discovery and program questions are not available right now.'
        : status.finding
          ? 'Finding more programs for you… usually takes a minute.'
          : !status.refresh.available
            ? `Next refresh available on ${new Date(status.refresh.nextAvailableAt).toLocaleDateString()}`
            : 'Refresh your catalog picks. A new search runs when more suitable programs are needed.'}
    </p>
    {status.discoveryEnabled && status.error && <p className="note">{status.error}</p>}
    {status.discoveryEnabled && status.limited && <p className="note">Live discovery has reached its allowance. You can still explore, save and replace catalog picks.</p>}
  </div>;
}
