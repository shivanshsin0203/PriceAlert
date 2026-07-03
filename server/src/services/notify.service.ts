import { UnrecoverableError } from "bullmq";
import { Api, GrammyError } from "grammy";
import { groundedFireContext } from "../brain/deepseek";
import { removeActive, type HotAlert } from "../cache/active";
import { env } from "../config/env";
import { pctFromAnchor } from "../engine/evaluate";
import { plog } from "../lib/logger";
import { markExpired, markTriggered } from "../models/alerts.repo";
import { insertPending, loadForDelivery, markFailed, markSent, type Channel } from "../models/deliveries.repo";
import { label } from "../adapters/symbols";
import { enqueueDelivery } from "../queues/queues";
import { fmtPrice } from "./format";

// The fire/expiry pipeline (ARCHITECTURE.md §11 step 5 + §12).
// Order is load-bearing: PG (durable truth) → enqueue → drop from hot set.
// Crash replay is harmless: markX() no-ops on non-active rows, insertPending() dedupes
// on UNIQUE(alert_id, channel), and the replay just completes the removeActive.

const api = new Api(env.TELEGRAM_BOT_TOKEN);
const CHANNELS: Channel[] = ["telegram", "inapp"];

// Deliveries are sent with parse_mode HTML (bold at a glance). Our own text is
// controlled; only the AI sentence gets escaped before it's embedded.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── message builders (deterministic core — the AI sentence is appended on top) ──

export function buildFireText(a: HotAlert, current: number): string {
  const c = a.condition;
  if (c.kind === "absolute") {
    return `🔔 <b>ALERT FIRED</b>\n<b>${label(c.symbol)}</b> is ${c.op} <b>${fmtPrice(c.value, c.symbol)}</b> — now at <b>${fmtPrice(current, c.symbol)}</b>.`;
  }
  const moved = pctFromAnchor(a.anchorPrice, current);
  const sign = moved >= 0 ? "+" : "";
  return `🔔 <b>ALERT FIRED</b>\n<b>${label(c.symbol)}</b> moved <b>${sign}${moved.toFixed(2)}%</b> (your target: ${c.dir === "up" ? "+" : "−"}${c.pct}% in ${c.window.value}${c.window.unit})\n${fmtPrice(a.anchorPrice, c.symbol)} → <b>${fmtPrice(current, c.symbol)}</b>`;
}

export function buildExpiryText(a: HotAlert, current: number | null): string {
  const c = a.condition;
  if (c.kind === "absolute") {
    const now = current != null ? ` ${label(c.symbol)} is at <b>${fmtPrice(current, c.symbol)}</b>.` : "";
    return `⌛ <b>ALERT EXPIRED</b>\nYour "<b>${label(c.symbol)}</b> ${c.op} ${fmtPrice(c.value, c.symbol)}" alert reached its 24h limit without firing.${now}`;
  }
  const moved = current != null ? pctFromAnchor(a.anchorPrice, current) : null;
  const detail =
    moved != null
      ? ` It moved <b>${moved >= 0 ? "+" : ""}${moved.toFixed(2)}%</b> (needed ${c.dir === "up" ? "+" : "−"}${c.pct}%).`
      : "";
  return `⌛ <b>ALERT EXPIRED</b>\nYour "<b>${label(c.symbol)}</b> ${c.dir === "up" ? "+" : "−"}${c.pct}% in ${c.window.value}${c.window.unit}" window ended without firing.${detail}`;
}

// ── fire / expire (called by the watcher tick) ──

async function finalize(a: HotAlert, kind: "fire" | "expiry", text: string, current: number | null): Promise<void> {
  for (const channel of CHANNELS) {
    const d = await insertPending({
      alertId: a.id,
      userId: a.userId,
      channel,
      price: current ?? undefined,
      contextText: text,
      payload: { kind, condition: a.condition, anchorPrice: a.anchorPrice, current },
    });
    if (!d) {
      plog.skip(`${kind} ${a.id.slice(0, 8)}: ${channel} delivery already exists (crash-replay dedupe)`);
      continue;
    }
    await enqueueDelivery(d.id);
    plog.queue(`enqueued ${channel} delivery ${d.id.slice(0, 8)} for alert ${a.id.slice(0, 8)}`);
  }
  await removeActive(a.id);
}

export async function fireAlert(a: HotAlert, current: number): Promise<void> {
  const row = await markTriggered(a.id);
  if (!row) {
    // already terminal in PG (crash replay / concurrent transition) — just finish the cleanup
    plog.skip(`fire ${a.id.slice(0, 8)}: already terminal in PG — cleaning hot copy`);
    await removeActive(a.id);
    return;
  }
  plog.fire(`${label(a.condition.symbol)} → TRIGGERED (alert ${a.id.slice(0, 8)}, now ${fmtPrice(current, a.condition.symbol)})`);

  // AI-grounded context (§14.3): one neutral sentence from the REAL numbers; ≤6s or skipped.
  let text = buildFireText(a, current);
  const c = a.condition;
  const ctx = await groundedFireContext({
    asset: label(c.symbol),
    kind: c.kind,
    anchorPrice: a.anchorPrice,
    currentPrice: current,
    movedPct: Number(pctFromAnchor(a.anchorPrice, current).toFixed(2)),
    target: c.kind === "absolute" ? `${c.op} ${fmtPrice(c.value, c.symbol)}` : `${c.dir} ${c.pct}%`,
    ...(c.kind === "pct_change" ? { window: `${c.window.value}${c.window.unit}` } : {}),
  });
  if (ctx) text += `\n\n💡 ${esc(ctx)}`;
  text += `\n<i>Not financial advice.</i>`;

  await finalize(a, "fire", text, current);
}

