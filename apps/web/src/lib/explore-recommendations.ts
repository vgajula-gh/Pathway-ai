/** Shared by Explore and its evals: preserve the current 5 + 5 display policy. */
type Recommendation = {
  id: string;
  status?: string | null;
  bucket?: string;
  fit: { excluded?: boolean; score?: number };
};

export function visibleRecommendations<T extends Recommendation>(recommended: readonly T[], picks: readonly T[]): T[] {
  const candidates = [...new Map([...recommended, ...picks].map(o => [o.id, o])).values()]
    .filter(o => !o.status && !o.fit.excluded);
  return (['free', 'paid'] as const).flatMap(bucket => candidates.filter(o => o.bucket === bucket)
    .sort((a, b) => (b.fit.score ?? 0) - (a.fit.score ?? 0)).slice(0, 5));
}
