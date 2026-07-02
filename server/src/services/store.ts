import type { CreateAlertArgs } from "../brain/schema";

// DEV in-memory store — stands in for Postgres + Redis while we test the LLM.
// Swap: alerts -> DB rows + Redis active set; currencies -> users.preferred_currency.

export type Currency = "USD" | "EUR" | "INR";

export type StoredAlert = {
  id: number;
  chatId: number;
  condition: CreateAlertArgs;
  anchorPrice: number; // live price at creation (pct_change compares against this)
  createdAt: number;
  expiresAt: number;
};

let nextId = 1;
const alerts = new Map<number, StoredAlert[]>(); // chatId -> alerts
const currencies = new Map<number, Currency>(); // chatId -> display currency

const prune = (list: StoredAlert[]) => list.filter((a) => a.expiresAt > Date.now());

export const store = {
  addAlert(a: Omit<StoredAlert, "id">): StoredAlert {
    const alert = { ...a, id: nextId++ };
    alerts.set(a.chatId, [...prune(alerts.get(a.chatId) ?? []), alert]);
    return alert;
  },
  listAlerts(chatId: number): StoredAlert[] {
    const live = prune(alerts.get(chatId) ?? []);
    alerts.set(chatId, live);
    return live;
  },
  deleteAlert(chatId: number, id: number): boolean {
    const live = this.listAlerts(chatId);
    const found = live.some((a) => a.id === id);
    alerts.set(chatId, live.filter((a) => a.id !== id));
    return found;
  },
  getCurrency: (chatId: number): Currency => currencies.get(chatId) ?? "USD",
  setCurrency: (chatId: number, c: Currency) => currencies.set(chatId, c),
};
