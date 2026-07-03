import { eq } from "drizzle-orm";
import { getPrice } from "./adapters/registry";
import type { Condition } from "./brain/schema";
import { getActive, removeActive } from "./cache/active";
import { getHistory, pushTurn } from "./cache/chat";
import { redis } from "./cache/redis";
import { db, pool } from "./models/db";
import { alerts, deliveries } from "./models/schema";
import { findOrCreateByChatId } from "./models/users.repo";
import { deliverQueue } from "./queues/queues";
import { startDeliveryWorker, startWatcher } from "./queues/workers";
import { createAlert, deleteAlert, listAlerts, rehydrateActive } from "./services/alert.service";
import { fireAlert } from "./services/notify.service";
import { runTick } from "./services/watcher.service";

// PIPELINE smoke test — proves the full loop: Redis · Postgres · queue · cron · fire ·
// expiry · dedupe · rehydrate · REAL Telegram landings. Run with the dev server STOPPED
// (it starts its own workers):  npx tsx src/smoke.pipeline.ts
//
// Sends 2 real notifications (1 🔔 fire + 1 ⌛ expiry) to TEST_CHAT — that's the proof.

const TEST_CHAT = 1764981523; // the dev user's real chat (from earlier sessions)

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const alertRow = async (id: string) => (await db.select().from(alerts).where(eq(alerts.id, id)))[0];
const deliveryRows = (alertId: string) => db.select().from(deliveries).where(eq(deliveries.alertId, alertId));

async function waitFor(what: string, test: () => Promise<boolean>, timeoutMs = 20_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await test()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`  ⏰ timed out waiting for: ${what}`);
  return false;
}

