'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import VideoPlaceholder from '@/components/VideoPlaceholder';

interface FaqItem { q: string; a: string; }

const FAQ: FaqItem[] = [
  {
    q: 'How do I create a shipment?',
    a: 'Go to Shipment → New Shipment. Pick Outbound or Inbound at the top, fill in the pickup/delivery details, driver, and material info, then submit. See the "Creating a Shipment" sections below for the full walkthrough.',
  },
  {
    q: "What's the difference between Outbound and Inbound?",
    a: 'Outbound is goods you are sending out (the original shipment type). Inbound is goods coming back to you from a supplier or vendor — the "Booked For" fields become "Supplier / Vendor", and the delivery address defaults to your own company address.',
  },
  {
    q: 'How does the driver get the tracking link?',
    a: 'Open the order and use the Driver Tracking Link card — copy the link or send it straight to the driver\'s phone over WhatsApp with one click.',
  },
  {
    q: 'What happens if a driver stops sharing their location?',
    a: 'Live Map marks that shipment as Stale once no location update has come in for 2 minutes. The last known position still shows on the map, just frozen, until a new ping arrives.',
  },
  {
    q: 'How does the consignee confirm delivery?',
    a: 'Once the driver has claimed delivery and uploaded a signature, the consignee uses their own link to confirm receipt and mark the goods as good or bad condition. If they can\'t, staff can confirm on their behalf from the order page (inbound orders only).',
  },
  {
    q: 'What does Live Map show?',
    a: 'Every shipment currently in transit, plotted with its last known position, and a Live/Stale badge based on how recently the driver\'s phone last sent a location update.',
  },
  {
    q: 'How does billing work?',
    a: 'Bogie Tracker runs on a subscription plan, not a prepaid wallet. Go to Billing & Subscription to see your current plan, buy or renew a plan, and download invoices for paid orders.',
  },
  {
    q: 'How do I add staff?',
    a: 'Go to Settings and open the Add Staff section. Only the account owner can add or manage staff logins.',
  },
  {
    q: 'How do I change my password or logo?',
    a: 'Both are on the Settings page — Change Password and Upload Logo have their own sections, and are also shortcuts in the sidebar\'s Settings menu.',
  },
  {
    q: 'Can I deactivate a driver instead of deleting them?',
    a: 'Yes — removing a driver deactivates them. They stop showing up when creating new shipments, but any order that already used them keeps their details intact.',
  },
  {
    q: 'Do I need to fill in a destination for Inbound orders?',
    a: 'No, not if you\'ve set a Default Company Address in Settings — it prefills automatically as the delivery address, but you can still edit it per order.',
  },
  {
    q: 'What ride types can I book?',
    a: 'Cab, Truck, and Ambulance, from Book a Ride in the sidebar.',
  },
];

