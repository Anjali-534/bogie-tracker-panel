'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Link2, FileText, MessageCircle, Send, CheckCircle2, AlertTriangle, XCircle, Mail, Upload, X, Trash2, PackageCheck, Plus, Truck, Pencil } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import axios from 'axios';
import StatusStepper from '@/components/StatusStepper';
import TrackingMap from '@/components/TrackingMap';
import RouteRows from '@/components/RouteRows';
import { api } from '@/lib/api';
import {
  STATUS_LABELS, STATUS_STYLES, STATUS_STEPS, TERMINAL_STATUSES, STATUS_RADIO_OPTIONS,
  NOTIFY_RECIPIENT_LABELS, DOC_TYPE_LABELS, ORDER_TYPE_LABELS, ORDER_TYPE_STYLES,
  type TrackerOrder, type TrackerOrderEvent, type OrderStatus, type TrackerLocationPing,
  type NotifyRecipient, type TrackerDocType, type DeliveryCondition,
} from '@/lib/types';

const NOTIFY_RECIPIENTS: NotifyRecipient[] = ['booked_for', 'consignee', 'transporter', 'driver'];

interface NotifyResult {
  recipient: NotifyRecipient;
  email?: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
}

function recipientEmail(order: TrackerOrder, r: NotifyRecipient): string | null {
  switch (r) {
    case 'booked_for': return order.booked_for_email;
    case 'consignee': return order.consignee_email;
    case 'transporter': return order.transporter_email;
    case 'driver': return null; // no driver_email field by design — WhatsApp instead
  }
}

const MAP_POLL_MS = 15000;

