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

export interface TrackerOrderEvent {
  id: string;
  order_id: string;
  status: OrderStatus;
  note: string;
  location: string;
  created_at: string;
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
