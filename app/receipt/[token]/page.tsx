'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';
import { CheckCircle2 } from 'lucide-react';
import RouteRows from '@/components/RouteRows';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';

interface ReceiptOrder {
  status: string;
  company_name: string;
  dispatch_from: string;
  dispatch_to: string;
  vehicle_number: string;
  material: string | null;
  quantity: string | null;
  delivered_at: string | null;
  received_confirmed_at: string | null;
}

export default function ReceiptPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<ReceiptOrder | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get<ReceiptOrder>(`${API}/gogoo/public/tracker/receipt/${token}`)
      .then(({ data }) => { if (!cancelled) setOrder(data); })
      .catch(() => { if (!cancelled) setOrder(null); });
    return () => { cancelled = true; };
  }, [token]);

  async function confirmReceipt() {
    setConfirming(true);
    try {
      const { data } = await axios.post<{ received_confirmed_at: string }>(
        `${API}/gogoo/public/tracker/receipt/${token}/confirm`
      );
      setOrder(prev => prev ? { ...prev, received_confirmed_at: data.received_confirmed_at } : prev);
    } catch {
      // Swallow — the button re-enables and the summary above still shows
      // the current (unconfirmed) state, so the user can just tap again.
    } finally {
      setConfirming(false);
    }
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
          <p className="text-gray-500 font-semibold">Receipt link not found</p>
          <p className="text-xs text-gray-400 mt-1">This link may be invalid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="text-center">
          <Image src="/logo.png" alt="bogie" width={1058} height={330} priority className="w-36 h-auto mx-auto mb-3" />
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider">bogie Tracker</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
          <div>
            {order.company_name && (
              <p className="text-sm text-gray-500 mb-2">
                Shipment booked by <span className="font-bold text-gray-900">{order.company_name}</span>
              </p>
            )}
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Shipment Summary</p>
            <RouteRows from={order.dispatch_from} to={order.dispatch_to} />
          </div>

          <div className="grid grid-cols-2 gap-4 pb-5 border-b border-gray-100">
            <Field label="Vehicle Number" value={order.vehicle_number} bold />
            {order.material && <Field label="Material" value={order.material} />}
            {order.quantity && <Field label="Quantity" value={order.quantity} />}
            {order.delivered_at && <Field label="Delivered" value={new Date(order.delivered_at).toLocaleString()} />}
          </div>

          {order.received_confirmed_at ? (
            <div className="text-center py-4">
              <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
              <p className="text-green-600 font-bold">Goods received — confirmed</p>
              <p className="text-xs text-gray-400 mt-1">
                Confirmed on {new Date(order.received_confirmed_at).toLocaleString()}
              </p>
            </div>
          ) : order.status === 'delivered' ? (
            <button
              onClick={confirmReceipt}
              disabled={confirming}
              className="w-full py-4 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {confirming ? 'Confirming…' : 'Goods received in proper condition'}
            </button>
          ) : (
            <div className="text-center py-4">
              <button disabled className="w-full py-4 bg-gray-100 text-gray-400 rounded-xl text-sm font-bold cursor-not-allowed mb-2">
                Goods received in proper condition
              </button>
              <p className="text-sm text-gray-400">You can confirm receipt once delivery is complete.</p>
            </div>
          )}
        </div>

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
