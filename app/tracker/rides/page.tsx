'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, CarFront } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

interface RideSummary {
  id: string;
  status: string;
  pickup_address: string;
  drop_address: string;
  estimated_fare: number;
  final_fare: number;
  distance_km: number;
  created_at: string;
  driver_name: string;
  service_name: string;
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

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function RidesListPage() {
  const [rides, setRides] = useState<RideSummary[] | null>(null);

  useEffect(() => {
    api.get<RideSummary[]>('/gogoo/tracker/companies/rides')
      .then(({ data }) => setRides(data || []))
      .catch(() => { toast.error('Failed to load rides'); setRides([]); });
  }, []);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Rides</h1>
          <p className="text-xs text-gray-400">Rides booked directly through the tracker panel</p>
        </div>
        <Link href="/tracker/rides/new"
          className="flex items-center gap-1.5 text-sm font-semibold text-white bg-orange-500 rounded-xl px-4 py-2.5 hover:bg-orange-600 transition-colors">
          <Plus size={15} />
          Book a Ride
        </Link>
      </div>

      {rides === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rides.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center space-y-2">
          <CarFront size={28} className="mx-auto text-gray-300" />
          <p className="text-sm font-semibold text-gray-500">No rides booked yet</p>
          <p className="text-xs text-gray-400">Book a cab, truck or ambulance to see it here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rides.map(r => (
            <Link key={r.id} href={`/tracker/rides/${r.id}`}
              className="block bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{r.service_name}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{r.pickup_address} → {r.drop_address}</p>
                </div>
                <span className={`flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 ${STATUS_STYLE[r.status] || 'bg-gray-100 text-gray-600'}`}>
                  {statusLabel(r.status)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                <span>{r.driver_name || 'No driver assigned yet'}</span>
                <span className="font-semibold text-gray-700">₹{r.final_fare || r.estimated_fare}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
