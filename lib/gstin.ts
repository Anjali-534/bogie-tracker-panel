// GSTIN format/checksum validation and state derivation — entirely
// client-side, no network call. lookupGSTIN() is deliberately the single
// seam a paid verification API (name/address lookup) could be wired into
// later without touching GSTInput or any form that uses it.

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Standard 2-digit GST state/UT codes.
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

// 15 chars: 2-digit state code, 10-char PAN, 1-digit entity code,
// 1 fixed 'Z', 1 checksum char.
const GSTIN_FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function checksumChar(gstin14: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = gstin14.length - 1; i >= 0; i--) {
    const code = CHARSET.indexOf(gstin14[i]);
    let d = code * factor;
    d = Math.floor(d / 36) + (d % 36);
    sum += d;
    factor = factor === 2 ? 1 : 2;
  }
  const checkCode = (36 - (sum % 36)) % 36;
  return CHARSET[checkCode];
}

export interface GSTINValidation {
  valid: boolean;
  stateCode: string | null;
  state: string | null;
}

// validateGSTIN checks structural format AND the mod-36 checksum digit —
// a format-only match on a mistyped GSTIN would still pass without this.
export function validateGSTIN(raw: string): GSTINValidation {
  const gstin = raw.trim().toUpperCase();
  if (!GSTIN_FORMAT.test(gstin)) {
    return { valid: false, stateCode: null, state: null };
  }
  const expected = checksumChar(gstin.slice(0, 14));
  if (expected !== gstin[14]) {
    return { valid: false, stateCode: null, state: null };
  }
  const stateCode = gstin.slice(0, 2);
  const state = GST_STATE_CODES[stateCode] ?? null;
  return { valid: true, stateCode, state };
}

export interface GSTINLookupResult {
  name?: string;
  address?: string;
  state: string | null;
}

// lookupGSTIN is the single seam for a future paid verification API — today
// it only derives the state from the embedded state code. Swap the body for
// an API call later; every caller (GSTInput) already treats this as async-
// shaped data flowing into editable inputs, never as authoritative truth.
export function lookupGSTIN(gstin: string): GSTINLookupResult {
  const { state } = validateGSTIN(gstin);
  return { state };
}
