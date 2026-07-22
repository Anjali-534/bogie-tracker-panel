'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Phone, Car, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import OlaMap, { fetchOlaRoute, type OlaMarker } from '@/components/OlaMap';

const POLL_MS = 4000;

interface Driver {
  id: string;
  name?: string;
  phone?: string;
  vehicle_number?: string;
  vehicle_model?: string;
  rating?: number;
  lat?: number;
  lng?: number;
}

interface RideDetail {
  id: string;
  status: string;
  pickup: { lat: number; lng: number; address: string };
  drop: { lat: number; lng: number; address: string };
  estimated_fare: number;
  final_fare: number | null;
  distance_km: number;
  service_name: string;
  ride_otp?: string;
  driver?: Driver;
  cancel_reason?: string;
  cancelled_by?: string;
}

const STATUS_STYLE: Record<string, string> = {
  searching: 'bg-yellow-50 text-yellow-700',
  scheduled: 'bg-blue-50 text-blue-700',
  accepted: 'bg-blue-50 text-blue-700',
  arriving: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-orange-50 text-orange-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-700',
};

const STATUS_MESSAGE: Record<string, string> = {
  searching: 'Looking for a nearby driver…',
  scheduled: 'This ride is scheduled — a driver will be assigned closer to pickup time.',
  accepted: 'A driver has been assigned and is on the way.',
  arriving: 'Your driver has arrived at the pickup location.',
  in_progress: 'Ride in progress.',
  completed: 'Ride completed.',
  cancelled: 'This ride was cancelled.',
};

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function RideTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const [ride, setRide] = useState<RideDetail | null | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const { data } = await api.get<RideDetail>(`/gogoo/tracker/companies/rides/${id}`);
        if (!cancelled) setRide(data);
        if (data.status === 'completed' || data.status === 'cancelled') {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        if (!cancelled) {
          setRide(null);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    }

    poll();
    pollRef.current = setInterval(poll, POLL_MS);
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/tracker/rides" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ride Status</h1>
          <p className="text-xs text-gray-400">Live status of this ride</p>
        </div>
      </div>

      {ride === undefined ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : ride === null ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-sm font-semibold text-gray-500">Ride not found</p>
        </div>
      ) : (
        <>
          <RideMap ride={ride} />
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{ride.service_name}</p>
              <p className="text-sm text-gray-800 mt-1">{ride.pickup.address}</p>
              <p className="text-xs text-gray-400 my-0.5">↓</p>
              <p className="text-sm text-gray-800">{ride.drop.address}</p>
            </div>
            <span className={`flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 ${STATUS_STYLE[ride.status] || 'bg-gray-100 text-gray-600'}`}>
              {statusLabel(ride.status)}
            </span>
          </div>

          <div className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-600">{STATUS_MESSAGE[ride.status] || 'Tracking ride status…'}</p>
            {ride.status === 'cancelled' && ride.cancel_reason && (
              <p className="text-xs text-gray-400 mt-1">Reason: {ride.cancel_reason}</p>
            )}
          </div>

          {ride.status === 'arriving' && ride.ride_otp && (
            <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-3">
              <KeyRound size={16} className="text-orange-500 flex-shrink-0" />
              <p className="text-sm text-orange-700">Share this OTP with the driver: <span className="font-bold">{ride.ride_otp}</span></p>
            </div>
          )}

          {ride.driver && (
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Driver</p>
              <div className="flex items-center gap-2 text-sm text-gray-800">
                <User size={14} className="text-gray-400" />
                {ride.driver.name || '—'}
                {ride.driver.rating != null && <span className="text-xs text-gray-400">★ {ride.driver.rating}</span>}
              </div>
              {ride.driver.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <Phone size={14} className="text-gray-400" />
                  {ride.driver.phone}
                </div>
              )}
              {ride.driver.vehicle_number && (
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <Car size={14} className="text-gray-400" />
                  {ride.driver.vehicle_number}{ride.driver.vehicle_model ? ` · ${ride.driver.vehicle_model}` : ''}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-400">{ride.distance_km ? `${ride.distance_km} km` : ''}</p>
            <p className="text-lg font-bold text-gray-900">₹{ride.final_fare ?? ride.estimated_fare}</p>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

// Before pickup (driver en route to rider) the map should show the
// driver→pickup leg dashed in green; once the ride is under way it
// switches to a solid orange pickup→drop leg — matches the convention
// already established in user-app's tracking/[id].tsx (mapAccent/beforePickup).
const PRE_PICKUP_STATUSES = ['searching', 'scheduled', 'accepted', 'arriving'];

function RideMap({ ride }: { ride: RideDetail }) {
  const [plannedRoute, setPlannedRoute] = useState<[number, number][] | undefined>(undefined);
  const lastRouteKeyRef = useRef('');

  const beforePickup = PRE_PICKUP_STATUSES.includes(ride.status);
  const hasDriver = ride.driver?.lat != null && ride.driver?.lng != null;

  useEffect(() => {
    let origin: { lat: number; lng: number } | null = null;
    let dest: { lat: number; lng: number } | null = null;

    if (beforePickup && hasDriver) {
      origin = { lat: ride.driver!.lat!, lng: ride.driver!.lng! };
      dest = { lat: ride.pickup.lat, lng: ride.pickup.lng };
    } else if (ride.status !== 'cancelled') {
      origin = { lat: ride.pickup.lat, lng: ride.pickup.lng };
      dest = { lat: ride.drop.lat, lng: ride.drop.lng };
    }
    if (!origin || !dest) return;

    const key = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}-${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
    if (key === lastRouteKeyRef.current) return;
    lastRouteKeyRef.current = key;

    fetchOlaRoute(origin, dest).then(r => setPlannedRoute(r?.coords));
  }, [beforePickup, hasDriver, ride.driver?.lat, ride.driver?.lng, ride.pickup.lat, ride.pickup.lng, ride.drop.lat, ride.drop.lng, ride.status]);

  const markers: OlaMarker[] = [
    { lng: ride.pickup.lng, lat: ride.pickup.lat, color: '#22C55E', icon: 'pin', popup: 'Pickup' },
    { lng: ride.drop.lng, lat: ride.drop.lat, color: '#EF4444', icon: 'pin', popup: 'Drop' },
  ];
  if (hasDriver) {
    markers.push({ lng: ride.driver!.lng!, lat: ride.driver!.lat!, color: '#FF6B2B', id: 'driver', icon: 'truck', popup: 'Driver' });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3">
      <OlaMap
        center={[ride.pickup.lng, ride.pickup.lat]}
        zoom={12}
        markers={markers}
        plannedRoute={plannedRoute}
        plannedRouteColor={beforePickup ? '#22C55E' : '#FF6B2B'}
        plannedRouteDashed={beforePickup}
        fitToMarkers
        className="w-full h-64 rounded-xl overflow-hidden"
      />
    </div>
  );
}