// One short line per alert for the batched ⌛ summary message.
function expiryLine(a: HotAlert, current: number | null): string {
  const c = a.condition;
  if (c.kind === "absolute") {
    const now = current != null ? ` (now ${fmtPrice(current, c.symbol)})` : "";
    return `<b>${label(c.symbol)}</b> ${c.op} ${fmtPrice(c.value, c.symbol)} — not reached${now}`;
  }
  const moved = current != null ? pctFromAnchor(a.anchorPrice, current) : null;
  const m = moved != null ? `moved <b>${moved >= 0 ? "+" : ""}${moved.toFixed(2)}%</b>` : "didn't move enough";
  return `<b>${label(c.symbol)}</b> ${m} (needed ${c.dir === "up" ? "+" : "−"}${c.pct}% in ${c.window.value}${c.window.unit})`;
}

export type PreparedExpiry = { chatId: number; deliveryId: string | null; line: string };

// Batch-aware expiry (user decision: batch ⌛ pings, never 🔔 fires). Durable rows are
// still ONE PER ALERT (inbox + UNIQUE dedupe guard untouched) — only the telegram SEND
// is grouped by the caller: 1 expiry → normal send, several → one summary message.
export async function prepareExpiry(a: HotAlert, current: number | null): Promise<PreparedExpiry | null> {
  const row = await markExpired(a.id);
  if (!row) {
    plog.skip(`expire ${a.id.slice(0, 8)}: already terminal in PG — cleaning hot copy`);
    await removeActive(a.id);
    return null;
  }
  plog.expire(`${label(a.condition.symbol)} window ended without firing (alert ${a.id.slice(0, 8)})`);

  const text = buildExpiryText(a, current);
  let telegramId: string | null = null;
  for (const channel of CHANNELS) {
    const d = await insertPending({
      alertId: a.id,
      userId: a.userId,
      channel,
      price: current ?? undefined,
      contextText: text,
      payload: { kind: "expiry", condition: a.condition, anchorPrice: a.anchorPrice, current },
    });
    if (!d) {
      plog.skip(`expiry ${a.id.slice(0, 8)}: ${channel} delivery already exists (crash-replay dedupe)`);
      continue;
    }
    if (channel === "inapp") await enqueueDelivery(d.id);
    else telegramId = d.id; // sent by the watcher — alone or inside a batch
  }
  await removeActive(a.id);
  return { chatId: a.chatId, deliveryId: telegramId, line: expiryLine(a, current) };
}

// One summary message covering several expiry deliveries (job "sendBatch").
// Idempotent on retry: rows already 'sent' are excluded; nothing pending = no send.
export async function deliverBatch(deliveryIds: string[], text: string): Promise<void> {
  const rows = (await Promise.all(deliveryIds.map((id) => loadForDelivery(id)))).filter(
    (r): r is NonNullable<typeof r> => r != null,
  );
  const pending = rows.filter((r) => r.status !== "sent");
  if (pending.length === 0) return;

  const chatId = pending[0].chatId;
  if (chatId == null) {
    await Promise.all(pending.map((r) => markFailed(r.id)));
    throw new UnrecoverableError("batch delivery: user has no telegram link");
  }
  try {
    await api.sendMessage(chatId, text, { parse_mode: "HTML" });
  } catch (e) {
    if (e instanceof GrammyError && e.error_code === 403) {
      await Promise.all(pending.map((r) => markFailed(r.id)));
      throw new UnrecoverableError("batch delivery: bot blocked by user");
    }
    throw e; // transient → BullMQ retries the whole batch (sent rows are skipped on replay)
  }
  await Promise.all(pending.map((r) => markSent(r.id)));
  plog.deliver(`telegram batch (${pending.length} expiries in 1 message) → chat ${chatId} ✓ landed`);
}

// ── delivery execution (called by the BullMQ delivery worker) ──

export async function deliverOne(deliveryId: string): Promise<void> {
  const d = await loadForDelivery(deliveryId);
  if (!d) throw new UnrecoverableError(`delivery ${deliveryId} not found`);
  if (d.status === "sent") return; // idempotent retry

  if (d.channel === "inapp") {
    await markSent(d.id); // the row IS the inbox entry
    plog.deliver(`inapp ${d.id.slice(0, 8)} marked sent (inbox row)`);
    return;
  }

  if (d.chatId == null) {
    await markFailed(d.id);
    throw new UnrecoverableError(`delivery ${deliveryId}: user has no telegram link`);
  }

  try {
    await api.sendMessage(d.chatId, d.contextText ?? "🔔 Alert update", { parse_mode: "HTML" });
  } catch (e) {
    if (e instanceof GrammyError && e.error_code === 403) {
      // user blocked the bot — permanent, don't burn retries
      await markFailed(d.id);
      throw new UnrecoverableError(`delivery ${deliveryId}: bot blocked by user`);
    }
    throw e; // transient (network / 429 / 5xx) → BullMQ retries with backoff
  }
  await markSent(d.id);
  plog.deliver(`telegram ${d.id.slice(0, 8)} → chat ${d.chatId} ✓ landed`);
}
