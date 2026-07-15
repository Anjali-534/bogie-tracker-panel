'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Upload, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { mockDrivers } from '@/lib/mockData';

// TODO(backend): wire this to real endpoints once they exist:
//   POST /tracker/orders                      -> create the order, returns { id, public_tracking_token }
//   POST /tracker/orders/:id/eway-bill         -> multipart upload, reuses documents.go's
//                                                  Cloudinary/local dual-write pattern
// For now, submit just shows a success toast and routes back to the orders list.

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function NewOrderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [bookedForCompany, setBookedForCompany] = useState('');
  const [bookedForPhone,   setBookedForPhone]   = useState('');
  const [dispatchFrom,     setDispatchFrom]     = useState('');
  const [dispatchTo,       setDispatchTo]       = useState('');
  const [transporterName,  setTransporterName]  = useState('');
  const [transporterPhone, setTransporterPhone] = useState('');
  const [vehicleNumber,    setVehicleNumber]    = useState('');
  const [ewayBillNumber,   setEwayBillNumber]   = useState('');
  const [ewayBillFile,     setEwayBillFile]     = useState<File | null>(null);

  const [driverMode, setDriverMode] = useState<'select' | 'new'>('select');
  const [driverId,    setDriverId]    = useState('');
  const [driverName,  setDriverName]  = useState('');
  const [driverPhone, setDriverPhone] = useState('');

  function selectDriver(id: string) {
    setDriverId(id);
    const d = mockDrivers.find(x => x.id === id);
    if (d) {
      setDriverName(d.driver_name);
      setDriverPhone(d.phone);
      if (!transporterName) setTransporterName(d.transporter_name);
      if (!transporterPhone) setTransporterPhone(d.transporter_phone);
      if (!vehicleNumber) setVehicleNumber(d.vehicle_number);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bookedForCompany || !bookedForPhone || !dispatchFrom || !dispatchTo || !vehicleNumber) {
      toast.error('Fill in all required fields');
      return;
    }
    if (driverMode === 'new' && (!driverName || !driverPhone)) {
      toast.error('Driver name and phone required');
      return;
    }
    setSaving(true);
    // Placeholder: real submit will POST to /tracker/orders, then if
    // ewayBillFile is set, POST it to /tracker/orders/:id/eway-bill.
    await new Promise(r => setTimeout(r, 500));
    setSaving(false);
    toast.success('Order created (demo — not saved to a backend yet)');
    router.push('/tracker');
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center gap-3">
        <Link href="/tracker" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Order</h1>
          <p className="text-xs text-gray-400">Create a new dispatch order</p>
        </div>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Booked For</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Company Name *</label>
              <input value={bookedForCompany} onChange={e => setBookedForCompany(e.target.value)} className={inputClass} placeholder="Receiving company name" />
            </div>
            <div>
              <label className={labelClass}>Phone Number *</label>
              <input value={bookedForPhone} onChange={e => setBookedForPhone(e.target.value)} className={inputClass} placeholder="+91 98765 43210" />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Route</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Dispatch From *</label>
              <input value={dispatchFrom} onChange={e => setDispatchFrom(e.target.value)} className={inputClass} placeholder="City, State" />
            </div>
            <div>
              <label className={labelClass}>Dispatch To *</label>
              <input value={dispatchTo} onChange={e => setDispatchTo(e.target.value)} className={inputClass} placeholder="City, State" />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Driver</h2>
            <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden">
              <button type="button" onClick={() => setDriverMode('select')}
                className={`px-3 py-1.5 font-semibold transition-colors ${driverMode === 'select' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                Registered Driver
              </button>
              <button type="button" onClick={() => { setDriverMode('new'); setDriverId(''); }}
                className={`px-3 py-1.5 font-semibold transition-colors ${driverMode === 'new' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                Type New Driver
              </button>
            </div>
          </div>

          {driverMode === 'select' ? (
            <div>
              <label className={labelClass}>Select Driver</label>
              <select value={driverId} onChange={e => selectDriver(e.target.value)} className={`${inputClass} bg-white`}>
                <option value="">— Choose a registered driver —</option>
                {mockDrivers.filter(d => d.is_active).map(d => (
                  <option key={d.id} value={d.id}>{d.driver_name} · {d.vehicle_number}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Driver Name *</label>
                <input value={driverName} onChange={e => setDriverName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Driver Phone *</label>
                <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Transporter Name</label>
              <input value={transporterName} onChange={e => setTransporterName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Transporter Phone</label>
              <input value={transporterPhone} onChange={e => setTransporterPhone(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Vehicle Number *</label>
              <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} className={inputClass} placeholder="DL 1AB 1234" />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-900">E-way Bill <span className="text-gray-400 font-normal">(optional)</span></h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>E-way Bill Number</label>
              <input value={ewayBillNumber} onChange={e => setEwayBillNumber(e.target.value)} className={inputClass} placeholder="EWB2507150001" />
            </div>
            <div>
              <label className={labelClass}>Upload E-way Bill</label>
              {ewayBillFile ? (
                <div className="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-2.5 text-sm">
                  <span className="truncate text-gray-700">{ewayBillFile.name}</span>
                  <button type="button" onClick={() => setEwayBillFile(null)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                  <Upload size={14} />Choose file (PDF/JPG/PNG)
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setEwayBillFile(e.target.files?.[0] ?? null)} />
                </label>
              )}
            </div>
          </div>
        </section>

        <div className="pt-2 flex gap-3">
          <Link href="/tracker" className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-center">Cancel</Link>
          <button type="submit" disabled={saving} className="flex-1 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
