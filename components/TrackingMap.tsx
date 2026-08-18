'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import OlaMap, { decodePolyline, distanceMeters, type OlaMarker } from './OlaMap';
import { formatAgo, formatRouteSummary } from '@/lib/format';
import type { TrackerLocationPing, TrackerLiveRoute } from '@/lib/types';

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
  // Fresh traffic-aware route(s) from GET .../live-route — polled by the
  // parent page while the order is actively in transit. Empty/absent before
  // the first poll response or once tracking stops; this component never
  // fetches on its own.
  liveRoutes?: TrackerLiveRoute[];
  // Which route the driver has actually tapped/selected on their own map
  // (order.selected_route_index) — read-only here, drives which option this
  // map previews and the "Driver is on Route X" label. Null/undefined means
  // no explicit selection yet, so index 0 (the recommended route) is shown.
  selectedRouteIndex?: number | null;
}

// Matches the staleness threshold used for live driver GPS elsewhere
// (cab-panel's live fleet map) — beyond this, badge flips from Live to Stale.
const STALE_MS = 2 * 60 * 1000;

export default function TrackingMap({
  lastLat, lastLng, lastLocationAt, pings, fromLat, fromLng, toLat, toLng,
  routePolyline, routeDistanceKm, routeDurationMins, companyLogoUrl, liveRoutes = [],
  selectedRouteIndex,
}: Props) {
  // Which live-route option this map previews — the driver's own choice
  // (order.selected_route_index), not a dispatcher UI toggle: the company
  // panel is read-only here, it displays the driver's selection rather than
  // setting it. Null/undefined (no explicit selection yet) and any stale
  // out-of-range index both fall back to 0, the recommended option.
  const selectedRouteIdx = selectedRouteIndex != null && selectedRouteIndex < liveRoutes.length
    ? selectedRouteIndex
    : 0;

  // Snapshot of "now" for the staleness calc below, refreshed every 15s by
  // the interval — NOT read via a bare Date.now() call in the render body,
  // which the React Compiler flags as an impure call (its result can differ
  // between renders of what's supposed to be a pure function). The lazy
  // useState initializer form runs exactly once, so it doesn't have that
  // problem the way a bare call in the body would.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15000);
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

  // selectedRoute and everything derived from it (below) must be computed
  // — and, for the useMemo calls, unconditionally called — before the
  // markers.length===0 early return further down: React requires the same
  // hooks in the same order on every render, and this component used to
  // call these three useMemo hooks only on renders that got past that
  // return, which is a rules-of-hooks violation.
  const selectedRoute = liveRoutes[Math.min(selectedRouteIdx, liveRoutes.length - 1)];

  // Decoded once per polyline value, same reasoning as plannedRoute above —
  // avoids re-decoding on every unrelated re-render (e.g. the 15s tick).
  const liveRouteCoords = useMemo(
    () => (selectedRoute?.polyline ? decodePolyline(selectedRoute.polyline) : undefined),
    [selectedRoute?.polyline],
  );

  // Ola's travel_advisory is "startPointIdx,endPointIdx,congestionLevel"
  // triplets, verified live to index directly into the decoded polyline's
  // point array (a real test response's point count matched the advisory's
  // max index exactly) — so slicing liveRouteCoords by each triplet's
  // [start,end] gives the exact coordinate run for that congestion level,
  // no separate geometry needed.
  const trafficSegments = useMemo(() => {
    if (!liveRouteCoords || !selectedRoute?.travel_advisory) return undefined;
    return selectedRoute.travel_advisory
      .split('|')
      .map(triplet => {
        const [startIdx, endIdx, congestion] = triplet.split(',').map(Number);
        return { coords: liveRouteCoords.slice(startIdx, endIdx + 1), congestion };
      })
      .filter(seg => seg.coords.length >= 2 && Number.isFinite(seg.congestion));
  }, [liveRouteCoords, selectedRoute?.travel_advisory]);

  // Current speed: haversine distance ÷ elapsed time between the two most
  // recent pings (pings[] is ordered oldest-first, per the fetch query).
  // Purely client-side from data already fetched for the map — no new
  // backend field. Noisy at the ~15s client ping interval — a real-world
  // limitation of any two-fix speed estimate, not something worth hiding.
  const currentSpeedKmh = useMemo(() => {
    if (pings.length < 2) return null;
    const a = pings[pings.length - 2];
    const b = pings[pings.length - 1];
    const dtSec = (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) / 1000;
    if (!Number.isFinite(dtSec) || dtSec <= 0) return null;
    const speedKmh = (distanceMeters(a.lat, a.lng, b.lat, b.lng) / dtSec) * 3.6;
    return Number.isFinite(speedKmh) && speedKmh >= 0 ? speedKmh : null;
  }, [pings]);

  const hasDriver = lastLat != null && lastLng != null;
  const stale = !lastLocationAt || (nowMs - new Date(lastLocationAt).getTime()) > STALE_MS;

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

  // "Live route" stats now come straight from the fresh traffic-aware call's
  // own distance/duration for whichever route the dispatcher has selected —
  // no more separate straight-line "Remaining" estimate now that a real
  // road-route number is available (superseded, per product decision).
  const liveStats: { label: string; value: string }[] = [];
  if (selectedRoute) {
    liveStats.push({ label: 'Route', value: `~${selectedRoute.distance_km < 10 ? selectedRoute.distance_km.toFixed(1) : Math.round(selectedRoute.distance_km)} km` });
    liveStats.push({ label: 'ETA', value: selectedRoute.duration_mins <= 0 ? 'Arriving' : `${selectedRoute.duration_mins} min` });
  }
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
          liveRoute={liveRouteCoords}
          trafficSegments={trafficSegments}
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
          <div className="absolute bottom-2 left-2 z-10 bg-white/95 backdrop-blur rounded-xl px-3 py-2 shadow-md border border-gray-200 max-w-[calc(100%-1rem)]">
            <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide flex items-center gap-1 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </p>
            {liveRoutes.length > 1 && (
              // Read-only — reflects the driver's own tap on their map
              // (selectedRouteIndex), never a dispatcher-side toggle.
              <div className="mb-1.5">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-blue-100 text-blue-700">
                  Driver is on Route {selectedRouteIdx + 1}
                </span>
              </div>
            )}
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
