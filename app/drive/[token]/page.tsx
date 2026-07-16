'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import Image from 'next/image';
import { Navigation, MapPin, AlertTriangle } from 'lucide-react';
import { STATUS_LABELS, STATUS_STYLES, type OrderStatus } from '@/lib/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';
const POST_INTERVAL_MS = 15000;

interface DriverOrder {
  status: OrderStatus;
  dispatch_from: string;
  dispatch_to: string;
  vehicle_number: string;
  is_terminal: boolean;
}

export default function DriverSharePage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<DriverOrder | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [, setTick] = useState(0); // forces re-render so "updated Xs ago" stays live

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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center">
          <Image src="/logo.png" alt="bogie" width={1536} height={1024} priority className="w-28 h-auto mx-auto mb-2" />
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider">Driver Location Sharing</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Route</p>
            <span className={`text-xs px-3 py-1 rounded-full font-semibold whitespace-nowrap ${STATUS_STYLES[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>
          <p className="text-base font-bold text-gray-900">{order.dispatch_from} → {order.dispatch_to}</p>
          <p className="text-xs text-gray-400 mt-1">Vehicle: {order.vehicle_number}</p>
        </div>

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
                <p className="text-center text-xs text-gray-400">
                  {lastSentAt
                    ? `Last update sent ${Math.max(0, Math.round((Date.now() - lastSentAt.getTime()) / 1000))}s ago`
                    : 'Waiting for GPS fix…'}
                </p>
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
