'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Download } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  PLAN_LABELS, DURATION_LABELS, PLAN_ORDER_STATUS_LABELS, PLAN_ORDER_STATUS_STYLES,
  type TrackerPlanOrder,
} from '@/lib/types';

function fmtINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PlanOrdersPage() {
  const [orders, setOrders] = useState<TrackerPlanOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<TrackerPlanOrder[]>('/gogoo/tracker/plan-orders');
      setOrders(data);
    } catch {
      toast.error('Failed to load plan orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function downloadInvoice(o: TrackerPlanOrder) {
    setDownloadingId(o.id);
    try {
      const res = await api.get(`/gogoo/tracker/plan-orders/${o.id}/invoice`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${o.invoice_number || o.id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download invoice');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Plan Orders</h1>
          <p className="text-xs text-gray-400">{orders.length} billing orders</p>
        </div>
        <Link href="/tracker/plan-orders/new" className="flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
          <Plus size={14} />New Plan Order
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-3xl mb-2">💳</p>
            <p className="text-gray-500 mb-4">No plan orders yet</p>
            <Link href="/tracker/plan-orders/new" className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
              <Plus size={14} />Buy a plan
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead><tr className="bg-gray-50">
              {['Plan', 'Duration', 'Amount', 'Status', 'Invoice', 'Created', ''].map(h => (
                <th key={h} className="text-left px-5 py-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900">{PLAN_LABELS[o.plan]}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{DURATION_LABELS[o.billing_duration]}</td>
                  <td className="px-5 py-3 text-sm text-gray-900">{fmtINR(o.total_amount)}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PLAN_ORDER_STATUS_STYLES[o.status]}`}>
                      {PLAN_ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{o.invoice_number || '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-5 py-3">
                    {o.status === 'paid' ? (
                      <button onClick={() => downloadInvoice(o)} disabled={downloadingId === o.id}
                        className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-800 disabled:opacity-50">
                        <Download size={13} />{downloadingId === o.id ? 'Downloading…' : 'Invoice'}
                      </button>
                    ) : o.status === 'pending_payment' ? (
                      <span className="text-xs text-gray-400">Awaiting payment confirmation</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