function FaqAccordion() {
  const [open, setOpen] = useState<Set<number>>(new Set([0]));

  function toggle(i: number) {
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2">Quick FAQ</div>
      <div className="divide-y divide-gray-100">
      {FAQ.map((item, i) => {
        const isOpen = open.has(i);
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left"
            >
              <span className="text-sm font-semibold text-gray-800">{item.q}</span>
              {isOpen ? <ChevronDown size={16} className="flex-shrink-0 text-gray-400" /> : <ChevronRight size={16} className="flex-shrink-0 text-gray-400" />}
            </button>
            {isOpen && (
              <div className="px-5 pb-4 -mt-1">
                <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

interface GuideSection {
  title: string;
  body: React.ReactNode;
}

const SECTIONS: GuideSection[] = [
  {
    title: 'Getting Started',
    body: (
      <>
        <p>Sign up with your company details from the panel&apos;s signup page. Your account needs to be approved before you can log in.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Submit the signup form with your company and contact details.</li>
          <li>Wait for approval — you&apos;ll be notified once your account is active.</li>
          <li>Log in with the email and password you signed up with.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Creating a Shipment (Outbound)',
    body: (
      <>
        <p>Outbound is the default shipment type — goods you&apos;re sending out to a customer or consignee.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to Shipment → New Shipment. Outbound is selected by default.</li>
          <li>Fill in Dispatch From, Dispatch To, Booked For, and Consignee details (or pick a saved recipient).</li>
          <li>Add the driver, vehicle, material, and quantity.</li>
          <li>Submit — the order is created and a driver tracking link is generated.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Creating a Shipment (Inbound)',
    body: (
      <>
        <p>Inbound is for goods coming back to you from a supplier or vendor — for example, a return pickup or a purchase delivery.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to Shipment → New Shipment and switch the toggle to Inbound.</li>
          <li>The Saved Recipient section is hidden, and the form relabels: &quot;Pickup From&quot;, &quot;Deliver To&quot;, &quot;Supplier / Vendor&quot;, and &quot;Received By&quot;.</li>
          <li>Deliver To auto-fills from your Default Company Address (set in Settings) the first time you switch to Inbound — you can still edit it.</li>
          <li>Fill in the rest and submit as usual.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Managing Drivers',
    body: (
      <>
        <p>Drivers are shared across all your shipments — add them once, then pick from the list when creating an order.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to Driver in the sidebar.</li>
          <li>Click Add Driver and fill in name, phone, and optionally vehicle/transporter details.</li>
          <li>Use the pencil icon to edit a driver, or remove to deactivate them — deactivated drivers won&apos;t show up on new shipments, but stay attached to their past orders.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Managing Consignees',
    body: (
      <>
        <p>Saved Recipients let you pre-fill Booked For, Consignee, and Destination details instead of retyping them on every Outbound shipment.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to Consignee in the sidebar.</li>
          <li>Click Add and fill in a label plus Booked For / Consignee / Destination details.</li>
          <li>Pick the saved recipient from New Shipment (Outbound only) to auto-fill the form.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Live Map',
    body: (
      <>
        <p>Live Map shows every shipment currently in transit, plotted at its last known position.</p>
        <p>A shipment is marked <strong>Live</strong> if the driver&apos;s phone has sent a location update in the last 2 minutes, and <strong>Stale</strong> otherwise. Stale doesn&apos;t mean the shipment stopped — it usually means the driver closed the tracking link or lost signal. The map keeps polling every 15 seconds while a shipment is actively moving.</p>
      </>
    ),
  },
  {
    title: 'Driver Tracking Link',
    body: (
      <>
        <p>Every order gets a unique driver link that shares the driver&apos;s live location without needing an app.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the order and find the Driver Tracking Link card.</li>
          <li>Copy the link, or click Send via WhatsApp to message it straight to the driver&apos;s phone.</li>
          <li>The driver opens the link and taps to start sharing — no login required on their end.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Sending Dispatch Details',
    body: (
      <>
        <p>You can email dispatch details and the public tracking link to Booked For, Consignee, or the transporter directly from the order page.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open the order and use the Notify / Send Dispatch Details section.</li>
          <li>Pick which recipients to email.</li>
          <li>Each email includes the shipment details and a live tracking link (Inbound orders omit the link, since it isn&apos;t needed).</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Delivery Confirmation',
    body: (
      <>
        <p>Delivery closes out in two steps: the driver claims delivery, then the receiving side confirms it.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>The driver marks the delivery as complete and uploads a signature from their tracking link.</li>
          <li>The consignee then confirms receipt from their own link, marking the goods as good or bad condition (with a reason if bad).</li>
          <li>For Inbound orders, if the consignee can&apos;t confirm, staff can use the Mark Received button on the order page instead — it&apos;s only available once the driver has claimed delivery.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Booking a Ride',
    body: (
      <>
        <p>Book a Ride covers Cab, Truck, and Ambulance bookings, separate from shipment tracking.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to Book a Ride and pick Cab, Truck, or Ambulance.</li>
          <li>Choose a service type, then set Pickup and Drop locations.</li>
          <li>For Truck bookings, also fill in the receiver&apos;s name and phone.</li>
          <li>Review the estimated fare and confirm to book.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Wallet & Subscription',
    body: (
      <>
        <p>Bogie Tracker runs on a subscription plan rather than a prepaid wallet. This lives on the Billing & Subscription page.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Go to Billing & Subscription to see your current plan and its status.</li>
          <li>Click to buy or renew a plan — choose a plan tier and billing cycle, fill in billing details, and review the total (including GST) before placing the order.</li>
          <li>Once an order is marked Paid, download its invoice from the same page.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Settings',
    body: (
      <>
        <p>Settings holds your company profile plus account-level options.</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Change Password — update your login password.</li>
          <li>Add Staff — give teammates their own login (owner account only).</li>
          <li>Upload Logo — used on emails and documents.</li>
          <li>Default Company Address — your own address, used to prefill Deliver To on Inbound shipments.</li>
        </ol>
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="max-w-[1600px] w-full space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">How to Use</h1>
        <p className="text-xs text-gray-400">A practical guide to every feature in the tracker panel.</p>
      </div>

      <FaqAccordion />

      <div className="space-y-4">
        <div className="bg-orange-500 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl">Detailed Guide</div>
        <div className="space-y-6">
          {SECTIONS.map(section => (
            <div key={section.title} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900">{section.title}</h3>
              <div className="text-sm text-gray-600 leading-relaxed space-y-2">{section.body}</div>
              <VideoPlaceholder title={section.title} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
