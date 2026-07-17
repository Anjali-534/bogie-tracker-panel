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
