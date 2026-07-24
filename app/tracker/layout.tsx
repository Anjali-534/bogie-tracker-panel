'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import {
  Home, Package, Users, BookUser, CreditCard, Settings, LogOut, CarFront, MapPin,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { clearSession } from '@/lib/api';
import InstallButton from '@/components/InstallButton';

interface NavLeaf { href: string; label: string; }
interface NavFlat { href: string; icon: typeof Home; label: string; }
interface NavSection { label: string; icon: typeof Home; basePaths: string[]; children: NavLeaf[]; }
type NavEntry = NavFlat | NavSection;

function isSection(entry: NavEntry): entry is NavSection {
  return 'children' in entry;
}

// Splits an href like "/tracker/orders?status=x" or "/tracker/settings#staff"
// into its path/query/hash parts so active-state matching can compare each
// piece independently (query-param variants of the same path, e.g. the
// Shipment status filters, need to highlight individually — not all at once).
function parseHref(href: string) {
  const hashIndex = href.indexOf('#');
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : '';
  const base = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const qIndex = base.indexOf('?');
  const path = qIndex >= 0 ? base.slice(0, qIndex) : base;
  const query = qIndex >= 0 ? base.slice(qIndex + 1) : '';
  return { path, query, hash };
}

const NAV: NavEntry[] = [
  { href: '/tracker', icon: Home, label: 'Home' },
  {
    label: 'Shipment', icon: Package, basePaths: ['/tracker/orders'],
    children: [
      { href: '/tracker/orders/new', label: 'New Shipment' },
      { href: '/tracker/orders?status=created', label: 'Created' },
      { href: '/tracker/orders?status=dispatched', label: 'Dispatched' },
      { href: '/tracker/orders?status=in_transit', label: 'In Transit' },
      { href: '/tracker/orders?status=delivered', label: 'Delivered' },
      { href: '/tracker/orders?status=cancelled', label: 'Cancelled' },
    ],
  },
  {
    label: 'Driver', icon: Users, basePaths: ['/tracker/drivers'],
    children: [
      { href: '/tracker/drivers', label: 'Add a Driver' },
      { href: '/tracker/drivers', label: 'Driver Details' },
    ],
  },
  {
    label: 'Consignee', icon: BookUser, basePaths: ['/tracker/recipients'],
    children: [
      { href: '/tracker/recipients', label: 'Add a Consignee' },
      { href: '/tracker/recipients', label: 'Consignee Details' },
    ],
  },
  { href: '/tracker/live-map', icon: MapPin, label: 'Live Map' },
  {
    label: 'Book a Ride', icon: CarFront, basePaths: ['/tracker/rides'],
    children: [
      { href: '/tracker/rides/new?type=cab', label: 'Cab' },
      { href: '/tracker/rides/new?type=truck', label: 'Truck' },
      { href: '/tracker/rides/new?type=ambulance', label: 'Ambulance' },
      { href: '/tracker/rides', label: 'Ride History' },
    ],
  },
  {
    label: 'Settings', icon: Settings, basePaths: ['/tracker/settings'],
    children: [
      { href: '/tracker/settings#password', label: 'Change Password' },
      { href: '/tracker/settings#staff', label: 'Add Staff' },
      { href: '/tracker/settings#logo', label: 'Upload Logo' },
    ],
  },
  { href: '/tracker/plan-orders', icon: CreditCard, label: 'Billing & Subscription' },
];

function SidebarNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sectionActive = (entry: NavSection) => entry.basePaths.some(p => pathname.startsWith(p));

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const entry of NAV) {
      if (isSection(entry) && sectionActive(entry)) initial.add(entry.label);
    }
    return initial;
  });

  useEffect(() => {
    setExpanded(prev => {
      const next = new Set(prev);
      for (const entry of NAV) {
        if (isSection(entry) && sectionActive(entry)) next.add(entry.label);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle(label: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  function isLeafActive(href: string) {
    const { path, query } = parseHref(href);
    if (pathname !== path) return false;
    if (!query) return true;
    const params = new URLSearchParams(query);
    for (const [key, value] of params.entries()) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  }

  function isFlatActive(href: string) {
    if (href === '/tracker') return pathname === '/tracker';
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {NAV.map(entry => {
        if (!isSection(entry)) {
          return (
            <Link
              key={entry.href}
              href={entry.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isFlatActive(entry.href)
                  ? 'bg-orange-50 text-orange-500 border-l-[3px] border-orange-500 pl-[9px] font-semibold'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <entry.icon size={16} className="flex-shrink-0" />
              {entry.label}
            </Link>
          );
        }

        const active = sectionActive(entry);
        const open = expanded.has(entry.label);
        return (
          <div key={entry.label}>
            <button
              type="button"
              onClick={() => toggle(entry.label)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-orange-50 text-orange-500 border-l-[3px] border-orange-500 pl-[9px] font-semibold'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <entry.icon size={16} className="flex-shrink-0" />
              <span className="flex-1 text-left">{entry.label}</span>
              {open ? <ChevronDown size={14} className="flex-shrink-0" /> : <ChevronRight size={14} className="flex-shrink-0" />}
            </button>
            {open && (
              <div className="mt-0.5 ml-[1.375rem] pl-3 border-l border-gray-100 space-y-0.5">
                {entry.children.map(child => (
                  <Link
                    key={child.href + child.label}
                    href={child.href}
                    className={`block px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
                      isLeafActive(child.href)
                        ? 'bg-orange-50 text-orange-500 font-semibold'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function TrackerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Only checks that a token exists — not the stored status. A stored
  // status is just a UI hint from the last login/response and can go stale
  // (e.g. approved after the last visit); the server's live status check on
  // every request (RequireTrackerCompany) is the actual source of truth,
  // and the api.ts response interceptor redirects to /blocked if it's not
  // active anymore.
  useEffect(() => {
    if (!localStorage.getItem('tracker_company_token')) router.push('/');
  }, [router]);

  function logout() {
    clearSession();
    router.push('/');
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      {/* White sidebar */}
      <aside className="w-56 h-screen flex flex-col fixed left-0 top-0 z-30 bg-white border-r border-gray-100">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <Image src="/logo.png" alt="bogie" width={1058} height={330} priority
            className="w-full h-auto" />
          <span className="mt-2 inline-block text-[10px] font-bold text-orange-500 bg-orange-50 rounded-full px-2 py-0.5 uppercase tracking-wider">
            Tracker Panel
          </span>
        </div>

        {/* Nav */}
        <Suspense fallback={<div className="flex-1 p-3" />}>
          <SidebarNavInner />
        </Suspense>

        {/* Bottom */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-red-500 text-sm hover:bg-red-50 rounded-lg px-1 -mx-1 py-1 transition-colors w-full"
          >
            <LogOut size={13} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="ml-56 flex-1 flex flex-col min-h-screen">
        <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-500 font-medium">Bogie Tracker Panel</span>
          </div>
          <div className="flex items-center gap-3">
            <InstallButton />
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full font-semibold">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Live
            </div>
          </div>
        </header>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
