'use client';
// Saved recipients — company-wide "beneficiary list" for dispatch orders
// (backend migration 041). Owner and all staff share one list; this page is
// the manage UI (the order form has its own inline picker + save prompt).
// Edits always send the full payload — same shape as create (see the
// backend's trackerSavedRecipientReq).
import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import Pagination from '@/components/Pagination';
import { ScrollBody } from '@/components/TableControls';
import { api } from '@/lib/api';
import { type TrackerSavedRecipient } from '@/lib/types';
import LocationInput from '@/components/LocationInput';
import GSTInput from '@/components/GSTInput';

const PER_PAGE = 12;

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

const EMPTY = {
  label: '',
  booked_for_company_name: '', booked_for_phone: '', booked_for_email: '',
  booked_for_gstin: '', booked_for_state: '',
  consignee_name: '', consignee_email: '', consignee_gstin: '', consignee_state: '',
  dispatch_to: '', dispatch_to_lat: null as number | null, dispatch_to_lng: null as number | null,
};

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<TrackerSavedRecipient[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState<TrackerSavedRecipient | null>(null);
  const [form,       setForm]       = useState(EMPTY);
  const [saving,     setSaving]     = useState(false);
  const [deleteId,   setDeleteId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<TrackerSavedRecipient[]>('/gogoo/tracker/recipients');
      setRecipients(data);
    } catch {
      toast.error('Failed to load recipients');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.toLowerCase();
  const filtered = recipients.filter(r =>
    r.label.toLowerCase().includes(q) ||
    r.booked_for_company_name.toLowerCase().includes(q) ||
    r.booked_for_phone.includes(search) ||
    (r.dispatch_to ?? '').toLowerCase().includes(q)
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function openCreate() { setEditing(null); setForm(EMPTY); setShowModal(true); }
  function openEdit(r: TrackerSavedRecipient) {
    setEditing(r);
    setForm({
      label: r.label,
      booked_for_company_name: r.booked_for_company_name,
      booked_for_phone: r.booked_for_phone,
      booked_for_email: r.booked_for_email ?? '',
      booked_for_gstin: r.booked_for_gstin ?? '',
      booked_for_state: r.booked_for_state ?? '',
      consignee_name: r.consignee_name ?? '',
      consignee_email: r.consignee_email ?? '',
      consignee_gstin: r.consignee_gstin ?? '',
      consignee_state: r.consignee_state ?? '',
      dispatch_to: r.dispatch_to ?? '',
      dispatch_to_lat: r.dispatch_to_lat,
      dispatch_to_lng: r.dispatch_to_lng,
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.label || !form.booked_for_company_name || !form.booked_for_phone) {
      toast.error('Label, company name and phone are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        dispatch_to_lat: form.dispatch_to_lat ?? undefined,
        dispatch_to_lng: form.dispatch_to_lng ?? undefined,
      };
      if (editing) {
        await api.patch(`/gogoo/tracker/recipients/${editing.id}`, payload);
        toast.success('Recipient updated');
      } else {
        await api.post('/gogoo/tracker/recipients', payload);
        toast.success('Recipient added');
      }
      setShowModal(false);
      await load();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    try {
      await api.delete(`/gogoo/tracker/recipients/${id}`);
      toast.success('Recipient removed');
      setDeleteId(null);
      await load();
    } catch {
      toast.error('Delete failed');
    }
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Saved Recipients</h1>
          <p className="text-xs text-gray-400">{recipients.length} recipients — pre-fill Booked For, Consignee &amp; Dispatch To on new orders</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search label, company, phone…"
              className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 w-64" />
          </div>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors"><Plus size={14} />Add Recipient</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-3xl mb-2">📇</p>
            <p className="text-gray-500 mb-4">{recipients.length === 0 ? 'No saved recipients yet' : 'No recipients found'}</p>
            {recipients.length === 0 && (
              <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
                <Plus size={14} />Add your first recipient
              </button>
            )}
          </div>
        ) : (
          <ScrollBody>
          <table className="w-full">
            <thead className="sticky top-0 z-10"><tr className="bg-gray-50">
              {['#','Label','Booked For','Consignee','Dispatch To','Used','Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map((r, i) => (
                <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-xs text-gray-400 font-medium">{(page - 1) * PER_PAGE + i + 1}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900">{r.label}</td>
                  <td className="px-5 py-3">
                    <p className="text-xs text-gray-600">{r.booked_for_company_name}</p>
                    <p className="text-xs text-gray-400">{r.booked_for_phone}</p>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-600">{r.consignee_name || '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-600 max-w-56 truncate">{r.dispatch_to || '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{r.use_count > 0 ? `${r.use_count}×` : '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => setDeleteId(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </ScrollBody>
        )}
        <div className="px-5 py-3 border-t border-gray-100">
          <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
        </div>
      </div>

      {/* Create / edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Recipient' : 'Add New Recipient'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Label *</label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className={inputClass} placeholder='e.g. "Reliance Warehouse - Gurgaon"' />
              </div>

              <div className="col-span-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-2">Booked For</div>
              <div>
                <label className={labelClass}>Company Name *</label>
                <input value={form.booked_for_company_name} onChange={e => setForm(f => ({ ...f, booked_for_company_name: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Phone *</label>
                <input value={form.booked_for_phone} onChange={e => setForm(f => ({ ...f, booked_for_phone: e.target.value }))} className={inputClass} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" value={form.booked_for_email} onChange={e => setForm(f => ({ ...f, booked_for_email: e.target.value }))} className={inputClass} />
              </div>
              <GSTInput label="GSTIN" value={form.booked_for_gstin}
                onChange={v => setForm(f => ({ ...f, booked_for_gstin: v }))}
                onStateResolved={s => setForm(f => ({ ...f, booked_for_state: s }))} />
              <div className="col-span-2">
                <label className={labelClass}>State</label>
                <input value={form.booked_for_state} onChange={e => setForm(f => ({ ...f, booked_for_state: e.target.value }))} className={inputClass} placeholder="Auto-filled from GSTIN, or type manually" />
              </div>

              <div className="col-span-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-2">Consignee <span className="font-normal normal-case">(optional)</span></div>
              <div>
                <label className={labelClass}>Name</label>
                <input value={form.consignee_name} onChange={e => setForm(f => ({ ...f, consignee_name: e.target.value }))} className={inputClass} placeholder="If different from Booked For" />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" value={form.consignee_email} onChange={e => setForm(f => ({ ...f, consignee_email: e.target.value }))} className={inputClass} />
              </div>
              <GSTInput label="GSTIN" value={form.consignee_gstin}
                onChange={v => setForm(f => ({ ...f, consignee_gstin: v }))}
                onStateResolved={s => setForm(f => ({ ...f, consignee_state: s }))} />
              <div>
                <label className={labelClass}>State</label>
                <input value={form.consignee_state} onChange={e => setForm(f => ({ ...f, consignee_state: e.target.value }))} className={inputClass} />
              </div>

              <div className="col-span-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-2">Destination <span className="font-normal normal-case">(optional)</span></div>
              <div className="col-span-2">
                <LocationInput
                  label="Dispatch To"
                  value={form.dispatch_to}
                  onChange={(address, lat, lng) => setForm(f => ({ ...f, dispatch_to: address, dispatch_to_lat: lat, dispatch_to_lng: lng }))}
                  placeholder="Search for an address or city"
                  className={inputClass}
                  labelClassName={labelClass}
                />
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : editing ? 'Update Recipient' : 'Add Recipient'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-96 text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <p className="font-bold text-gray-900 mb-2">Remove this recipient?</p>
            <p className="text-sm text-gray-500 mb-6">Existing orders are not affected — recipients only pre-fill the new-order form.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => del(deleteId)} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
