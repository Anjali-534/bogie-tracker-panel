'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { api } from '@/lib/api';

function TrackerLoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (searchParams.get('verified') === '1') {
      toast.success('Email verified — you can now log in.');
      router.replace('/');
    }
  }, [searchParams, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Enter email and password'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/gogoo/tracker/login', { email, password });
      localStorage.setItem('tracker_company_token', data.token);
      localStorage.setItem('tracker_company_name', data.company.company_name);
      localStorage.setItem('tracker_company_email', email);
      localStorage.setItem('tracker_company_status', data.company.status);
      localStorage.setItem('tracker_company_is_owner', String(!!data.company.is_owner));
      toast.success('Welcome to Bogie Tracker!');
      setTimeout(() => router.push('/tracker'), 500);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string; status?: string };
        if (err.response.status === 403 && body.status) {
          router.push(`/blocked?status=${encodeURIComponent(body.status)}`);
          return;
        }
        toast.error(body.error || 'Invalid credentials');
      } else {
        toast.error('Connection failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <Toaster position="top-right" />
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex bg-white rounded-2xl p-4 mb-4">
            <Image src="/logo.png" alt="bogie" width={1536} height={1024} priority className="w-48 h-auto" />
          </div>
          <p className="text-sm mt-1 font-semibold text-orange-400">Tracker Panel</p>
          <p className="text-xs mt-0.5 text-gray-500">Dispatch Tracking for Your Business</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-6">Sign In</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Company Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ops@yourcompany.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white
                  placeholder-gray-500 focus:outline-none focus:border-orange-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white
                  placeholder-gray-500 focus:outline-none focus:border-orange-500 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold
                py-3 rounded-xl transition-colors mt-2 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</>
              ) : 'Sign In to Tracker Panel'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-500">Not yet subscribed? <a href="/signup" className="text-orange-400 font-semibold">Sign up for Bogie Tracker</a></p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}

export default function TrackerLoginPage() {
  return (
    <Suspense fallback={null}>
      <TrackerLoginPageInner />
    </Suspense>
  );
}
