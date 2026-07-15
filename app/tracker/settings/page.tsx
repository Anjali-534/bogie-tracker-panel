'use client';
import { useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

// TODO(backend): GET/PATCH /tracker/company/profile and
// POST /tracker/company/password don't exist yet — this page reads from
// localStorage (set at login) and simulates a save.

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function SettingsPage() {
  const [companyName, setCompanyName] = useState('');
  const [email,        setEmail]        = useState('');
  const [phone,        setPhone]        = useState('');
  const [gstin,        setGstin]        = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword,  setSavingPassword]  = useState(false);

  useEffect(() => {
    setCompanyName(localStorage.getItem('tracker_company_name') || '');
    setEmail(localStorage.getItem('tracker_company_email') || '');
  }, []);

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setTimeout(() => {
      localStorage.setItem('tracker_company_name', companyName);
      setSavingProfile(false);
      toast.success('Profile updated (demo — not saved to a backend yet)');
    }, 400);
  }

  function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) { toast.error('Fill in all password fields'); return; }
    if (newPassword !== confirmPassword) { toast.error('New passwords do not match'); return; }
    setSavingPassword(true);
    setTimeout(() => {
      setSavingPassword(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast.success('Password changed (demo — not saved to a backend yet)');
    }, 400);
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Toaster position="top-right" />
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-xs text-gray-400">Company profile & account</p>
      </div>

      <form onSubmit={saveProfile} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-900">Company Profile</h2>
        <div>
          <label className={labelClass}>Company Name</label>
          <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
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
        <div className="pt-1">
          <button type="submit" disabled={savingProfile} className="px-5 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>

      <form onSubmit={savePassword} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
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
    </div>
  );
}
