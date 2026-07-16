'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import { Navigation, MapPin, AlertTriangle, Maximize2, X } from 'lucide-react';
import OlaMap, { decodePolyline, type OlaMarker } from '@/components/OlaMap';
import RouteRows from '@/components/RouteRows';
import { formatRouteSummary } from '@/lib/format';
import { STATUS_LABELS, STATUS_STYLES, type OrderStatus } from '@/lib/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';
const POST_INTERVAL_MS = 15000;

interface DriverOrder {
  status: OrderStatus;
  company_name: string;
  dispatch_from: string;
  dispatch_to: string;
  vehicle_number: string;
  is_terminal: boolean;
  dispatch_from_lat: number | null;
  dispatch_from_lng: number | null;
  dispatch_to_lat: number | null;
  dispatch_to_lng: number | null;
  route_polyline: string | null;
  route_distance_km: number | null;
  route_duration_mins: number | null;
}

export default function DriverSharePage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<DriverOrder | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [, setTick] = useState(0); // forces re-render so "updated Xs ago" stays live

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapObjRef = useRef<{ resize: () => void } | null>(null);
  const dragStartYRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await axios.get<DriverOrder>(`${API}/gogoo/public/tracker/driver/${token}`);
        if (!cancelled) setOrder(data);
      } catch {
        if (!cancelled) setOrder(null);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  // Live-update the "updated Xs ago" text while sharing.
  useEffect(() => {
    if (!sharing) return;
    const t = setInterval(() => setTick(x => x + 1), 5000);
    return () => clearInterval(t);
  }, [sharing]);

  // Always clean up geolocation watchers/timers on unmount.
  useEffect(() => stopSharing, []);

  // The map canvas needs an explicit resize after its container jumps between
  // compact and fullscreen — once right away, once after the animation settles.
  // Lock body scroll behind the fullscreen sheet while it's open.
  useEffect(() => {
    document.body.style.overflow = mapExpanded ? 'hidden' : '';
    const t1 = setTimeout(() => mapObjRef.current?.resize(), 50);
    const t2 = setTimeout(() => mapObjRef.current?.resize(), 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.body.style.overflow = '';
    };
  }, [mapExpanded]);

  // Decoded once — the stored route never changes for an order.
  const plannedRoute = useMemo(
    () => (order?.route_polyline ? decodePolyline(order.route_polyline) : undefined),
    [order?.route_polyline],
  );

  async function sendLocation() {
    if (!latestPosRef.current) return;
    try {
      await axios.post(`${API}/gogoo/public/tracker/driver/${token}/location`, latestPosRef.current);
      setLastSentAt(new Date());
      setSendError(false);
    } catch {
      setSendError(true);
    }
  }

  function startSharing() {
    if (!navigator.geolocation) {
      setUnsupported(true);
      return;
    }
    setPermissionDenied(false);
    setUnsupported(false);
    setSharing(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const isFirstFix = latestPosRef.current === null;
        latestPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyPos(latestPosRef.current);
        if (isFirstFix) sendLocation();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
          stopSharing();
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    intervalRef.current = setInterval(sendLocation, POST_INTERVAL_MS);
  }

  function stopSharing() {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (intervalRef.current != null) clearInterval(intervalRef.current);
    watchIdRef.current = null;
    intervalRef.current = null;
    latestPosRef.current = null;
    setSharing(false);
  }

  if (order === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (order === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-gray-500 font-semibold">Tracking link not found</p>
          <p className="text-xs text-gray-400 mt-1">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const routeSummary = formatRouteSummary(order.route_distance_km, order.route_duration_mins);
  const lastSentText = lastSentAt
    ? `Last update sent ${Math.max(0, Math.round((Date.now() - lastSentAt.getTime()) / 1000))}s ago`
    : 'Waiting for GPS fix…';
  const navigateHref = order.dispatch_to_lat != null && order.dispatch_to_lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${order.dispatch_to_lat},${order.dispatch_to_lng}`
    : null;

  const mapMarkers: OlaMarker[] = [];
  if (order.dispatch_from_lat != null && order.dispatch_from_lng != null) {
    mapMarkers.push({ lng: order.dispatch_from_lng, lat: order.dispatch_from_lat, color: '#22C55E', label: 'A' });
  }
  if (order.dispatch_to_lat != null && order.dispatch_to_lng != null) {
    mapMarkers.push({ lng: order.dispatch_to_lng, lat: order.dispatch_to_lat, color: '#EF4444', label: 'B' });
  }
  if (myPos) {
    mapMarkers.push({ lng: myPos.lng, lat: myPos.lat, color: '#FF6B2B', label: '🚚' });
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center">
          <Image src="/logo.png" alt="bogie" width={1536} height={1024} priority className="w-24 h-auto mx-auto mb-2" />
          {order.company_name ? (
            <>
              <h1 className="text-xl font-extrabold text-gray-900 leading-tight">{order.company_name}</h1>
              <p className="text-[11px] font-semibold text-orange-500 uppercase tracking-wider mt-1">Location Sharing</p>
            </>
          ) : (
            <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider">Location Sharing</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Route</p>
            <span className={`text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${STATUS_STYLES[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>
          <RouteRows from={order.dispatch_from} to={order.dispatch_to} />
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
            Vehicle: {order.vehicle_number}
            {routeSummary && <span> · {routeSummary}</span>}
          </p>
        </div>

        {mapMarkers.length > 0 && (
          /* The same element hosts both states so the OlaMap instance (and the
             geolocation stream feeding it) survives expand/collapse — only the
             wrapper classes change. */
          <div
            className={mapExpanded
              ? 'fixed inset-0 z-50 bg-white flex flex-col sheet-expand'
              : 'bg-white rounded-2xl border border-gray-100 p-3 space-y-3'}
          >
            {mapExpanded && (
              <div
                className="flex items-center justify-between px-3 py-2 border-b border-gray-100 touch-none select-none"
                onTouchStart={(e) => { dragStartYRef.current = e.touches[0].clientY; }}
                onTouchMove={(e) => {
                  if (dragStartYRef.current != null && e.touches[0].clientY - dragStartYRef.current > 70) {
                    dragStartYRef.current = null;
                    setMapExpanded(false);
                  }
                }}
                onTouchEnd={() => { dragStartYRef.current = null; }}
              >
                <span className="w-9" />
                <span className="w-10 h-1.5 bg-gray-300 rounded-full" />
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
                center={[mapMarkers[0].lng, mapMarkers[0].lat]}
                zoom={11}
                markers={mapMarkers}
                plannedRoute={plannedRoute}
                fitToMarkers
                onMapReady={(m) => { mapObjRef.current = m; }}
                className={mapExpanded ? 'w-full h-full' : 'w-full h-52 rounded-xl overflow-hidden'}
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
            </div>

            {mapExpanded ? (
              /* Bottom bar — sharing stays controllable without leaving the map. */
              <div className="border-t border-gray-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {order.is_terminal ? (
                  <p className="text-center text-sm font-semibold text-gray-500 py-2">This trip has ended.</p>
                ) : sharing ? (
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-600">Sharing your location</p>
                      <p className="text-[11px] text-gray-400 truncate">{lastSentText}</p>
                    </div>
                    {navigateHref && (
                      <a
                        href={navigateHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Navigate with Google Maps"
                        className="w-11 h-11 flex items-center justify-center border border-gray-200 rounded-xl"
                      >
                        <Navigation size={16} className="text-blue-600" />
                      </a>
                    )}
                    <button
                      onClick={stopSharing}
                      className="px-4 py-2.5 border-2 border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 transition-colors"
                    >
                      Stop
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={startSharing}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors"
                    >
                      <Navigation size={16} />
                      Start Sharing Location
                    </button>
                    {navigateHref && (
                      <a
                        href={navigateHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Navigate with Google Maps"
                        className="w-11 h-11 flex items-center justify-center border border-gray-200 rounded-xl"
                      >
                        <Navigation size={16} className="text-blue-600" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              navigateHref && (
                <a
                  href={navigateHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Navigation size={15} className="text-blue-600" />
                  Navigate with Google Maps
                </a>
              )
            )}
          </div>
        )}

        {order.is_terminal ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <p className="text-sm font-semibold text-gray-600">This trip has ended.</p>
            <p className="text-xs text-gray-400 mt-1">Location sharing is closed for this order.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            {permissionDenied && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">
                  Location permission was denied. Please enable location access for this site in your browser settings, then tap Start again.
                </p>
              </div>
            )}
            {unsupported && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">Location sharing isn&apos;t supported on this device/browser.</p>
              </div>
            )}
            {sendError && sharing && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">Couldn&apos;t send your last update — will retry automatically.</p>
              </div>
            )}

            {sharing ? (
              <>
                <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 rounded-xl py-3 font-semibold text-sm">
                  <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                  Sharing your location
                </div>
                <p className="text-center text-xs text-gray-400">{lastSentText}</p>
                <button
                  onClick={stopSharing}
                  className="w-full py-4 bg-white border-2 border-red-200 text-red-600 rounded-2xl text-base font-bold hover:bg-red-50 transition-colors"
                >
                  Stop Sharing
                </button>
              </>
            ) : (
              <button
                onClick={startSharing}
                className="w-full flex items-center justify-center gap-2 py-4 bg-orange-500 text-white rounded-2xl text-base font-bold hover:bg-orange-600 transition-colors"
              >
                <Navigation size={18} />
                Start Sharing Location
              </button>
            )}

            <div className="flex items-start gap-2 text-gray-400">
              <MapPin size={14} className="flex-shrink-0 mt-0.5" />
              <p className="text-xs">
                Keep this page open and your screen on while sharing — closing the app or locking your screen will stop location updates.
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400">
          bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}
