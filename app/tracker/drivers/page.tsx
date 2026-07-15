'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, Upload, Download, Pencil, Trash2, X } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import Pagination from '@/components/Pagination';
import { ScrollBody } from '@/components/TableControls';
import { api } from '@/lib/api';
import { type TrackerDriver } from '@/lib/types';

const PER_PAGE = 12;

const EMPTY = {
  driver_name: '', phone: '', vehicle_number: '',
  transporter_name: '', transporter_phone: '',
};

export default function DriversPage() {
  const [drivers,        setDrivers]        = useState<TrackerDriver[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [page,           setPage]           = useState(1);
  const [showInactive,   setShowInactive]   = useState(false);
  const [showModal,      setShowModal]      = useState(false);
  const [editing,        setEditing]        = useState<TrackerDriver | null>(null);
  const [form,           setForm]           = useState(EMPTY);
  const [saving,         setSaving]         = useState(false);
  const [deleteId,       setDeleteId]       = useState<string | null>(null);
  const [importing,      setImporting]      = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<TrackerDriver[]>('/gogoo/tracker/drivers', {
        params: showInactive ? { include_inactive: 'true' } : undefined,
      });
      setDrivers(data);
    } catch {
      toast.error('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const filtered = drivers.filter(d =>
    d.driver_name.toLowerCase().includes(search.toLowerCase()) ||
    d.phone.includes(search) ||
    d.vehicle_number.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function openCreate() { setEditing(null); setForm(EMPTY); setShowModal(true); }
  function openEdit(d: TrackerDriver) {
    setEditing(d);
    setForm({ driver_name: d.driver_name, phone: d.phone, vehicle_number: d.vehicle_number,
      transporter_name: d.transporter_name, transporter_phone: d.transporter_phone });
    setShowModal(true);
  }

  async function save() {
    if (!form.driver_name || !form.phone) { toast.error('Name and phone required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/gogoo/tracker/drivers/${editing.id}`, form);
        toast.success('Driver updated');
      } else {
        await api.post('/gogoo/tracker/drivers', form);
        toast.success('Driver added');
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
      await api.delete(`/gogoo/tracker/drivers/${id}`);
      toast.success('Driver deactivated');
      setDeleteId(null);
      await load();
    } catch {
      toast.error('Deactivate failed');
    }
  }

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(drivers.map(d => ({
      Name: d.driver_name, Phone: d.phone, Vehicle: d.vehicle_number,
      Transporter: d.transporter_name, TransporterPhone: d.transporter_phone, Active: d.is_active,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
    XLSX.writeFile(wb, `bogie_tracker_drivers_${Date.now()}.xlsx`);
    toast.success('Exported!');
  }

  async function importXLSX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async evt => {
      const wb  = XLSX.read(evt.target?.result, { type: 'binary' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as Record<string, string>[];
      const valid = rows.filter(r => r.Name && r.Phone);
      let ok = 0;
      for (const r of valid) {
        try {
          await api.post('/gogoo/tracker/drivers', {
            driver_name: r.Name,
            phone: String(r.Phone),
            vehicle_number: r.Vehicle || '',
            transporter_name: r.Transporter || '',
            transporter_phone: r.TransporterPhone || '',
          });
          ok++;
        } catch {
          // continue importing the rest even if one row fails
        }
      }
      toast.success(`Imported ${ok}/${rows.length} drivers`);
      setImporting(false);
      await load();
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  return (
    <div className="space-y-5">
      <Toaster position="top-right" />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Driver Management</h1>
          <p className="text-xs text-gray-400">{drivers.length} drivers</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 font-medium px-1">
            <input type="checkbox" checked={showInactive} onChange={e => { setShowInactive(e.target.checked); setPage(1); }} />
            Show inactive
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, phone, vehicle…"
              className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 w-64" />
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importXLSX} />
          <button onClick={() => fileRef.current?.click()} disabled={importing} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"><Upload size={14} />{importing ? 'Importing…' : 'Import'}</button>
          <button onClick={exportXLSX} className="flex items-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"><Download size={14} />Export</button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors"><Plus size={14} />Add Driver</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-3xl mb-2">🚛</p>
            <p className="text-gray-500 mb-4">{drivers.length === 0 ? 'No drivers registered yet' : 'No drivers found'}</p>
            {drivers.length === 0 && (
              <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
                <Plus size={14} />Add your first driver
              </button>
            )}
          </div>
        ) : (
          <ScrollBody>
          <table className="w-full">
            <thead className="sticky top-0 z-10"><tr className="bg-gray-50">
              {['#','Driver','Vehicle','Transporter','Status','Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {paged.map((d, i) => (
                <tr key={d.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-xs text-gray-400 font-medium">{(page - 1) * PER_PAGE + i + 1}</td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-900 text-sm">{d.driver_name}</p>
                    <p className="text-xs text-gray-400">{d.phone}</p>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-600">{d.vehicle_number || '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-600">
                    <p>{d.transporter_name || '—'}</p>
                    {d.transporter_phone && <p className="text-gray-400">{d.transporter_phone}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {d.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors"><Pencil size={14} /></button>
                      {d.is_active && (
                        <button onClick={() => setDeleteId(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"><Trash2 size={14} /></button>
                      )}
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Driver' : 'Add New Driver'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Driver Name *</label>
                <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone *</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400" placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Vehicle Number</label>
                <input value={form.vehicle_number} onChange={e => setForm(f => ({ ...f, vehicle_number: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400" placeholder="DL 1AB 1234" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Transporter Name</label>
                <input value={form.transporter_name} onChange={e => setForm(f => ({ ...f, transporter_name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Transporter Phone</label>
                <input value={form.transporter_phone} onChange={e => setForm(f => ({ ...f, transporter_phone: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400" />
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : editing ? 'Update Driver' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-96 text-center">
            <p className="text-4xl mb-3">🚫</p>
            <p className="font-bold text-gray-900 mb-2">Deactivate this driver?</p>
            <p className="text-sm text-gray-500 mb-6">They won&apos;t appear when creating new orders. Existing orders keep their driver details.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => del(deleteId)} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors">Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
