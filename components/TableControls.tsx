import { useState } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';

export type DateRangeKey =
  | 'today' | 'this_week' | 'this_month' | 'this_year' | 'all_time' | 'custom';

export interface DateRangeValue {
  range: DateRangeKey;
  from?: string; // yyyy-mm-dd, only when range === "custom"
  to?: string;
}

const RANGE_LABELS: { key: DateRangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'this_year', label: 'This Year' },
  { key: 'all_time', label: 'All Time' },
  { key: 'custom', label: 'Custom Range' },
];

// Date-range filter chip row. Defaults to "All Time" everywhere it's used so
// adding this control never hides data a company was already seeing.
export function DateRangeFilter({ value, onChange }: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {RANGE_LABELS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => {
            if (key === 'custom') { setShowCustom(true); return; }
            setShowCustom(false);
            onChange({ range: key });
          }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={value.range === key
            ? { backgroundColor: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' }
            : { backgroundColor: '#F9FAFB', color: '#6B7280', border: '1px solid #F3F4F6' }}
        >
          {key === 'custom' && <Calendar size={12} />}
          {label}
        </button>
      ))}
      {showCustom && (
        <div className="flex items-center gap-1.5 pl-1">
          <input
            type="date"
            value={value.from || ''}
            onChange={e => onChange({ range: 'custom', from: e.target.value, to: value.to })}
            className="px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none"
          />
          <span className="text-gray-400 text-xs">to</span>
          <input
            type="date"
            value={value.to || ''}
            onChange={e => onChange({ range: 'custom', from: value.from, to: e.target.value })}
            className="px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

export type SortDir = 'desc' | 'asc';

export function SortToggle({ value, onChange }: { value: SortDir; onChange: (v: SortDir) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value as SortDir)}
        className="appearance-none pl-3 pr-8 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none text-gray-700 cursor-pointer"
      >
        <option value="desc">Newest First</option>
        <option value="asc">Oldest First</option>
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

// Converts a DateRangeValue into the range/from/to query params the
// backend's dateutil.Resolve expects.
export function rangeToParams(v: DateRangeValue): Record<string, string> {
  if (v.range === 'custom' && v.from && v.to) {
    return { range: 'custom', from: `${v.from}T00:00:00+05:30`, to: `${v.to}T23:59:59+05:30` };
  }
  return { range: v.range };
}

// Applies a DateRangeValue client-side to an array of records — for views
// where the dataset is already fully fetched (e.g. after a category filter).
export function filterByRange<T>(rows: T[], v: DateRangeValue, getDate: (row: T) => string | undefined): T[] {
  if (v.range === 'all_time') return rows;
  const now = new Date();
  let start: Date, end: Date = now;
  if (v.range === 'custom') {
    if (!v.from || !v.to) return rows;
    start = new Date(`${v.from}T00:00:00+05:30`);
    end = new Date(`${v.to}T23:59:59+05:30`);
  } else if (v.range === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (v.range === 'this_week') {
    const day = now.getDay() === 0 ? 7 : now.getDay();
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1));
  } else if (v.range === 'this_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (v.range === 'this_year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    return rows;
  }
  return rows.filter(row => {
    const d = getDate(row);
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });
}

export function sortByDate<T>(rows: T[], dir: SortDir, getDate: (row: T) => string | undefined): T[] {
  return [...rows].sort((a, b) => {
    const ta = getDate(a) ? new Date(getDate(a)!).getTime() : 0;
    const tb = getDate(b) ? new Date(getDate(b)!).getTime() : 0;
    return dir === 'asc' ? ta - tb : tb - ta;
  });
}

// Fixed-height internally-scrolling wrapper for a table body — keeps the
// surrounding page (stats cards, filters, footer) from growing with row
// count.
export function ScrollBody({ children, maxHeight = '650px' }: { children: React.ReactNode; maxHeight?: string }) {
  return (
    <div className="overflow-y-auto overflow-x-auto" style={{ maxHeight }}>
      {children}
    </div>
  );
}
