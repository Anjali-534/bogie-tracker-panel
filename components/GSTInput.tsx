'use client';
import { useEffect, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { validateGSTIN, lookupGSTIN } from '@/lib/gstin';

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-green-400';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

interface Props {
  label: string;
  value: string;
  onChange: (gstin: string) => void;
  // Called once, only when a NEW value validates — fills the state field.
  // The state input itself stays a normal editable input; this just seeds
  // it. Never called again for the same valid value (won't fight manual edits).
  onStateResolved?: (state: string) => void;
}

// GSTIN input — client-side format + checksum validation only, no network
// call (see lib/gstin.ts). Optional field; manual override always works
// since onStateResolved only ever seeds a normal editable input.
export default function GSTInput({ label, value, onChange, onStateResolved }: Props) {
  const { valid } = validateGSTIN(value);
  const lastResolvedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!valid) return;
    const gstin = value.trim().toUpperCase();
    if (lastResolvedFor.current === gstin) return;
    lastResolvedFor.current = gstin;
    const { state } = lookupGSTIN(gstin);
    if (state && onStateResolved) onStateResolved(state);
  }, [valid, value, onStateResolved]);

  return (
    <div>
      <label className={labelClass}>{label} <span className="text-gray-400 font-normal">(optional)</span></label>
      <div className="relative">
        <input
          value={value}
          onChange={e => onChange(e.target.value.toUpperCase())}
          className={`${inputClass} ${valid ? 'pr-9' : ''}`}
          placeholder="07AAAAA0000A1Z5"
          maxLength={15}
        />
        {valid && (
          <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />
        )}
      </div>
      {valid && <p className="text-[11px] text-green-600 mt-1">Verified format ✓</p>}
      {!valid && value.length > 0 && (
        <p className="text-[11px] text-gray-400 mt-1">15 characters — state code, PAN, entity &amp; check digits</p>
      )}
    </div>
  );
}
