'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';

export default function TrackerSignupPage() {
  const router = useRouter();
  const [companyName, setCompanyName]     = useState('');
  const [contactEmail, setContactEmail]   = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]         = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading]             = useState(false);

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
      router.push('/blocked?status=pending');
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
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          bogie Tracker · Aggarwal Publicity and Marketing Pvt. Ltd.
        </p>
      </div>
    </div>
  );
}
