// Two-row route treatment used everywhere a route was previously shown as a
// single "A → B" line — driver share page, company order detail, public track.
// fromName/toName are optional party names (currently only passed by the
// driver share page) rendered above the address on their respective row.
export default function RouteRows({ from, to, fromName, toName, compact = false }: { from: string; to: string; fromName?: string; toName?: string; compact?: boolean }) {
  const valueCls = compact ? 'text-sm font-semibold text-gray-800' : 'text-base font-bold text-gray-900';
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dispatch From</p>
        {fromName && <p className="text-xs font-semibold text-gray-600">{fromName}</p>}
        <p className={valueCls}>{from}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Where To</p>
        {toName && <p className="text-xs font-semibold text-gray-600">{toName}</p>}
        <p className={valueCls}>{to}</p>
      </div>
    </div>
  );
}
