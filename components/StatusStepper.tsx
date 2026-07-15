import { Check } from 'lucide-react';
import { STATUS_LABELS, STATUS_STEPS, type OrderStatus, type TrackerOrderEvent } from '@/lib/mockData';

interface Props {
  status: OrderStatus;
  events: TrackerOrderEvent[];
}

// Shared stepper used by both the company's Order Details page and the
// public /track/[token] page — keep visual parity between the two.
export default function StatusStepper({ status, events }: Props) {
  if (status === 'cancelled') {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
        <p className="text-red-600 font-bold text-sm">This order was cancelled</p>
      </div>
    );
  }

  const currentIdx = STATUS_STEPS.indexOf(status);
  const eventFor = (s: OrderStatus) => events.find(e => e.status === s);

  return (
    <div className="space-y-0">
      {STATUS_STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const ev = eventFor(step);
        const isLast = i === STATUS_STEPS.length - 1;
        return (
          <div key={step} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                done ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {done ? <Check size={14} /> : <span className="text-xs font-bold">{i + 1}</span>}
              </div>
              {!isLast && <div className={`w-0.5 flex-1 min-h-[2rem] ${i < currentIdx ? 'bg-indigo-600' : 'bg-gray-100'}`} />}
            </div>
            <div className="pb-8">
              <p className={`text-sm font-bold ${done ? 'text-gray-900' : 'text-gray-400'}`}>{STATUS_LABELS[step]}</p>
              {ev ? (
                <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                  <p>{new Date(ev.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  {ev.location && <p>📍 {ev.location}</p>}
                  {ev.note && <p className="text-gray-400">{ev.note}</p>}
                </div>
              ) : (
                <p className="text-xs text-gray-300 mt-0.5">Pending</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
