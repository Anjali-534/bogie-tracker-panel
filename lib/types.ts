export type OrderStatus = 'created' | 'loading' | 'loaded' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';

export type OrderPriority = 'normal' | 'urgent' | 'same_day';

export const PRIORITY_LABELS: Record<OrderPriority, string> = {
  normal: 'Normal',
  urgent: 'Urgent',
  same_day: 'Same-day',
};

// Special-handling checkbox catalog for the order form — matches no fixed
// DB enum (the column is a plain TEXT[]), just the standard set companies
// asked for. Free-text entries typed elsewhere in the array still round-trip
// fine; this list only drives which checkboxes are pre-rendered.
export const SPECIAL_HANDLING_OPTIONS = [
  'Fragile',
  'Keep Upright',
  'Temperature Sensitive',
  'Handle with Care',
  'Do Not Stack',
] as const;

export interface TrackerDriver {
  id: string;
  company_id: string;
  driver_name: string;
  phone: string;
  vehicle_number: string;
  transporter_name: string;
  transporter_phone: string;
  is_active: boolean;
  created_at: string;
}

export type DriverEventKind = 'on_break' | 'about_to_reach' | 'reached' | 'unloading' | 'delivery_claimed';

export type DeliveryCondition = 'good' | 'bad';

// Order type (backend migration 050) — 'outbound' (default, goods sent out)
// or 'inbound' (goods received from a supplier — see New Order page's
// toggle and ORDER_TYPE_LABELS).
export type OrderType = 'outbound' | 'inbound';

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  outbound: 'Outbound',
  inbound: 'Inbound',
};

export const ORDER_TYPE_STYLES: Record<OrderType, string> = {
  outbound: 'bg-blue-100 text-blue-700',
  inbound: 'bg-purple-100 text-purple-700',
};

export interface TrackerOrderEvent {
  id: string;
  order_id: string;
  status: OrderStatus;
  note: string;
  location: string;
  created_at: string;
  // reported_by/event_kind: added for driver quick-status taps. Existing
  // company-driven status-change events still come back with
  // reported_by: 'company' and event_kind: '' (server defaults). 'consignee'
  // is the one-off receipt-confirmation event (see ConfirmTrackerReceipt);
  // 'staff' is the equivalent panel-side action (see MarkTrackerOrderReceivedByStaff).
  reported_by: 'company' | 'driver' | 'consignee' | 'staff';
  event_kind: DriverEventKind | '';
}

export interface TrackerOrder {
  id: string;
  company_id: string;
  booked_for_company_name: string;
  booked_for_phone: string;
  dispatch_from: string;
  dispatch_to: string;
  transporter_name: string;
  transporter_phone: string;
  driver_id: string | null;
  driver_name: string;
  driver_phone: string;
  vehicle_number: string;
  eway_bill_number: string;
  eway_bill_file_url: string;
  status: OrderStatus;
  public_tracking_token: string;
  created_at: string;

  // Order type (backend migration 050) — see OrderType above. Existing
  // orders (created before this shipped) come back 'outbound', the
  // server-side default.
  order_type: OrderType;

  // Trip linkage (backend migration 055) — trip_id is set on every order
  // now (the backend auto-creates a trip even for a standalone shipment),
  // but trip_stop_count is only ever >1 for a genuine multi-drop trip —
  // that's the signal to actually surface trip UI, not trip_id alone.
  trip_id: string | null;
  stop_sequence: number;
  trip_stop_count: number;
  trip_public_tracking_token: string | null;
  trip_driver_tracking_token: string | null;

  // Dispatch details — from the real dispatch sheet, all optional. Orders
  // created before this feature shipped return null for all five.
  consignee_name: string | null;
  material: string | null;
  quantity: string | null;
  dispatch_datetime: string | null;
  documents_enclosed: string | null;

  // Live driver location tracking — null until the order first moves to
  // 'dispatched' (driver_tracking_token) and until the driver's share page
  // sends its first location ping (the rest).
  driver_tracking_token: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;

  // Route endpoint coordinates — set only when the address was picked from
  // Ola Places autocomplete or "use current location"; null for manually
  // typed addresses and all pre-existing orders.
  dispatch_from_lat: number | null;
  dispatch_from_lng: number | null;
  dispatch_to_lat: number | null;
  dispatch_to_lng: number | null;

