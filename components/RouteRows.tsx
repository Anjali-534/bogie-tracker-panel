// Two-row route treatment used everywhere a route was previously shown as a
// single "A → B" line — driver share page, company order detail, public track.
export default function RouteRows({ from, to, compact = false }: { from: string; to: string; compact?: boolean }) {
  const valueCls = compact ? 'text-sm font-semibold text-gray-800' : 'text-base font-bold text-gray-900';
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dispatch From</p>
        <p className={valueCls}>{from}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Where To</p>
        <p className={valueCls}>{to}</p>
      </div>
    </div>
  );
}
