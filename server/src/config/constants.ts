// Redis keys & TTLs (ARCHITECTURE.md §9). Central so API + worker agree.
export const ACTIVE_ALERTS_KEY = "active_alerts";
export const alertKey = (id: string) => `alert:${id}`;
export const priceKey = (symbol: string) => `price:${symbol}`;
export const historyKey = (symbol: string, interval: string) => `hist:${symbol}:${interval}`;
export const verifyKey = (token: string) => `verify:${token}`;

export const PRICE_TTL_SECONDS = 45;
export const VERIFY_TTL_SECONDS = 600;

export const WATCHER_CRON = "* * * * *"; // every minute (BullMQ repeatable) — ARCHITECTURE.md §11