  // Planned route (Ola Directions) — computed server-side once at creation
  // when both coordinate pairs exist; null otherwise.
  route_polyline: string | null;
  route_distance_km: number | null;
  route_duration_mins: number | null;

  // Which live-route option (see the live-route endpoint's `routes` array)
  // the driver has tapped to select on their own map. Read-only here — the
  // company panel displays it, it doesn't set it. Null means no explicit
  // selection yet; both sides then default to index 0.
  selected_route_index: number | null;

  // Proof-of-delivery signature — set once by the driver-token-gated upload
  // after a 'delivery_claimed' event; null until then.
  signature_url: string | null;

  // Dispatch notification email recipients — all optional, nullable. No
  // driver_email field exists by design; drivers get the WhatsApp tracking
  // link instead (see the notify endpoint).
  booked_for_email: string | null;
  consignee_email: string | null;
  transporter_email: string | null;

  // Goods-received confirmation — received_confirmation_token is generated
  // at order creation (or lazily backfilled on first notify send);
  // received_confirmed_at is set once by the consignee via the public
  // receipt page, for either button. delivery_condition/_reason are set
  // alongside it — a separate flag that never blocks the 'delivered'
  // transition itself (see tryAutoCompleteDelivery, backend). Once both
  // this AND the driver's claim (signature_url + a 'delivery_claimed'
  // event) exist, the order auto-transitions to 'delivered' server-side —
  // there is no company-side action for this anymore.
  received_confirmation_token: string | null;
  received_confirmed_at: string | null;
  delivery_condition: DeliveryCondition | null;
  delivery_condition_reason: string | null;

  // Set by the daily delivery-reminder job once 7 reminders to the
  // consignee get no response — informational only, never blocks anything.
  needs_staff_attention: boolean;

  // GSTIN for the two other dispatch-sheet parties — optional, format/
  // checksum validated client-side only (see components/GSTInput.tsx).
  consignee_gstin: string | null;
  booked_for_gstin: string | null;

  // State — auto-filled from the GSTIN's state code (see GSTInput's
  // onStateResolved) but a normal editable field; manual override always works.
  consignee_state: string | null;
  booked_for_state: string | null;

  // Shipment-detail expansion (backend migration 043) — all optional except
  // priority, which the server defaults to 'normal' when omitted.
  registered_address: string | null;
  factory_address: string | null;
  contact_person_name: string | null;
  contact_person_phone: string | null;
  contact_person_email: string | null;
  contact_person_designation: string | null;
  priority: OrderPriority;
  expected_delivery_date: string | null;
  declared_value: number | null;
  special_handling: string[] | null;
  internal_reference: string | null;

  // Additional dispatch-email recipients, variable count — distinct from
  // booked_for/consignee/transporter email, which each map to a specific party.
  cc_emails: string[];
  bcc_emails: string[];

  // Documents (backend migration 044) — replaces the old single e-way-bill
  // upload. Every doc_type is always optional; there is no mandatory-
  // document enforcement. eway_bill_number/eway_bill_file_url above still
  // exist for pre-migration orders but new uploads go through this list.
  documents: TrackerOrderDocument[];
}

export type TrackerDocType = 'coa' | 'invoice' | 'lr' | 'eway_bill' | 'other';

export const DOC_TYPE_LABELS: Record<TrackerDocType, string> = {
  coa: 'COA',
  invoice: 'Invoice',
  lr: 'LR',
  eway_bill: 'E-way Bill',
  other: 'Other',
};

export interface TrackerOrderDocument {
  id: string;
  order_id: string;
  doc_type: TrackerDocType;
  custom_label: string | null;
  file_url: string;
  expiry_date: string | null;
  created_at: string;
}

// Plan/subscription billing — see backend migration 032. No payment gateway
// is wired up yet: an order goes to 'pending_payment' on creation, and a
// staff member confirms payment was received out-of-band (dashboard's
// mark-paid action), which stamps invoice_number/paid_at and emails the PDF.
export type TrackerPlan = 'single' | '2users' | '5users' | 'mega' | 'lifetime';
export type TrackerBillingDuration = 'monthly' | 'quarterly' | 'halfYearly' | 'yearly' | 'onetime';
export type TrackerPlanOrderStatus = 'pending_payment' | 'paid' | 'cancelled';

export interface TrackerPlanOrder {
  id: string;
  company_id: string;
  plan: TrackerPlan;
  billing_duration: TrackerBillingDuration;
  base_amount: number;
  gst_amount: number;
  total_amount: number;

