'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import { Navigation, MapPin, AlertTriangle, Maximize2, X, MessageCircle } from 'lucide-react';
import OlaMap, { decodePolyline, type OlaMarker } from '@/components/OlaMap';
import SignaturePad from '@/components/SignaturePad';
import RouteRows from '@/components/RouteRows';
import { formatRouteSummary } from '@/lib/format';
import { DRIVER_EVENT_KIND_LABELS, STATUS_LABELS, STATUS_STYLES, type DriverEventKind, type OrderStatus } from '@/lib/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';
const POST_INTERVAL_MS = 15000;
const MESSAGE_POLL_MS = 20000;

// Quick-status row — 'delivery_claimed' (Delivered) is handled separately
// below since it opens the signature pad instead of posting directly.
const QUICK_STATUS_BUTTONS: Exclude<DriverEventKind, 'delivery_claimed'>[] = [
  'on_break', 'about_to_reach', 'reached', 'unloading',
];

interface DriverMessage {
  id: string;
  body: string;
  created_at: string;
  is_new: boolean;
}

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

  // Quick-status buttons (Phase 2)
  const [postingKind, setPostingKind] = useState<DriverEventKind | null>(null);
  const [lastPostedKind, setLastPostedKind] = useState<DriverEventKind | null>(null);
  const [quickStatusError, setQuickStatusError] = useState<string | null>(null);

  // Delivered → signature pad flow (Phase 3)
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [submittingSignature, setSubmittingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [deliveryClaimed, setDeliveryClaimed] = useState(false);

  // Company → driver messages (Phase 4)
  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [messageBanner, setMessageBanner] = useState<DriverMessage | null>(null);
  const [showMessageFeed, setShowMessageFeed] = useState(false);

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

  // Piggybacks on the same 20s poll as the fetch — the GET marks unread
  // messages read as a side effect, so the fetch IS the read receipt.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { data } = await axios.get<{ messages: DriverMessage[] }>(`${API}/gogoo/public/tracker/driver/${token}/messages`);
        if (cancelled) return;
        setMessages(data.messages);
        const newest = [...data.messages].reverse().find(m => m.is_new);
        if (newest) setMessageBanner(newest);
      } catch {
        // Silent — messages are a nice-to-have overlay, not critical path.
      }
    }
    poll();
    const t = setInterval(poll, MESSAGE_POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [token]);

  async function postQuickStatus(kind: Exclude<DriverEventKind, 'delivery_claimed'>) {
    setPostingKind(kind);
    setQuickStatusError(null);
    try {
      await axios.post(`${API}/gogoo/public/tracker/driver/${token}/event`, { kind });
      setLastPostedKind(kind);
    } catch {
      setQuickStatusError("Couldn't send that update — please try again.");
    } finally {
      setPostingKind(null);
    }
  }

  async function confirmDeliverySignature(blob: Blob) {
    setSubmittingSignature(true);
    setSignatureError(null);
    try {
      // Record the claim first, then the signature — if the signature
      // upload fails the driver can retry without re-claiming.
      await axios.post(`${API}/gogoo/public/tracker/driver/${token}/event`, { kind: 'delivery_claimed' });
      const form = new FormData();
      form.append('file', blob, 'signature.png');
      await axios.post(`${API}/gogoo/public/tracker/driver/${token}/signature`, form);
      setDeliveryClaimed(true);
      setShowSignaturePad(false);
    } catch {
      setSignatureError("Couldn't submit your signature — please try again.");
    } finally {
      setSubmittingSignature(false);
    }
  }

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

  if (showSignaturePad) {
    return (
      <SignaturePad
        onConfirm={confirmDeliverySignature}
        onCancel={() => { if (!submittingSignature) setShowSignaturePad(false); }}
        submitting={submittingSignature}
        error={signatureError}
      />
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
    mapMarkers.push({ lng: order.dispatch_from_lng, lat: order.dispatch_from_lat, color: '#22C55E', icon: 'pin' });
  }
  if (order.dispatch_to_lat != null && order.dispatch_to_lng != null) {
    mapMarkers.push({ lng: order.dispatch_to_lng, lat: order.dispatch_to_lat, color: '#EF4444', icon: 'pin' });
  }
  if (myPos) {
    mapMarkers.push({ lng: myPos.lng, lat: myPos.lat, color: '#FF6B2B', id: 'driver', icon: 'truck' });
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center">
          <Image src="/logo.png" alt="bogie" width={1058} height={330} priority className="w-24 h-auto mx-auto mb-2" />
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
                fitTrigger={mapExpanded ? 1 : 0}
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

        {messageBanner && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-3">
            <MessageCircle size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">Message from {order.company_name || 'Company'}</p>
              <p className="text-sm text-blue-900 mt-0.5">{messageBanner.body}</p>
            </div>
            <button onClick={() => setMessageBanner(null)} aria-label="Dismiss" className="flex-shrink-0 text-blue-400 hover:text-blue-600">
              <X size={16} />
            </button>
          </div>
        )}

        {!order.is_terminal && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900 mb-1">Quick Status</h2>
              <p className="text-xs text-gray-400">Let the company know where things stand.</p>
            </div>

            {deliveryClaimed ? (
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl p-3">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-green-700">Delivery claimed — waiting for the company to confirm.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {QUICK_STATUS_BUTTONS.map(kind => (
                  <button
                    key={kind}
                    onClick={() => postQuickStatus(kind)}
                    disabled={postingKind !== null}
                    className={`px-3 py-3 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50 ${
                      lastPostedKind === kind
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {postingKind === kind ? 'Sending…' : DRIVER_EVENT_KIND_LABELS[kind]}
                  </button>
                ))}
                <button
                  onClick={() => { setSignatureError(null); setShowSignaturePad(true); }}
                  disabled={postingKind !== null}
                  className="col-span-2 px-3 py-3 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {DRIVER_EVENT_KIND_LABELS.delivery_claimed}
                </button>
              </div>
            )}

            {quickStatusError && <p className="text-xs text-red-500">{quickStatusError}</p>}
          </div>
        )}

        {messages.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <button
              onClick={() => setShowMessageFeed(s => !s)}
              className="w-full flex items-center justify-between text-sm font-bold text-gray-900"
            >
              <span className="flex items-center gap-1.5"><MessageCircle size={14} />Messages ({messages.length})</span>
              <span className="text-xs text-gray-400">{showMessageFeed ? 'Hide' : 'Show'}</span>
            </button>
            {showMessageFeed && (
              <div className="mt-3 space-y-2.5">
                {messages.slice().reverse().map(m => (
                  <div key={m.id} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-sm text-gray-800">{m.body}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{new Date(m.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400">
          bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}
