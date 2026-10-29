// Client-side helpers: API calls and the prototype's date / label formatters.
export class ApiFail extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}, public data: any = {}) {
    super(message);
  }
}

export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && typeof window !== 'undefined' && !url.startsWith('/api/auth/')) {
    window.location.href = '/login';
  }
  if (!res.ok) throw new ApiFail(res.status, data?.error || `Request failed (${res.status})`, data?.fields || {}, data || {});
  return data as T;
}

// Calendar days in India (YYYY-MM-DD)
export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export const shift = (s: string, n: number) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const toD = (s: string) => new Date(s + 'T00:00:00Z');
export const longDate = (s: string) => toD(s).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const shortDate = (s?: string | null) => (s ? toD(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '—');
export const relDay = (s: string) => {
  const t = todayIST();
  return s === t ? 'Today' : s === shift(t, 1) ? 'Tomorrow' : s === shift(t, -1) ? 'Yesterday' : '';
};
export const t12 = (t?: string | null) => {
  if (!t) return 'Any time';
  let [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'am' : 'pm';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
};
export const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export const tone = (s: string) => ({ Open: 'info', 'In Progress': 'warn', Closed: 'ok', Converted: 'ok', Rejected: 'mute' } as Record<string, string>)[s] || 'brand';
export const shortSrc = (s: string) => s.replace(' (Facebook/Instagram)', '').replace(' (Outlook/Gmail)', '');
export const shortPur = (p: string) => (p === 'Job Vacancy / Job Application' ? 'Job application' : p === 'New Business Enquiry' ? 'New business' : p);
export const fmtPhone = (p: string) => (p && p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p);
export const initials = (name: string) =>
  name.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '—';

export const digits = (ph: string) => { let d = String(ph || '').replace(/\D/g, ''); if (d.length === 10) d = '91' + d; return d; };

// Tell every open page that data changed, so lists and counts refetch.
export const emitChange = () => window.dispatchEvent(new Event('crm:changed'));
