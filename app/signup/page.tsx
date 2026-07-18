'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';

const RESEND_COOLDOWN_SECONDS = 30;
type Step = 'form' | 'otp';

export default function TrackerSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('form');
  const [companyName, setCompanyName]     = useState('');
  const [contactEmail, setContactEmail]   = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]         = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading]             = useState(false);

  const [pendingEmail, setPendingEmail] = useState('');
  const [otpCode, setOtpCode]           = useState('');
  const [verifying, setVerifying]       = useState(false);
  const [resending, setResending]       = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => setResendCooldown(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !contactEmail || !password || !confirmPassword) {
      toast.error('Fill in all required fields');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      await api.post('/gogoo/tracker/signup', {
        company_name: companyName,
        contact_email: contactEmail,
        password,
      });
      setPendingEmail(contactEmail);
      setOtpCode('');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStep('otp');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Signup failed');
      } else {
        toast.error('Connection failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      await api.post('/gogoo/tracker/verify-email', { email: pendingEmail, code: otpCode });
      router.push('/?verified=1');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Verification failed');
      } else {
        toast.error('Connection failed. Try again.');
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    try {
      await api.post('/gogoo/tracker/resend-otp', { email: pendingEmail });
      toast.success('A new code has been sent');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        toast.error('You can request a new code in a few seconds');
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Could not resend code');
      } else {
        toast.error('Connection failed. Try again.');
      }
    } finally {
      setResending(false);
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
          <p className="text-xs mt-0.5 text-gray-500">
            {step === 'otp' ? 'Verify your email to continue' : 'Dispatch Tracking for Your Business'}
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
          {step === 'otp' ? (
            <>
              <h2 className="text-lg font-semibold text-white mb-3">Verify your email</h2>
              <p className="text-sm text-gray-400 mb-6">
                We&apos;ve sent a 6-digit code to <span className="font-semibold text-gray-200">{pendingEmail}</span>. Enter it below to verify your email.
              </p>
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-center text-lg font-semibold tracking-[0.3em]
                      placeholder-gray-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={verifying || otpCode.length !== 6}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold
                    py-3 rounded-xl transition-colors mt-2 flex items-center justify-center gap-2 text-sm"
                >
                  {verifying ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying...</>
                  ) : 'Verify'}
                </button>
              </form>

              <div className="mt-5 text-center text-sm">
                {resendCooldown > 0 ? (
                  <p className="text-gray-500">Resend code in {resendCooldown}s</p>
                ) : (
                  <button type="button" onClick={handleResend} disabled={resending} className="font-semibold text-orange-400 hover:text-orange-300 disabled:opacity-60">
                    {resending ? 'Resending...' : 'Resend code'}
                  </button>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800 text-center">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="text-xs font-medium text-gray-500 hover:text-gray-300"
                >
                  Wrong email? Go back
                </button>
              </div>
            </>
          ) : (
          <>
          <h2 className="text-lg font-semibold text-white mb-6">Sign Up</h2>
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Your Company Pvt. Ltd."
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white
                  placeholder-gray-500 focus:outline-none focus:border-orange-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Contact Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="ops@yourcompany.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white
                  placeholder-gray-500 focus:outline-none focus:border-orange-500 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Password</label>
              <div className="flex items-center bg-gray-800 border border-gray-700 rounded-xl focus-within:border-orange-500">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="flex-1 bg-transparent px-4 py-3 text-white placeholder-gray-500 focus:outline-none text-sm"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="px-3 text-gray-400 hover:text-gray-200">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Confirm Password</label>
              <div className="flex items-center bg-gray-800 border border-gray-700 rounded-xl focus-within:border-orange-500">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="flex-1 bg-transparent px-4 py-3 text-white placeholder-gray-500 focus:outline-none text-sm"
                />
                <button type="button" onClick={() => setShowConfirmPassword(v => !v)} className="px-3 text-gray-400 hover:text-gray-200">
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-400 mt-1.5">Passwords don&apos;t match</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold
                py-3 rounded-xl transition-colors mt-2 flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing up...</>
              ) : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-800 text-center">
            <p className="text-xs text-gray-500">Already have an account? <a href="/" className="text-orange-400 font-semibold">Sign in</a></p>
          </div>
          </>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}
