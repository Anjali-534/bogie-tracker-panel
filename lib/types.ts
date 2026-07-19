export type OrderStatus = 'created' | 'loading' | 'loaded' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';

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
  // is the one-off receipt-confirmation event (see ConfirmTrackerReceipt).
  reported_by: 'company' | 'driver' | 'consignee';
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
  // the first time the order reaches 'delivered'; received_confirmed_at is
  // set once by the consignee via the public receipt page.
  received_confirmation_token: string | null;
  received_confirmed_at: string | null;

  // GSTIN for the two other dispatch-sheet parties — optional, format/
  // checksum validated client-side only (see components/GSTInput.tsx).
  consignee_gstin: string | null;
  booked_for_gstin: string | null;

  // State — auto-filled from the GSTIN's state code (see GSTInput's
  // onStateResolved) but a normal editable field; manual override always works.
  consignee_state: string | null;
  booked_for_state: string | null;
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
// a separate action, not part of the forward sequence.
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
