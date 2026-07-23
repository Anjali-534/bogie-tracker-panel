'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import axios from 'axios';
import { CheckCircle2, XCircle } from 'lucide-react';
import RouteRows from '@/components/RouteRows';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';

type DeliveryCondition = 'good' | 'bad';

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
  driver_claimed: boolean;
  delivery_condition: DeliveryCondition | null;
  delivery_condition_reason: string | null;
}

export default function ReceiptPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<ReceiptOrder | null | undefined>(undefined);
  const [confirming, setConfirming] = useState<DeliveryCondition | null>(null);
  const [showBadForm, setShowBadForm] = useState(false);
  const [badReason, setBadReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    axios.get<ReceiptOrder>(`${API}/gogoo/public/tracker/receipt/${token}`)
      .then(({ data }) => { if (!cancelled) setOrder(data); })
      .catch(() => { if (!cancelled) setOrder(null); });
    return () => { cancelled = true; };
  }, [token]);

  async function confirmReceipt(condition: DeliveryCondition, reason?: string) {
    setError('');
    setConfirming(condition);
    try {
      const { data } = await axios.post<{ received_confirmed_at: string }>(
        `${API}/gogoo/public/tracker/receipt/${token}/confirm`,
        { condition, reason: reason || undefined }
      );
      setOrder(prev => prev ? {
        ...prev,
        received_confirmed_at: data.received_confirmed_at,
        delivery_condition: condition,
        delivery_condition_reason: reason || null,
      } : prev);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        setError(body.error || 'Something went wrong — please try again.');
      } else {
        setError('Something went wrong — please try again.');
      }
    } finally {
      setConfirming(null);
    }
  }

  function submitBadCondition() {
    if (!badReason.trim()) return;
    confirmReceipt('bad', badReason.trim());
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
            order.delivery_condition === 'bad' ? (
              <div className="text-center py-4">
                <XCircle size={40} className="text-red-500 mx-auto mb-3" />
                <p className="text-red-600 font-bold">Reported — not in good condition</p>
                {order.delivery_condition_reason && (
                  <p className="text-xs text-gray-500 mt-2 text-left bg-gray-50 rounded-xl p-3">{order.delivery_condition_reason}</p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Reported on {new Date(order.received_confirmed_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
                <p className="text-green-600 font-bold">Goods received — confirmed</p>
                <p className="text-xs text-gray-400 mt-1">
                  Confirmed on {new Date(order.received_confirmed_at).toLocaleString()}
                </p>
              </div>
            )
          ) : order.driver_claimed ? (
            <div className="space-y-3">
              {error && <p className="text-xs text-red-500 text-center">{error}</p>}

              <button
                onClick={() => confirmReceipt('good')}
                disabled={confirming !== null}
                className="w-full py-4 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {confirming === 'good' ? 'Confirming…' : 'Goods received in perfect condition'}
              </button>

              {!showBadForm ? (
                <button
                  onClick={() => setShowBadForm(true)}
                  disabled={confirming !== null}
                  className="w-full py-4 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Products delivered — not in good condition
                </button>
              ) : (
                <div className="border border-red-200 rounded-xl p-4 space-y-3">
                  <label className="block text-xs font-semibold text-gray-600">
                    What&apos;s wrong with the shipment?
                  </label>
                  <textarea
                    value={badReason}
                    onChange={e => setBadReason(e.target.value)}
                    placeholder="e.g. Two boxes were crushed, material spilled out"
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submitBadCondition}
                      disabled={confirming !== null || !badReason.trim()}
                      className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {confirming === 'bad' ? 'Submitting…' : 'Submit Report'}
                    </button>
                    <button
                      onClick={() => { setShowBadForm(false); setBadReason(''); }}
                      disabled={confirming !== null}
                      className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-bold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <button disabled className="w-full py-4 bg-gray-100 text-gray-400 rounded-xl text-sm font-bold cursor-not-allowed mb-2">
                Goods received in perfect condition
              </button>
              <p className="text-sm text-gray-400">You can confirm receipt once the driver has marked delivery.</p>
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
