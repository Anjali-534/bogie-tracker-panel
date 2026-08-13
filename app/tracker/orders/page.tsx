'use client';
import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import Pagination from '@/components/Pagination';
import { ScrollBody } from '@/components/TableControls';
import { api } from '@/lib/api';
import { STATUS_LABELS, STATUS_STYLES, ORDER_TYPE_LABELS, ORDER_TYPE_STYLES, type TrackerOrder, type OrderStatus } from '@/lib/types';

const PER_PAGE = 12;

// Lightest-touch way to surface trip membership on the list without a table
// redesign — a compact pill badge (same "Part of a X-stop trip" signal as
// the order detail page, just shortened to fit next to Order Type/Status).
// trip_stop_count > 1 (not just trip_id) is the actual "genuinely
// multi-drop" signal — every order has a trip_id now (see backend
// CreateTrackerCompanyOrder), including ones that will only ever have one
// stop.
function TripBadge({ o }: { o: TrackerOrder }) {
  if (!o.trip_id || o.trip_stop_count <= 1 || !o.trip_public_tracking_token) return null;
  return (
    <a href={`/track-trip/${o.trip_public_tracking_token}`} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={`Part of a ${o.trip_stop_count}-stop trip · Stop ${o.stop_sequence} · View trip`}
      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-colors">
      <Truck size={10} />Stop {o.stop_sequence}/{o.trip_stop_count}
    </a>
  );
}

// Compact order-type pill — same colors as the order detail page's
// ORDER_TYPE_STYLES badge, just smaller to sit next to Status/TripBadge.
function OrderTypeBadge({ o }: { o: TrackerOrder }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${ORDER_TYPE_STYLES[o.order_type]}`}>
      {ORDER_TYPE_LABELS[o.order_type]}
    </span>
  );
}
const STATUS_FILTERS: (OrderStatus | '')[] = ['', 'created', 'dispatched', 'in_transit', 'delivered', 'cancelled'];
const VALID_STATUSES = new Set(STATUS_FILTERS.filter(Boolean));

function OrdersPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The URL's ?status= param is the single source of truth for the active
  // filter — deriving it here (rather than mirroring it into its own
  // useState) keeps the dropdown, the actual query, and the sidebar's
  // highlighted item from ever drifting apart, regardless of whether the
  // filter changed via sidebar link, direct URL, or the dropdown itself.
  const statusParam = searchParams.get('status');
  const statusFilter: OrderStatus | '' =
    statusParam && VALID_STATUSES.has(statusParam as OrderStatus) ? (statusParam as OrderStatus) : '';
  const [orders,  setOrders]  = useState<TrackerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);

  function handleStatusChange(next: OrderStatus | '') {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('status', next); else params.delete('status');
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<TrackerOrder[]>('/gogoo/tracker/orders', {
        params: statusFilter ? { status: statusFilter } : undefined,
      });
      setOrders(data);
    } catch {
      toast.error('Failed to load shipments');
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Shipments</h1>
          <p className="text-xs text-gray-400">{orders.length} shipments</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <select value={statusFilter} onChange={e => { handleStatusChange(e.target.value as OrderStatus | ''); setPage(1); }}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-orange-400">
            {STATUS_FILTERS.map(s => (
              <option key={s || 'all'} value={s}>{s ? STATUS_LABELS[s] : 'All statuses'}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search company, route, driver, vehicle…"
              className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 w-full sm:w-72" />
          </div>
          <Link href="/tracker/orders/new" className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
            <Plus size={14} />New Shipment
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
            <p className="text-gray-500 mb-4">{orders.length === 0 ? 'No shipments yet' : 'No shipments found'}</p>
            {orders.length === 0 && (
              <Link href="/tracker/orders/new" className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
                <Plus size={14} />Create your first shipment
              </Link>
            )}
          </div>
        ) : (
          <>
          {/* Table — md: and above */}
          <div className="hidden md:block">
            <ScrollBody>
            <table className="w-full">
              <thead className="sticky top-0 z-10"><tr className="bg-orange-500">
                {['#','Booked For','Route','Driver / Vehicle','Status','Created','Actions'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-[11px] font-bold text-white uppercase tracking-wider">{h}</th>
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
                      <div className="flex flex-wrap items-center gap-1">
                        <OrderTypeBadge o={o} />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[o.status]}`}>
                          {STATUS_LABELS[o.status]}
                        </span>
                        <TripBadge o={o} />
                      </div>
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
          </div>

          {/* Card list — below md: */}
          <div className="md:hidden divide-y divide-gray-50">
            {paged.map((o, i) => (
              <div key={o.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-400 font-medium">#{(page - 1) * PER_PAGE + i + 1}</p>
                    <Link href={`/tracker/orders/${o.id}`} className="font-semibold text-gray-900 text-sm hover:text-orange-600 block truncate">{o.booked_for_company_name}</Link>
                    <p className="text-xs text-gray-400">{o.booked_for_phone}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1 flex-shrink-0">
                    <OrderTypeBadge o={o} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${STATUS_STYLES[o.status]}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                    <TripBadge o={o} />
                  </div>
                </div>
                <div className="text-xs text-gray-600">
                  <p>{o.dispatch_from}</p>
                  <p className="text-gray-400">→ {o.dispatch_to}</p>
                  {(o.material || o.quantity) && (
                    <p className="text-gray-400 mt-0.5">{[o.material, o.quantity].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="text-gray-600">
                    <p>{o.driver_name || '—'} <span className="text-gray-400">· {o.vehicle_number}</span></p>
                    <p className="text-gray-400 mt-0.5">{new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link href={`/tracker/orders/${o.id}`} className="font-semibold text-orange-600 hover:text-orange-800">View</Link>
                    <button onClick={() => copyTrackingLink(o)} className="font-semibold text-gray-500 hover:text-gray-800">Copy Link</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
        <div className="px-5 py-3 border-t border-gray-100">
          <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400 text-sm">Loading…</div>}>
      <OrdersPageInner />
    </Suspense>
  );
}
