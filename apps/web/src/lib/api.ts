// Typed API client. Identity is DEV-ONLY (x-student-id); replace with real auth before launch.
const BASE = import.meta.env.VITE_API_URL || '';
export const access = { get: () => sessionStorage.getItem('pathway.accessCode'), set: (code: string) => sessionStorage.setItem('pathway.accessCode', code) };
export const accessHeaders = (): Record<string, string> => access.get() ? { 'x-access-code': access.get()! } : {};
const KEY = 'pathway.studentId';
export const session = { get: () => localStorage.getItem(KEY), set: (id: string) => localStorage.setItem(KEY, id), clear: () => localStorage.removeItem(KEY) };

export class ApiError extends Error { constructor(public status: number, message: string, public body?: unknown) { super(message); } }

export async function api<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = accessHeaders(); const id = session.get(); if (id) headers['x-student-id'] = id;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, { method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'), headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string; warning?: string }).error || (data as { warning?: string }).warning || 'Request failed', data);
  return data as T;
}
export const icsUrl = (eventId: string) => `${BASE}/api/events/${eventId}/ics`;
export async function download(path: string, filename: string) {
  const id = session.get(); const res = await fetch(BASE + path, { headers: { ...accessHeaders(), ...(id ? { 'x-student-id': id } : {}) } });
  const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
