// Typed client the browser uses to call OUR OWN Next /api (the BFF) — never Express directly.
// Real methods (getAlerts, createAlert, ...) added as endpoints land. ARCHITECTURE.md §5.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path.replace(/^\//, "")}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}
