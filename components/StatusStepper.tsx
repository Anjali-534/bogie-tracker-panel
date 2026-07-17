import { Check } from 'lucide-react';
import { DRIVER_EVENT_KIND_LABELS, STATUS_LABELS, STATUS_STEPS, type DriverEventKind, type OrderStatus, type TrackerOrderEvent } from '@/lib/types';

type StepperEvent = Pick<TrackerOrderEvent, 'status' | 'note' | 'location' | 'created_at' | 'reported_by' | 'event_kind'>;

interface Props {
  status: OrderStatus;
  events: StepperEvent[];
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
  // A step can carry multiple events now — driver quick-status taps are
  // notes at the CURRENT status, not transitions, so several can pile up
  // against one step (e.g. two "On Break" taps during a long haul).
  const eventsFor = (s: OrderStatus) => events.filter(e => e.status === s);

  return (
    <div className="space-y-0">
      {STATUS_STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const stepEvents = eventsFor(step);
        const isLast = i === STATUS_STEPS.length - 1;
        return (
          <div key={step} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                done ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {done ? <Check size={14} /> : <span className="text-xs font-bold">{i + 1}</span>}
              </div>
              {!isLast && <div className={`w-0.5 flex-1 min-h-[2rem] ${i < currentIdx ? 'bg-orange-500' : 'bg-gray-100'}`} />}
            </div>
            <div className="pb-8 space-y-2">
              <p className={`text-sm font-bold ${done ? 'text-gray-900' : 'text-gray-400'}`}>{STATUS_LABELS[step]}</p>
              {stepEvents.length > 0 ? (
                stepEvents.map((ev, idx) => {
                  const isDriver = ev.reported_by === 'driver';
                  const isConsignee = ev.reported_by === 'consignee';
                  return (
                    <div key={idx} className="text-xs text-gray-500 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span>{new Date(ev.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        {isDriver && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[10px] font-bold uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            Driver{ev.event_kind ? ` · ${DRIVER_EVENT_KIND_LABELS[ev.event_kind as DriverEventKind]}` : ''}
                          </span>
                        )}
                        {isConsignee && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Consignee
                          </span>
                        )}
                      </div>
                      {ev.location && <p>📍 {ev.location}</p>}
                      {ev.note && <p className="text-gray-400">{ev.note}</p>}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-gray-300">Pending</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
