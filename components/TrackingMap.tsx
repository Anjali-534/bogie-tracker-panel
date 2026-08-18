'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import OlaMap, { decodePolyline, distanceMeters, type OlaMarker } from './OlaMap';
import { formatAgo, formatRouteSummary } from '@/lib/format';
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
  routePolyline?: string | null;
  routeDistanceKm?: number | null;
  routeDurationMins?: number | null;
  companyLogoUrl?: string | null;
}

// Matches the staleness threshold used for live driver GPS elsewhere
// (cab-panel's live fleet map) — beyond this, badge flips from Live to Stale.
const STALE_MS = 2 * 60 * 1000;

export default function TrackingMap({
  lastLat, lastLng, lastLocationAt, pings, fromLat, fromLng, toLat, toLng,
  routePolyline, routeDistanceKm, routeDurationMins, companyLogoUrl,
}: Props) {
  // No prop here changes on its own between polls — this just keeps the
  // "updated Xm ago" text counting up between the parent's poll ticks.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  // Fullscreen toggle — same pattern as the driver share page's map (single
  // OlaMap instance persists across states, only wrapper classes change).
  const [mapExpanded, setMapExpanded] = useState(false);
  // OlaMap has its own ResizeObserver on the map container, so no manual
  // resize() nudge is needed here anymore — it reacts to the fullscreen
  // class swap on its own.
  useEffect(() => {
    document.body.style.overflow = mapExpanded ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mapExpanded]);

  // Decoded once per polyline value — the stored route never changes for an
  // order, so the 15s poll re-render never re-decodes it.
  const plannedRoute = useMemo(
    () => (routePolyline ? decodePolyline(routePolyline) : undefined),
    [routePolyline],
  );

  const hasDriver = lastLat != null && lastLng != null;
  const stale = !lastLocationAt || (Date.now() - new Date(lastLocationAt).getTime()) > STALE_MS;

  const markers: OlaMarker[] = [];
  if (fromLat != null && fromLng != null) {
    markers.push({ lng: fromLng, lat: fromLat, color: '#22C55E', icon: 'pin', popup: 'Dispatch From' });
  }
  if (toLat != null && toLng != null) {
    markers.push({ lng: toLng, lat: toLat, color: '#EF4444', icon: 'pin', popup: 'Dispatch To' });
  }
  if (hasDriver) {
    markers.push({
      lng: lastLng as number, lat: lastLat as number, color: stale ? '#9CA3AF' : '#FF6B2B', id: 'driver', icon: 'truck', popup: 'Driver',
      logoUrl: companyLogoUrl ?? undefined,
    });
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
  const routeSummary = formatRouteSummary(routeDistanceKm ?? null, routeDurationMins ?? null);

  // Straight-line distance from the driver's *current* position to the
  // dropoff, every poll — same approximation already used for the driver
  // page's "reached" auto-detection. Kept as its own value (rather than
  // only feeding etaMins below) so it can be displayed directly.
  const remainingKm = useMemo(() => {
    if (!hasDriver || toLat == null || toLng == null) return null;
    return distanceMeters(lastLat as number, lastLng as number, toLat, toLng) / 1000;
  }, [hasDriver, lastLat, lastLng, toLat, toLng]);

  // Live ETA: re-derives remaining time from remainingKm every poll, using
  // the planned route's average speed (distance/duration) — not just a
  // client-side countdown timer, so it actually reflects whether the driver
  // has fallen behind or caught up.
  const etaMins = useMemo(() => {
    if (remainingKm == null) return null;
    if (!routeDistanceKm || !routeDurationMins || routeDistanceKm <= 0 || routeDurationMins <= 0) return null;
    const avgSpeedKmh = routeDistanceKm / (routeDurationMins / 60);
    if (!Number.isFinite(avgSpeedKmh) || avgSpeedKmh <= 0) return null;
    return Math.max(0, Math.round((remainingKm / avgSpeedKmh) * 60));
  }, [remainingKm, routeDistanceKm, routeDurationMins]);

  // Current speed: haversine distance ÷ elapsed time between the two most
  // recent pings (pings[] is ordered oldest-first, per the fetch query).
  // Purely client-side from data already fetched for the map — no new
  // backend field. Noisy at the ~15s client ping interval, same caveat as
  // remainingKm's straight-line approximation.
  const currentSpeedKmh = useMemo(() => {
    if (pings.length < 2) return null;
    const a = pings[pings.length - 2];
    const b = pings[pings.length - 1];
    const dtSec = (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) / 1000;
    if (!Number.isFinite(dtSec) || dtSec <= 0) return null;
    const speedKmh = (distanceMeters(a.lat, a.lng, b.lat, b.lng) / dtSec) * 3.6;
    return Number.isFinite(speedKmh) && speedKmh >= 0 ? speedKmh : null;
  }, [pings]);

  const liveStats: { label: string; value: string }[] = [];
  if (etaMins != null) liveStats.push({ label: 'ETA', value: etaMins <= 0 ? 'Arriving' : `${etaMins} min` });
  if (remainingKm != null) liveStats.push({ label: 'Remaining', value: `~${remainingKm < 10 ? remainingKm.toFixed(1) : Math.round(remainingKm)} km (straight-line)` });
  if (currentSpeedKmh != null) liveStats.push({ label: 'Speed', value: `~${Math.round(currentSpeedKmh)} km/h` });

  return (
    <div
      className={mapExpanded
        ? 'fixed inset-0 z-50 bg-white flex flex-col sheet-expand'
        : 'bg-white rounded-2xl border border-gray-100 p-4 space-y-3'}
    >
      <div className={mapExpanded ? 'flex items-center justify-between px-4 py-3 border-b border-gray-100' : 'flex items-center justify-between px-1'}>
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-bold text-gray-900">Live Location</p>
          {routeSummary && <p className="text-xs text-gray-400">{routeSummary}</p>}
        </div>
        <div className="flex items-center gap-2">
          {hasDriver && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${
              stale ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
            }`}>
              {stale ? 'Stale' : 'Live'} · updated {formatAgo(lastLocationAt)}
            </span>
          )}
          {mapExpanded && (
            <button
              onClick={() => setMapExpanded(false)}
              aria-label="Collapse map"
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X size={18} className="text-gray-600" />
            </button>
          )}
        </div>
      </div>
      <div className={mapExpanded ? 'relative flex-1 min-h-0' : 'relative'}>
        <OlaMap
          center={[markers[0].lng, markers[0].lat]}
          zoom={12}
          markers={markers}
          route={route}
          plannedRoute={plannedRoute}
          fitToMarkers
          fitTrigger={mapExpanded ? 1 : 0}
          className={mapExpanded ? 'w-full h-full' : 'w-full h-72 rounded-xl overflow-hidden'}
        />
        {!mapExpanded && (
          <button
            onClick={() => setMapExpanded(true)}
            aria-label="Expand map"
            className="absolute top-2 left-2 w-9 h-9 flex items-center justify-center bg-white rounded-lg border border-gray-200 shadow-md"
          >
            <Maximize2 size={16} className="text-gray-700" />
          </button>
        )}
        {liveStats.length > 0 && (
          <div className="absolute bottom-2 left-2 z-10 bg-white/95 backdrop-blur rounded-xl px-3 py-2 shadow-md border border-gray-200">
            <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide flex items-center gap-1 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </p>
            <div className="flex items-center">
              {liveStats.map((stat, i) => (
                <div key={stat.label} className={i > 0 ? 'pl-3 ml-3 border-l border-gray-200' : ''}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
                  <p className="text-sm font-bold text-gray-900">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
