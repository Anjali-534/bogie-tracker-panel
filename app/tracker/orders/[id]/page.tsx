'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Link2, FileText } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import StatusStepper from '@/components/StatusStepper';
import { api } from '@/lib/api';
import {
  STATUS_LABELS, STATUS_STYLES, STATUS_STEPS, TERMINAL_STATUSES,
  type TrackerOrder, type TrackerOrderEvent, type OrderStatus,
} from '@/lib/types';

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order,     setOrder]     = useState<TrackerOrder | null | undefined>(undefined);
  const [events,    setEvents]    = useState<TrackerOrderEvent[]>([]);
  const [updating,  setUpdating]  = useState(false);
  const [note,      setNote]      = useState('');
  const [location,  setLocation]  = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/gogoo/tracker/orders/${id}`);
      setOrder(data.order);
      setEvents(data.events);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setOrder(null);
      } else {
        toast.error('Failed to load order');
      }
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function copyTrackingLink() {
    if (!order) return;
    const url = `${window.location.origin}/track/${order.public_tracking_token}`;
    navigator.clipboard.writeText(url);
    toast.success('Tracking link copied');
  }

  async function setStatus(next: OrderStatus) {
    if (!order) return;
    setUpdating(true);
    try {
      await api.patch(`/gogoo/tracker/orders/${order.id}`, { status: next });
      toast.success(`Marked as ${STATUS_LABELS[next]}`);
      await load();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Status update failed');
      } else {
        toast.error('Status update failed');
      }
    } finally {
      setUpdating(false);
    }
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!order || (!note && !location)) return;
    setAddingNote(true);
    try {
      await api.post(`/gogoo/tracker/orders/${order.id}/events`, {
        note: note || undefined,
        location: location || undefined,
      });
      setNote(''); setLocation('');
      toast.success('Update added');
      await load();
    } catch {
      toast.error('Failed to add update');
    } finally {
      setAddingNote(false);
    }
  }

  if (order === undefined) {
    return <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>;
  }
  if (order === null) {
    return (
      <div className="p-16 text-center">
        <p className="text-3xl mb-2">🔍</p>
        <p className="text-gray-500 mb-4">Order not found</p>
        <button onClick={() => router.push('/tracker')} className="text-indigo-600 font-semibold text-sm">Back to Orders</button>
      </div>
    );
  }

  const isTerminal = TERMINAL_STATUSES.includes(order.status);
  const nextStatus = STATUS_STEPS[STATUS_STEPS.indexOf(order.status) + 1];

  return (
    <div className="max-w-4xl space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/tracker" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{order.booked_for_company_name}</h1>
            <p className="text-xs text-gray-400">{order.dispatch_from} → {order.dispatch_to}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${STATUS_STYLES[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
          <button onClick={copyTrackingLink} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            <Link2 size={14} />Copy Tracking Link
          </button>
          {!isTerminal && nextStatus && (
            <button onClick={() => setStatus(nextStatus)} disabled={updating} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              Mark as {STATUS_LABELS[nextStatus]}
            </button>
          )}
          {!isTerminal && (
            <button onClick={() => setStatus('cancelled')} disabled={updating} className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 disabled:opacity-50 transition-colors">
              Cancel Order
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-5">Status Timeline</h2>
            <StatusStepper status={order.status} events={events} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Add Update</h2>
            <form onSubmit={addEvent} className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Location</label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Vadodara, Gujarat"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Note</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Crossed toll"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>
              <button type="submit" disabled={addingNote || (!note && !location)} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {addingNote ? 'Adding…' : 'Add'}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Order Details</h2>
            <Field label="Booked For" value={order.booked_for_company_name} />
            <Field label="Contact Phone" value={order.booked_for_phone} />
            <Field label="Driver" value={order.driver_name || '—'} />
            <Field label="Driver Phone" value={order.driver_phone || '—'} />
            <Field label="Vehicle Number" value={order.vehicle_number} />
            <Field label="Transporter" value={order.transporter_name || '—'} />
            <Field label="Transporter Phone" value={order.transporter_phone || '—'} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-900">E-way Bill</h2>
            {order.eway_bill_number ? (
              <>
                <Field label="Number" value={order.eway_bill_number} />
                {order.eway_bill_file_url ? (
                  <a href={order.eway_bill_file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                    <FileText size={14} />View uploaded file
                  </a>
                ) : (
                  <p className="text-xs text-gray-400">No file uploaded</p>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400">Not provided</p>
            )}
          </div>
        </div>
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
