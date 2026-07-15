'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import StatusStepper from '@/components/StatusStepper';
import { mockOrders, STATUS_LABELS, STATUS_STYLES, type TrackerOrder } from '@/lib/mockData';

// TODO(backend): replace with
// `fetch(`${API}/public/tracker/orders/${token}`)` (no auth header — this
// route is public, guarded only by the unguessable token) once it exists.
// Poll on an interval like the website's /book/track/[id] page does
// (TrackingView.tsx, POLL_MS = 4000) so status updates show up without a
// manual refresh.
//
// Fields intentionally NOT shown here, per the tenant-isolation decision for
// this feature: booked_for_phone (the tracker company's internal contact).
// Only shipment-relevant contacts (driver, transporter) are shown.

export default function PublicTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<TrackerOrder | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await new Promise(r => setTimeout(r, 300));
      if (cancelled) return;
      setOrder(mockOrders.find(o => o.public_tracking_token === token) ?? null);
    }
    load();
    return () => { cancelled = true; };
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
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 mb-3">
            <span className="text-xl">🚚</span>
          </div>
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">bogie Tracker</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Shipment Status</p>
              <p className="text-lg font-bold text-gray-900">{order.dispatch_from} → {order.dispatch_to}</p>
            </div>
            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold whitespace-nowrap ${STATUS_STYLES[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 pb-5 mb-5 border-b border-gray-100">
            <Field label="Driver" value={order.driver_name || '—'} />
            <Field label="Vehicle Number" value={order.vehicle_number} />
            <Field label="Transporter" value={order.transporter_name || '—'} />
            {order.transporter_phone && <Field label="Transporter Phone" value={order.transporter_phone} />}
          </div>

          <StatusStepper status={order.status} events={order.events} />
        </div>

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
