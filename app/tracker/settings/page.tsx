'use client';
import { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import Link from 'next/link';
import { Upload, X, Trash2, FileText, Building2, UserPlus, KeyRound, HelpCircle } from 'lucide-react';
import { api, isTrackerOwner } from '@/lib/api';
import { TrackerStaffUser, TrackerStaffListResponse } from '@/lib/types';
import LocationInput from '@/components/LocationInput';

// The sidebar's Settings dropdown deep-links here via #password/#staff/#logo.
// Next.js's default hash-scroll only fires on the initial load of the route,
// not on a same-route client-side <Link> navigation (App Router treats a
// hash-only href change as no navigation), so we scroll manually on mount.
function useHashScroll(ready: boolean) {
  useEffect(() => {
    function scrollToHash() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Sections don't exist in the DOM until the profile fetch finishes (the
    // page renders a bare "Loading…" placeholder until then), so wait for
    // that before attempting the initial scroll.
    if (ready) scrollToHash();
    // Clicking a #password/#staff/#logo link while already on /tracker/settings
    // doesn't remount this component (App Router sees it as the same route),
    // so the effect above won't rerun on its own — hashchange covers that case.
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, [ready]);
}

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

interface CompanyProfile {
  company_name: string;
  contact_phone: string;
  contact_email: string;
  gstin: string;
  status: string;
  notification_email: string | null;
  logo_url: string | null;
  default_address: string | null;
  default_address_lat: number | null;
  default_address_lng: number | null;
}

interface ProfileFormState {
  companyName: string;
  phone: string;
  gstin: string;
  notificationEmail: string;
  defaultAddress: string;
  defaultAddressLat: number | null;
  defaultAddressLng: number | null;
}

const SUBSCRIPTION_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-50 text-green-600 border-green-200' },
  overdue: { label: 'Overdue', className: 'bg-red-50 text-red-600 border-red-200' },
  paused: { label: 'Paused', className: 'bg-amber-50 text-amber-600 border-amber-200' },
};

export default function SettingsPage() {
  const [companyName, setCompanyName] = useState('');
  const [email,        setEmail]        = useState('');
  const [phone,        setPhone]        = useState('');
  const [gstin,        setGstin]        = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [defaultAddress,    setDefaultAddress]    = useState('');
  const [defaultAddressLat, setDefaultAddressLat] = useState<number | null>(null);
  const [defaultAddressLng, setDefaultAddressLng] = useState<number | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile,  setSavedProfile]  = useState<ProfileFormState | null>(null);

  const [logoUrl,        setLogoUrl]        = useState<string | null>(null);
  const [uploadingLogo,  setUploadingLogo]  = useState(false);

  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword,  setSavingPassword]  = useState(false);

  const isOwner = isTrackerOwner();
  const [staff, setStaff] = useState<TrackerStaffUser[]>([]);
  const [staffLimit, setStaffLimit] = useState<number | null>(null);
  const [staffUnlimited, setStaffUnlimited] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);

  function loadStaff() {
    if (!isOwner) return;
    api.get<TrackerStaffListResponse>('/gogoo/tracker/staff')
      .then(({ data }) => {
        setStaff(data.staff);
        setStaffUnlimited(!!data.unlimited);
        setStaffLimit(data.limit ?? null);
      })
      .catch(() => toast.error('Failed to load staff logins'));
  }

  useEffect(() => { loadStaff(); }, [isOwner]);

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!staffEmail || !staffPassword) { toast.error('Enter email and password'); return; }
    setAddingStaff(true);
    try {
      await api.post('/gogoo/tracker/staff', { email: staffEmail, password: staffPassword });
      setStaffEmail(''); setStaffPassword('');
      toast.success('Staff login added');
      loadStaff();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to add staff login');
      } else {
        toast.error('Failed to add staff login');
      }
    } finally {
      setAddingStaff(false);
    }
  }

  async function removeStaff(id: string) {
    try {
      await api.delete(`/gogoo/tracker/staff/${id}`);
      toast.success('Staff login removed');
      loadStaff();
    } catch {
      toast.error('Failed to remove staff login');
    }
  }

  async function reactivateStaff(id: string) {
    try {
      await api.post(`/gogoo/tracker/staff/${id}/reactivate`);
      toast.success('Staff login reactivated');
      loadStaff();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to reactivate staff login');
      } else {
        toast.error('Failed to reactivate staff login');
      }
    }
  }

  useEffect(() => {
    api.get<CompanyProfile>('/gogoo/tracker/company/profile')
      .then(({ data }) => {
        setCompanyName(data.company_name);
        setEmail(data.contact_email);
        setPhone(data.contact_phone);
        setGstin(data.gstin || '');
        setNotificationEmail(data.notification_email || '');
        setLogoUrl(data.logo_url || null);
        setDefaultAddress(data.default_address || '');
        setDefaultAddressLat(data.default_address_lat ?? null);
        setDefaultAddressLng(data.default_address_lng ?? null);
        setSavedProfile({
          companyName: data.company_name,
          phone: data.contact_phone,
          gstin: data.gstin || '',
          notificationEmail: data.notification_email || '',
          defaultAddress: data.default_address || '',
          defaultAddressLat: data.default_address_lat ?? null,
          defaultAddressLng: data.default_address_lng ?? null,
        });
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
    // Subscription status badge — same wallet ledger endpoint the rides/new
    // payment toggle already uses, just reading subscription_status off it.
    api.get('/gogoo/tracker/wallet/ledger')
      .then(({ data }) => setSubscriptionStatus(data.subscription_status || null))
      .catch(() => {});
  }, []);

  function cancelProfileEdits() {
    if (!savedProfile) return;
    setCompanyName(savedProfile.companyName);
    setPhone(savedProfile.phone);
    setGstin(savedProfile.gstin);
    setNotificationEmail(savedProfile.notificationEmail);
    setDefaultAddress(savedProfile.defaultAddress);
    setDefaultAddressLat(savedProfile.defaultAddressLat);
    setDefaultAddressLng(savedProfile.defaultAddressLng);
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post<{ logo_url: string }>('/gogoo/tracker/logo', form);
      setLogoUrl(data.logo_url);
      localStorage.setItem('tracker_company_logo_url', data.logo_url);
      toast.success('Logo updated');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Logo upload failed');
      } else {
        toast.error('Logo upload failed');
      }
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    setUploadingLogo(true);
    try {
      await api.delete('/gogoo/tracker/logo');
      setLogoUrl(null);
      localStorage.removeItem('tracker_company_logo_url');
      toast.success('Logo removed');
    } catch {
      toast.error('Failed to remove logo');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/gogoo/tracker/company/profile', {
        company_name: companyName,
        contact_phone: phone,
        gstin: gstin || undefined,
        notification_email: notificationEmail || undefined,
        default_address: defaultAddress || undefined,
        default_address_lat: defaultAddressLat ?? undefined,
        default_address_lng: defaultAddressLng ?? undefined,
      });
      localStorage.setItem('tracker_company_name', companyName);
      setSavedProfile({
        companyName, phone, gstin, notificationEmail,
        defaultAddress, defaultAddressLat, defaultAddressLng,
      });
      toast.success('Settings saved successfully');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Update failed');
      } else {
        toast.error('Update failed');
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) { toast.error('Fill in all password fields'); return; }
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return; }
    setSavingPassword(true);
    try {
      await api.post('/gogoo/tracker/company/password', {
        old_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast.success('Password changed');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Password change failed');
      } else {
        toast.error('Password change failed');
      }
    } finally {
      setSavingPassword(false);
    }
  }

  useHashScroll(!loading);

  if (loading) {
    return <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>;
  }

  const subBadge = subscriptionStatus ? SUBSCRIPTION_BADGE[subscriptionStatus] : null;

  return (
    <div className="max-w-6xl space-y-5">
      <Toaster position="top-right" toastOptions={{ success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } } }} />
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-xs text-gray-400">Company profile & account</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN — logo + quick info */}
        <div className="lg:col-span-3 space-y-6">
          <div id="logo" className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center text-center space-y-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Company logo" className="w-24 h-24 object-contain rounded-xl border border-gray-200 bg-gray-50" />
            ) : (
              <div className="w-24 h-24 rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                <Building2 size={28} className="text-gray-300" />
              </div>
            )}
            <label className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              <Upload size={13} />{uploadingLogo ? 'Uploading…' : 'Upload Logo'}
              <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" disabled={uploadingLogo}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
            </label>
            {logoUrl && (
              <button type="button" onClick={removeLogo} disabled={uploadingLogo} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">
                Remove Logo
              </button>
            )}
            <p className="text-[11px] text-gray-400">Shown on your dashboard and, if approved, in Bogie&apos;s partner list.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Quick Info</h2>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-[11px] text-gray-400">Company Name</p>
                <p className="font-semibold text-gray-800 truncate">{companyName || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Contact Phone</p>
                <p className="font-semibold text-gray-800">{phone || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 mb-1">Subscription</p>
                {subBadge ? (
                  <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${subBadge.className}`}>
                    {subBadge.label}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN — form cards */}
        <div className="lg:col-span-6 space-y-6">
          <form onSubmit={saveProfile} className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Company Profile</h2>
              <div>
                <label className={labelClass}>Company Name</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Contact Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="+91 98765 43210" />
                </div>
                <div>
                  <label className={labelClass}>GSTIN <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} className={inputClass} placeholder="07AAAAA0000A1Z5" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Contact Email</label>
                <input value={email} disabled className={`${inputClass} bg-gray-50 text-gray-400 cursor-not-allowed`} />
                <p className="text-[11px] text-gray-400 mt-1">Login email can&apos;t be changed here — contact support to update it.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Default Company Address</h2>
              <div>
                <LocationInput
                  label="Default Company Address (optional)"
                  value={defaultAddress}
                  lat={defaultAddressLat}
                  lng={defaultAddressLng}
                  onChange={(address, lat, lng) => { setDefaultAddress(address); setDefaultAddressLat(lat); setDefaultAddressLng(lng); }}
                  placeholder="Search for an address or city"
                  className={inputClass}
                  labelClassName={labelClass}
                />
                <p className="text-[11px] text-gray-400 mt-1">Used to prefill Deliver To on inbound shipments — the goods coming back to you.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <h2 className="text-sm font-bold text-gray-900">Notifications</h2>
              <div>
                <label className={labelClass}>Notification Email <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="email" value={notificationEmail} onChange={e => setNotificationEmail(e.target.value)} className={inputClass} placeholder={email || 'you@company.com'} />
                <p className="text-[11px] text-gray-400 mt-1">Replies to dispatch emails go here; defaults to your signup email.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={savingProfile} className="px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" onClick={cancelProfileEdits} disabled={savingProfile} className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 disabled:opacity-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>

          <form id="password" onSubmit={savePassword} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Change Password</h2>
            <div>
              <label className={labelClass}>Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="pt-1">
              <button type="submit" disabled={savingPassword} className="px-5 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
                {savingPassword ? 'Updating…' : 'Change Password'}
              </button>
            </div>
          </form>

          {isOwner && (
            <div id="staff" className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">Team</h2>
                <span className="text-xs text-gray-400">
                  {(() => {
                    const activeCount = staff.filter(s => !s.disabled_at).length;
                    return staffUnlimited
                      ? `${activeCount} staff login(s) · unlimited`
                      : `${activeCount}${staffLimit !== null ? ` / ${staffLimit}` : ''} staff login(s)`;
                  })()}
                </span>
              </div>

              {staff.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {staff.map(s => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className={`text-sm min-w-0 truncate ${s.disabled_at ? 'text-gray-400' : 'text-gray-700'}`}>
                        {s.email}
                        {s.disabled_at && (
                          <span className="ml-2 text-[11px] font-semibold text-amber-500">Disabled — plan downgrade</span>
                        )}
                      </span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {s.disabled_at && (
                          <button onClick={() => reactivateStaff(s.id)} className="text-xs font-semibold text-green-600 hover:text-green-700">
                            Reactivate
                          </button>
                        )}
                        <button onClick={() => removeStaff(s.id)} className="text-gray-400 hover:text-red-500" title="Remove staff login">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={addStaff} className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className={labelClass}>Staff Email</label>
                  <input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} className={inputClass} placeholder="teammate@company.com" />
                </div>
                <div>
                  <label className={labelClass}>Staff Password</label>
                  <input type="password" value={staffPassword} onChange={e => setStaffPassword(e.target.value)} className={inputClass} placeholder="min 8 characters" />
                </div>
                <div className="sm:col-span-2">
                  <button type="submit" disabled={addingStaff} className="px-5 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
                    {addingStaff ? 'Adding…' : 'Add Staff Login'}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-2">Staff have the same full access as you, except managing other staff logins.</p>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
            <h2 className="text-sm font-bold text-gray-900">Legal</h2>
            <ul className="divide-y divide-gray-100">
              {[
                { href: '/terms', label: 'Terms of Service' },
                { href: '/privacy', label: 'Privacy Policy' },
                { href: '/refund-policy', label: 'Refund & Cancellation Policy' },
                { href: '/cookie-policy', label: 'Cookie Policy' },
              ].map(item => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2.5 py-2.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <FileText size={14} className="text-gray-400" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* FAR RIGHT SIDEBAR — quick tips */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 lg:sticky lg:top-6">
            <h2 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Quick Tips</h2>
            <ul className="space-y-3">
              <li>
                <Link href="#staff" className="flex items-start gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors">
                  <UserPlus size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <span>Need to add a team member? <span className="font-semibold">Add Staff</span></span>
                </Link>
              </li>
              <li>
                <Link href="#password" className="flex items-start gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors">
                  <KeyRound size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <span>Forgot your password? <span className="font-semibold">Change Password</span></span>
                </Link>
              </li>
              <li>
                <Link href="/tracker/help" className="flex items-start gap-2 text-xs text-gray-600 hover:text-orange-600 transition-colors">
                  <HelpCircle size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <span>New to the panel? <span className="font-semibold">How to Use</span></span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
