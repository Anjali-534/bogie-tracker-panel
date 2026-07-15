// TODO(backend): this whole file is placeholder data standing in for the
// not-yet-built tracker backend (see 022_bogie_tracker.sql). Once
// GET/POST /tracker/orders, /tracker/drivers etc. exist, delete this file
// and replace every `import { mock* } from '@/lib/mockData'` call site with
// a real axios call using the same `hdrs()` pattern the other panels use.

export type OrderStatus = 'created' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';

export interface TrackerDriver {
  id: string;
  driver_name: string;
  phone: string;
  vehicle_number: string;
  transporter_name: string;
  transporter_phone: string;
  is_active: boolean;
}

export interface TrackerOrderEvent {
  id: string;
  status: OrderStatus;
  note?: string;
  location?: string;
  created_at: string;
}

export interface TrackerOrder {
  id: string;
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
  eway_bill_number?: string;
  eway_bill_file_url?: string;
  status: OrderStatus;
  public_tracking_token: string;
  created_at: string;
  events: TrackerOrderEvent[];
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  created: 'Created',
  dispatched: 'Dispatched',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const STATUS_STYLES: Record<OrderStatus, string> = {
  created: 'bg-gray-100 text-gray-600',
  dispatched: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

export const STATUS_STEPS: OrderStatus[] = ['created', 'dispatched', 'in_transit', 'delivered'];

export const mockDrivers: TrackerDriver[] = [
  { id: 'drv_1', driver_name: 'Ramesh Kumar', phone: '+91 98765 43210', vehicle_number: 'DL 1AB 1234', transporter_name: 'Kumar Transport Co.', transporter_phone: '+91 98765 00001', is_active: true },
  { id: 'drv_2', driver_name: 'Suresh Yadav', phone: '+91 98765 43211', vehicle_number: 'HR 55 XY 9988', transporter_name: 'Yadav Logistics', transporter_phone: '+91 98765 00002', is_active: true },
  { id: 'drv_3', driver_name: 'Vikram Singh', phone: '+91 98765 43212', vehicle_number: 'UP 16 CD 4567', transporter_name: 'Singh Roadways', transporter_phone: '+91 98765 00003', is_active: false },
];

export const mockOrders: TrackerOrder[] = [
  {
    id: 'ord_1', booked_for_company_name: 'KG Enterprises', booked_for_phone: '+91 98111 22233',
    dispatch_from: 'Bhiwandi, Maharashtra', dispatch_to: 'Karol Bagh, New Delhi',
    transporter_name: 'Kumar Transport Co.', transporter_phone: '+91 98765 00001',
    driver_id: 'drv_1', driver_name: 'Ramesh Kumar', driver_phone: '+91 98765 43210',
    vehicle_number: 'DL 1AB 1234', eway_bill_number: 'EWB2507150001',
    status: 'in_transit', public_tracking_token: 'demo-token-ord1',
    created_at: '2026-07-13T09:15:00+05:30',
    events: [
      { id: 'ev1', status: 'created', created_at: '2026-07-13T09:15:00+05:30' },
      { id: 'ev2', status: 'dispatched', location: 'Bhiwandi, Maharashtra', created_at: '2026-07-13T11:00:00+05:30' },
      { id: 'ev3', status: 'in_transit', note: 'Crossed Vadodara toll', location: 'Vadodara, Gujarat', created_at: '2026-07-14T04:30:00+05:30' },
    ],
  },
  {
    id: 'ord_2', booked_for_company_name: 'Chemilinco Pvt. Ltd.', booked_for_phone: '+91 98222 33344',
    dispatch_from: 'Faridabad, Haryana', dispatch_to: 'Kanpur, Uttar Pradesh',
    transporter_name: 'Yadav Logistics', transporter_phone: '+91 98765 00002',
    driver_id: 'drv_2', driver_name: 'Suresh Yadav', driver_phone: '+91 98765 43211',
    vehicle_number: 'HR 55 XY 9988', status: 'delivered', public_tracking_token: 'demo-token-ord2',
    created_at: '2026-07-11T08:00:00+05:30',
    events: [
      { id: 'ev4', status: 'created', created_at: '2026-07-11T08:00:00+05:30' },
      { id: 'ev5', status: 'dispatched', location: 'Faridabad, Haryana', created_at: '2026-07-11T09:30:00+05:30' },
      { id: 'ev6', status: 'in_transit', location: 'Agra, Uttar Pradesh', created_at: '2026-07-11T15:00:00+05:30' },
      { id: 'ev7', status: 'delivered', location: 'Kanpur, Uttar Pradesh', created_at: '2026-07-12T06:45:00+05:30' },
    ],
  },
  {
    id: 'ord_3', booked_for_company_name: 'Aggarwal Publicity & Marketing', booked_for_phone: '+91 98333 44455',
    dispatch_from: 'Rohini, New Delhi', dispatch_to: 'Jaipur, Rajasthan',
    transporter_name: '', transporter_phone: '',
    driver_id: null, driver_name: 'Manoj Verma', driver_phone: '+91 91234 56789',
    vehicle_number: 'RJ 14 GH 3321', status: 'created', public_tracking_token: 'demo-token-ord3',
    created_at: '2026-07-15T10:05:00+05:30',
    events: [
      { id: 'ev8', status: 'created', created_at: '2026-07-15T10:05:00+05:30' },
    ],
  },
];
