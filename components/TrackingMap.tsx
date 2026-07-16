'use client';
import { useEffect, useState } from 'react';
import OlaMap from './OlaMap';
import { formatAgo } from '@/lib/format';
import type { TrackerLocationPing } from '@/lib/types';

interface Props {
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
  pings: TrackerLocationPing[];
}

// Matches the staleness threshold used for live driver GPS elsewhere
// (cab-panel's live fleet map) — beyond this, badge flips from Live to Stale.
const STALE_MS = 2 * 60 * 1000;

export default function TrackingMap({ lastLat, lastLng, lastLocationAt, pings }: Props) {
  // No prop here changes on its own between polls — this just keeps the
  // "updated Xm ago" text counting up between the parent's poll ticks.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  if (lastLat == null || lastLng == null) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
        <p className="text-sm text-gray-400">Waiting for the driver&apos;s first location update…</p>
      </div>
    );
  }

  const stale = !lastLocationAt || (Date.now() - new Date(lastLocationAt).getTime()) > STALE_MS;
  const route = pings.map(p => [p.lng, p.lat] as [number, number]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-bold text-gray-900">Live Location</p>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
          stale ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
        }`}>
          {stale ? 'Stale' : 'Live'} · updated {formatAgo(lastLocationAt)}
        </span>
      </div>
      <OlaMap
        center={[lastLng, lastLat]}
        zoom={13}
        markers={[{ lng: lastLng, lat: lastLat, color: stale ? '#9CA3AF' : '#FF6B2B', label: '🚚' }]}
        route={route}
        fitToMarkers
        className="w-full h-72 rounded-xl overflow-hidden"
      />
    </div>
  );
}
