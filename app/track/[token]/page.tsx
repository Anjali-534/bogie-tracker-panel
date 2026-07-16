'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';
import StatusStepper from '@/components/StatusStepper';
import TrackingMap from '@/components/TrackingMap';
import RouteRows from '@/components/RouteRows';
import {
  STATUS_LABELS, STATUS_STYLES, STATUS_STEPS,
  type OrderStatus, type TrackerOrderEvent, type TrackerLocationPing,
} from '@/lib/types';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';
const POLL_MS = 4000;

interface PublicOrder {
  status: OrderStatus;
  dispatch_from: string;
  dispatch_to: string;
  vehicle_number: string;
  transporter_name: string | null;
  transporter_phone: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  consignee_name: string | null;
  material: string | null;
  quantity: string | null;
  dispatch_datetime: string | null;
  events: Pick<TrackerOrderEvent, 'status' | 'note' | 'location' | 'created_at'>[];
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  location_pings: TrackerLocationPing[];
  dispatch_from_lat: number | null;
  dispatch_from_lng: number | null;
  dispatch_to_lat: number | null;
  dispatch_to_lng: number | null;
  route_polyline: string | null;
  route_distance_km: number | null;
  route_duration_mins: number | null;
}

export default function PublicTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<PublicOrder | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await axios.get<PublicOrder>(`${API}/gogoo/public/tracker/orders/${token}`);
        if (!cancelled) setOrder(data);
      } catch {
        if (!cancelled) setOrder(null);
      }
    }
    load();
    const interval = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

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
          <p className="text-xs text-gray-400 mt-1">This link may be invalid or the order may have been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-5">

        <div className="text-center">
          <Image src="/logo.png" alt="bogie" width={1536} height={1024} priority className="w-36 h-auto mx-auto mb-3" />
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider">bogie Tracker</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Shipment Status</p>
            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold whitespace-nowrap ${STATUS_STYLES[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>
          <div className="mb-5">
            <RouteRows from={order.dispatch_from} to={order.dispatch_to} />
          </div>

          <div className="grid grid-cols-2 gap-4 pb-5 mb-5 border-b border-gray-100">
            <Field label="Driver" value={order.driver_name || '—'} />
            <Field label="Vehicle Number" value={order.vehicle_number} />
            <Field label="Transporter" value={order.transporter_name || '—'} />
            {order.transporter_phone && <Field label="Transporter Phone" value={order.transporter_phone} />}
            {order.consignee_name && <Field label="Consignee" value={order.consignee_name} />}
            {order.material && <Field label="Material" value={order.material} />}
            {order.quantity && <Field label="Quantity" value={order.quantity} />}
            {order.dispatch_datetime && <Field label="Dispatch Date & Time" value={new Date(order.dispatch_datetime).toLocaleString()} />}
          </div>

          <StatusStepper status={order.status} events={order.events} />
        </div>

        {STATUS_STEPS.indexOf(order.status) >= STATUS_STEPS.indexOf('dispatched') && (
          <TrackingMap
            lastLat={order.last_lat}
            lastLng={order.last_lng}
            lastLocationAt={order.last_location_at}
            pings={order.location_pings}
            fromLat={order.dispatch_from_lat}
            fromLng={order.dispatch_from_lng}
            toLat={order.dispatch_to_lat}
            toLng={order.dispatch_to_lng}
            routePolyline={order.route_polyline}
            routeDistanceKm={order.route_distance_km}
            routeDurationMins={order.route_duration_mins}
          />
        )}

        <p className="text-center text-[11px] text-gray-400">
          Tracked with bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}
