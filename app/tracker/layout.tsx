'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import {
  LayoutDashboard, Package, Users, BookUser, CreditCard, Settings, LogOut, CarFront,
} from 'lucide-react';
import { clearSession } from '@/lib/api';
import InstallButton from '@/components/InstallButton';

const NAV = [
  { href: '/tracker',             icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/tracker/rides',       icon: CarFront,        label: 'Book a Ride' },
  { href: '/tracker/orders',      icon: Package,         label: 'Shipment Details' },
  { href: '/tracker/drivers',     icon: Users,           label: 'Driver Details' },
  { href: '/tracker/recipients',  icon: BookUser,        label: 'Consignee Directory' },
  { href: '/tracker/plan-orders', icon: CreditCard,      label: 'Billing & Subscription' },
  { href: '/tracker/settings',    icon: Settings,        label: 'Settings' },
];

export default function TrackerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

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

  function isActive(href: string) {
    if (href === '/tracker') return pathname === '/tracker';
    return pathname.startsWith(href);
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
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive(item.href)
                  ? 'bg-orange-50 text-orange-500 border-l-[3px] border-orange-500 pl-[9px] font-semibold'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon size={16} className="flex-shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

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
