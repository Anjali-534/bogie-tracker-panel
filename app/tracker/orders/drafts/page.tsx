'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, FileEdit } from 'lucide-react';
import toast from 'react-hot-toast';
import { ScrollBody } from '@/components/TableControls';
import { api } from '@/lib/api';
import { ORDER_TYPE_LABELS, ORDER_TYPE_STYLES } from '@/lib/types';
import { type SavedDraft, loadDrafts, deleteDraft } from '@/lib/drafts';

// Drafts list — reuses the Shipments-list table/card styling (same orange
// header, same row treatment) but reads straight from localStorage rather
// than the API, since drafts (unlike real orders) never touch the backend
// until submitted. Keyed per company, same as the New Shipment page's
// draft read/write — see lib/drafts.ts.
export default function DraftsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [drafts,    setDrafts]    = useState<SavedDraft[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);

  useEffect(() => {
    api.get('/gogoo/tracker/company/profile')
      .then(({ data }) => {
        setCompanyId(data.id ?? null);
        if (data.id) setDrafts(loadDrafts(data.id));
      })
      .catch(() => toast.error('Failed to load drafts'))
      .finally(() => setLoading(false));
  }, []);

  function confirmDelete(id: string) {
    if (!companyId) return;
    deleteDraft(companyId, id);
    setDrafts(loadDrafts(companyId));
    setDeleteId(null);
    toast.success('Draft deleted');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Drafts</h1>
          <p className="text-xs text-gray-400">{drafts.length} saved draft{drafts.length === 1 ? '' : 's'}</p>
        </div>
        <Link href="/tracker/orders/new" className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
          <Plus size={14} />New Shipment
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : drafts.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-3xl mb-2">📝</p>
            <p className="text-gray-500 mb-4">No saved drafts yet</p>
            <Link href="/tracker/orders/new" className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
              <Plus size={14} />New Shipment
            </Link>
          </div>
        ) : (
          <>
          {/* Table — md: and above */}
          <div className="hidden md:block">
            <ScrollBody>
            <table className="w-full">
              <thead className="sticky top-0 z-10"><tr className="bg-orange-500">
                {['#','Draft','Type','Last Saved','Actions'].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-[11px] font-bold text-white uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {drafts.map((d, i) => (
                  <tr key={d.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-xs text-gray-400 font-medium">{i + 1}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900 text-sm">{d.label}</p>
                      {(d.data.dispatchFrom || d.data.dispatchTo) && (
                        <p className="text-xs text-gray-400">{d.data.dispatchFrom || '—'} → {d.data.dispatchTo || '—'}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${ORDER_TYPE_STYLES[d.data.orderType]}`}>
                        {ORDER_TYPE_LABELS[d.data.orderType]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-500">{new Date(d.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/tracker/orders/new?draft=${d.id}`} className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-800">
                          <FileEdit size={13} />Continue
                        </Link>
                        <button onClick={() => setDeleteId(d.id)} className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700">
                          <Trash2 size={13} />Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </ScrollBody>
          </div>

          {/* Card list — below md: */}
          <div className="md:hidden divide-y divide-gray-50">
            {drafts.map((d, i) => (
              <div key={d.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-400 font-medium">#{i + 1}</p>
                    <p className="font-semibold text-gray-900 text-sm truncate">{d.label}</p>
                    {(d.data.dispatchFrom || d.data.dispatchTo) && (
                      <p className="text-xs text-gray-400">{d.data.dispatchFrom || '—'} → {d.data.dispatchTo || '—'}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap flex-shrink-0 ${ORDER_TYPE_STYLES[d.data.orderType]}`}>
                    {ORDER_TYPE_LABELS[d.data.orderType]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <p className="text-gray-400">{new Date(d.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  <div className="flex items-center gap-3">
                    <Link href={`/tracker/orders/new?draft=${d.id}`} className="flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-800">
                      <FileEdit size={13} />Continue
                    </Link>
                    <button onClick={() => setDeleteId(d.id)} className="flex items-center gap-1 font-semibold text-red-500 hover:text-red-700">
                      <Trash2 size={13} />Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <p className="font-bold text-gray-900 mb-2">Delete this draft?</p>
            <p className="text-sm text-gray-500 mb-6">This can’t be undone — the saved form data will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => confirmDelete(deleteId)} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