  billing_name: string;
  billing_address_line: string;
  billing_city: string;
  billing_state: string;
  billing_pincode: string;
  gstin: string | null;

  invoice_number: string | null;
  status: TrackerPlanOrderStatus;
  payment_gateway_ref: string | null;
  created_at: string;
  paid_at: string | null;
}

// Staff logins — see backend migration 039. Staff share the owner's full
// company-scoped access everywhere except managing other staff logins,
// which is gated owner-only both server-side (RequireTrackerOwner) and here.
export interface TrackerStaffUser {
  id: string;
  email: string;
  created_at: string;
  // Set when a plan downgrade auto-disabled this seat (see backend
  // migration 040) — reactivation is always a manual owner action.
  disabled_at: string | null;
}

// Saved recipients — see backend migration 041. Company-wide (owner + all
// staff share one list). Bundles the who/where side of an order: Booked For
// party + Consignee party + Dispatch To destination. Shipment-specific
// fields are never part of a recipient. The backend list endpoint returns
// most-used-first (use_count DESC, last_used_at DESC).
export interface TrackerSavedRecipient {
  id: string;
  label: string;
  booked_for_company_name: string;
  booked_for_phone: string;
  booked_for_email: string | null;
  booked_for_gstin: string | null;
  booked_for_state: string | null;
  consignee_name: string | null;
  consignee_email: string | null;
  consignee_gstin: string | null;
  consignee_state: string | null;
  dispatch_to: string | null;
  dispatch_to_lat: number | null;
  dispatch_to_lng: number | null;

  // Address/contact-person fields (backend migration 043) — captured on the
  // recipient so picking one pre-fills the fuller picture, same split the
  // table already draws for the party fields above (shipment-specific
  // fields like priority/declared value stay order-only).
  registered_address: string | null;
  factory_address: string | null;
  contact_person_name: string | null;
  contact_person_phone: string | null;
  contact_person_email: string | null;
  contact_person_designation: string | null;

  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

export interface TrackerStaffListResponse {
  staff: TrackerStaffUser[];
  count: number;
  unlimited?: boolean;
  limit?: number;
}

export const PLAN_LABELS: Record<TrackerPlan, string> = {
  single: 'Single User',
  '2users': '2 Users',
  '5users': '5 Users',
  mega: 'Mega',
  lifetime: 'Lifetime',
};

// Tier order for the recurring plans, low to high — used to label a plan
// card "Upgrade"/"Downgrade"/"Renew" relative to the company's current_plan.
// Lifetime sits outside this ladder (it's a separate one-time purchase, not
// a tier to move between).
export const PLAN_TIER_ORDER: Record<TrackerPlan, number> = {
  single: 0,
  '2users': 1,
  '5users': 2,
  mega: 3,
  lifetime: 99,
};

// Per-month rate shown on the picker for each recurring duration — the
// server independently looks up the actual period total via
// trackerbilling.Lookup on order creation, so this is display-only.
export const PLAN_PRICING: Record<TrackerPlan, Partial<Record<TrackerBillingDuration, number>>> = {
  single:   { monthly: 500, quarterly: 375, halfYearly: 350, yearly: 335 },
  '2users': { monthly: 700, quarterly: 525, halfYearly: 490, yearly: 469 },
  '5users': { monthly: 1000, quarterly: 750, halfYearly: 700, yearly: 670 },
  mega:     { monthly: 2000, quarterly: 1500, halfYearly: 1400, yearly: 1340 },
  lifetime: { onetime: 20000 },
};

export const DURATION_LABELS: Record<TrackerBillingDuration, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  halfYearly: 'Half-Yearly',
  yearly: 'Yearly',
  onetime: 'One-time',
};

// Months per billing_duration — used only to compute the period total shown
// on the picker/summary (base_amount = per-month rate × months). Matches
// the backend's trackerbilling.Lookup table exactly.
export const DURATION_MONTHS: Partial<Record<TrackerBillingDuration, number>> = {
  monthly: 1, quarterly: 3, halfYearly: 6, yearly: 12,
};

export const TRACKER_GST_RATE = 0.18;

