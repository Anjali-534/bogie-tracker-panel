'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, BookmarkPlus, RotateCcw, Upload, X, FileText, Save } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { api } from '@/lib/api';
import { type TrackerDriver, type TrackerOrder, type TrackerSavedRecipient, type OrderPriority, type TrackerDocType, type OrderType, PRIORITY_LABELS, ORDER_TYPE_LABELS } from '@/lib/types';
import LocationInput from '@/components/LocationInput';
import GSTInput from '@/components/GSTInput';
import { lookupGSTIN } from '@/lib/gstin';

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';
const sectionClass = 'space-y-4 border-l-[3px] border-orange-200 bg-orange-50/40 rounded-r-2xl pl-5 pr-4 py-5';

export default function NewOrderPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [drivers, setDrivers] = useState<TrackerDriver[]>([]);

  // "Add another stop" (backend migration 055) — present when this page was
  // opened as /tracker/orders/new?trip_id=<id> from the order detail page's
  // "+ Add another stop" button. Read via window.location.search rather
  // than useSearchParams so this page doesn't need a Suspense boundary
  // wrapper just for one query param.
  //
  // Both tripId and editId MUST start out null and only get set from a
  // useEffect (client-only, post-mount) — not from a useState(() => ...)
  // lazy initializer that reads window.location.search directly. This page
  // is server-rendered; a lazy initializer would compute null on the server
  // (no window) but the real id on the client's first render, so editMode/
  // tripLocked would drive different JSX (whole sections — Saved Clients,
  // Upload Documents, driver-mode toggle, Save Draft, submit button label —
  // present on one side and not the other) between the server-rendered HTML
  // and the client's hydration pass. That's a structural hydration mismatch,
  // not just a text diff, and was the actual cause of a real bug: opening
  // ?edit=<id> rendered the blank/default "New Shipment" state because
  // hydration never reconciled to the client's edit-mode tree. Setting
  // these from an effect keeps the first client render identical to the
  // server's (both null/blank), so hydration is clean; the real values land
  // a moment later via a normal, safe post-hydration state update.
  const [tripId, setTripId] = useState<string | null>(null);
  const tripLocked = tripId !== null;

  // Edit flow — /tracker/orders/new?edit=<order_id>, opened from the order
  // detail page's Edit button (only shown while status is created/loading;
  // the backend's status guard on PATCH /details enforces the same window
  // server-side, including for the race where status changes mid-edit).
  const [editId, setEditId] = useState<string | null>(null);
  const editMode = editId !== null;

  // Draft autosave (New Shipment only — not while editing an existing
  // order, and not while adding a trip stop, both of which already have
  // their own source of truth). Keyed per company since localStorage is
  // shared across whichever company is currently logged into this browser.
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftKey = (cid: string) => `bogie-tracker-draft-order-${cid}`;

  const [orderType, setOrderType] = useState<OrderType>('outbound');
  // The company's own address (Settings → Default Company Address), used to
  // prefill Deliver To once orderType flips to 'inbound' — see the effect
  // below. Fetched once on mount alongside drivers/recipients.
  const [companyDefaultAddress,    setCompanyDefaultAddress]    = useState('');
  const [companyDefaultAddressLat, setCompanyDefaultAddressLat] = useState<number | null>(null);
  const [companyDefaultAddressLng, setCompanyDefaultAddressLng] = useState<number | null>(null);
  // Read-only "Bill From"/"Bill To" identity for whichever side is the
  // company's own — not submitted anywhere on order creation (the order is
  // already scoped to company_id), purely informational. State is derived
  // client-side from the company's own GSTIN (same lookupGSTIN used by
  // GSTInput) since the profile endpoint doesn't store state separately.
  const [companyName,  setCompanyName]  = useState('');
  const [companyGstin, setCompanyGstin] = useState('');
  const [companyState, setCompanyState] = useState('');

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

  const [consigneeName,       setConsigneeName]       = useState('');
  const [consigneeEmail,      setConsigneeEmail]      = useState('');
  const [consigneeGstin,      setConsigneeGstin]      = useState('');
  const [consigneeState,      setConsigneeState]      = useState('');
  const [material,            setMaterial]            = useState('');
  const [quantity,             setQuantity]           = useState('');
  const [documentsEnclosed,    setDocumentsEnclosed]  = useState('');

  // Shipment-detail expansion (Phase 1) — registered/factory address and
  // contact person are informational text, not route waypoints, so plain
  // inputs rather than LocationInput (which drives Ola autocomplete + route
  // caching for dispatch_from/dispatch_to specifically).
  const [registeredAddress,        setRegisteredAddress]        = useState('');
  const [factoryAddress,           setFactoryAddress]           = useState('');
  const [contactPersonName,        setContactPersonName]        = useState('');
  const [contactPersonPhone,       setContactPersonPhone]       = useState('');
  const [contactPersonEmail,       setContactPersonEmail]       = useState('');
  const [contactPersonDesignation, setContactPersonDesignation] = useState('');
  const [priority,                 setPriority]                 = useState<OrderPriority>('normal');
  const [expectedDeliveryDate,     setExpectedDeliveryDate]     = useState('');
  const [ccEmails,                 setCcEmails]                 = useState<string[]>([]);
  const [bccEmails,                setBccEmails]                = useState<string[]>([]);

  // Document restructure (Phase 2) — the order doesn't exist yet on this
  // page, so documents are staged locally and uploaded one by one to
  // POST /tracker/orders/:id/documents right after order creation succeeds
  // (same "create order, then attach files" pattern the old single e-way-
  // bill upload used). Every doc_type is always optional.
  interface PendingDoc { key: string; docType: TrackerDocType; customLabel: string; file: File }
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);

  function addPendingDoc(file: File) {
    const dotIndex = file.name.lastIndexOf('.');
    const defaultLabel = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
    setPendingDocs(prev => [...prev, { key: `${Date.now()}-${Math.random()}`, docType: 'other', customLabel: defaultLabel, file }]);
  }
  function updatePendingDoc(key: string, patch: Partial<PendingDoc>) {
    setPendingDocs(prev => prev.map(d => d.key === key ? { ...d, ...patch } : d));
  }
  function removePendingDoc(key: string) {
    setPendingDocs(prev => prev.filter(d => d.key !== key));
  }

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

  // Full prefill for the Edit flow — mirrors repeatLastOrder() but covers
  // every field the PATCH /details endpoint accepts (eway bill, CC/BCC,
  // expected delivery date, order type), since this is editing the order
  // itself rather than seeding a new one. Driver is always treated as free
  // text here (driverMode 'new'): PATCH /details only accepts driver_name/
  // driver_phone snapshot fields, never a driver_id reassignment, so there's
  // no "select a different registered driver" affordance in edit mode.
  function applyOrderForEdit(o: TrackerOrder) {
    setOrderType(o.order_type);
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
    setEwayBillNumber(o.eway_bill_number ?? '');
    setDriverMode('new');
    setDriverName(o.driver_name ?? '');
    setDriverPhone(o.driver_phone ?? '');
    setRegisteredAddress(o.registered_address ?? '');
    setFactoryAddress(o.factory_address ?? '');
    setContactPersonName(o.contact_person_name ?? '');
    setContactPersonPhone(o.contact_person_phone ?? '');
    setContactPersonEmail(o.contact_person_email ?? '');
    setContactPersonDesignation(o.contact_person_designation ?? '');
    setPriority(o.priority ?? 'normal');
    setExpectedDeliveryDate(o.expected_delivery_date ? o.expected_delivery_date.slice(0, 10) : '');
    setCcEmails(o.cc_emails ?? []);
    setBccEmails(o.bcc_emails ?? []);
  }

  // Draft snapshot — every field a plain "New Shipment" fills in, minus
  // pendingDocs (File objects can't survive JSON/localStorage) and anything
  // tied to a specific trip/edit context.
  function buildDraft() {
    return {
      orderType, bookedForCompany, bookedForPhone, bookedForEmail, bookedForGstin, bookedForState,
      dispatchFrom, dispatchFromLat, dispatchFromLng, dispatchTo, dispatchToLat, dispatchToLng,
      transporterName, transporterPhone, transporterEmail, vehicleNumber, ewayBillNumber,
      consigneeName, consigneeEmail, consigneeGstin, consigneeState, material, quantity, documentsEnclosed,
      registeredAddress, factoryAddress, contactPersonName, contactPersonPhone, contactPersonEmail, contactPersonDesignation,
      priority, expectedDeliveryDate, ccEmails, bccEmails,
      driverMode, driverId, driverName, driverPhone,
    };
  }
  type DraftShape = ReturnType<typeof buildDraft>;

  function applyDraft(d: Partial<DraftShape>) {
    if (d.orderType !== undefined) setOrderType(d.orderType);
    if (d.bookedForCompany !== undefined) setBookedForCompany(d.bookedForCompany);
    if (d.bookedForPhone !== undefined) setBookedForPhone(d.bookedForPhone);
    if (d.bookedForEmail !== undefined) setBookedForEmail(d.bookedForEmail);
    if (d.bookedForGstin !== undefined) setBookedForGstin(d.bookedForGstin);
    if (d.bookedForState !== undefined) setBookedForState(d.bookedForState);
    if (d.dispatchFrom !== undefined) setDispatchFrom(d.dispatchFrom);
    if (d.dispatchFromLat !== undefined) setDispatchFromLat(d.dispatchFromLat);
    if (d.dispatchFromLng !== undefined) setDispatchFromLng(d.dispatchFromLng);
    if (d.dispatchTo !== undefined) setDispatchTo(d.dispatchTo);
    if (d.dispatchToLat !== undefined) setDispatchToLat(d.dispatchToLat);
    if (d.dispatchToLng !== undefined) setDispatchToLng(d.dispatchToLng);
    if (d.transporterName !== undefined) setTransporterName(d.transporterName);
    if (d.transporterPhone !== undefined) setTransporterPhone(d.transporterPhone);
    if (d.transporterEmail !== undefined) setTransporterEmail(d.transporterEmail);
    if (d.vehicleNumber !== undefined) setVehicleNumber(d.vehicleNumber);
    if (d.ewayBillNumber !== undefined) setEwayBillNumber(d.ewayBillNumber);
    if (d.consigneeName !== undefined) setConsigneeName(d.consigneeName);
    if (d.consigneeEmail !== undefined) setConsigneeEmail(d.consigneeEmail);
    if (d.consigneeGstin !== undefined) setConsigneeGstin(d.consigneeGstin);
    if (d.consigneeState !== undefined) setConsigneeState(d.consigneeState);
    if (d.material !== undefined) setMaterial(d.material);
    if (d.quantity !== undefined) setQuantity(d.quantity);
    if (d.documentsEnclosed !== undefined) setDocumentsEnclosed(d.documentsEnclosed);
    if (d.registeredAddress !== undefined) setRegisteredAddress(d.registeredAddress);
    if (d.factoryAddress !== undefined) setFactoryAddress(d.factoryAddress);
    if (d.contactPersonName !== undefined) setContactPersonName(d.contactPersonName);
    if (d.contactPersonPhone !== undefined) setContactPersonPhone(d.contactPersonPhone);
    if (d.contactPersonEmail !== undefined) setContactPersonEmail(d.contactPersonEmail);
    if (d.contactPersonDesignation !== undefined) setContactPersonDesignation(d.contactPersonDesignation);
    if (d.priority !== undefined) setPriority(d.priority);
    if (d.expectedDeliveryDate !== undefined) setExpectedDeliveryDate(d.expectedDeliveryDate);
    if (d.ccEmails !== undefined) setCcEmails(d.ccEmails);
    if (d.bccEmails !== undefined) setBccEmails(d.bccEmails);
    if (d.driverMode !== undefined) setDriverMode(d.driverMode);
    if (d.driverId !== undefined) setDriverId(d.driverId);
    if (d.driverName !== undefined) setDriverName(d.driverName);
    if (d.driverPhone !== undefined) setDriverPhone(d.driverPhone);
  }

  function discardDraft() {
    if (companyId) localStorage.removeItem(draftKey(companyId));
    setDraftRestored(false);
    window.location.href = '/tracker/orders/new';
  }

  function saveDraftNow() {
    if (!companyId) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    localStorage.setItem(draftKey(companyId), JSON.stringify(buildDraft()));
    toast.success('Draft saved');
  }

  useEffect(() => {
    // Read the URL once, here (client-only, post-hydration) rather than at
    // initial state — see the tripId/editId declarations above for why.
    // Local consts, not the (still-null-on-this-first-run) tripId/editId
    // state, drive everything below; setTripId/setEditId just update state
    // for rendering (editMode/tripLocked).
    const params = new URLSearchParams(window.location.search);
    const tid = params.get('trip_id');
    const eid = params.get('edit');
    /* eslint-disable react-hooks/set-state-in-effect --
       Deliberate: this is the fix for a real hydration-mismatch bug (see
       comment on the tripId/editId useState calls above), not the
       anti-pattern this rule normally flags. There is no way to read
       window.location.search into state without a client-only effect while
       keeping the server render and the first client render identical. */
    setTripId(tid);
    setEditId(eid);
    /* eslint-enable react-hooks/set-state-in-effect */

    api.get<TrackerDriver[]>('/gogoo/tracker/drivers')
      .then(({ data }) => setDrivers(data))
      .catch(() => toast.error('Failed to load drivers'));
    api.get<TrackerSavedRecipient[]>('/gogoo/tracker/recipients')
      .then(({ data }) => setRecipients(data))
      .catch(() => {});
    api.get<TrackerOrder[]>('/gogoo/tracker/orders')
      .then(({ data }) => setLastOrderId(data[0]?.id ?? null))
      .catch(() => {});

    api.get('/gogoo/tracker/company/profile')
      .then(({ data }) => {
        setCompanyDefaultAddress(data.default_address ?? '');
        setCompanyDefaultAddressLat(data.default_address_lat ?? null);
        setCompanyDefaultAddressLng(data.default_address_lng ?? null);
        setCompanyName(data.company_name ?? '');
        const gstin = data.gstin ?? '';
        setCompanyGstin(gstin);
        if (gstin) setCompanyState(lookupGSTIN(gstin).state ?? '');
        setCompanyId(data.id ?? null);

        // Draft restore only applies to a genuinely blank New Shipment —
        // never when opened via ?trip_id= or ?edit=, both of which have
        // their own prefill source that would otherwise get clobbered.
        if (!tid && !eid && data.id) {
          const raw = localStorage.getItem(draftKey(data.id));
          if (raw) {
            try {
              applyDraft(JSON.parse(raw));
              setDraftRestored(true);
            } catch {
              localStorage.removeItem(draftKey(data.id));
            }
          }
        }
      })
      .catch(() => {});

    if (eid) {
      api.get<{ order: TrackerOrder }>(`/gogoo/tracker/orders/${eid}`)
        .then(({ data }) => applyOrderForEdit(data.order))
        .catch(() => toast.error('Failed to load shipment for editing'));
    } else if (tid) {
      api.get(`/gogoo/tracker/trips/${tid}`)
        .then(({ data }) => {
          setVehicleNumber(data.vehicle_number ?? '');
          // Always 'select' mode when locked — this never re-registers a
          // driver via "Type New Driver" on submit (see submit()), and the
          // server ignores whatever driver_id this sends anyway once
          // trip_id is present (copied from the trip row instead — see
          // CreateTrackerCompanyOrder). driver_id may be null (driver was
          // left blank on an earlier stop); that's fine, nothing to lock to.
          setDriverMode('select');
          setDriverId(data.driver_id ?? '');
          setDriverName(data.driver_name ?? '');
          setDriverPhone(data.driver_phone ?? '');
          const stops = data.stops ?? [];
          const lastStop = stops[stops.length - 1];
          if (lastStop) setDispatchFrom(lastStop.dispatch_to);
        })
        .catch(() => toast.error('Failed to load trip details'));
    }
  }, []);

  // Debounced autosave (~1.5s after the last keystroke) — New Shipment
  // only, see editMode/tripLocked guard. Every dependency below is a field
  // buildDraft() reads; keep the two lists in sync.
  useEffect(() => {
    if (!companyId || editMode || tripLocked) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      localStorage.setItem(draftKey(companyId), JSON.stringify(buildDraft()));
    }, 1500);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [
    companyId, editMode, tripLocked,
    orderType, bookedForCompany, bookedForPhone, bookedForEmail, bookedForGstin, bookedForState,
    dispatchFrom, dispatchFromLat, dispatchFromLng, dispatchTo, dispatchToLat, dispatchToLng,
    transporterName, transporterPhone, transporterEmail, vehicleNumber, ewayBillNumber,
    consigneeName, consigneeEmail, consigneeGstin, consigneeState, material, quantity, documentsEnclosed,
    registeredAddress, factoryAddress, contactPersonName, contactPersonPhone, contactPersonEmail, contactPersonDesignation,
    priority, expectedDeliveryDate, ccEmails, bccEmails,
    driverMode, driverId, driverName, driverPhone,
  ]);

  // Inbound orders deliver back to the company itself — prefill Deliver To
  // from the company's default address the moment the toggle flips to
  // 'inbound', but only if the field is still empty (never clobber
  // something the user already typed, or a value carried over from
  // "Repeat last shipment"). Outbound orders mirror this for Dispatch From
  // (they typically originate from the company's own address) — including
  // on initial mount, since 'outbound' is the default orderType and
  // prevOrderType starts as null (not 'outbound'), so the mount case reads
  // as a "flip into outbound" too. Each direction fires once per flip
  // (tracked via prevOrderType, not a dispatchTo/dispatchFrom dependency)
  // so clearing the field back out afterward doesn't immediately re-fill it
  // — still fully editable, same as these fields always are.
  const prevOrderType = useRef<OrderType | null>(null);
  useEffect(() => {
    if (orderType === 'inbound' && prevOrderType.current === 'outbound' && dispatchTo === '' && companyDefaultAddress !== '') {
      setDispatchTo(companyDefaultAddress);
      setDispatchToLat(companyDefaultAddressLat);
      setDispatchToLng(companyDefaultAddressLng);
    }
    if (orderType === 'outbound' && prevOrderType.current !== 'outbound' && dispatchFrom === '' && companyDefaultAddress !== '') {
      setDispatchFrom(companyDefaultAddress);
      setDispatchFromLat(companyDefaultAddressLat);
      setDispatchFromLng(companyDefaultAddressLng);
    }
    prevOrderType.current = orderType;
  }, [orderType, companyDefaultAddress, companyDefaultAddressLat, companyDefaultAddressLng, dispatchTo, dispatchFrom]);

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
    setRegisteredAddress(r.registered_address ?? '');
    setFactoryAddress(r.factory_address ?? '');
    setContactPersonName(r.contact_person_name ?? '');
    setContactPersonPhone(r.contact_person_phone ?? '');
    setContactPersonEmail(r.contact_person_email ?? '');
    setContactPersonDesignation(r.contact_person_designation ?? '');
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
        registered_address: registeredAddress || undefined,
        factory_address: factoryAddress || undefined,
        contact_person_name: contactPersonName || undefined,
        contact_person_phone: contactPersonPhone || undefined,
        contact_person_email: contactPersonEmail || undefined,
        contact_person_designation: contactPersonDesignation || undefined,
      });
      setRecipients(prev => [...prev, data]);
      // The just-saved recipient counts as "used" for this order too.
      setSelectedRecipientId(data.id);
      setRecipientQuery(data.label);
      setSaveLabel('');
      toast.success(`Saved "${data.label}" for future shipments`);
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
  // the e-way bill number/file (always unique per dispatch).
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
      setRegisteredAddress(o.registered_address ?? '');
      setFactoryAddress(o.factory_address ?? '');
      setContactPersonName(o.contact_person_name ?? '');
      setContactPersonPhone(o.contact_person_phone ?? '');
      setContactPersonEmail(o.contact_person_email ?? '');
      setContactPersonDesignation(o.contact_person_designation ?? '');
      setPriority(o.priority ?? 'normal');
      // Expected delivery date is deliberately NOT carried over — same
      // footgun as the e-way bill, a stale delivery date silently reused
      // would be worse than an empty field.
      toast.success('Prefilled from your last shipment — e-way bill & delivery date start fresh');
    } catch {
      toast.error('Failed to load your last shipment');
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

    if (editMode) {
      try {
        // PATCH /details round-trips the whole dispatch-sheet field set
        // (same contract the order detail page's inline EditableField uses)
        // — driver here is always the free-text snapshot, never a driver_id
        // reassignment (see applyOrderForEdit).
        await api.patch(`/gogoo/tracker/orders/${editId}/details`, {
          booked_for_company_name: bookedForCompany,
          booked_for_phone: bookedForPhone,
          dispatch_from: dispatchFrom,
          dispatch_to: dispatchTo,
          transporter_name: transporterName || undefined,
          transporter_phone: transporterPhone || undefined,
          transporter_email: transporterEmail || undefined,
          driver_name: driverName || undefined,
          driver_phone: driverPhone || undefined,
          vehicle_number: vehicleNumber,
          eway_bill_number: ewayBillNumber || undefined,
          consignee_name: consigneeName || undefined,
          material: material || undefined,
          quantity: quantity || undefined,
          documents_enclosed: documentsEnclosed || undefined,
          booked_for_email: bookedForEmail || undefined,
          consignee_email: consigneeEmail || undefined,
          consignee_gstin: consigneeGstin || undefined,
          booked_for_gstin: bookedForGstin || undefined,
          consignee_state: consigneeState || undefined,
          booked_for_state: bookedForState || undefined,
          registered_address: registeredAddress || undefined,
          factory_address: factoryAddress || undefined,
          contact_person_name: contactPersonName || undefined,
          contact_person_phone: contactPersonPhone || undefined,
          contact_person_email: contactPersonEmail || undefined,
          contact_person_designation: contactPersonDesignation || undefined,
          priority,
          expected_delivery_date: expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString() : undefined,
          cc_emails: ccEmails.filter(e => e.trim() !== ''),
          bcc_emails: bccEmails.filter(e => e.trim() !== ''),
        });
        toast.success('Shipment updated');
        router.push(`/tracker/orders/${editId}`);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
          const body = err.response.data as { error?: string };
          if (err.response.status === 409) {
            // Race condition: someone dispatched this order while it was
            // being edited — the backend's status guard rejected the write.
            // Surface that distinctly rather than a generic failure toast.
            toast.error(body.error || 'This shipment was dispatched while you were editing it and can no longer be changed.', { duration: 6000 });
          } else {
            toast.error(body.error || 'Failed to update shipment');
          }
        } else {
          toast.error('Connection failed. Try again.');
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      // "Type New Driver" registers the driver first (so they're on the
      // roster for future orders too — same as the Drivers page), then
      // links the order to that new driver_id. The backend only accepts an
      // existing driver_id on order creation, not free-text driver details.
      let linkedDriverId: string | undefined = driverMode === 'select' ? (driverId || undefined) : undefined;
      if (driverMode === 'new' && !tripLocked) {
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
        order_type: orderType,
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
        documents_enclosed: documentsEnclosed || undefined,
        registered_address: registeredAddress || undefined,
        factory_address: factoryAddress || undefined,
        contact_person_name: contactPersonName || undefined,
        contact_person_phone: contactPersonPhone || undefined,
        contact_person_email: contactPersonEmail || undefined,
        contact_person_designation: contactPersonDesignation || undefined,
        priority,
        expected_delivery_date: expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString() : undefined,
        cc_emails: ccEmails.filter(e => e.trim() !== ''),
        bcc_emails: bccEmails.filter(e => e.trim() !== ''),
        trip_id: tripId || undefined,
      });

      if (pendingDocs.length > 0) {
        let failed = 0;
        for (const doc of pendingDocs) {
          const form = new FormData();
          form.append('file', doc.file);
          form.append('doc_type', doc.docType);
          if (doc.docType === 'other' && doc.customLabel) form.append('custom_label', doc.customLabel);
          try {
            await api.post(`/gogoo/tracker/orders/${order.id}/documents`, form);
          } catch {
            failed++;
          }
        }
        if (failed > 0) {
          toast.error(`Shipment created, but ${failed} document${failed > 1 ? 's' : ''} failed to upload — you can retry from the shipment page`);
        }
      }

      // Fire-and-forget: the backend builds the email (with whatever
      // documents made it) and sends it async — this call doesn't block
      // navigation and its result is never surfaced to the user.
      api.post(`/gogoo/tracker/orders/${order.id}/creation-email`).catch(() => {});

      // Draft's job is done — clear it so a future New Shipment visit
      // starts blank instead of restoring this now-submitted data.
      if (companyId) localStorage.removeItem(draftKey(companyId));

      toast.success(tripLocked ? 'Stop added to trip' : 'Shipment created');
      router.push(`/tracker/orders/${order.id}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to create shipment');
      } else {
        toast.error('Connection failed. Try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  // The Bill From / Bill To quadrants swap content by orderType (see Route
  // section below) but never both appear at once, so these are safe to
  // define once and place in whichever slot applies.
  const companyBillBlock = (
    <div className="space-y-3">
      <div>
        <span className={labelClass}>Name</span>
        <p className="text-sm font-semibold text-gray-800">{companyName || '—'}</p>
      </div>
      <div>
        <span className={labelClass}>GSTIN</span>
        <p className="text-sm font-semibold text-gray-800">{companyGstin || '—'}</p>
      </div>
      <div>
        <span className={labelClass}>State</span>
        <p className="text-sm font-semibold text-gray-800">{companyState || '—'}</p>
      </div>
    </div>
  );

  const otherPartyBlock = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className={labelClass}>{orderType === 'inbound' ? 'Supplier / Vendor Name *' : 'Party Name *'}</label>
        <input value={bookedForCompany} onChange={e => setBookedForCompany(e.target.value)} className={inputClass} placeholder={orderType === 'inbound' ? 'Supplier / vendor name' : 'Receiving company name'} />
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
  );

  return (
    <div className="max-w-[1600px] w-full space-y-5">
      <Toaster position="top-right" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 flex-1">
          <Link href="/tracker/orders" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{editMode ? 'Edit Shipment' : tripLocked ? 'Add Another Stop' : 'New Shipment'}</h1>
            <p className="text-xs text-gray-400">{editMode ? 'Update the dispatch sheet for this shipment' : tripLocked ? 'Same truck, next drop on this trip' : 'Create a new shipment'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex text-xs rounded-lg border border-gray-200 overflow-hidden ${editMode ? 'opacity-50 pointer-events-none' : ''}`} title={editMode ? 'Order type can’t be changed once a shipment exists' : undefined}>
            {(['outbound', 'inbound'] as OrderType[]).map(t => (
              <button key={t} type="button" onClick={() => setOrderType(t)} disabled={editMode}
                className={`px-3 py-1.5 font-semibold transition-colors ${orderType === t ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                {ORDER_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          {!editMode && lastOrderId && (
            <button type="button" onClick={repeatLastOrder} disabled={repeating}
              className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 border border-orange-200 rounded-lg px-3 py-2 hover:bg-orange-50 disabled:opacity-50 transition-colors">
              <RotateCcw size={13} />{repeating ? 'Loading…' : 'Repeat last shipment'}
            </button>
          )}
        </div>
      </div>

      {draftRestored && !editMode && (
        <div className="flex flex-wrap items-center gap-3 border border-blue-200 bg-blue-50 rounded-xl px-4 py-3">
          <p className="flex-1 min-w-[200px] text-xs font-semibold text-blue-700">Draft restored from your last session</p>
          <button type="button" onClick={discardDraft} className="text-xs font-bold text-blue-700 hover:text-blue-900">Discard</button>
        </div>
      )}

      <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-6 lg:p-10 space-y-6">

        {!editMode && orderType === 'outbound' && recipients.length > 0 && (
          <section className={sectionClass}>
            <h2 className="text-sm font-bold text-gray-900">Saved Clients <span className="text-gray-400 font-normal">(optional)</span></h2>
            <div className="relative">
              <input
                value={recipientQuery}
                onChange={e => { setRecipientQuery(e.target.value); setRecipientListOpen(true); setSelectedRecipientId(null); }}
                onFocus={() => setRecipientListOpen(true)}
                onBlur={() => setRecipientListOpen(false)}
                className={inputClass}
                placeholder="Search saved clients to pre-fill Booked For, Consignee & Dispatch To"
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

        <section className={sectionClass}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">Bill From</div>
              <div className="p-4">{orderType === 'outbound' ? companyBillBlock : otherPartyBlock}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">Bill To</div>
              <div className="p-4">{orderType === 'outbound' ? otherPartyBlock : companyBillBlock}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100">
              <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-t-xl">Dispatch From</div>
              <div className="p-4">
                <LocationInput
                  label="Dispatch From *"
                  value={dispatchFrom}
                  lat={dispatchFromLat}
                  lng={dispatchFromLng}
                  onChange={(address, lat, lng) => { setDispatchFrom(address); setDispatchFromLat(lat); setDispatchFromLng(lng); }}
                  placeholder="Search for an address or city"
                  className={inputClass}
                  labelClassName={labelClass}
                />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100">
              <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-t-xl">Ship To</div>
              <div className="p-4 space-y-4">
                <div>
                  <label className={labelClass}>Registered Address</label>
                  <textarea value={registeredAddress} onChange={e => setRegisteredAddress(e.target.value)} className={inputClass} rows={2} placeholder="Company's registered office address" />
                </div>
                <div>
                  <label className={labelClass}>Factory / Godown Address</label>
                  <textarea value={factoryAddress} onChange={e => setFactoryAddress(e.target.value)} className={inputClass} rows={2} placeholder="If different from registered address" />
                </div>
                <LocationInput
                  label="Ship To *"
                  value={dispatchTo}
                  lat={dispatchToLat}
                  lng={dispatchToLng}
                  onChange={(address, lat, lng) => { setDispatchTo(address); setDispatchToLat(lat); setDispatchToLng(lng); }}
                  placeholder="Search for an address or city"
                  className={inputClass}
                  labelClassName={labelClass}
                />
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">Consignee Details</div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>{orderType === 'inbound' ? 'Received By' : 'Consignee Name'}</label>
                  <input value={consigneeName} onChange={e => setConsigneeName(e.target.value)} className={inputClass} placeholder={orderType === 'inbound' ? 'Who received the goods, if different from Supplier' : 'Receiving entity, if different from Booked For'} />
                </div>
                <div>
                  <label className={labelClass}>{orderType === 'inbound' ? 'Received By Email' : 'Consignee Email'}</label>
                  <input type="email" value={consigneeEmail} onChange={e => setConsigneeEmail(e.target.value)} className={inputClass} placeholder="for dispatch notification email" />
                </div>
                <GSTInput label="Consignee GSTIN" value={consigneeGstin} onChange={setConsigneeGstin} onStateResolved={setConsigneeState} />
                <div>
                  <label className={labelClass}>Consignee State</label>
                  <input value={consigneeState} onChange={e => setConsigneeState(e.target.value)} className={inputClass} placeholder="Auto-filled from GSTIN, or type manually" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">Contact Person Details</div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Contact Person Name</label>
                  <input value={contactPersonName} onChange={e => setContactPersonName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contact Person Designation</label>
                  <input value={contactPersonDesignation} onChange={e => setContactPersonDesignation(e.target.value)} className={inputClass} placeholder="e.g. Purchase Manager" />
                </div>
                <div>
                  <label className={labelClass}>Contact Person Phone</label>
                  <input value={contactPersonPhone} onChange={e => setContactPersonPhone(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contact Person Email</label>
                  <input type="email" value={contactPersonEmail} onChange={e => setContactPersonEmail(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value as OrderPriority)} className={`${inputClass} bg-white`}>
                    {(Object.keys(PRIORITY_LABELS) as OrderPriority[]).map(p => (
                      <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Expected Delivery Date</label>
                  <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} className={inputClass} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3 space-y-2">
                  <label className={labelClass}>CC Emails <span className="text-gray-400 font-normal">(dispatch &amp; status-update notifications)</span></label>
                  {ccEmails.map((email, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="email" value={email}
                        onChange={e => setCcEmails(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                        className={inputClass} placeholder="name@example.com" />
                      <button type="button" onClick={() => setCcEmails(prev => prev.filter((_, j) => j !== i))}
                        className="flex-shrink-0 px-3 border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-50"><X size={14} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setCcEmails(prev => [...prev, ''])}
                    className="text-xs font-semibold text-green-600 hover:text-green-700">+ Add CC email</button>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 space-y-2">
                  <label className={labelClass}>BCC Emails</label>
                  {bccEmails.map((email, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="email" value={email}
                        onChange={e => setBccEmails(prev => prev.map((v, j) => j === i ? e.target.value : v))}
                        className={inputClass} placeholder="name@example.com" />
                      <button type="button" onClick={() => setBccEmails(prev => prev.filter((_, j) => j !== i))}
                        className="flex-shrink-0 px-3 border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-50"><X size={14} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setBccEmails(prev => [...prev, ''])}
                    className="text-xs font-semibold text-green-600 hover:text-green-700">+ Add BCC email</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">Transportation Details</div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">Driver</h2>
                {!tripLocked && !editMode && (
                  <div className="flex text-xs rounded-lg border border-gray-200 overflow-hidden">
                    <button type="button" onClick={() => setDriverMode('select')}
                      className={`px-3 py-1.5 font-semibold transition-colors ${driverMode === 'select' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      Registered Driver
                    </button>
                    <button type="button" onClick={() => { setDriverMode('new'); setDriverId(''); }}
                      className={`px-3 py-1.5 font-semibold transition-colors ${driverMode === 'new' ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                      Add New Driver
                    </button>
                  </div>
                )}
              </div>

              {tripLocked ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-700">{driverName || '— No driver assigned —'}</p>
                  {driverPhone && <p className="text-xs text-gray-500">{driverPhone}</p>}
                  <p className="text-[11px] text-gray-400 mt-1">Same vehicle as previous stop</p>
                </div>
              ) : driverMode === 'select' ? (
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Driver Name{editMode ? '' : ' *'}</label>
                    <input value={driverName} onChange={e => setDriverName(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Driver Mobile No.{editMode ? '' : ' *'}</label>
                    <input value={driverPhone} onChange={e => setDriverPhone(e.target.value)} className={inputClass} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} readOnly={tripLocked}
                    className={`${inputClass} ${tripLocked ? 'bg-gray-50 text-gray-500' : ''}`} placeholder="DL 1AB 1234" />
                  {tripLocked && <p className="text-[11px] text-gray-400 mt-1">Same vehicle as previous stop</p>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">Item Details</div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Material Description</label>
                  <input value={material} onChange={e => setMaterial(e.target.value)} className={inputClass} placeholder="e.g. PFD 96%" />
                </div>
                <div>
                  <label className={labelClass}>Quantity</label>
                  <input value={quantity} onChange={e => setQuantity(e.target.value)} className={inputClass} placeholder="e.g. 16.000 MT" />
                </div>
                <div>
                  <label className={labelClass}>E-way Bill Number</label>
                  <input value={ewayBillNumber} onChange={e => setEwayBillNumber(e.target.value)} className={inputClass} placeholder="EWB2507150001" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={labelClass}>Documents Enclosed</label>
                  <input value={documentsEnclosed} onChange={e => setDocumentsEnclosed(e.target.value)} className={inputClass} placeholder="e.g. Invoice, E-Way Bill, LR & COA to Driver" />
                </div>
                {!editMode && (
                  <div className="sm:col-span-2 lg:col-span-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                        <Upload size={13} />Upload Documents
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
                          onChange={e => { Array.from(e.target.files ?? []).forEach(addPendingDoc); e.target.value = ''; }} />
                      </label>
                    </div>
                    {pendingDocs.length > 0 && (
                      <div className="space-y-2">
                        {pendingDocs.map(doc => (
                          <div key={doc.key} className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5">
                            <FileText size={14} className="text-gray-400 flex-shrink-0" />
                            <span className="text-xs text-gray-500 truncate flex-1">{doc.file.name}</span>
                            <input value={doc.customLabel} onChange={e => updatePendingDoc(doc.key, { customLabel: e.target.value })}
                              placeholder="Label" className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-green-400" />
                            <button type="button" onClick={() => removePendingDoc(doc.key)} className="text-gray-400 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {!editMode && showSavePrompt && (
          <div className="flex flex-wrap items-center gap-3 border border-orange-200 bg-orange-50 rounded-xl px-4 py-3">
            <BookmarkPlus size={16} className="text-orange-500 flex-shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs font-semibold text-gray-700">Save this recipient for future shipments?</p>
              <p className="text-[11px] text-gray-500">Booked For, Consignee &amp; Dispatch To are saved — shipment details are not.</p>
            </div>
            <input value={saveLabel} onChange={e => setSaveLabel(e.target.value)} placeholder={bookedForCompany}
              className="w-full sm:w-44 border border-orange-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:border-orange-400" />
            <button type="button" onClick={saveAsRecipient} disabled={savingRecipient}
              className="text-xs font-bold text-white bg-orange-500 rounded-lg px-3 py-2 hover:bg-orange-600 disabled:opacity-50 transition-colors">
              {savingRecipient ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setSavePromptDismissed(true)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
        )}

        <div className="pt-2 flex gap-3">
          <Link href={editMode ? `/tracker/orders/${editId}` : '/tracker/orders'} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-center">Cancel</Link>
          {!editMode && !tripLocked && (
            <button type="button" onClick={saveDraftNow} disabled={!companyId}
              className="flex items-center justify-center gap-1.5 px-5 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              <Save size={15} />Save Draft
            </button>
          )}
          <button type="submit" disabled={saving} className="flex-1 py-3 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
            {saving ? (editMode ? 'Saving…' : 'Creating…') : editMode ? 'Save Changes' : 'Create Shipment'}
          </button>
        </div>
      </form>
    </div>
  );
}
