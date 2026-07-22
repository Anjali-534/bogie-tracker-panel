'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Car, Truck, Siren } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import LocationInput from '@/components/LocationInput';

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

interface ServiceType {
  id: string;
  name: string;
  slug: string;
  category: string;
  base_fare: number;
  per_km_rate: number;
}

const CATEGORY_META: Record<string, { icon: typeof Car; label: string }> = {
  cab: { icon: Car, label: 'Cab' },
  truck: { icon: Truck, label: 'Truck' },
  ambulance: { icon: Siren, label: 'Ambulance' },
};
const CATEGORY_ORDER = ['cab', 'truck', 'ambulance'];

// Great-circle distance — mirrors the rider app's client-side estimate
// (booking/index.tsx). The server independently recomputes and enforces
// the real fare from pickup/drop coordinates, so this is a display-only
// estimate, not something the backend trusts.
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function BookRidePage() {
  const router = useRouter();

  const [services, setServices] = useState<ServiceType[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [category, setCategory] = useState('cab');
  const [selected, setSelected] = useState<ServiceType | null>(null);

  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [dropAddress, setDropAddress] = useState('');
  const [dropLat, setDropLat] = useState<number | null>(null);
  const [dropLng, setDropLng] = useState<number | null>(null);

  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');

  const [booking, setBooking] = useState(false);

  useEffect(() => {
    api.get<ServiceType[]>('/gogoo/services')
      .then(({ data }) => setServices(data || []))
      .catch(() => toast.error('Failed to load service types'))
      .finally(() => setServicesLoading(false));
  }, []);

  const categoriesPresent = CATEGORY_ORDER.filter(c => services.some(s => s.category === c));
  const categoryServices = services.filter(s => s.category === category);

  const dist = pickupLat != null && pickupLng != null && dropLat != null && dropLng != null
    ? distanceKm(pickupLat, pickupLng, dropLat, dropLng)
    : 0;
  const estimatedFare = selected
    ? Math.round((selected.base_fare || 0) + dist * (selected.per_km_rate || 0))
    : 0;

  async function submit() {
    if (!pickupAddress) { toast.error('Set a pickup location'); return; }
    if (!dropAddress) { toast.error('Set a drop location'); return; }
    if (!selected) { toast.error('Choose a vehicle'); return; }
    if (pickupLat == null || pickupLng == null) { toast.error('Pick a pickup location from the suggestions list'); return; }
    if (dropLat == null || dropLng == null) { toast.error('Pick a drop location from the suggestions list'); return; }

    setBooking(true);
    try {
      const { data } = await api.post('/gogoo/tracker/companies/rides', {
        service_type_id: selected.id,
        pickup_lat: pickupLat, pickup_lng: pickupLng, pickup_address: pickupAddress,
        drop_lat: dropLat, drop_lng: dropLng, drop_address: dropAddress,
        estimated_fare: estimatedFare,
        distance_km: Math.round(dist * 10) / 10,
        source: 'website',
        ...(category === 'truck' ? { receiver_name: receiverName, receiver_phone: receiverPhone } : {}),
      });
      toast.success('Ride booked');
      router.push(`/tracker/rides/${data.booking_id}`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to book ride');
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/tracker/rides" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} className="text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Book a Ride</h1>
          <p className="text-xs text-gray-400">Book a cab, truck or ambulance through gogoo</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-gray-900">Service Type</h2>
          {servicesLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {categoriesPresent.map(c => {
                  const meta = CATEGORY_META[c];
                  const Icon = meta.icon;
                  return (
                    <button key={c} type="button"
                      onClick={() => { setCategory(c); setSelected(null); }}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                        category === c ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}>
                      <Icon size={18} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {categoryServices.map(s => (
                  <button key={s.id} type="button" onClick={() => setSelected(s)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-colors ${
                      selected?.id === s.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                    <span className="text-sm font-semibold text-gray-900">{s.name}</span>
                    <span className="text-xs text-gray-400">₹{s.base_fare} base + ₹{s.per_km_rate}/km</span>
                  </button>
                ))}
                {!categoryServices.length && (
                  <p className="text-sm text-gray-400">No {CATEGORY_META[category]?.label.toLowerCase()} services available right now.</p>
                )}
              </div>
            </>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-gray-900">Route</h2>
          <div className="grid grid-cols-2 gap-4">
            <LocationInput
              label="Pickup Location *"
              value={pickupAddress}
              onChange={(address, lat, lng) => { setPickupAddress(address); setPickupLat(lat); setPickupLng(lng); }}
              placeholder="Search for an address or city"
              className={inputClass}
              labelClassName={labelClass}
            />
            <LocationInput
              label="Drop Location *"
              value={dropAddress}
              onChange={(address, lat, lng) => { setDropAddress(address); setDropLat(lat); setDropLng(lng); }}
              placeholder="Search for an address or city"
              className={inputClass}
              labelClassName={labelClass}
            />
          </div>
        </section>

        {category === 'truck' && (
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Receiver Details <span className="text-gray-400 font-normal">(optional)</span></h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Receiver Name</label>
                <input value={receiverName} onChange={e => setReceiverName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Receiver Phone</label>
                <input value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} className={inputClass} />
              </div>
            </div>
          </section>
        )}

        {selected && (
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
            <div>
              <p className="text-xs text-gray-400">Estimated Fare</p>
              <p className="text-lg font-bold text-gray-900">₹{estimatedFare}</p>
            </div>
            {dist > 0 && <p className="text-xs text-gray-400">{(Math.round(dist * 10) / 10)} km</p>}
          </div>
        )}

        <button type="button" onClick={submit} disabled={booking}
          className="w-full py-4 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors">
          {booking ? 'Booking…' : 'Book Ride'}
        </button>
      </div>
    </div>
  );
}