export const PLAN_ORDER_STATUS_LABELS: Record<TrackerPlanOrderStatus, string> = {
  pending_payment: 'Pending Payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const PLAN_ORDER_STATUS_STYLES: Record<TrackerPlanOrderStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

export interface TrackerLocationPing {
  lat: number;
  lng: number;
  created_at: string;
}

// One route option from GET /gogoo/tracker/orders/:id/live-route — a FRESH
// traffic-aware route from the driver's current position to the destination,
// never cached (unlike TrackerOrder's route_polyline/route_distance_km/
// route_duration_mins, which stay the one-time planned route from creation).
// travel_advisory is Ola's raw "startPointIdx,endPointIdx,congestionLevel"
// pipe-separated string, indices into the decoded polyline's point array.
export interface TrackerLiveRoute {
  distance_km: number;
  duration_mins: number;
  polyline: string;
  travel_advisory: string;
  // Turn-by-turn maneuvers (driver page's voice-guidance/driving-companion
  // view only — the company panel's TrackingMap ignores this field). Absent/
  // empty is possible if Ola's response ever omits legs (shouldn't happen
  // for a resolved route, but not asserted server-side), so always guard
  // with steps?.length before indexing.
  steps?: TrackerRouteStep[];
}

// One maneuver from TrackerLiveRoute.steps — mirrors OlaRouteStep in
// live_map.go exactly (verified against a real Ola Directions response: 45
// steps for a 30km Delhi NCR route). maneuver is a stable enum ("depart",
// "turn-left", "turn-right", "turn-slight-left", "turn-slight-right",
// "continue", "enter-roundabout", "arrive", and possibly others Ola adds
// later — the icon map in the driving-companion view falls back to a plain
// arrow for anything unrecognized).
export interface TrackerRouteStep {
  instructions: string;
  distance_meters: number;
  duration_secs: number;
  maneuver: string;
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  bearing_before: number;
  bearing_after: number;
}

// Trimmed shape returned by GET /gogoo/tracker/live-map — one entry per
// currently-trackable shipment (dispatched/in_transit with a location fix).
export interface TrackerLiveMapOrder {
  id: string;
  driver_name: string;
  vehicle_number: string;
  booked_for_company_name: string;
  dispatch_from: string;
  dispatch_to: string;
  status: OrderStatus;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  route_distance_km: number | null;
  route_duration_mins: number | null;
  // Same value on every entry — the caller's own company logo.
  company_logo_url: string | null;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  created: 'Created',
  loading: 'Loading',
  loaded: 'Loaded',
  dispatched: 'Dispatched',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_STYLES: Record<OrderStatus, string> = {
  created: 'bg-gray-100 text-gray-600',
  loading: 'bg-purple-100 text-purple-700',
  loaded: 'bg-indigo-100 text-indigo-700',
  dispatched: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

// Terminal order statuses — no transition is allowed out of these
// (enforced server-side too, in tracker.go's UpdateTrackerCompanyOrderStatus).
export const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled'];

export const STATUS_STEPS: OrderStatus[] = ['created', 'loading', 'loaded', 'dispatched', 'in_transit', 'delivered'];

// The status control on the order detail page is a radio group over these —
// 'created' is the implicit starting state (not a choice) and 'cancelled' is
// a separate action, not part of the forward sequence. 'delivered' is a
// normal manual option here, same as every other status — it's also
// reachable automatically via tryAutoCompleteDelivery (backend) when the
// consignee confirms receipt first. Matches validOrderStatuses server-side.
export const STATUS_RADIO_OPTIONS: OrderStatus[] = ['loading', 'loaded', 'dispatched', 'in_transit', 'delivered'];

// Drive-page quick-status button row. 'delivery_claimed' is special-cased on
// the drive page (it triggers the signature pad instead of posting directly)
// so it isn't in this row — see DRIVER_QUICK_STATUS_BUTTONS in the drive page.
export const DRIVER_EVENT_KIND_LABELS: Record<DriverEventKind, string> = {
  on_break: 'On Break',
  about_to_reach: 'About to Reach',
  reached: 'Reached',
  unloading: 'Unloading',
  delivery_claimed: 'Delivered',
};

// Dispatch-notification-email recipient kinds — matches the backend's
// validNotifyRecipients map. 'driver' is always listed but always skipped
// server-side (no driver_email field by design; drivers get WhatsApp).
export type NotifyRecipient = 'booked_for' | 'consignee' | 'transporter' | 'driver';

export const NOTIFY_RECIPIENT_LABELS: Record<NotifyRecipient, string> = {
  booked_for: 'Booked For',
  consignee: 'Consignee',
  transporter: 'Transporter',
  driver: 'Driver',
};
