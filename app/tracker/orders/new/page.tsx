'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookmarkPlus, RotateCcw, Upload, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { api } from '@/lib/api';
import { type TrackerDriver, type TrackerOrder, type TrackerSavedRecipient } from '@/lib/types';
import LocationInput from '@/components/LocationInput';
import GSTInput from '@/components/GSTInput';

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

export default function NewOrderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState<TrackerDriver[]>([]);

  const [bookedForCompany, setBookedForCompany] = useState('');
  const [bookedForPhone,   setBookedForPhone]   = useState('');
  const [bookedForEmail,   setBookedForEmail]   = useState('');
  const [bookedForGstin,   setBookedForGstin]   = useState('');
  // Auto-filled from the GSTIN's state code (GSTInput's onStateResolved),
  // but a normal editable field — manual entry/override always works.
  const [bookedForState,   setBookedForState]   = useState('');
  const [dispatchFrom,     setDispatchFrom]     = useState('');
  const [dispatchFromLat,  setDispatchFromLat]  = useState<number | null>(null);
  const [dispatchFromLng,  setDispatchFromLng]  = useState<number | null>(null);
  const [dispatchTo,       setDispatchTo]       = useState('');
  const [dispatchToLat,    setDispatchToLat]    = useState<number | null>(null);
  const [dispatchToLng,    setDispatchToLng]    = useState<number | null>(null);
  const [transporterName,  setTransporterName]  = useState('');
  const [transporterPhone, setTransporterPhone] = useState('');
  const [transporterEmail, setTransporterEmail] = useState('');
  const [vehicleNumber,    setVehicleNumber]    = useState('');
  const [ewayBillNumber,   setEwayBillNumber]   = useState('');
  const [ewayBillFile,     setEwayBillFile]     = useState<File | null>(null);

  const [consigneeName,       setConsigneeName]       = useState('');
  const [consigneeEmail,      setConsigneeEmail]      = useState('');
  const [consigneeGstin,      setConsigneeGstin]      = useState('');
  const [consigneeState,      setConsigneeState]      = useState('');
  const [material,            setMaterial]            = useState('');
  const [quantity,             setQuantity]           = useState('');
  const [dispatchDatetime,     setDispatchDatetime]   = useState('');
  const [documentsEnclosed,    setDocumentsEnclosed]  = useState('');

  const [driverMode, setDriverMode] = useState<'select' | 'new'>('select');
  const [driverId,    setDriverId]    = useState('');
  const [driverName,  setDriverName]  = useState('');
  const [driverPhone, setDriverPhone] = useState('');

  // Saved recipients — backend returns most-used-first, the picker keeps
  // that order and only filters it.
  const [recipients,          setRecipients]          = useState<TrackerSavedRecipient[]>([]);
  const [recipientQuery,      setRecipientQuery]      = useState('');
  const [recipientListOpen,   setRecipientListOpen]   = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [savePromptDismissed, setSavePromptDismissed] = useState(false);
  const [saveLabel,           setSaveLabel]           = useState('');
  const [savingRecipient,     setSavingRecipient]     = useState(false);

  // "Repeat last order" — only the latest order's id is kept from the list;
  // the full field set is fetched on click (the list response is trimmed).
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [repeating,   setRepeating]   = useState(false);

  useEffect(() => {
    api.get<TrackerDriver[]>('/gogoo/tracker/drivers')
      .then(({ data }) => setDrivers(data))
      .catch(() => toast.error('Failed to load drivers'));
    api.get<TrackerSavedRecipient[]>('/gogoo/tracker/recipients')
      .then(({ data }) => setRecipients(data))
      .catch(() => {});
    api.get<TrackerOrder[]>('/gogoo/tracker/orders')
      .then(({ data }) => setLastOrderId(data[0]?.id ?? null))
      .catch(() => {});
  }, []);

  function applyRecipient(r: TrackerSavedRecipient) {
    setSelectedRecipientId(r.id);
    setRecipientQuery(r.label);
    setRecipientListOpen(false);
    setBookedForCompany(r.booked_for_company_name);
    setBookedForPhone(r.booked_for_phone);
    setBookedForEmail(r.booked_for_email ?? '');
    setBookedForGstin(r.booked_for_gstin ?? '');
    setBookedForState(r.booked_for_state ?? '');
    setConsigneeName(r.consignee_name ?? '');
    setConsigneeEmail(r.consignee_email ?? '');
    setConsigneeGstin(r.consignee_gstin ?? '');
    setConsigneeState(r.consignee_state ?? '');
    if (r.dispatch_to) {
      setDispatchTo(r.dispatch_to);
      setDispatchToLat(r.dispatch_to_lat);
      setDispatchToLng(r.dispatch_to_lng);
    }
  }

  const recipientFilter = recipientQuery.trim().toLowerCase();
  const filteredRecipients = recipientFilter === '' ? recipients : recipients.filter(r =>
    r.label.toLowerCase().includes(recipientFilter) ||
    r.booked_for_company_name.toLowerCase().includes(recipientFilter) ||
    r.booked_for_phone.includes(recipientFilter) ||
    (r.dispatch_to ?? '').toLowerCase().includes(recipientFilter)
  );

  const normPhone = (p: string) => p.replace(/\s+/g, '');
  const matchesExistingRecipient = recipients.some(r =>
    r.booked_for_company_name.trim().toLowerCase() === bookedForCompany.trim().toLowerCase() &&
    normPhone(r.booked_for_phone) === normPhone(bookedForPhone)
  );
  const showSavePrompt = !selectedRecipientId && !savePromptDismissed &&
    bookedForCompany.trim() !== '' && bookedForPhone.trim() !== '' && !matchesExistingRecipient;

  async function saveAsRecipient() {
    setSavingRecipient(true);
    try {
      const { data } = await api.post<TrackerSavedRecipient>('/gogoo/tracker/recipients', {
        label: (saveLabel.trim() || bookedForCompany).trim(),
        booked_for_company_name: bookedForCompany,
        booked_for_phone: bookedForPhone,
        booked_for_email: bookedForEmail || undefined,
        booked_for_gstin: bookedForGstin || undefined,
        booked_for_state: bookedForState || undefined,
        consignee_name: consigneeName || undefined,
        consignee_email: consigneeEmail || undefined,
        consignee_gstin: consigneeGstin || undefined,
        consignee_state: consigneeState || undefined,
        dispatch_to: dispatchTo || undefined,
        dispatch_to_lat: dispatchToLat ?? undefined,
        dispatch_to_lng: dispatchToLng ?? undefined,
      });
      setRecipients(prev => [...prev, data]);
      // The just-saved recipient counts as "used" for this order too.
      setSelectedRecipientId(data.id);
      setRecipientQuery(data.label);
      setSaveLabel('');
      toast.success(`Saved "${data.label}" for future orders`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to save recipient');
      } else {
        toast.error('Failed to save recipient');
      }
    } finally {
      setSavingRecipient(false);
    }
  }

  // Prefills everything editable from the company's most recent order EXCEPT
  // dispatch_datetime (a stale past date silently carried over is a footgun)
  // and the e-way bill number/file (always unique per dispatch).
  async function repeatLastOrder() {
    if (!lastOrderId) return;
    setRepeating(true);
    try {
      const { data } = await api.get<{ order: TrackerOrder }>(`/gogoo/tracker/orders/${lastOrderId}`);
      const o = data.order;
      setSelectedRecipientId(null);
      setRecipientQuery('');
      setBookedForCompany(o.booked_for_company_name);
      setBookedForPhone(o.booked_for_phone);
      setBookedForEmail(o.booked_for_email ?? '');
      setBookedForGstin(o.booked_for_gstin ?? '');
      setBookedForState(o.booked_for_state ?? '');
      setDispatchFrom(o.dispatch_from);
      setDispatchFromLat(o.dispatch_from_lat);
      setDispatchFromLng(o.dispatch_from_lng);
      setDispatchTo(o.dispatch_to);
      setDispatchToLat(o.dispatch_to_lat);
      setDispatchToLng(o.dispatch_to_lng);
      setConsigneeName(o.consignee_name ?? '');
      setConsigneeEmail(o.consignee_email ?? '');
      setConsigneeGstin(o.consignee_gstin ?? '');
      setConsigneeState(o.consignee_state ?? '');
      setMaterial(o.material ?? '');
      setQuantity(o.quantity ?? '');
      setDocumentsEnclosed(o.documents_enclosed ?? '');
      setTransporterName(o.transporter_name);
      setTransporterPhone(o.transporter_phone);
      setTransporterEmail(o.transporter_email ?? '');
      setVehicleNumber(o.vehicle_number);
      setDriverMode('select');
      setDriverId(o.driver_id ?? '');
      toast.success('Prefilled from your last order — dispatch date and e-way bill start fresh');
    } catch {
      toast.error('Failed to load your last order');
    } finally {
      setRepeating(false);
    }
  }

  function selectDriver(id: string) {
    setDriverId(id);
    const d = drivers.find(x => x.id === id);
    if (d) {
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
    try {
      // "Type New Driver" registers the driver first (so they're on the
      // roster for future orders too — same as the Drivers page), then
      // links the order to that new driver_id. The backend only accepts an
      // existing driver_id on order creation, not free-text driver details.
      let linkedDriverId: string | undefined = driverMode === 'select' ? (driverId || undefined) : undefined;
      if (driverMode === 'new') {
        const { data } = await api.post('/gogoo/tracker/drivers', {
          driver_name: driverName,
          phone: driverPhone,
          vehicle_number: vehicleNumber,
          transporter_name: transporterName,
          transporter_phone: transporterPhone,
        });
        linkedDriverId = data.id;
      }

      const { data: order } = await api.post('/gogoo/tracker/orders', {
        booked_for_company_name: bookedForCompany,
        booked_for_phone: bookedForPhone,
        dispatch_from: dispatchFrom,
        dispatch_from_lat: dispatchFromLat ?? undefined,
        dispatch_from_lng: dispatchFromLng ?? undefined,
        dispatch_to: dispatchTo,
        dispatch_to_lat: dispatchToLat ?? undefined,
        dispatch_to_lng: dispatchToLng ?? undefined,
        booked_for_email: bookedForEmail || undefined,
        booked_for_gstin: bookedForGstin || undefined,
        booked_for_state: bookedForState || undefined,
        transporter_name: transporterName || undefined,
        transporter_phone: transporterPhone || undefined,
        transporter_email: transporterEmail || undefined,
        driver_id: linkedDriverId,
        vehicle_number: vehicleNumber,
        eway_bill_number: ewayBillNumber || undefined,
        consignee_name: consigneeName || undefined,
        consignee_email: consigneeEmail || undefined,
        consignee_gstin: consigneeGstin || undefined,
        consignee_state: consigneeState || undefined,
        saved_recipient_id: selectedRecipientId ?? undefined,
        material: material || undefined,
        quantity: quantity || undefined,
        dispatch_datetime: dispatchDatetime ? new Date(dispatchDatetime).toISOString() : undefined,
        documents_enclosed: documentsEnclosed || undefined,
      });

      if (ewayBillFile) {
        const form = new FormData();
        form.append('file', ewayBillFile);
        try {
          await api.post(`/gogoo/tracker/orders/${order.id}/eway-bill`, form);
        } catch {
          toast.error('Order created, but e-way bill upload failed — you can retry from the order page');
        }
      }

      toast.success('Order created');
      router.push(`/tracker/orders/${order.id}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to create order');
      } else {
        toast.error('Connection failed. Try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Toaster position="top-right" />
      <div className="flex items-center gap-3">
        <Link href="/tracker/orders" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">New Order</h1>
          <p className="text-xs text-gray-400">Create a new dispatch order</p>
        </div>
        {lastOrderId && (
          <button type="button" onClick={repeatLastOrder} disabled={repeating}
            className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 border border-orange-200 rounded-lg px-3 py-2 hover:bg-orange-50 disabled:opacity-50 transition-colors">
            <RotateCcw size={13} />{repeating ? 'Loading…' : 'Repeat last order'}
          </button>
        )}
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">

        {recipients.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-gray-900">Saved Recipient <span className="text-gray-400 font-normal">(optional)</span></h2>
            <div className="relative">
              <input
                value={recipientQuery}
                onChange={e => { setRecipientQuery(e.target.value); setRecipientListOpen(true); setSelectedRecipientId(null); }}
                onFocus={() => setRecipientListOpen(true)}
                onBlur={() => setRecipientListOpen(false)}
                className={inputClass}
                placeholder="Search saved recipients to pre-fill Booked For, Consignee & Dispatch To"
              />
              {recipientListOpen && filteredRecipients.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {filteredRecipients.map(r => (
                    <button type="button" key={r.id}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => applyRecipient(r)}
                      className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors">
                      <p className="text-sm font-semibold text-gray-900">{r.label}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {r.booked_for_company_name} · {r.booked_for_phone}{r.dispatch_to ? ` · ${r.dispatch_to}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

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
            <div>
              <label className={labelClass}>Email <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="email" value={bookedForEmail} onChange={e => setBookedForEmail(e.target.value)} className={inputClass} placeholder="for dispatch notification email" />
            </div>
            <GSTInput label="GSTIN" value={bookedForGstin} onChange={setBookedForGstin} onStateResolved={setBookedForState} />
            <div>
              <label className={labelClass}>State</label>
              <input value={bookedForState} onChange={e => setBookedForState(e.target.value)} className={inputClass} placeholder="Auto-filled from GSTIN, or type manually" />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Route</h2>
          <div className="grid grid-cols-2 gap-4">
            <LocationInput
              label="Dispatch From *"
              value={dispatchFrom}
              onChange={(address, lat, lng) => { setDispatchFrom(address); setDispatchFromLat(lat); setDispatchFromLng(lng); }}
              placeholder="Search for an address or city"
              className={inputClass}
              labelClassName={labelClass}
            />
            <LocationInput
              label="Dispatch To *"
              value={dispatchTo}
              onChange={(address, lat, lng) => { setDispatchTo(address); setDispatchToLat(lat); setDispatchToLng(lng); }}
              placeholder="Search for an address or city"
              className={inputClass}
              labelClassName={labelClass}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Dispatch Details <span className="text-gray-400 font-normal">(optional)</span></h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Consignee Name</label>
              <input value={consigneeName} onChange={e => setConsigneeName(e.target.value)} className={inputClass} placeholder="Receiving entity, if different from Booked For" />
            </div>
            <div>
              <label className={labelClass}>Consignee Email</label>
              <input type="email" value={consigneeEmail} onChange={e => setConsigneeEmail(e.target.value)} className={inputClass} placeholder="for dispatch notification email" />
            </div>
            <GSTInput label="Consignee GSTIN" value={consigneeGstin} onChange={setConsigneeGstin} onStateResolved={setConsigneeState} />
            <div>
              <label className={labelClass}>Consignee State</label>
              <input value={consigneeState} onChange={e => setConsigneeState(e.target.value)} className={inputClass} placeholder="Auto-filled from GSTIN, or type manually" />
            </div>
            <div>
              <label className={labelClass}>Dispatch Date &amp; Time</label>
              <input type="datetime-local" value={dispatchDatetime} onChange={e => setDispatchDatetime(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Material</label>
              <input value={material} onChange={e => setMaterial(e.target.value)} className={inputClass} placeholder="e.g. PFD 96%" />
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              <input value={quantity} onChange={e => setQuantity(e.target.value)} className={inputClass} placeholder="e.g. 16.000 MT" />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Documents Enclosed</label>
              <input value={documentsEnclosed} onChange={e => setDocumentsEnclosed(e.target.value)} className={inputClass} placeholder="e.g. Invoice, E-Way Bill, LR & COA to Driver" />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Driver</h2>
            <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden">
              <button type="button" onClick={() => setDriverMode('select')}
                className={`px-3 py-1.5 font-semibold transition-colors ${driverMode === 'select' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                Registered Driver
              </button>
              <button type="button" onClick={() => { setDriverMode('new'); setDriverId(''); }}
                className={`px-3 py-1.5 font-semibold transition-colors ${driverMode === 'new' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                Type New Driver
              </button>
            </div>
          </div>

          {driverMode === 'select' ? (
            <div>
              <label className={labelClass}>Select Driver</label>
              <select value={driverId} onChange={e => selectDriver(e.target.value)} className={`${inputClass} bg-white`}>
                <option value="">— Choose a registered driver —</option>
                {drivers.filter(d => d.is_active).map(d => (
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
              <label className={labelClass}>Transporter Email</label>
              <input type="email" value={transporterEmail} onChange={e => setTransporterEmail(e.target.value)} className={inputClass} placeholder="for dispatch notification email" />
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

        {showSavePrompt && (
          <div className="flex items-center gap-3 border border-orange-200 bg-orange-50 rounded-xl px-4 py-3">
            <BookmarkPlus size={16} className="text-orange-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-700">Save this recipient for future orders?</p>
              <p className="text-[11px] text-gray-500">Booked For, Consignee &amp; Dispatch To are saved — shipment details are not.</p>
            </div>
            <input value={saveLabel} onChange={e => setSaveLabel(e.target.value)} placeholder={bookedForCompany}
              className="w-44 border border-orange-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:border-orange-400" />
            <button type="button" onClick={saveAsRecipient} disabled={savingRecipient}
              className="text-xs font-bold text-white bg-orange-500 rounded-lg px-3 py-2 hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {savingRecipient ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setSavePromptDismissed(true)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
        )}

        <div className="pt-2 flex gap-3">
          <Link href="/tracker/orders" className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-center">Cancel</Link>
          <button type="submit" disabled={saving} className="flex-1 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
