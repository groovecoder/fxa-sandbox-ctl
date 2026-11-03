// The reads and writes of the v1 endpoints: no-store, r.ok checked, JSON parsed, and {data} or {error}, never a throw.
export type Got<T = unknown> = { data: T; etag: string | null } | { error: string; status: number };

export async function getJson<T = unknown>(url: string, init: RequestInit = {}): Promise<Got<T>> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init });
    const j = await r.json().catch(() => undefined);
    if (!r.ok) return { error: (j as { error?: string } | undefined)?.error || `HTTP ${r.status}`, status: r.status };
    if (j === undefined) return { error: 'the answer is not JSON', status: r.status };
    return { data: j as T, etag: r.headers?.get?.('ETag') ?? null };
  } catch (e) {
    return { error: (e as Error)?.message || 'no answer', status: 0 };
  }
}

export const postJson = <T = unknown>(url: string, body: unknown) =>
  getJson<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Only the answer of the last call for a key counts: an older answer that comes later gives null.
const SEQ = new Map<string, number>();
export async function latest<T = unknown>(key: string, url: string): Promise<Got<T> | null> {
  const n = (SEQ.get(key) ?? 0) + 1;
  SEQ.set(key, n);
  const got = await getJson<T>(url);
  return SEQ.get(key) === n ? got : null;
}
