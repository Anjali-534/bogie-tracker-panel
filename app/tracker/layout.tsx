'use client';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import {
  Package, Users, Settings, ExternalLink, LogOut,
} from 'lucide-react';
import { clearSession } from '@/lib/api';

const NAV = [
  { href: '/tracker',          icon: Package, label: 'Orders' },
  { href: '/tracker/drivers',  icon: Users,   label: 'Drivers' },
  { href: '/tracker/settings', icon: Settings, label: 'Settings' },
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
      {/* Indigo sidebar */}
      <aside className="w-56 h-screen flex flex-col fixed left-0 top-0 z-30 bg-indigo-600">

        {/* Logo */}
        <div className="p-5 border-b border-indigo-500">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🚚</span>
            <div>
              <p className="text-white font-bold text-base leading-tight">bogie</p>
              <p className="text-indigo-100 text-xs font-medium">Tracker Panel</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive(item.href)
                  ? 'bg-white/20 text-white font-semibold'
                  : 'text-indigo-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <item.icon size={16} className="flex-shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-indigo-500 space-y-2">
          <a
            href="https://gogoo-dashboard-production.up.railway.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-indigo-100 text-sm hover:text-white transition-colors"
          >
            <ExternalLink size={13} />
            Bogie Master Panel
          </a>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-indigo-100 text-sm hover:text-white transition-colors w-full"
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
            <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
            <span className="text-sm text-gray-500 font-medium">Bogie Tracker Panel</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full font-semibold">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </div>
        </header>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
