'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Package, Truck, CheckCircle2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { STATUS_LABELS, STATUS_STYLES, type TrackerOrder, type TrackerDriver } from '@/lib/types';

interface CompanyProfile {
  company_name: string;
  contact_phone: string;
  contact_email: string;
  gstin: string;
  status: string;
  logo_url: string | null;
}

export default function OverviewPage() {
  const [companyName, setCompanyName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('tracker_company_name') ?? '';
  });
  const [orders,  setOrders]  = useState<TrackerOrder[] | null>(null);
  const [drivers, setDrivers] = useState<TrackerDriver[] | null>(null);

  useEffect(() => {
    api.get<CompanyProfile>('/gogoo/tracker/company/profile')
      .then(({ data }) => {
        setCompanyName(data.company_name);
        localStorage.setItem('tracker_company_name', data.company_name);
        if (data.logo_url) {
          localStorage.setItem('tracker_company_logo_url', data.logo_url);
        } else {
          localStorage.removeItem('tracker_company_logo_url');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get<TrackerOrder[]>('/gogoo/tracker/orders')
      .then(({ data }) => setOrders(data))
      .catch(() => { toast.error('Failed to load shipments'); setOrders([]); });
    api.get<TrackerDriver[]>('/gogoo/tracker/drivers')
      .then(({ data }) => setDrivers(data))
      .catch(() => setDrivers([]));
  }, []);

  const loading = orders === null || drivers === null;
  const totalOrders   = orders?.length ?? 0;
  const inTransit     = orders?.filter(o => o.status === 'in_transit').length ?? 0;
  const delivered     = orders?.filter(o => o.status === 'delivered').length ?? 0;
  const activeDrivers = drivers?.length ?? 0;
  const recentOrders  = [...(orders ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const STATS = [
    { label: 'Total Shipments', value: totalOrders,   icon: Package,      href: '/tracker/orders' },
    { label: 'In Transit',     value: inTransit,      icon: Truck,        href: '/tracker/orders?status=in_transit' },
    { label: 'Delivered',      value: delivered,       icon: CheckCircle2, href: '/tracker/orders?status=delivered' },
    { label: 'Active Drivers', value: activeDrivers,   icon: Users,        href: '/tracker/drivers' },
  ];

  return (
    <div className="space-y-8">
      {/* Header block */}
      <div className="text-center pt-4">
        <h1 className="text-2xl font-bold text-gray-900">{companyName || ' '}</h1>
        <p className="text-sm text-gray-400 mt-1">Bogie Tracker Panel</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : totalOrders === 0 ? (
        <div className="p-16 text-center">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-gray-500 mb-4">No shipments yet</p>
          <Link href="/tracker/orders/new" className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
            <Plus size={14} />Create your first shipment
          </Link>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            {STATS.map(s => (
              <Link key={s.label} href={s.href} className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{s.label}</span>
                  <s.icon size={16} className="text-orange-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              </Link>
            ))}
          </div>

          {/* Recent shipments */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Recent Shipments</h2>
              <Link href="/tracker/orders" className="text-xs font-semibold text-orange-600 hover:text-orange-800">View all</Link>
            </div>
            <div>
              {recentOrders.map(o => (
                <Link key={o.id} href={`/tracker/orders/${o.id}`}
                  className="flex items-center justify-between px-5 py-3.5 border-t border-gray-50 first:border-t-0 hover:bg-gray-50/50 transition-colors">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{o.booked_for_company_name}</p>
                    <p className="text-xs text-gray-400">{o.dispatch_from} → {o.dispatch_to}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${STATUS_STYLES[o.status]}`}>
                    {STATUS_LABELS[o.status]}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
