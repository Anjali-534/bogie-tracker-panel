// "~412 km · ~7h 5m" — null when either half is missing/zero, so callers can
// skip the line entirely for orders without a cached route.
export function formatRouteSummary(distanceKm: number | null, durationMins: number | null): string | null {
  if (!distanceKm || !durationMins) return null;
  const km = Math.round(distanceKm);
  const h = Math.floor(durationMins / 60);
  const m = durationMins % 60;
  const duration = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return `~${km} km · ~${duration}`;
}

export function formatAgo(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}
