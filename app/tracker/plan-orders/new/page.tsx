'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import GSTInput from '@/components/GSTInput';
import {
  PLAN_LABELS, PLAN_PRICING, PLAN_TIER_ORDER, DURATION_LABELS, DURATION_MONTHS, TRACKER_GST_RATE,
  type TrackerPlan, type TrackerBillingDuration,
} from '@/lib/types';

interface CompanyProfile {
  current_plan: TrackerPlan | null;
  subscription_expires_at: string | null;
}

// Label for a plan card's CTA relative to what the company already has.
// Lifetime current_plan is handled by a dedicated full-page state before
// this ever runs, so `current` here is never 'lifetime'.
function planCta(target: TrackerPlan, current: TrackerPlan | null): string {
  if (!current) return 'Get Started';
  if (target === current) return 'Renew';
  return PLAN_TIER_ORDER[target] > PLAN_TIER_ORDER[current]
    ? `Upgrade to ${PLAN_LABELS[target]}`
    : `Downgrade to ${PLAN_LABELS[target]}`;
}

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

const RECURRING_PLANS: TrackerPlan[] = ['single', '2users', '5users', 'mega'];
const RECURRING_DURATIONS: TrackerBillingDuration[] = ['monthly', 'quarterly', 'halfYearly', 'yearly'];

// Display-only mirror of the server-side lookup (trackerbilling.Lookup is
// the real source of truth, applied again on submit) — used to render the
// picker and summary without a round-trip.
function computeAmounts(plan: TrackerPlan, duration: TrackerBillingDuration) {
  let base: number;
  if (plan === 'lifetime') {
    base = PLAN_PRICING.lifetime.onetime!;
  } else {
    const perMonth = PLAN_PRICING[plan][duration];
    const months = DURATION_MONTHS[duration];
    if (perMonth === undefined || months === undefined) return null;
    base = perMonth * months;
  }
  const gst = Math.round(base * TRACKER_GST_RATE * 100) / 100;
  const total = Math.round((base + gst) * 100) / 100;
  return { base, gst, total };
}

