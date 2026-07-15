'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import Pagination from '@/components/Pagination';
import { ScrollBody } from '@/components/TableControls';
import { api } from '@/lib/api';
import { STATUS_LABELS, STATUS_STYLES, type TrackerOrder, type OrderStatus } from '@/lib/types';

const PER_PAGE = 12;
const STATUS_FILTERS: (OrderStatus | '')[] = ['', 'created', 'dispatched', 'in_transit', 'delivered', 'cancelled'];

export default function OrdersPage() {
  const [orders,       setOrders]       = useState<TrackerOrder[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [page,         setPage]         = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<TrackerOrder[]>('/gogoo/tracker/orders', {
        params: statusFilter ? { status: statusFilter } : undefined,
      });
      setOrders(data);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o =>
    o.booked_for_company_name.toLowerCase().includes(search.toLowerCase()) ||
    o.dispatch_from.toLowerCase().includes(search.toLowerCase()) ||
    o.dispatch_to.toLowerCase().includes(search.toLowerCase()) ||
    o.driver_name.toLowerCase().includes(search.toLowerCase()) ||
    o.vehicle_number.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function copyTrackingLink(o: TrackerOrder) {
    const url = `${window.location.origin}/track/${o.public_tracking_token}`;
    navigator.clipboard.writeText(url);
    toast.success('Tracking link copied');
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <p className="text-xs text-gray-400">{orders.length} dispatch orders</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as OrderStatus | ''); setPage(1); }}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-orange-400">
            {STATUS_FILTERS.map(s => (
              <option key={s || 'all'} value={s}>{s ? STATUS_LABELS[s] : 'All statuses'}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search company, route, driver, vehicle…"
              className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 w-72" />
          </div>
          <Link href="/tracker/orders/new" className="flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
            <Plus size={14} />New Order
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-3xl mb-2">📦</p>
            <p className="text-gray-500 mb-4">{orders.length === 0 ? 'No orders yet' : 'No orders found'}</p>
            {orders.length === 0 && (
              <Link href="/tracker/orders/new" className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
                <Plus size={14} />Create your first order
              </Link>
            )}
          </div>
        ) : (
          <ScrollBody>
          <table className="w-full">
            <thead className="sticky top-0 z-10"><tr className="bg-gray-50">
              {['#','Booked For','Route','Driver / Vehicle','Status','Created','Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map((o, i) => (
                <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-xs text-gray-400 font-medium">{(page - 1) * PER_PAGE + i + 1}</td>
                  <td className="px-5 py-3">
                    <Link href={`/tracker/orders/${o.id}`} className="font-semibold text-gray-900 text-sm hover:text-orange-600">{o.booked_for_company_name}</Link>
                    <p className="text-xs text-gray-400">{o.booked_for_phone}</p>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-600">
                    <p>{o.dispatch_from}</p>
                    <p className="text-gray-400">→ {o.dispatch_to}</p>
                    {(o.material || o.quantity) && (
                      <p className="text-gray-400 mt-0.5">{[o.material, o.quantity].filter(Boolean).join(' · ')}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-600">
                    <p>{o.driver_name || '—'}</p>
                    <p className="text-gray-400">{o.vehicle_number}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[o.status]}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/tracker/orders/${o.id}`} className="text-xs font-semibold text-orange-600 hover:text-orange-800">View</Link>
                      <button onClick={() => copyTrackingLink(o)} className="text-xs font-semibold text-gray-500 hover:text-gray-800">Copy Link</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </ScrollBody>
        )}
        <div className="px-5 py-3 border-t border-gray-100">
          <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}
