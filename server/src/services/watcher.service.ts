import { getActive } from "../cache/active";
import { cachedPrice } from "../cache/price";
import { isMarketOpen } from "../adapters/market";
import { evaluate, isExpired } from "../engine/evaluate";
import { plog } from "../lib/logger";
import { fireAlert, prepareExpiry, type PreparedExpiry } from "./notify.service";
import { enqueueDelivery, enqueueExpiryBatch } from "../queues/queues";
import { healActive } from "./alert.service";

// The per-minute tick (ARCHITECTURE.md §11). Error policy (user decision):
// SKIP, LOG, RETRY NEXT MINUTE. A failed symbol fetch skips its alerts; a failed alert
// never blocks the others; nothing mutates state on a failure path.

let tickNo = 0;

export async function runTick(): Promise<void> {
  const n = ++tickNo;
  const t0 = Date.now();

  const { alerts, missing } = await getActive();
  if (missing.length > 0) await healActive(missing); // ids in the set with no hash → reload from PG

  if (alerts.length === 0) {
    plog.dim(`tick #${n}: no active alerts`);
    return;
  }

  // 1) EXPIRY FIRST (user rule): a move after the window closed must not count.
  const expired = alerts.filter((a) => isExpired(a.expiresAt));
  const live = alerts.filter((a) => !isExpired(a.expiresAt));
  const prepared = (
    await Promise.all(
      expired.map(async (a) => {
        try {
          const p = await cachedPrice(a.condition.symbol); // best effort — enriches the ⌛ message
          return await prepareExpiry(a, p?.price ?? null);
        } catch (e) {
          plog.error(`tick #${n}: expiry of ${a.id.slice(0, 8)} failed — ${(e as Error).message} (retry next tick)`);
          return null;
        }
      }),
    )
  ).filter((x): x is PreparedExpiry => x != null && x.deliveryId != null && x.chatId != null);

  // Telegram ⌛ sends grouped per user: 1 expiry → normal send, several → ONE summary
  const byChat = new Map<number, PreparedExpiry[]>();
  for (const p of prepared) byChat.set(p.chatId as number, [...(byChat.get(p.chatId as number) ?? []), p]);
  for (const [chatId, items] of byChat) {
    if (items.length === 1) {
      await enqueueDelivery(items[0].deliveryId as string);
    } else {
      const text = `⌛ ${items.length} alerts expired without firing:\n${items.map((i) => `• ${i.line}`).join("\n")}`;
      await enqueueExpiryBatch(items.map((i) => i.deliveryId as string), text);
      plog.queue(`batched ${items.length} expiry pings into 1 message for chat ${chatId}`);
    }
  }

  // 2) Market gating + one price fetch per unique symbol — all fetches IN PARALLEL,
  //    so the tick costs ~the slowest single fetch, not the sum (one slow source
  //    can no longer stretch a tick to 20s+).
  const open = live.filter((a) => isMarketOpen(a.condition.symbol));
  const closed = live.length - open.length;
  const symbols = [...new Set(open.map((a) => a.condition.symbol))];
  const fetched = await Promise.all(
    symbols.map(async (s) => [s, await cachedPrice(s)] as const), // failure logged inside; null = skip this tick
  );
  const prices = new Map<string, number>();
  let cacheHits = 0;
  for (const [s, p] of fetched) {
    if (p) {
      prices.set(s, p.price);
      if (p.cached) cacheHits++;
    }
  }

  // 3) Evaluate — per-alert try/catch so one bad alert never blocks the rest.
  let fired = 0;
  let skippedNoData = 0;
  for (const a of open) {
    const price = prices.get(a.condition.symbol);
    if (price == null) {
      skippedNoData++;
      continue; // no data this tick — untouched, retried next minute
    }
    try {
      if (evaluate(a.condition, a.anchorPrice, price)) {
        await fireAlert(a, price);
        fired++;
      }
    } catch (e) {
      plog.error(`tick #${n}: alert ${a.id.slice(0, 8)} failed — ${(e as Error).message} (retry next tick)`);
    }
  }

  const parts = [
    `${alerts.length} active`,
    expired.length && `${expired.length} expired ⌛`,
    closed && `${closed} market-closed 🌙`,
    `${symbols.length} symbol${symbols.length === 1 ? "" : "s"} (${cacheHits} cache-hit)`,
    skippedNoData && `${skippedNoData} skipped (no data) ⏭️`,
    fired ? `${fired} FIRED 🔔` : "0 fired",
    `${Date.now() - t0}ms`,
  ].filter(Boolean);
  plog.tick(`#${n}: ${parts.join(" · ")}`);
}
