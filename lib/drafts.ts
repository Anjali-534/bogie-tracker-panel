import type { OrderPriority, OrderType } from './types';

// Multi-draft New Shipment storage. Replaces the old single-slot
// bogie-tracker-draft-order-<company_id> autosave key with a list of
// deliberately-created drafts under bogie-tracker-drafts-<company_id> — see
// app/tracker/orders/new/page.tsx (draft build/apply/save) and
// app/tracker/orders/drafts/page.tsx (the list/continue/delete UI).

export interface DraftFormData {
  orderType: OrderType;
  bookedForCompany: string; bookedForPhone: string; bookedForEmail: string; bookedForGstin: string; bookedForState: string;
  dispatchFrom: string; dispatchFromLat: number | null; dispatchFromLng: number | null;
  dispatchTo: string; dispatchToLat: number | null; dispatchToLng: number | null;
  transporterName: string; transporterPhone: string; transporterEmail: string; vehicleNumber: string; ewayBillNumber: string;
  consigneeName: string; consigneeEmail: string; consigneeGstin: string; consigneeState: string; material: string; quantity: string; documentsEnclosed: string;
  registeredAddress: string; factoryAddress: string; contactPersonName: string; contactPersonPhone: string; contactPersonEmail: string; contactPersonDesignation: string;
  priority: OrderPriority; expectedDeliveryDate: string; ccEmails: string[]; bccEmails: string[];
  driverMode: 'select' | 'new'; driverId: string; driverName: string; driverPhone: string;
}

export interface SavedDraft {
  id: string;
  created_at: string; // set on first save; unchanged by later silent updates
  updated_at: string;
  label: string; // auto-derived — see deriveDraftLabel
  data: DraftFormData;
}

const draftsKey = (companyId: string) => `bogie-tracker-drafts-${companyId}`;

export function loadDrafts(companyId: string): SavedDraft[] {
  try {
    const raw = localStorage.getItem(draftsKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(companyId: string, drafts: SavedDraft[]) {
  localStorage.setItem(draftsKey(companyId), JSON.stringify(drafts));
}

// "<Booked For value> · <Outbound/Inbound>", or "Untitled draft" if Booked
// For hasn't been filled in yet — same label shown in the Drafts list and
// the "Continuing draft" banner on New Shipment.
export function deriveDraftLabel(data: DraftFormData): string {
  const orderTypeLabel = data.orderType === 'inbound' ? 'Inbound' : 'Outbound';
  const party = data.bookedForCompany.trim();
  return party ? `${party} · ${orderTypeLabel}` : 'Untitled draft';
}

// Called by the New Shipment page's "Save Draft" button — always appends a
// new entry, even if the form was opened via ?draft=<id> (a deliberate save
// is a new snapshot, distinct from the silent in-place autosave that only
// happens while continuing a specific draft — see updateDraft below).
export function addDraft(companyId: string, data: DraftFormData): SavedDraft {
  const now = new Date().toISOString();
  const draft: SavedDraft = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
    updated_at: now,
    label: deriveDraftLabel(data),
    data,
  };
  const drafts = loadDrafts(companyId);
  drafts.unshift(draft);
  persist(companyId, drafts);
  return draft;
}

export function getDraft(companyId: string, draftId: string): SavedDraft | null {
  return loadDrafts(companyId).find(d => d.id === draftId) ?? null;
}

// Silent in-place update to the draft currently being continued (?draft=
// <id> on New Shipment) — does not create a new entry or touch created_at.
export function updateDraft(companyId: string, draftId: string, data: DraftFormData) {
  const drafts = loadDrafts(companyId);
  const idx = drafts.findIndex(d => d.id === draftId);
  if (idx === -1) return;
  drafts[idx] = { ...drafts[idx], data, label: deriveDraftLabel(data), updated_at: new Date().toISOString() };
  persist(companyId, drafts);
}

export function deleteDraft(companyId: string, draftId: string) {
  persist(companyId, loadDrafts(companyId).filter(d => d.id !== draftId));
}