export default function OrderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order,     setOrder]     = useState<TrackerOrder | null | undefined>(undefined);
  const [events,    setEvents]    = useState<TrackerOrderEvent[]>([]);
  const [pings,     setPings]     = useState<TrackerLocationPing[]>([]);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [updating,  setUpdating]  = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [note,      setNote]      = useState('');
  const [location,  setLocation]  = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [notifyRecipients, setNotifyRecipients] = useState<NotifyRecipient[]>(['booked_for']);
  const [sendingNotify, setSendingNotify] = useState(false);
  const [notifyResults, setNotifyResults] = useState<NotifyResult[] | null>(null);

  // Editable fields state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [updatingField, setUpdatingField] = useState<string | null>(null);

  // Staff-side "Mark Received" (inbound orders only) — mirrors the public
  // receipt page's good/bad condition capture, POSTing to mark-received
  // instead of the consignee's public confirm endpoint.
  const [showMarkReceivedForm, setShowMarkReceivedForm] = useState(false);
  const [markReceivedReason, setMarkReceivedReason] = useState('');
  const [markingReceived, setMarkingReceived] = useState<DeliveryCondition | null>(null);

  // Document restructure (Phase 2) — the order already exists on this page,
  // but a file is still staged (with its expiry/custom-label) before it's
  // actually uploaded, same two-step pattern as the new-order page's
  // pending-documents queue.
  interface StagedDoc { key: string; docType: TrackerDocType; customLabel: string; expiryDate: string; file: File }
  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  function addStagedDoc(docType: TrackerDocType, file: File) {
    setStagedDocs(prev => [...prev, { key: `${Date.now()}-${Math.random()}`, docType, customLabel: '', expiryDate: '', file }]);
  }
  function updateStagedDoc(key: string, patch: Partial<StagedDoc>) {
    setStagedDocs(prev => prev.map(d => d.key === key ? { ...d, ...patch } : d));
  }
  function removeStagedDoc(key: string) {
    setStagedDocs(prev => prev.filter(d => d.key !== key));
  }

  async function commitStagedDoc(doc: StagedDoc) {
    if (!order) return;
    setUploadingKey(doc.key);
    try {
      const form = new FormData();
      form.append('file', doc.file);
      form.append('doc_type', doc.docType);
      if (doc.docType === 'other' && doc.customLabel) form.append('custom_label', doc.customLabel);
      if (doc.expiryDate) form.append('expiry_date', doc.expiryDate);
      await api.post(`/gogoo/tracker/orders/${order.id}/documents`, form);
      removeStagedDoc(doc.key);
      toast.success('Document uploaded');
      await load();
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploadingKey(null);
    }
  }

  async function removeDocument(docId: string) {
    if (!order) return;
    try {
      await api.delete(`/gogoo/tracker/orders/${order.id}/documents/${docId}`);
      toast.success('Document removed');
      await load();
    } catch {
      toast.error('Failed to remove document');
    }
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/gogoo/tracker/orders/${id}`);
      setOrder(data.order);
      setEvents(data.events);
      setPings(data.location_pings || []);
      setCompanyLogoUrl(data.company_logo_url ?? null);
      if (STATUS_RADIO_OPTIONS.includes(data.order.status)) {
        setSelectedStatus(data.order.status);
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setOrder(null);
      } else {
        toast.error('Failed to load shipment');
      }
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Keep the map fresh while the order is actively moving. Polling stops once
  // delivered — the map still renders the last known position, just frozen.
  useEffect(() => {
    if (!order) return;
    const idx = STATUS_STEPS.indexOf(order.status);
    const dispatchedIdx = STATUS_STEPS.indexOf('dispatched');
    const deliveredIdx = STATUS_STEPS.indexOf('delivered');
    const activelyTracking = idx >= dispatchedIdx && idx < deliveredIdx;
    if (!activelyTracking) return;
    const t = setInterval(load, MAP_POLL_MS);
    return () => clearInterval(t);
  }, [order?.status, load]);

  function copyTrackingLink() {
    if (!order) return;
    const url = `${window.location.origin}/track/${order.public_tracking_token}`;
    navigator.clipboard.writeText(url);
    toast.success('Tracking link copied');
  }

  // A multi-stop trip (trip_stop_count > 1) shares ONE driver link across
  // every stop — the trip's own token, not any individual stop's order
  // token — so the driver never has to re-share a new link mid-run. A
  // single-stop "trip" (the common case) keeps using the order's own token,
  // exactly as before this feature existed.
  function driverLinkToken(): string | null {
    if (!order) return null;
    if (order.trip_stop_count > 1 && order.trip_driver_tracking_token) return order.trip_driver_tracking_token;
    return order.driver_tracking_token;
  }

  function copyDriverLink() {
    const token = driverLinkToken();
    if (!token) return;
    const url = `${window.location.origin}/drive/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Driver link copied');
  }

  function whatsAppDriverLink() {
    const token = driverLinkToken();
    if (!token || !order?.driver_phone) return;
    const url = `${window.location.origin}/drive/${token}`;
    const digits = order.driver_phone.replace(/\D/g, '');
    const waNumber = digits.length === 10 ? `91${digits}` : digits;
    const message =
      `नमस्ते! कृपया अपनी लोकेशन शेयर करने के लिए यह लिंक खोलें: ${url}\n\n` +
      `Hi! Please open this link to share your live location for this delivery: ${url}`;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  // Booked For's WhatsApp share reuses the public tracking link (same one as
  // "Copy Tracking Link" up top) — unlike the driver link above, which uses
  // the driver-only token and points at /drive instead of /track.
  function whatsAppBookedForLink() {
    if (!order?.public_tracking_token || !order.booked_for_phone) return;
    const url = `${window.location.origin}/track/${order.public_tracking_token}`;
    const digits = order.booked_for_phone.replace(/\D/g, '');
    const waNumber = digits.length === 10 ? `91${digits}` : digits;
    const message =
      `नमस्ते! आपके शिपमेंट को लाइव ट्रैक करने के लिए यह लिंक खोलें: ${url}\n\n` +
      `Hi, here's the live tracking link for your shipment: ${url}`;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  async function setStatus(next: OrderStatus) {
    if (!order) return;
    setUpdating(true);
    try {
      await api.patch(`/gogoo/tracker/orders/${order.id}`, { status: next });
      toast.success(`Marked as ${STATUS_LABELS[next]}`);
      await load();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Status update failed');
      } else {
        toast.error('Status update failed');
      }
    } finally {
      setUpdating(false);
    }
  }

  // Only reachable while status='created' (see the button's visibility
  // check below) — matches the backend's DELETE guard exactly, so this
  // never fires against an order the server is guaranteed to reject.
  async function deleteOrder() {
    if (!order) return;
    setDeleting(true);
    try {
      await api.delete(`/gogoo/tracker/orders/${order.id}`);
      toast.success('Shipment deleted');
      router.push('/tracker/orders');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to delete shipment');
      } else {
        toast.error('Failed to delete shipment');
      }
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!order || (!note && !location)) return;
    setAddingNote(true);
    try {
      await api.post(`/gogoo/tracker/orders/${order.id}/events`, {
        note: note || undefined,
        location: location || undefined,
      });
      setNote(''); setLocation('');
      toast.success('Update added');
      await load();
    } catch {
      toast.error('Failed to add update');
    } finally {
      setAddingNote(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !messageBody.trim()) return;
    setSendingMessage(true);
    try {
      await api.post(`/gogoo/tracker/orders/${order.id}/messages`, { body: messageBody.trim() });
      setMessageBody('');
      toast.success('Message sent to driver');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  }

  function toggleNotifyRecipient(r: NotifyRecipient) {
    setNotifyRecipients(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  function startEdit(field: string, currentValue: string) {
    setEditingField(field);
    setEditValues(prev => ({ ...prev, [field]: currentValue }));
  }

  function cancelEdit() {
    setEditingField(null);
    setEditValues({});
  }

  async function saveFieldEdit(field: string) {
    if (!order) return;
    const newValue = editValues[field];
    if (newValue === undefined || newValue === '') return;

    setUpdatingField(field);
    try {
      // PATCH /details is the dispatch-sheet edit endpoint — it always
      // round-trips its full field set (not a partial patch), so every
      // required field must be sent even though only one is changing here.
      // dispatch_from/dispatch_to are included because they're required by
      // the endpoint, not because this form edits them.
      const updateData: Record<string, any> = {
        booked_for_company_name: order.booked_for_company_name,
        booked_for_phone: order.booked_for_phone,
        dispatch_from: order.dispatch_from,
        dispatch_to: order.dispatch_to,
        transporter_name: order.transporter_name || '',
        transporter_phone: order.transporter_phone || '',
        vehicle_number: order.vehicle_number,
        eway_bill_number: order.eway_bill_number || '',
        consignee_name: order.consignee_name || '',
        material: order.material || '',
        quantity: order.quantity || '',
        documents_enclosed: order.documents_enclosed || '',
        consignee_gstin: order.consignee_gstin || '',
        booked_for_gstin: order.booked_for_gstin || '',
        consignee_state: order.consignee_state || '',
        booked_for_state: order.booked_for_state || '',
        driver_name: order.driver_name || '',
        driver_phone: order.driver_phone || '',
        booked_for_email: order.booked_for_email || '',
        consignee_email: order.consignee_email || '',
        transporter_email: order.transporter_email || '',
      };

      // Update the specific field being edited
      updateData[field] = newValue;

      await api.patch(`/gogoo/tracker/orders/${order.id}/details`, updateData);
      toast.success(`${field} updated`);
      setEditingField(null);
      setEditValues({});
      await load();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Update failed');
      } else {
        toast.error('Update failed');
      }
    } finally {
      setUpdatingField(null);
    }
  }

  async function sendDispatchEmails() {
    if (!order || notifyRecipients.length === 0) return;
    setSendingNotify(true);
    setNotifyResults(null);
    try {
      const { data } = await api.post(`/gogoo/tracker/orders/${order.id}/notify`, { recipients: notifyRecipients });
      const results = data.results as NotifyResult[];
      setNotifyResults(results);
      const sent = results.filter(r => r.status === 'sent').length;
      if (sent > 0) {
        toast.success(`Dispatch details emailed to ${sent} recipient${sent === 1 ? '' : 's'}`);
        await load();
      } else {
        toast.error('No emails sent — check recipient addresses');
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to send dispatch emails');
      } else {
        toast.error('Failed to send dispatch emails');
      }
    } finally {
      setSendingNotify(false);
    }
  }

  async function markReceived(condition: DeliveryCondition, reason?: string) {
    if (!order) return;
    setMarkingReceived(condition);
    try {
      await api.post(`/gogoo/tracker/orders/${order.id}/mark-received`, { condition, reason: reason || undefined });
      toast.success('Marked as received');
      setShowMarkReceivedForm(false);
      setMarkReceivedReason('');
      await load();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string };
        toast.error(body.error || 'Failed to mark received');
      } else {
        toast.error('Failed to mark received');
      }
    } finally {
      setMarkingReceived(null);
    }
  }

  if (order === undefined) {
    return <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>;
  }
  if (order === null) {
    return (
      <div className="p-16 text-center">
        <p className="text-3xl mb-2">🔍</p>
        <p className="text-gray-500 mb-4">Shipment not found</p>
        <button onClick={() => router.push('/tracker/orders')} className="text-orange-600 font-semibold text-sm">Back to Shipments</button>
      </div>
    );
  }

  const isTerminal = TERMINAL_STATUSES.includes(order.status);
  const showMap = STATUS_STEPS.indexOf(order.status) >= STATUS_STEPS.indexOf('dispatched');
  // Matches the backend's PATCH /details status guard exactly (created/
  // loading only) — used to gate both the header Edit button and every
  // inline EditableField pencil below, so the UI never invites an edit the
  // server is guaranteed to reject.
  const detailsEditable = order.status === 'created' || order.status === 'loading';
  const editLockedTooltip = 'Editing is locked once a shipment is dispatched.';

  return (
    <div className="max-w-4xl space-y-5">
      <Toaster position="top-right" />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/tracker/orders" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{order.booked_for_company_name}</h1>
            <div className="mt-1">
              <RouteRows from={order.dispatch_from} to={order.dispatch_to} compact />
            </div>
            {order.trip_id && order.trip_stop_count > 1 && order.trip_public_tracking_token && (
              <Link href={`/track-trip/${order.trip_public_tracking_token}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700">
                <Truck size={12} />Part of a {order.trip_stop_count}-stop trip · Stop {order.stop_sequence} · View trip
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${ORDER_TYPE_STYLES[order.order_type]}`}>
            {ORDER_TYPE_LABELS[order.order_type]}
          </span>
          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${STATUS_STYLES[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
          {order.received_confirmed_at && (
            order.delivery_condition === 'bad' ? (
              <span
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-semibold bg-red-100 text-red-700"
                title={`${new Date(order.received_confirmed_at).toLocaleString()}${order.delivery_condition_reason ? ` — ${order.delivery_condition_reason}` : ''}`}
              >
                <XCircle size={12} />Reported bad condition
              </span>
            ) : (
              <span
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-semibold bg-green-100 text-green-700"
                title={new Date(order.received_confirmed_at).toLocaleString()}
              >
                <CheckCircle2 size={12} />
                {order.delivery_condition === 'good' ? 'Received in good condition' : 'Consignee confirmed receipt'}
              </span>
            )
          )}
          <button onClick={copyTrackingLink} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            <Link2 size={14} />Copy Tracking Link
          </button>
          {detailsEditable ? (
            <Link href={`/tracker/orders/new?edit=${order.id}`}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              <Pencil size={14} />Edit
            </Link>
          ) : (
            <button type="button" disabled title={editLockedTooltip}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-300 cursor-not-allowed">
              <Pencil size={14} />Edit
            </button>
          )}
          {order.trip_id && (
            <Link href={`/tracker/orders/new?trip_id=${order.trip_id}`}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-orange-200 text-orange-600 rounded-xl text-sm font-semibold hover:bg-orange-50 transition-colors">
              <Plus size={14} />Add Another Stop
            </Link>
          )}
          {!isTerminal && (
            <button onClick={() => setStatus('cancelled')} disabled={updating} className="px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 disabled:opacity-50 transition-colors">
              Cancel Shipment
            </button>
          )}
          {order.status === 'created' && (
            <button onClick={() => setShowDeleteConfirm(true)} disabled={updating}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 disabled:opacity-50 transition-colors">
              <Trash2 size={14} />Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {showMap && (
            <TrackingMap
              lastLat={order.last_lat}
              lastLng={order.last_lng}
              lastLocationAt={order.last_location_at}
              pings={pings}
              fromLat={order.dispatch_from_lat}
              fromLng={order.dispatch_from_lng}
              toLat={order.dispatch_to_lat}
              toLng={order.dispatch_to_lng}
              routePolyline={order.route_polyline}
              routeDistanceKm={order.route_distance_km}
              routeDurationMins={order.route_duration_mins}
              companyLogoUrl={companyLogoUrl}
            />
          )}

          {order.needs_staff_attention && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800">Needs staff attention</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  The consignee hasn&apos;t responded on the receipt page after 7 daily reminders. Follow up with them directly — this doesn&apos;t block anything in the system.
                </p>
              </div>
            </div>
          )}

          {order.delivery_condition === 'bad' && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-5">
              <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-800">Consignee reported bad condition</p>
                {order.delivery_condition_reason && (
                  <p className="text-xs text-red-600 mt-0.5">{order.delivery_condition_reason}</p>
                )}
              </div>
            </div>
          )}

          {!isTerminal && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-sm font-bold text-gray-900 mb-4">Update Status</h2>
              <div className="flex flex-wrap gap-3 mb-5">
                {STATUS_RADIO_OPTIONS.map(opt => (
                  <label key={opt} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer text-sm font-semibold transition-colors ${
                    selectedStatus === opt ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="status"
                      value={opt}
                      checked={selectedStatus === opt}
                      onChange={() => setSelectedStatus(opt)}
                      className="accent-orange-500"
                    />
                    {STATUS_LABELS[opt]}
                  </label>
                ))}
              </div>
              <button
                onClick={() => selectedStatus && setStatus(selectedStatus)}
                disabled={updating || !selectedStatus || selectedStatus === order.status}
                className="px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                Update Status
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-5">Status Timeline</h2>
            <StatusStepper status={order.status} events={events} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Add Update</h2>
            <form onSubmit={addEvent} className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Location</label>
                <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Vadodara, Gujarat"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Note</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Crossed toll"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400" />
              </div>
              <button type="submit" disabled={addingNote || (!note && !location)} className="px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {addingNote ? 'Adding…' : 'Add'}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-5">
          {order.order_type === 'inbound' && !order.received_confirmed_at && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><PackageCheck size={16} className="text-green-500" />Mark Received</h2>
              {!showMarkReceivedForm ? (
                <div className="space-y-2">
                  <button
                    onClick={() => markReceived('good')}
                    disabled={markingReceived !== null}
                    className="w-full py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 disabled:opacity-50 transition-colors"
                  >
                    {markingReceived === 'good' ? 'Marking…' : 'Goods received in perfect condition'}
                  </button>
                  <button
                    onClick={() => setShowMarkReceivedForm(true)}
                    disabled={markingReceived !== null}
                    className="w-full py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-bold hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    Not in good condition
                  </button>
                </div>
              ) : (
                <div className="border border-red-200 rounded-xl p-4 space-y-3">
                  <label className="block text-xs font-semibold text-gray-600">What&apos;s wrong with the shipment?</label>
                  <textarea
                    value={markReceivedReason}
                    onChange={e => setMarkReceivedReason(e.target.value)}
                    placeholder="e.g. Two boxes were crushed, material spilled out"
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => markReceived('bad', markReceivedReason.trim())}
                      disabled={markingReceived !== null || !markReceivedReason.trim()}
                      className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {markingReceived === 'bad' ? 'Submitting…' : 'Submit Report'}
                    </button>
                    <button
                      onClick={() => { setShowMarkReceivedForm(false); setMarkReceivedReason(''); }}
                      disabled={markingReceived !== null}
                      className="px-4 py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-bold hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {order.signature_url && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-900">Proof of Delivery</h2>
              {/* eslint-disable-next-line @next/next/no-img-element -- signature comes from Cloudinary/local uploads, not a next/image-configured domain */}
              <img src={order.signature_url} alt="Delivery signature" className="w-full rounded-xl border border-gray-100 bg-gray-50" />
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-900">Send Dispatch Details</h2>
            <p className="text-xs text-gray-400">Emails the dispatch summary (party, consignee, material, truck, driver, transporter, tracking link) to the selected recipients.</p>
            <div className="space-y-2">
              {NOTIFY_RECIPIENTS.map(r => {
                const email = recipientEmail(order, r);
                const result = notifyResults?.find(x => x.recipient === r);
                return (
                  <label key={r} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm ${email ? 'border-gray-200 cursor-pointer hover:bg-gray-50' : 'border-gray-100 bg-gray-50 cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      className="accent-orange-500"
                      disabled={!email}
                      checked={notifyRecipients.includes(r)}
                      onChange={() => toggleNotifyRecipient(r)}
                    />
                    <span className="flex-1">
                      <span className={`font-semibold ${email ? 'text-gray-800' : 'text-gray-400'}`}>{NOTIFY_RECIPIENT_LABELS[r]}</span>
                      <span className="block text-[11px] text-gray-400">{email || 'no email on file'}</span>
                    </span>
                    {result && (
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${
                        result.status === 'sent' ? 'text-green-600' : result.status === 'failed' ? 'text-red-500' : 'text-gray-400'
                      }`}>
                        {result.status}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={sendDispatchEmails}
                disabled={sendingNotify || notifyRecipients.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                <Mail size={14} />{sendingNotify ? 'Sending…' : 'Email'}
              </button>
              <button
                type="button"
                disabled
                title="SMS coming soon — provider + DLT registration pending"
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-400 rounded-xl text-sm font-bold cursor-not-allowed"
              >
                SMS (coming soon)
              </button>
            </div>
          </div>

          {order.driver_tracking_token && !isTerminal && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-900">Message to Driver</h2>
              <form onSubmit={sendMessage} className="space-y-2.5">
                <textarea
                  value={messageBody}
                  onChange={e => setMessageBody(e.target.value)}
                  placeholder="e.g. Please take the bypass route, main road is jammed"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 resize-none"
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !messageBody.trim()}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  <Send size={14} />{sendingMessage ? 'Sending…' : 'Send'}
                </button>
              </form>
            </div>
          )}

          {driverLinkToken() && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-900">Driver Tracking Link</h2>
              <p className="text-xs text-gray-400">
                {order.trip_stop_count > 1
                  ? 'One shared link for this whole trip — the driver only needs to open it once.'
                  : 'Share this link with the driver so they can send their live location.'}
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={copyDriverLink} className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                  <Link2 size={14} />Copy Driver Link
                </button>
                {order.driver_phone && (
                  <button onClick={whatsAppDriverLink} className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-600 transition-colors">
                    <MessageCircle size={14} />Send via WhatsApp
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Shipment Details</h2>
            <Field label="Booked For" value={order.booked_for_company_name} />
            <EditableField
              label="Contact Phone"
              value={order.booked_for_phone}
              fieldKey="booked_for_phone"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'booked_for_phone'}
              isUpdating={updatingField === 'booked_for_phone'}
              editValue={editValues['booked_for_phone'] ?? order.booked_for_phone}
              onStartEdit={() => startEdit('booked_for_phone', order.booked_for_phone)}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, booked_for_phone: val }))}
              onSave={() => saveFieldEdit('booked_for_phone')}
              inputType="tel"
            />
            {order.booked_for_phone && order.public_tracking_token && (
              <button onClick={whatsAppBookedForLink} className="flex items-center justify-center gap-1.5 px-4 py-2 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-colors">
                <MessageCircle size={13} />Send via WhatsApp
              </button>
            )}
            <EditableField
              label="Booked For Email"
              value={order.booked_for_email || '—'}
              fieldKey="booked_for_email"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'booked_for_email'}
              isUpdating={updatingField === 'booked_for_email'}
              editValue={editValues['booked_for_email'] ?? (order.booked_for_email || '')}
              onStartEdit={() => startEdit('booked_for_email', order.booked_for_email || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, booked_for_email: val }))}
              onSave={() => saveFieldEdit('booked_for_email')}
              inputType="email"
            />
            <EditableField
              label="Driver"
              value={order.driver_name || '—'}
              fieldKey="driver_name"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'driver_name'}
              isUpdating={updatingField === 'driver_name'}
              editValue={editValues['driver_name'] ?? (order.driver_name || '')}
              onStartEdit={() => startEdit('driver_name', order.driver_name || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, driver_name: val }))}
              onSave={() => saveFieldEdit('driver_name')}
            />
            <EditableField
              label="Driver Phone"
              value={order.driver_phone || '—'}
              fieldKey="driver_phone"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'driver_phone'}
              isUpdating={updatingField === 'driver_phone'}
              editValue={editValues['driver_phone'] ?? (order.driver_phone || '')}
              onStartEdit={() => startEdit('driver_phone', order.driver_phone || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, driver_phone: val }))}
              onSave={() => saveFieldEdit('driver_phone')}
              inputType="tel"
            />
            <Field label="Vehicle Number" value={order.vehicle_number} />
            <EditableField
              label="Transporter"
              value={order.transporter_name || '—'}
              fieldKey="transporter_name"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'transporter_name'}
              isUpdating={updatingField === 'transporter_name'}
              editValue={editValues['transporter_name'] ?? (order.transporter_name || '')}
              onStartEdit={() => startEdit('transporter_name', order.transporter_name || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, transporter_name: val }))}
              onSave={() => saveFieldEdit('transporter_name')}
            />
            <EditableField
              label="Transporter Phone"
              value={order.transporter_phone || '—'}
              fieldKey="transporter_phone"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'transporter_phone'}
              isUpdating={updatingField === 'transporter_phone'}
              editValue={editValues['transporter_phone'] ?? (order.transporter_phone || '')}
              onStartEdit={() => startEdit('transporter_phone', order.transporter_phone || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, transporter_phone: val }))}
              onSave={() => saveFieldEdit('transporter_phone')}
              inputType="tel"
            />
            <EditableField
              label="Transporter Email"
              value={order.transporter_email || '—'}
              fieldKey="transporter_email"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'transporter_email'}
              isUpdating={updatingField === 'transporter_email'}
              editValue={editValues['transporter_email'] ?? (order.transporter_email || '')}
              onStartEdit={() => startEdit('transporter_email', order.transporter_email || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, transporter_email: val }))}
              onSave={() => saveFieldEdit('transporter_email')}
              inputType="email"
            />
            <Field label="Booked For GSTIN" value={order.booked_for_gstin || '—'} />
            <Field label="Booked For State" value={order.booked_for_state || '—'} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Dispatch Details</h2>
            <EditableField
              label="Consignee"
              value={order.consignee_name || '—'}
              fieldKey="consignee_name"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'consignee_name'}
              isUpdating={updatingField === 'consignee_name'}
              editValue={editValues['consignee_name'] ?? (order.consignee_name || '')}
              onStartEdit={() => startEdit('consignee_name', order.consignee_name || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, consignee_name: val }))}
              onSave={() => saveFieldEdit('consignee_name')}
            />
            <EditableField
              label="Consignee Email"
              value={order.consignee_email || '—'}
              fieldKey="consignee_email"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'consignee_email'}
              isUpdating={updatingField === 'consignee_email'}
              editValue={editValues['consignee_email'] ?? (order.consignee_email || '')}
              onStartEdit={() => startEdit('consignee_email', order.consignee_email || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, consignee_email: val }))}
              onSave={() => saveFieldEdit('consignee_email')}
              inputType="email"
            />
            <Field label="Consignee GSTIN" value={order.consignee_gstin || '—'} />
            <Field label="Consignee State" value={order.consignee_state || '—'} />
            <EditableField
              label="Material"
              value={order.material || '—'}
              fieldKey="material"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'material'}
              isUpdating={updatingField === 'material'}
              editValue={editValues['material'] ?? (order.material || '')}
              onStartEdit={() => startEdit('material', order.material || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, material: val }))}
              onSave={() => saveFieldEdit('material')}
            />
            <EditableField
              label="Quantity"
              value={order.quantity || '—'}
              fieldKey="quantity"
              locked={!detailsEditable}
              lockedTooltip={editLockedTooltip}
              isEditing={editingField === 'quantity'}
              isUpdating={updatingField === 'quantity'}
              editValue={editValues['quantity'] ?? (order.quantity || '')}
              onStartEdit={() => startEdit('quantity', order.quantity || '')}
              onCancelEdit={cancelEdit}
              onValueChange={val => setEditValues(prev => ({ ...prev, quantity: val }))}
              onSave={() => saveFieldEdit('quantity')}
            />
            <Field label="Dispatch Date & Time" value={order.dispatch_datetime ? new Date(order.dispatch_datetime).toLocaleString() : '—'} />
            <Field label="Documents Enclosed" value={order.documents_enclosed || '—'} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-900">E-way Bill Number</h2>
            <Field label="Number" value={order.eway_bill_number || '—'} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <h2 className="text-sm font-bold text-gray-900">Documents <span className="text-gray-400 font-normal">(optional — all documents, always)</span></h2>
            <div className="flex flex-wrap gap-2">
              {(['coa', 'invoice', 'lr', 'eway_bill', 'other'] as TrackerDocType[]).map(dt => (
                <label key={dt} className="flex items-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
                  <Upload size={13} />{DOC_TYPE_LABELS[dt]}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) addStagedDoc(dt, f); e.target.value = ''; }} />
                </label>
              ))}
            </div>

            {stagedDocs.length > 0 && (
              <div className="space-y-2">
                {stagedDocs.map(doc => (
                  <div key={doc.key} className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
                    <FileText size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-gray-700 flex-shrink-0">{DOC_TYPE_LABELS[doc.docType]}</span>
                    <span className="text-xs text-gray-500 truncate flex-1">{doc.file.name}</span>
                    {doc.docType === 'other' && (
                      <input value={doc.customLabel} onChange={e => updateStagedDoc(doc.key, { customLabel: e.target.value })}
                        placeholder="Label" className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-green-400" />
                    )}
                    <input type="date" value={doc.expiryDate} onChange={e => updateStagedDoc(doc.key, { expiryDate: e.target.value })}
                      title="Expiry date (optional)" className="w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-green-400" />
                    <button type="button" onClick={() => commitStagedDoc(doc)} disabled={uploadingKey === doc.key}
                      className="text-xs font-bold text-green-600 hover:text-green-700 disabled:opacity-50 flex-shrink-0">
                      {uploadingKey === doc.key ? 'Uploading…' : 'Upload'}
                    </button>
                    <button type="button" onClick={() => removeStagedDoc(doc.key)} className="text-gray-400 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            {order.documents.length > 0 ? (
              <div className="space-y-2 pt-1">
                {order.documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 border-t border-gray-50 pt-2 first:border-t-0 first:pt-0">
                    <FileText size={14} className="text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-gray-700 flex-shrink-0">
                      {doc.doc_type === 'other' ? (doc.custom_label || 'Other') : DOC_TYPE_LABELS[doc.doc_type]}
                    </span>
                    {doc.expiry_date && <span className="text-[11px] text-gray-400 flex-shrink-0">exp. {new Date(doc.expiry_date).toLocaleDateString()}</span>}
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-orange-600 hover:text-orange-800 flex-1 truncate">View file</a>
                    <button type="button" onClick={() => removeDocument(doc.id)} className="text-gray-400 hover:text-red-500 flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ) : stagedDocs.length === 0 && (
              <p className="text-xs text-gray-400">No documents uploaded</p>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center">
            <p className="text-4xl mb-3">🗑️</p>
            <p className="font-bold text-gray-900 mb-2">Delete this shipment?</p>
            <p className="text-sm text-gray-500 mb-6">This can&apos;t be undone — the shipment and its documents will be permanently removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={deleteOrder} disabled={deleting}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

interface EditableFieldProps {
  label: string;
  value: string;
  fieldKey: string;
  isEditing: boolean;
  isUpdating: boolean;
  editValue: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onValueChange: (val: string) => void;
  onSave: () => void;
  inputType?: string;
  locked?: boolean;
  lockedTooltip?: string;
}

function EditableField({
  label,
  value,
  fieldKey,
  isEditing,
  isUpdating,
  editValue,
  onStartEdit,
  onCancelEdit,
  onValueChange,
  onSave,
  inputType = 'text',
  locked = false,
  lockedTooltip,
}: EditableFieldProps) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      {!isEditing ? (
        <div className="flex items-center gap-2 group">
          <p className="text-sm text-gray-800 flex-1">{value || '—'}</p>
          <button
            onClick={onStartEdit}
            disabled={locked}
            title={locked ? lockedTooltip : 'Edit'}
            className={locked
              ? 'p-1.5 rounded-lg text-gray-300 cursor-not-allowed'
              : 'p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 opacity-0 group-hover:opacity-100 transition-all'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-current stroke-2">
              <path d="M11.333 2L14 4.667M2 14H5.333L13.778 5.556C14.148 5.185 14.148 4.592 13.778 4.222L11.778 2.222C11.407 1.852 10.815 1.852 10.444 2.222L2 10.667V14Z" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-2">
          <input
            type={inputType}
            value={editValue}
            onChange={e => onValueChange(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={isUpdating || !editValue}
              className="flex-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {isUpdating ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onCancelEdit}
              disabled={isUpdating}
              className="flex-1 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