async function main() {
  console.log("=== PIPELINE SMOKE (Redis + PG + BullMQ + Telegram) ===\n");

  // ── 1. Redis up ──
  console.log("— redis —");
  check("redis PING", (await redis.ping()) === "PONG");
  await redis.set("smoke:probe", "1", "EX", 10);
  check("redis SET/GET roundtrip", (await redis.get("smoke:probe")) === "1");

  // ── 2. Chat history window ──
  console.log("— chat history (7 msgs, 1h TTL) —");
  for (let i = 1; i <= 9; i++) await pushTurn(TEST_CHAT + 1e9, { role: "user", content: `m${i}` });
  const hist = await getHistory(TEST_CHAT + 1e9);
  check("keeps only last 7", hist.length === 7 && hist[0].content === "m3" && hist[6].content === "m9");
  const ttl = await redis.ttl(`chat:${TEST_CHAT + 1e9}`);
  check("history has ~1h TTL", ttl > 3500 && ttl <= 3600, `ttl=${ttl}s`);
  await redis.del(`chat:${TEST_CHAT + 1e9}`);

  // ── 3. PG: telegram-first user auto-create ──
  console.log("— postgres —");
  const user = await findOrCreateByChatId(TEST_CHAT, "pipeline-smoke");
  check("findOrCreate user for real chat", !!user.userId, `user ${user.userId.slice(0, 8)}`);
  const again = await findOrCreateByChatId(TEST_CHAT);
  check("second resolve = same user (no dup)", again.userId === user.userId);

  // ── 4. Create → PG row + Redis hot copy ──
  console.log("— create pipeline —");
  const btc = (await getPrice("BTC")).price;
  const cond: Condition = { kind: "absolute", symbol: "BTC", op: "above", value: Math.round(btc * 1.005 * 100) / 100 } as Condition;
  const c = await createAlert(user, cond);
  if (!c.ok) throw new Error(`create failed: ${c.reason}`);
  const id = c.alert.id;
  check("alert saved to PG (status=active)", (await alertRow(id))?.status === "active", id.slice(0, 8));
  check("alert in Redis active set", (await redis.sismember("active_alerts", id)) === 1);
  const hot = await redis.hgetall(`alert:${id}`);
  check("hot copy fields complete", hot.chatId === String(TEST_CHAT) && !!hot.condition && !!hot.anchorPrice && !!hot.expiresAt);

  // ── 5. Tick without a cross → nothing fires ──
  console.log("— tick (no cross) —");
  await runTick();
  check("still active after tick", (await alertRow(id))?.status === "active");

  // ── 6. Simulate the price crossing (tamper the hot copy) → tick fires it ──
  console.log("— tick (forced cross) → FIRE —");
  const crossed: Condition = { kind: "absolute", symbol: "BTC", op: "below", value: Math.round(btc * 1.5) } as Condition;
  await redis.hset(`alert:${id}`, "condition", JSON.stringify(crossed));
  await runTick();
  check("PG status=triggered", (await alertRow(id))?.status === "triggered");
  check("removed from active set", (await redis.sismember("active_alerts", id)) === 0);
  const dels = await deliveryRows(id);
  check("2 delivery rows (telegram + inapp)", dels.length === 2, dels.map((d) => `${d.channel}:${d.status}`).join(" "));

  // ── 7. Delivery worker → notification LANDS in Telegram ──
  console.log("— delivery (real send) —");
  const dw = startDeliveryWorker();
  const landed = await waitFor("both deliveries sent", async () => {
    const rows = await deliveryRows(id);
    return rows.length === 2 && rows.every((d) => d.status === "sent");
  });
  check("🔔 fire delivered (check your Telegram!)", landed, (await deliveryRows(id)).map((d) => `${d.channel}:${d.status}`).join(" "));

  // ── 8. Double-fire guard (crash replay) ──
  console.log("— dedupe guard —");
  await fireAlert(
    { id, userId: user.userId, chatId: TEST_CHAT, condition: crossed, anchorPrice: btc, createdAt: Date.now(), expiresAt: Date.now() + 3600_000 },
    btc,
  );
  check("replayed fire = no new deliveries", (await deliveryRows(id)).length === 2);

  // ── 9. Expiry-first rule → ⌛ ping ──
  console.log("— expiry pipeline —");
  const e = await createAlert(user, { kind: "absolute", symbol: "BTC", op: "above", value: Math.round(btc * 1.5) } as Condition);
  if (!e.ok) throw new Error(`expiry-test create failed: ${e.reason}`);
  await redis.hset(`alert:${e.alert.id}`, "expiresAt", String(Date.now() - 1000)); // time's up
  await runTick();
  check("PG status=expired", (await alertRow(e.alert.id))?.status === "expired");
  const esent = await waitFor("expiry delivery sent", async () =>
    (await deliveryRows(e.alert.id)).some((d) => d.channel === "telegram" && d.status === "sent"),
  );
  check("⌛ expiry ping delivered (check Telegram!)", esent);

  // ── 9b. BATCHED expiry: several expiries in one tick → ONE summary message ──
  console.log("— batched expiry (2 alerts → 1 message) —");
  const b1 = await createAlert(user, { kind: "absolute", symbol: "ETH", op: "above", value: 888888 } as Condition);
  const b2 = await createAlert(user, { kind: "absolute", symbol: "SOL", op: "above", value: 888888 } as Condition);
  if (!b1.ok || !b2.ok) throw new Error("batch-test create failed");
  await redis.hset(`alert:${b1.alert.id}`, "expiresAt", String(Date.now() - 1000));
  await redis.hset(`alert:${b2.alert.id}`, "expiresAt", String(Date.now() - 1000));
  await runTick();
  check(
    "both expired in PG",
    (await alertRow(b1.alert.id))?.status === "expired" && (await alertRow(b2.alert.id))?.status === "expired",
  );
  const bsent = await waitFor("batched expiry sent", async () => {
    const rows = [...(await deliveryRows(b1.alert.id)), ...(await deliveryRows(b2.alert.id))];
    const tg = rows.filter((d) => d.channel === "telegram");
    return tg.length === 2 && tg.every((d) => d.status === "sent");
  });
  check("⌛ 2 expiries delivered as ONE batch message (check Telegram!)", bsent);

  // ── 10. Rehydrate: PG → Redis (kill the hot copy, rebuild it) ──
  console.log("— rehydrate —");
  const r = await createAlert(user, { kind: "absolute", symbol: "ETH", op: "above", value: 999999 } as Condition);
  if (!r.ok) throw new Error(`rehydrate-test create failed: ${r.reason}`);
  await removeActive(r.alert.id); // simulate Redis loss of this alert
  check("hot copy gone", (await redis.sismember("active_alerts", r.alert.id)) === 0);
  await rehydrateActive();
  check("rehydrate rebuilt it from PG", (await redis.sismember("active_alerts", r.alert.id)) === 1);
  const { alerts: hotNow } = await getActive();
  check("rebuilt hash parses (chatId intact)", hotNow.some((h) => h.id === r.alert.id && h.chatId === TEST_CHAT));

  // ── 11. The real cron: BullMQ repeatable tick actually runs on schedule ──
  console.log("— cron (BullMQ repeatable, waits ≤75s for the minute boundary) —");
  const ww = await startWatcher();
  const ticked = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), 75_000);
    ww.on("completed", () => {
      clearTimeout(t);
      resolve(true);
    });
  });
  check("scheduled tick ran via BullMQ cron", ticked);

  // ── cleanup ──
  console.log("— cleanup —");
  await deleteAlert(user.userId, r.alert.id);
  check("cleanup: 0 active alerts left for test user", (await listAlerts(user.userId)).length === 0);

  console.log(`\n=== PIPELINE RESULT: ${pass} passed, ${fail} failed (${pass + fail} checks) ===`);
  await ww.close();
  await dw.close();
  await deliverQueue.close();
  await redis.quit().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("pipeline smoke crashed:", e);
  process.exit(1);
});
