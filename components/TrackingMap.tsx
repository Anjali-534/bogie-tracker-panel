'use client';
import { useEffect, useState } from 'react';
import OlaMap, { type OlaMarker } from './OlaMap';
import { formatAgo } from '@/lib/format';
import type { TrackerLocationPing } from '@/lib/types';

interface Props {
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  pings: TrackerLocationPing[];
  fromLat?: number | null;
  fromLng?: number | null;
  toLat?: number | null;
  toLng?: number | null;
}

// Matches the staleness threshold used for live driver GPS elsewhere
// (cab-panel's live fleet map) — beyond this, badge flips from Live to Stale.
const STALE_MS = 2 * 60 * 1000;

export default function TrackingMap({
  lastLat, lastLng, lastLocationAt, pings, fromLat, fromLng, toLat, toLng,
}: Props) {
  // No prop here changes on its own between polls — this just keeps the
  // "updated Xm ago" text counting up between the parent's poll ticks.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const hasDriver = lastLat != null && lastLng != null;
  const stale = !lastLocationAt || (Date.now() - new Date(lastLocationAt).getTime()) > STALE_MS;

  const markers: OlaMarker[] = [];
  if (fromLat != null && fromLng != null) {
    markers.push({ lng: fromLng, lat: fromLat, color: '#22C55E', label: 'A', popup: 'Dispatch From' });
  }
  if (toLat != null && toLng != null) {
    markers.push({ lng: toLng, lat: toLat, color: '#EF4444', label: 'B', popup: 'Dispatch To' });
  }
  if (hasDriver) {
    markers.push({ lng: lastLng as number, lat: lastLat as number, color: stale ? '#9CA3AF' : '#FF6B2B', label: '🚚', popup: 'Driver' });
  }

  // Nothing to plot at all — no route pins captured and no driver ping yet.
  if (markers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
        <p className="text-sm text-gray-400">Waiting for the driver&apos;s first location update…</p>
      </div>
    );
  }

  const route = pings.map(p => [p.lng, p.lat] as [number, number]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-bold text-gray-900">Live Location</p>
        {hasDriver && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
            stale ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
          }`}>
            {stale ? 'Stale' : 'Live'} · updated {formatAgo(lastLocationAt)}
          </span>
        )}
      </div>
      <OlaMap
        center={[markers[0].lng, markers[0].lat]}
        zoom={12}
        markers={markers}
        route={route}
        fitToMarkers
        className="w-full h-72 rounded-xl overflow-hidden"
      />
    </div>
  );
}
