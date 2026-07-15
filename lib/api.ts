import axios from 'axios';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'https://gogobackend-production.up.railway.app';

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('tracker_company_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function clearSession() {
  localStorage.removeItem('tracker_company_token');
  localStorage.removeItem('tracker_company_name');
  localStorage.removeItem('tracker_company_email');
  localStorage.removeItem('tracker_company_status');
}

// A 403 carrying a `status` field means the backend re-checked the
// company's live status (RequireTrackerCompany) and it's no longer
// active — the account may have been suspended/rejected after this token
// was issued. Treat it like a 401: the stored session is dead either way.
// Route both cases to the shared blocked screen so a stale, wrongly-active
// localStorage value never overrides what the server just said.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (typeof window !== 'undefined' && error.response) {
      const { status: httpStatus, data } = error.response;
      if (httpStatus === 401) {
        clearSession();
        window.location.href = '/';
      } else if (httpStatus === 403 && data?.status) {
        clearSession();
        window.location.href = `/blocked?status=${encodeURIComponent(data.status)}`;
      }
    }
    return Promise.reject(error);
  }
);
