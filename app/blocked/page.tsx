'use client';
import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { clearSession } from '@/lib/api';

const COPY: Record<string, { title: string; body: string; tone: string }> = {
  pending: {
    title: 'Your account is pending approval',
    body: "Thanks for signing up for Bogie Tracker. Our team is reviewing your account and you'll be able to sign in as soon as it's approved.",
    tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  rejected: {
    title: 'Signup was not approved',
    body: 'Your Bogie Tracker application was not approved. If you believe this is a mistake, please contact support.',
    tone: 'text-red-400 bg-red-500/10 border-red-500/30',
  },
  suspended: {
    title: 'Account suspended',
    body: 'Your Bogie Tracker account has been suspended. Please contact support for details.',
    tone: 'text-red-400 bg-red-500/10 border-red-500/30',
  },
};

function BlockedScreenInner() {
  const params = useSearchParams();
  const router = useRouter();
  const status = params.get('status') || 'pending';
  const copy = COPY[status] || COPY.pending;

  function backToLogin() {
    clearSession();
    router.push('/');
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex bg-white rounded-2xl p-4 mb-6">
          <Image src="/logo.png" alt="bogie" width={1058} height={330} priority className="w-40 h-auto" />
        </div>
        <div className={`rounded-2xl border p-8 ${copy.tone}`}>
          <h1 className="text-lg font-bold text-white mb-3">{copy.title}</h1>
          <p className="text-sm text-gray-300 leading-relaxed">{copy.body}</p>
        </div>
        <button
          onClick={backToLogin}
          className="mt-6 w-full border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500
            font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          Try logging in again
        </button>
        <p className="text-center text-xs text-gray-600 mt-6">
          bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}

export default function BlockedScreen() {
  return (
    <Suspense fallback={null}>
      <BlockedScreenInner />
    </Suspense>
  );
}
