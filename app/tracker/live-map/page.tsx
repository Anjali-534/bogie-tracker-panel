'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Maximize2, X, Search } from 'lucide-react';
import OlaMap, { type OlaMarker } from '@/components/OlaMap';
import { api } from '@/lib/api';
import { formatAgo, formatRouteSummary } from '@/lib/format';
import type { TrackerLiveMapOrder } from '@/lib/types';

const POLL_MS = 15000;
// Matches the staleness threshold used everywhere else driver GPS is shown
// (cab-panel's live fleet map, TrackingMap on the order-detail page).
const STALE_MS = 2 * 60 * 1000;

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  dispatched: { bg: '#FEF3C7', text: '#B45309', label: 'Dispatched' },
  in_transit: { bg: '#DBEAFE', text: '#1D4ED8', label: 'In Transit' },
};

export default function LiveMapPage() {
  const [orders, setOrders] = useState<TrackerLiveMapOrder[] | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const hasLoadedOnce = useRef(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const mapObjRef = useRef<{ resize: () => void; flyTo: (opts: { center: [number, number]; zoom?: number }) => void } | null>(null);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);
  // OlaMap has its own ResizeObserver on the map container, so no manual
  // resize() nudge is needed here anymore — it reacts to the fullscreen
  // class swap on its own.
  useEffect(() => {
    document.body.style.overflow = mapExpanded ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mapExpanded]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/gogoo/tracker/live-map');
      setOrders(data || []);
      // Only fit bounds the first time markers appear — every later poll
      // updates positions in place so it never fights the user's own pan/zoom.
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true;
        setFitTrigger(t => t + 1);
      }
    } catch {
      // Keep showing the last-known state; the next 15s poll retries.
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (orders === null) {
    return <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>;
  }

  const now = Date.now();
  const isStale = (o: TrackerLiveMapOrder) =>
    !o.last_location_at || now - new Date(o.last_location_at).getTime() > STALE_MS;
  const staleCount = orders.filter(isStale).length;

  const markers: OlaMarker[] = orders
    .filter(o => o.last_lat != null && o.last_lng != null)
    .map(o => {
      const stale = isStale(o);
      const badge = STATUS_BADGE[o.status] || { bg: '#F3F4F6', text: '#6B7280', label: o.status };
      const routeSummary = formatRouteSummary(o.route_distance_km, o.route_duration_mins);
      const popupHtml = `
        <div style="font-family:system-ui;min-width:190px;padding:4px">
          <div style="font-weight:800;font-size:14px;margin-bottom:2px">🚚 ${o.driver_name || 'Unassigned driver'}</div>
          <div style="color:#6B7280;font-size:12px">${o.vehicle_number || '—'}</div>
          <div style="color:#374151;font-size:12px;margin-top:6px;font-weight:600">${o.booked_for_company_name}</div>
          <div style="color:#9CA3AF;font-size:11px;margin-top:2px">${o.dispatch_from} → ${o.dispatch_to}</div>
          ${routeSummary ? `<div style="color:#9CA3AF;font-size:11px;margin-top:2px">${routeSummary}</div>` : ''}
          <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
            <span style="background:${badge.bg};color:${badge.text};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">${badge.label}</span>
            <span style="background:${stale ? '#F3F4F6' : '#DCFCE7'};color:${stale ? '#6B7280' : '#16A34A'};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">${stale ? 'STALE' : 'LIVE'}</span>
          </div>
          <div style="color:#9CA3AF;font-size:10px;margin-top:5px">last updated ${formatAgo(o.last_location_at)}</div>
          <div style="margin-top:8px"><a href="/tracker/orders/${o.id}" style="color:#FF6B2B;font-size:12px;font-weight:700;text-decoration:underline">View Order →</a></div>
        </div>`;
      return {
        id: o.id,
        lng: o.last_lng as number,
        lat: o.last_lat as number,
        icon: 'truck',
        color: stale ? '#9CA3AF' : '#FF6B2B',
        popup: popupHtml,
      };
    });

  const searchMatches = search.trim().length === 0 ? [] : orders.filter(o => {
    if (o.last_lat == null || o.last_lng == null) return false;
    const q = search.trim().toLowerCase();
    return (o.driver_name || '').toLowerCase().includes(q)
      || (o.vehicle_number || '').toLowerCase().includes(q)
      || (o.booked_for_company_name || '').toLowerCase().includes(q);
  });

  function jumpToOrder(o: TrackerLiveMapOrder) {
    if (o.last_lat == null || o.last_lng == null) return;
    mapObjRef.current?.flyTo({ center: [o.last_lng, o.last_lat], zoom: 15 });
    setSearch('');
    setShowDropdown(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Live Map</h1>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-orange-500 transition font-medium">
          <RefreshCw size={13} />Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-2xl font-extrabold text-orange-600">{orders.length}</p>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">In Transit</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-2xl font-extrabold text-gray-500">{staleCount}</p>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-1">Stale / Not Sharing</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <p className="text-3xl mb-2">🗺️</p>
          <p className="text-gray-500 font-medium">No shipments currently in transit</p>
        </div>
      ) : (
        <>
        <div ref={searchBoxRef} className="relative">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => search.trim().length > 0 && setShowDropdown(true)}
              placeholder="Find a driver, vehicle number or company…"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          {showDropdown && search.trim().length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {searchMatches.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400">No matching driver in transit</p>
              ) : searchMatches.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => jumpToOrder(o)}
                  className="flex flex-col w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0"
                >
                  <span className="text-sm font-semibold text-gray-800">{o.driver_name || 'Unassigned driver'} · {o.vehicle_number || '—'}</span>
                  <span className="text-xs text-gray-400 truncate">{o.booked_for_company_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div
          className={mapExpanded
            ? 'fixed inset-0 z-50 bg-white flex flex-col sheet-expand'
            : 'relative'}
        >
          {mapExpanded && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h1 className="text-sm font-bold text-gray-900">Live Map</h1>
              <button
                onClick={() => setMapExpanded(false)}
                aria-label="Collapse map"
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
          )}
          <div className={mapExpanded ? 'relative flex-1 min-h-0' : 'relative'}>
            <OlaMap
              markers={markers}
              fitToMarkers
              fitTrigger={fitTrigger}
              onMapReady={(m) => { mapObjRef.current = m; }}
              className={mapExpanded
                ? 'w-full h-full'
                : 'w-full h-[60vh] lg:h-[calc(100vh-320px)] min-h-[350px] lg:min-h-[500px] rounded-2xl overflow-hidden border border-gray-100'}
            />
            {!mapExpanded && (
              <button
                onClick={() => { setMapExpanded(true); setFitTrigger(t => t + 1); }}
                aria-label="Expand map"
                className="absolute top-2 left-2 w-9 h-9 flex items-center justify-center bg-white rounded-lg border border-gray-200 shadow-md"
              >
                <Maximize2 size={16} className="text-gray-700" />
              </button>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
