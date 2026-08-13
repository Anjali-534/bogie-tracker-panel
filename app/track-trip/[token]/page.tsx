'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import axios from 'axios';
import { CheckCircle2, XCircle, Circle, ArrowRight } from 'lucide-react';
import TrackingMap from '@/components/TrackingMap';
import RouteRows from '@/components/RouteRows';
import { STATUS_LABELS, STATUS_STYLES, type OrderStatus, type TrackerLocationPing } from '@/lib/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';
const POLL_MS = 4000;

type TripStatus = 'created' | 'in_transit' | 'completed' | 'cancelled';

const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  created: 'Created',
  in_transit: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TRIP_STATUS_STYLES: Record<TripStatus, string> = {
  created: 'bg-gray-100 text-gray-600',
  in_transit: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

interface TripStop {
  order_id: string;
  stop_sequence: number;
  status: OrderStatus;
  consignee_name: string | null;
  dispatch_to: string;
  public_tracking_token: string;
}

interface PublicTrip {
  dispatch_from: string;
  vehicle_number: string;
  driver_name: string | null;
  driver_phone: string | null;
  overall_status: TripStatus;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  created_at: string;
  completed_at: string | null;
  company_name: string;
  company_logo_url: string | null;
  stops: TripStop[];
  location_pings: TrackerLocationPing[];
}

// Same rule as tryAutoCompleteDelivery/advanceTrackerTripAfterDelivery on the
// backend — the current active stop is the lowest stop_sequence not yet
// delivered/cancelled. If every stop is terminal, there is no active stop
// (trip should already read 'completed' by then).
function activeStopSequence(stops: TripStop[]): number | null {
  const active = stops.find(s => s.status !== 'delivered' && s.status !== 'cancelled');
  return active ? active.stop_sequence : null;
}

export default function PublicTripPage() {
  const { token } = useParams<{ token: string }>();
  const [trip, setTrip] = useState<PublicTrip | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await axios.get<PublicTrip>(`${API}/gogoo/public/tracker/trips/${token}`);
        if (!cancelled) setTrip(data);
      } catch {
        if (!cancelled) setTrip(null);
      }
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  if (trip === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (trip === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-3xl mb-2">🔍</p>
          <p className="text-gray-500 font-semibold">Tracking link not found</p>
          <p className="text-xs text-gray-400 mt-1">This link may be invalid or the trip may have been removed.</p>
        </div>
      </div>
    );
  }

  const activeSeq = activeStopSequence(trip.stops);

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-5">

        <div className="text-center">
          <Image src="/logo.png" alt="bogie" width={1058} height={330} priority className="w-36 h-auto mx-auto mb-3" />
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider">bogie Tracker</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          {trip.company_name && (
            <p className="text-sm text-gray-500 mb-1">
              Trip booked by <span className="font-bold text-gray-900">{trip.company_name}</span>
            </p>
          )}
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Trip Status</p>
            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold whitespace-nowrap ${TRIP_STATUS_STYLES[trip.overall_status]}`}>
              {TRIP_STATUS_LABELS[trip.overall_status]}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 mb-5 border-b border-gray-100">
            <Field label="Origin" value={trip.dispatch_from} />
            <Field label="Vehicle Number" value={trip.vehicle_number} bold />
            <Field label="Driver" value={trip.driver_name || '—'} />
            {trip.driver_phone && <Field label="Driver Phone" value={trip.driver_phone} />}
          </div>

          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Stops ({trip.stops.length})
          </p>
          <div className="space-y-2">
            {trip.stops.map(stop => {
              const isActive = stop.stop_sequence === activeSeq;
              const isDone = stop.status === 'delivered';
              const isCancelled = stop.status === 'cancelled';
              return (
                <Link
                  key={stop.order_id}
                  href={`/track/${stop.public_tracking_token}`}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                    isActive ? 'border-orange-300 bg-orange-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                  ) : isCancelled ? (
                    <XCircle size={18} className="text-red-400 flex-shrink-0" />
                  ) : (
                    <Circle size={18} className={`flex-shrink-0 ${isActive ? 'text-orange-500' : 'text-gray-300'}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      Stop {stop.stop_sequence}{stop.consignee_name ? ` · ${stop.consignee_name}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{stop.dispatch_to}</p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap flex-shrink-0 ${STATUS_STYLES[stop.status]}`}>
                    {STATUS_LABELS[stop.status]}
                  </span>
                  <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
                </Link>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400 mt-4 text-center">
            Tap a stop to open its own tracking page — receipt confirmation happens there, not here.
          </p>
        </div>

        {(trip.overall_status === 'in_transit' || trip.overall_status === 'created') && (
          <TrackingMap
            lastLat={trip.last_lat}
            lastLng={trip.last_lng}
            lastLocationAt={trip.last_location_at}
            pings={trip.location_pings}
            companyLogoUrl={trip.company_logo_url}
          />
        )}

        <p className="text-center text-[11px] text-gray-400">
          Tracked with bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-sm text-gray-800 ${bold ? 'font-bold' : ''}`}>{value}</p>
    </div>
  );
}
