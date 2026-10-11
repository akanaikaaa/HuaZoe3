import type * as T from './types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
const KEY = 'ht_session';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const sessionStore = {
  get: (): T.Session | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } },
  set: (s: T.Session | null) => (s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY)),
};

let onUnauthorized: () => void = () => {};
export const setOnUnauthorized = (fn: () => void) => { onUnauthorized = fn; };

async function refresh(): Promise<boolean> {
  const s = sessionStore.get();
  if (!s) return false;
  const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
  if (!res.ok) return false;
  sessionStore.set((await res.json()).data.session);
  return true;
}

async function request<R>(path: string, init: RequestInit = {}, retry = true): Promise<R> {
  const s = sessionStore.get();
  const headers = new Headers(init.headers);
  if (s) headers.set('Authorization', `Bearer ${s.access_token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let res: Response;
  try { res = await fetch(`${BASE}${path}`, { ...init, headers }); }
  catch { throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection.'); }

  if (res.status === 401 && retry && s && (await refresh())) return request<R>(path, init, false);
  if (res.status === 401) { sessionStore.set(null); onUnauthorized(); }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? `Request failed (${res.status})`);
  return json.data as R;
}

const q = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return p ? `?${p}` : '';
};
const body = (b: unknown) => JSON.stringify(b);

export const api = {
  login: (email: string, password: string) => request<{ session: T.Session; user: T.User }>('/auth/login', { method: 'POST', body: body({ email, password }) }),
  register: (email: string, password: string, full_name: string) => request<{ confirmation_required: boolean; session: T.Session | null; message?: string; dev_token?: string; token_sent?: boolean }>('/auth/register', { method: 'POST', body: body({ email, password, full_name }) }),
  verifyToken: (email: string, token: string, type: 'signup' | 'email' = 'signup') => request<{ session: T.Session; user: T.User }>('/auth/verify-token', { method: 'POST', body: body({ email, token, type }) }),
  sendToken: (email: string, type: 'signup' | 'email' = 'signup') => request<{ sent: boolean; email: string; message: string; dev_token?: string; token_sent?: boolean }>('/auth/send-token', { method: 'POST', body: body({ email, type }) }),
  me: () => request<T.User>('/auth/me'),
  updateMe: (p: Partial<T.User>) => request<T.User>('/auth/me', { method: 'PATCH', body: body(p) }),

  reports: (userId?: string) => request<T.ReportSummary[]>(`/reports${q({ userId })}`),
  report: (id: string) => request<T.ReportDetail>(`/reports/${id}`),
  reportFileUrl: (id: string) => request<{ url: string }>(`/reports/${id}/file`),
  reprocessReport: (id: string) => request<{ id: string; status: string }>(`/reports/${id}/reprocess`, { method: 'POST' }),
  uploadReport: (file: File) => { const f = new FormData(); f.append('file', file); return request<T.ReportSummary>('/reports', { method: 'POST', body: f }); },
  deleteReport: (id: string) => request<{ deleted: boolean }>(`/reports/${id}`, { method: 'DELETE' }),

  trends: (userId?: string) => request<T.TrendSeries[]>(`/biomarkers/trends${q({ userId })}`),
  dietPlan: (userId?: string) => request<T.DietPlan | null>(`/diet-plans/current${q({ userId })}`),
  exercisePlan: (userId?: string) => request<T.ExercisePlan | null>(`/exercise-plans/current${q({ userId })}`),
  regeneratePlans: () => request<{ diet: T.DietPlan; exercise: T.ExercisePlan }>('/plans/regenerate', { method: 'POST' }),

  dailyLogs: (userId?: string) => request<T.DailyLog[]>(`/daily-logs${q({ userId })}`),
  saveLog: (date: string, log: Omit<T.DailyLog, 'log_date'>) => request<T.DailyLog>(`/daily-logs/${date}`, { method: 'PUT', body: body(log) }),

  comparisons: (userId?: string) => request<T.Comparison[]>(`/comparisons${q({ userId })}`),
  comparison: (id: string) => request<T.Comparison>(`/comparisons/${id}`),

  patients: () => request<T.PatientSummary[]>('/admin/patients'),
  patientOverview: (id: string) => request<T.PatientOverview>(`/admin/patients/${id}/overview`),
};
