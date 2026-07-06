// Typed client the browser uses to call OUR OWN Next /api (the BFF) — never Express directly.
// Mirrors the server's serializer DTOs (server/src/serializers/*). ARCHITECTURE.md §5.

export type Condition =
  | { kind: "absolute"; symbol: string; op: "above" | "below"; value: number }
  | { kind: "pct_change"; symbol: string; dir: "up" | "down"; pct: number; window: { value: number; unit: "m" | "h" | "d" } };

export type AlertDTO = {
  id: string;
  status: string;
  symbol: string;
  name: string;
  label: string;
  condition: Condition;
  description: string;
  displayCurrency: "USD" | "EUR" | "INR";
  anchorPrice: number;
  targetPrice: number;
  currentPrice: number | null;
  currentPriceFmt: string | null;
  targetPriceFmt: string;
  anchorPriceFmt: string;
  distanceToTarget: { pct: number; dir: "up" | "down" } | null;
  targetReached: boolean;
  movedFromAnchorPct: number | null;
  progressPct: number | null;
  createdAt: number;
  expiresAt: number;
  triggeredAt: number | null;
};

export type NotificationDTO = {
  id: string;
  alertId: string;
  kind: "fire" | "expiry";
  text: string;
  read: boolean;
  firedAt: number;
};

export type HistoryPoint = { t: number; p: number };
export type AlertHistoryResp = {
  alert: AlertDTO;
  history: { series: HistoryPoint[]; interval: "1m" | "5m"; from: number; to: number };
};

export type SymbolGroups = { groups: { label: string; symbols: { symbol: string; name: string }[] }[] };

export type MeDTO = {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  currency: "USD" | "EUR" | "INR";
  telegram: { linked: boolean; username: string | null };
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/${path.replace(/^\//, "")}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    // surface the server's friendly reason (guards, 404s) instead of a bare status code
    let msg = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) msg = j.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  symbols: () => apiFetch<SymbolGroups>("symbols"),
  alerts: () => apiFetch<{ currency: string; alerts: AlertDTO[] }>("alerts"),
  createAlert: (condition: Condition) =>
    apiFetch<{ alert: AlertDTO | null; note: string | null }>("alerts", {
      method: "POST",
      body: JSON.stringify({ condition }),
    }),
  deleteAlert: (id: string) => apiFetch<{ ok: boolean }>(`alerts/${id}`, { method: "DELETE" }),
  alertHistory: (id: string) => apiFetch<AlertHistoryResp>(`alerts/${id}/history`),
  notifications: () => apiFetch<{ notifications: NotificationDTO[]; unread: number }>("notifications"),
  unreadCount: () => apiFetch<{ unread: number }>("notifications/unread-count"),
  markAllRead: () => apiFetch<{ ok: boolean }>("notifications/read-all", { method: "POST" }),
  dismissNotification: (id: string) => apiFetch<{ ok: boolean }>(`notifications/${id}`, { method: "DELETE" }),
  setCurrency: (currency: "USD" | "EUR" | "INR") =>
    apiFetch<{ ok: boolean; currency: string }>("me/currency", { method: "POST", body: JSON.stringify({ currency }) }),
  me: () => apiFetch<MeDTO>("me"),
  telegramLinkToken: () => apiFetch<{ url: string }>("me/telegram/link-token", { method: "POST" }),
};