function fmtINR(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Step = 'pick' | 'billing' | 'summary' | 'done';

export default function NewPlanOrderPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('pick');

  const [duration, setDuration] = useState<TrackerBillingDuration>('monthly');
  const [plan, setPlan] = useState<TrackerPlan | null>(null);

  const [billingName, setBillingName] = useState('');
  const [billingAddressLine, setBillingAddressLine] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingPincode, setBillingPincode] = useState('');
  const [gstin, setGstin] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{ total_amount: number } | null>(null);

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    api.get<CompanyProfile>('/gogoo/tracker/company/profile')
      .then(({ data }) => setProfile(data))
      .catch(() => toast.error('Failed to load your current plan'))
      .finally(() => setProfileLoading(false));
  }, []);

  const effectiveDuration: TrackerBillingDuration | null = plan === 'lifetime' ? 'onetime' : plan ? duration : null;
  const amounts = useMemo(() => (plan && effectiveDuration ? computeAmounts(plan, effectiveDuration) : null), [plan, effectiveDuration]);

  function choosePlan(p: TrackerPlan) {
    setPlan(p);
    setStep('billing');
  }

  function continueToSummary(e: React.FormEvent) {
    e.preventDefault();
    if (!billingName || !billingAddressLine || !billingCity || !billingState || !billingPincode) {
      toast.error('Fill in all required billing fields');
      return;
    }
    setStep('summary');
  }

  async function submit() {
    if (!plan || !effectiveDuration) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/gogoo/tracker/plan-orders', {
        plan,
        billing_duration: effectiveDuration,
        billing_name: billingName,
        billing_address_line: billingAddressLine,
        billing_city: billingCity,
        billing_state: billingState,
        billing_pincode: billingPincode,
        gstin: gstin || undefined,
      });
      setPlacedOrder({ total_amount: data.total_amount });
      setStep('done');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        // 409 = duplicate pending order for this exact plan/duration — the
        // backend's message already tells the user what to do next.
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to create order');
      } else {
        toast.error('Connection failed. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center gap-3">
        <Link href="/tracker/plan-orders" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Plan Order</h1>
          <p className="text-xs text-gray-400">Buy or renew a Bogie Tracker plan</p>
        </div>
      </div>

      {step === 'pick' && !profileLoading && profile?.current_plan === 'lifetime' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center space-y-2">
          <p className="text-3xl mb-1">♾️</p>
          <h2 className="text-lg font-bold text-gray-900">You have lifetime access</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Your Bogie Tracker subscription never expires — there&apos;s nothing further to buy or renew.
          </p>
          <Link href="/tracker/plan-orders" className="inline-block mt-2 px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            Back to Plan Orders
          </Link>
        </div>
      )}

      {step === 'pick' && !(profile?.current_plan === 'lifetime') && (
        <div className="space-y-5">
          {!profileLoading && <CurrentPlanCard profile={profile} />}

          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900">Choose a plan</h2>
              <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden">
                {RECURRING_DURATIONS.map(d => (
                  <button key={d} type="button" onClick={() => setDuration(d)}
                    className={`px-3 py-1.5 font-semibold transition-colors ${duration === d ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {DURATION_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {RECURRING_PLANS.map(p => {
                const a = computeAmounts(p, duration);
                return (
                  <button key={p} type="button" onClick={() => choosePlan(p)}
                    className="text-left border border-gray-200 rounded-2xl p-5 hover:border-green-400 hover:shadow-sm transition-all">
                    <p className="text-sm font-bold text-gray-900">{PLAN_LABELS[p]}</p>
                    {a && (
                      <>
                        <p className="text-2xl font-extrabold text-gray-900 mt-2">{fmtINR(a.total)}</p>
                        <p className="text-xs text-gray-400">incl. GST · {DURATION_LABELS[duration]}</p>
                      </>
                    )}
                    <div className="mt-4 text-xs font-semibold text-green-600">{planCta(p, profile?.current_plan ?? null)} →</div>
                  </button>
                );
              })}
            </div>

            <div className="pt-1 border-t border-gray-100" />

            {(() => {
              const a = computeAmounts('lifetime', 'onetime');
              return (
                <button type="button" onClick={() => choosePlan('lifetime')}
                  className="w-full text-left border border-gray-200 rounded-2xl p-5 hover:border-green-400 hover:shadow-sm transition-all flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Lifetime</p>
                    <p className="text-xs text-gray-400">One-time payment, no renewals</p>
                  </div>
                  <div className="text-right">
                    {a && <p className="text-2xl font-extrabold text-gray-900">{fmtINR(a.total)}</p>}
                    <p className="text-xs font-semibold text-green-600">{profile?.current_plan ? 'Upgrade to Lifetime' : 'Get Started'} →</p>
                  </div>
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {step === 'billing' && plan && (
        <form onSubmit={continueToSummary} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Billing details</h2>
            <button type="button" onClick={() => setStep('pick')} className="text-xs font-semibold text-gray-500 hover:text-gray-800">Change plan</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelClass}>Billing Name *</label>
              <input value={billingName} onChange={e => setBillingName(e.target.value)} className={inputClass} placeholder="Name on the invoice" />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Address *</label>
              <input value={billingAddressLine} onChange={e => setBillingAddressLine(e.target.value)} className={inputClass} placeholder="Street address" />
            </div>
            <div>
              <label className={labelClass}>City *</label>
              <input value={billingCity} onChange={e => setBillingCity(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Pincode *</label>
              <input value={billingPincode} onChange={e => setBillingPincode(e.target.value)} className={inputClass} />
            </div>
            <GSTInput label="GSTIN" value={gstin} onChange={setGstin} onStateResolved={setBillingState} />
            <div>
              <label className={labelClass}>State *</label>
              <input value={billingState} onChange={e => setBillingState(e.target.value)} className={inputClass} placeholder="Auto-filled from GSTIN, or type manually" />
            </div>
          </div>
          <div className="pt-2 flex gap-3">
            <Link href="/tracker/plan-orders" className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-center">Cancel</Link>
            <button type="submit" className="flex-1 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">Continue</button>
          </div>
        </form>
      )}

      {step === 'summary' && plan && effectiveDuration && amounts && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Order summary</h2>
            <button type="button" onClick={() => setStep('billing')} className="text-xs font-semibold text-gray-500 hover:text-gray-800">Edit details</button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Plan</span>
              <span className="font-semibold text-gray-900">{PLAN_LABELS[plan]} · {DURATION_LABELS[effectiveDuration]}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Billed to</span>
              <span className="font-semibold text-gray-900 text-right">{billingName}<br /><span className="text-xs text-gray-400 font-normal">{billingAddressLine}, {billingCity}, {billingState} - {billingPincode}</span></span>
            </div>
            {gstin && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">GSTIN</span>
                <span className="font-semibold text-gray-900">{gstin}</span>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Base amount</span>
              <span className="text-gray-900">{fmtINR(amounts.base)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">GST (18%)</span>
              <span className="text-gray-900">{fmtINR(amounts.gst)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-extrabold pt-2 border-t border-gray-100">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">{fmtINR(amounts.total)}</span>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Final pricing is confirmed by our server when the order is placed. Payment is confirmed manually by our team — you&apos;ll receive an invoice by email once it&apos;s marked paid.
          </p>

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={() => setStep('billing')} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Back</button>
            <button type="button" onClick={submit} disabled={submitting} className="flex-1 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
              {submitting ? 'Placing order…' : 'Place Order'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && placedOrder && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center space-y-4">
          <CheckCircle2 size={40} className="mx-auto text-green-500" />
          <h2 className="text-lg font-bold text-gray-900">Order placed</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Your order for {fmtINR(placedOrder.total_amount)} is pending payment confirmation. Our team confirms payment manually — once confirmed, an invoice will be generated and emailed to you automatically.
          </p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Mail size={13} />You&apos;ll see the order here as &quot;Paid&quot; with a downloadable invoice once it&apos;s confirmed.
          </div>
          <button onClick={() => router.push('/tracker/plan-orders')} className="mt-2 px-5 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
            View Plan Orders
          </button>
        </div>
      )}
    </div>
  );
}

// "Your current plan" summary shown above the picker. No card at all when
// the company has never subscribed (current_plan is null) — there's
// nothing to summarize yet, so the plan picker speaks for itself.
function CurrentPlanCard({ profile }: { profile: CompanyProfile | null }) {
  if (!profile?.current_plan) return null;

  const expiresAt = profile.subscription_expires_at ? new Date(profile.subscription_expires_at) : null;
  const daysRemaining = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  let tone: 'green' | 'amber' | 'red';
  let statusText: string;
  if (daysRemaining === null) {
    tone = 'green';
    statusText = 'Active';
  } else if (daysRemaining <= 0) {
    tone = 'red';
    statusText = 'Expired';
  } else if (daysRemaining <= 7) {
    tone = 'amber';
    statusText = `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`;
  } else {
    tone = 'green';
    statusText = `${daysRemaining} days remaining`;
  }

  const toneClasses = {
    green: 'border-green-200 bg-green-50 text-green-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 flex items-center justify-between ${toneClasses}`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Your current plan</p>
        <p className="text-lg font-extrabold mt-0.5">{PLAN_LABELS[profile.current_plan]}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold">{statusText}</p>
        {expiresAt && (
          <p className="text-xs opacity-70">
            {daysRemaining !== null && daysRemaining <= 0 ? 'Expired on' : 'Expires on'} {expiresAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  );
}
