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
import { DRIVER_EVENT_KIND_LABELS, STATUS_LABELS, STATUS_STYLES, type OrderStatus } from '@/lib/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';
const POST_INTERVAL_MS = 10000;
const MESSAGE_POLL_MS = 20000;
const REACHED_RADIUS_METERS = 100;

// Haversine great-circle distance, in meters — used to auto-detect when the
// driver is close enough to the dropoff to reveal Sign + Delivered.
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface DriverMessage {
  id: string;
  body: string;
  created_at: string;
  is_new: boolean;
}

interface DriverOrder {
  status: OrderStatus;
  company_name: string;
  company_logo_url: string | null;
  booked_for_company_name: string;
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
  // Present only when this driver_token belongs to a multi-stop trip
  // (backend migration 055) rather than a single order — dispatch_to/
  // booked_for_company_name above already reflect the trip's CURRENT
  // active stop in that case, this is just the "Stop X of Y" context.
  is_trip?: boolean;
  current_stop_sequence?: number;
  total_stops?: number;
}

export default function DriverSharePage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<DriverOrder | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  // Set on POSITION_UNAVAILABLE/TIMEOUT — transient (weak signal, indoors),
  // so watchPosition keeps running, but the UI must stop claiming "Sharing"
  // when no fix has actually landed since the issue started.
  const [gpsIssue, setGpsIssue] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number; heading?: number } | null>(null);
  const [, setTick] = useState(0); // forces re-render so "updated Xs ago" stays live

  // GPS auto-detect "Reached" (Phase 2) — gates Sign + Delivered below.
  const [reachedConfirmed, setReachedConfirmed] = useState(false);
  const reachedFiredRef = useRef(false);

  // Delivered → signature pad flow (Phase 3)
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [submittingSignature, setSubmittingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [deliveryClaimed, setDeliveryClaimed] = useState(false);

  // Company → driver messages (Phase 4)
  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [messageBanner, setMessageBanner] = useState<DriverMessage | null>(null);
  const [showMessageFeed, setShowMessageFeed] = useState(false);

  // Fullscreen map toggle — same pattern as TrackingMap/LocationInput/live-map
  // (single OlaMap instance persists across states, only wrapper classes
  // change; bumping fitTrigger on toggle re-fits bounds to the new aspect
  // ratio, and OlaMap's own ResizeObserver on its container handles the
  // actual resize() call, so no manual nudge is needed here).
  const [mapExpanded, setMapExpanded] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(1);
  // Switching the map section to `fixed` pulls its ~45vh out of normal flow,
  // shrinking the document's scrollable height for as long as it's expanded
  // — enough, on a short page, to clamp window.scrollY to 0 before this
  // effect even runs (the class swap and its reflow are already committed
  // by the time an effect fires). So the read has to happen synchronously
  // in the click handler, before setMapExpanded, not in here.
  const scrollYRef = useRef(0);
  useEffect(() => {
    if (mapExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      requestAnimationFrame(() => window.scrollTo(0, scrollYRef.current));
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mapExpanded]);
  function toggleMapExpanded() {
    if (!mapExpanded) scrollYRef.current = window.scrollY;
    setMapExpanded(e => !e);
    setFitTrigger(t => t + 1);
  }

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestPosRef = useRef<{ lat: number; lng: number } | null>(null);

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

  // Fires at most once per session (reachedFiredRef guards re-entry while a
  // request is in flight); on failure the guard resets so the next GPS fix
  // (every ~15s while stationary in range) can retry.
  function maybeAutoConfirmReached(lat: number, lng: number) {
    if (reachedFiredRef.current) return;
    if (!order || order.dispatch_to_lat == null || order.dispatch_to_lng == null) return;
    if (haversineMeters(lat, lng, order.dispatch_to_lat, order.dispatch_to_lng) > REACHED_RADIUS_METERS) return;
    reachedFiredRef.current = true;
    axios.post(`${API}/gogoo/public/tracker/driver/${token}/event`, { kind: 'reached' })
      .then(() => setReachedConfirmed(true))
      .catch(() => { reachedFiredRef.current = false; });
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
    setGpsIssue(false);
    setSharing(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const isFirstFix = latestPosRef.current === null;
        latestPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // coords.heading is device-dependent (often null on stationary/older
        // devices) — passed through as a bonus; OlaMap falls back to its own
        // GPS-history bearing calculation when it's absent.
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, heading: pos.coords.heading ?? undefined });
        setGpsIssue(false);
        if (isFirstFix) sendLocation();
        maybeAutoConfirmReached(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
          stopSharing();
        } else {
          // POSITION_UNAVAILABLE or TIMEOUT — no fix right now, but often
          // transient. Keep watchPosition running instead of stopping, and
          // let the render below reflect that nothing is currently being sent.
          setGpsIssue(true);
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
    setGpsIssue(false);
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
  // Honest sharing state: only claim "Sharing" once a fix has actually landed
  // and nothing is currently blocking it — otherwise nothing is being sent,
  // regardless of how long `sharing` (the watch/interval being armed) has been true.
  const gpsWaiting = sharing && (myPos === null || gpsIssue);
  const sharingHeadline = gpsWaiting ? 'No GPS signal yet, retrying…' : 'Sharing your location';
  const sharingSubtext = lastSentAt
    ? `Last update sent ${Math.max(0, Math.round((Date.now() - lastSentAt.getTime()) / 1000))}s ago`
    : gpsWaiting
      ? 'Will resume automatically once signal improves.'
      : 'Waiting for GPS fix…';
  const navigateHref = order.dispatch_to_lat != null && order.dispatch_to_lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${order.dispatch_to_lat},${order.dispatch_to_lng}`
    : null;
  // No coordinates on the order (pre-autocomplete orders) means GPS
  // proximity can never be computed — fall back to always showing Delivered
  // rather than stranding the driver with no way to reach the signature pad.
  const canShowDelivered = reachedConfirmed || order.dispatch_to_lat == null || order.dispatch_to_lng == null;

  const mapMarkers: OlaMarker[] = [];
  if (order.dispatch_from_lat != null && order.dispatch_from_lng != null) {
    mapMarkers.push({ lng: order.dispatch_from_lng, lat: order.dispatch_from_lat, color: '#22C55E', icon: 'pin' });
  }
  if (order.dispatch_to_lat != null && order.dispatch_to_lng != null) {
    mapMarkers.push({ lng: order.dispatch_to_lng, lat: order.dispatch_to_lat, color: '#EF4444', icon: 'pin' });
  }
  if (myPos) {
    mapMarkers.push({
      lng: myPos.lng, lat: myPos.lat, color: '#FF6B2B', id: 'driver', icon: 'truck', heading: myPos.heading,
      logoUrl: order.company_logo_url ?? undefined,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-0 py-0 sm:px-3 sm:py-3 lg:px-4 lg:py-4">
        <div className="flex flex-1 flex-col overflow-hidden rounded-none border-0 bg-white shadow-sm sm:rounded-[28px] sm:border sm:border-gray-200">
          <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              {order.company_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={order.company_logo_url} alt={order.company_name || 'Company logo'} className="h-10 w-auto max-w-[120px] object-contain" />
              ) : (
                <Image src="/logo.png" alt="bogie" width={1058} height={330} priority className="h-10 w-auto" />
              )}
            </div>
            <div className="text-right">
              {order.company_name ? (
                <p className="text-sm font-extrabold text-gray-900 leading-tight">{order.company_name}</p>
              ) : (
                <p className="text-sm font-extrabold text-gray-900 leading-tight">Location Sharing</p>
              )}
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-500">
                {order.booked_for_company_name ? `For ${order.booked_for_company_name}` : 'Location Sharing'}
              </p>
              {order.is_trip && order.total_stops && order.total_stops > 1 && (
                <p className="text-[11px] text-gray-400 mt-0.5">Stop {order.current_stop_sequence} of {order.total_stops}</p>
              )}
            </div>
          </header>

          {mapMarkers.length > 0 ? (
            <>
              <div className={mapExpanded ? 'fixed inset-0 z-50 bg-white sheet-expand' : 'relative h-[45vh] flex-shrink-0'}>
                <OlaMap
                  center={[mapMarkers[0].lng, mapMarkers[0].lat]}
                  zoom={11}
                  markers={mapMarkers}
                  plannedRoute={plannedRoute}
                  fitToMarkers
                  fitTrigger={fitTrigger}
                  className="h-full w-full"
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 sm:p-4">
                  <div className="rounded-full bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-500">Live route</p>
                  </div>
                  {navigateHref && (
                    <a
                      href={navigateHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Navigate with Google Maps"
                      className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/90 shadow-sm backdrop-blur"
                    >
                      <Navigation size={18} className="text-blue-600" />
                    </a>
                  )}
                </div>

                {/* Third floating control, stacked below OlaMap's own
                    recenter (top-2) + dark-mode (top-12) buttons — toggles
                    fullscreen; icon/label/action flip with mapExpanded so
                    it also serves as the "X to collapse" control while
                    expanded, without a separate header bar. */}
                <button
                  type="button"
                  onClick={toggleMapExpanded}
                  aria-label={mapExpanded ? 'Collapse map' : 'Expand map'}
                  className="absolute right-2 top-[88px] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-sm backdrop-blur"
                >
                  {mapExpanded ? <X size={16} className="text-gray-700" /> : <Maximize2 size={16} className="text-gray-700" />}
                </button>
              </div>

              <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-4">
                  <div className="mx-auto max-w-xl rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400">Route</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Vehicle <span className="font-semibold text-gray-700">{order.vehicle_number}</span>
                          {routeSummary && <span> · {routeSummary}</span>}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLES[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>

                    <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/80 p-3">
                      <RouteRows
                        from={order.dispatch_from}
                        to={order.dispatch_to}
                        fromName={order.company_name}
                        toName={order.booked_for_company_name}
                      />
                    </div>

                    <div className="mt-4 space-y-3">
                      {messageBanner && (
                        <div className="flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                          <MessageCircle size={16} className="mt-0.5 flex-shrink-0 text-blue-500" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">Message from {order.company_name || 'Company'}</p>
                            <p className="mt-1 text-sm text-blue-900">{messageBanner.body}</p>
                          </div>
                          <button onClick={() => setMessageBanner(null)} aria-label="Dismiss" className="flex-shrink-0 text-blue-400 hover:text-blue-600">
                            <X size={16} />
                          </button>
                        </div>
                      )}

                      {order.is_terminal ? (
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-center">
                          <p className="text-sm font-semibold text-gray-600">This trip has ended.</p>
                          <p className="mt-1 text-xs text-gray-400">Location sharing is closed for this order.</p>
                        </div>
                      ) : (
                        <>
                          {permissionDenied && (
                            <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3">
                              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
                              <p className="text-xs text-red-600">
                                Location permission was denied. Please enable location access for this site in your browser settings, then tap Start again.
                              </p>
                            </div>
                          )}
                          {unsupported && (
                            <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-3">
                              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
                              <p className="text-xs text-red-600">Location sharing isn&apos;t supported on this device/browser.</p>
                            </div>
                          )}
                          {sendError && sharing && (
                            <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
                              <p className="text-xs text-amber-700">Couldn&apos;t send your last update — will retry automatically.</p>
                            </div>
                          )}

                          {sharing ? (
                            <div className="rounded-2xl border border-green-100 bg-green-50 p-3">
                              <div className={`flex items-center gap-2 font-semibold text-sm ${gpsWaiting ? 'text-amber-600' : 'text-green-600'}`}>
                                <span className={`h-2.5 w-2.5 rounded-full animate-pulse ${gpsWaiting ? 'bg-amber-500' : 'bg-green-500'}`} />
                                {sharingHeadline}
                              </div>
                              <p className="mt-1 text-xs text-gray-500">{sharingSubtext}</p>
                              <button
                                onClick={stopSharing}
                                className="mt-3 w-full rounded-2xl border-2 border-red-200 bg-white px-3 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
                              >
                                Stop Sharing
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={startSharing}
                              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                            >
                              <Navigation size={18} />
                              Start Sharing Location
                            </button>
                          )}

                          <div className="flex items-start gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-gray-400">
                            <MapPin size={14} className="mt-0.5 flex-shrink-0" />
                            <p className="text-xs">
                              Keep this page open and your screen on while sharing — closing the app or locking your screen will stop location updates.
                            </p>
                          </div>

                          {!order.is_terminal && (
                            <div className="rounded-2xl border border-orange-100 bg-orange-50/80 p-3">
                              <div>
                                <h2 className="text-sm font-bold text-gray-900">Quick Status</h2>
                                <p className="mt-1 text-xs text-gray-500">Let the company know where things stand.</p>
                              </div>
                              {deliveryClaimed ? (
                                <div className="mt-3 flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 p-3">
                                  <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                                  <p className="text-xs font-semibold text-green-700">Delivery claimed — waiting for the company to confirm.</p>
                                </div>
                              ) : canShowDelivered ? (
                                <button
                                  onClick={() => { setSignatureError(null); setShowSignaturePad(true); }}
                                  className="mt-3 w-full rounded-xl bg-orange-500 px-3 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                                >
                                  {DRIVER_EVENT_KIND_LABELS.delivery_claimed}
                                </button>
                              ) : (
                                <p className="mt-3 text-center text-xs text-gray-400">You&apos;ll be able to confirm delivery once you&apos;re near the destination.</p>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {messages.length > 0 && (
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                          <button
                            onClick={() => setShowMessageFeed(s => !s)}
                            className="flex w-full items-center justify-between text-sm font-bold text-gray-900"
                          >
                            <span className="flex items-center gap-1.5"><MessageCircle size={14} />Messages ({messages.length})</span>
                            <span className="text-xs text-gray-400">{showMessageFeed ? 'Hide' : 'Show'}</span>
                          </button>
                          {showMessageFeed && (
                            <div className="mt-3 space-y-2.5">
                              {messages.slice().reverse().map(m => (
                                <div key={m.id} className="rounded-xl bg-white p-3">
                                  <p className="text-sm text-gray-800">{m.body}</p>
                                  <p className="mt-1 text-[11px] text-gray-400">{new Date(m.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-gray-50 p-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm">
                <p className="text-xs text-gray-400">Route details not available for this order.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
