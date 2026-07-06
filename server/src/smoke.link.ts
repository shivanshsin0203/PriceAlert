import { eq } from "drizzle-orm";
import { redis } from "./cache/redis";
import { db, pool } from "./models/db";
import { alerts, deliveries, telegramLinks, users } from "./models/schema";
import { findAuthUser } from "./models/users.repo";
import { removeActive } from "./cache/active";
import { consumeLinkToken, createLinkToken } from "./services/telegram-link.service";

// Smoke: Telegram deep-link linking + placeholder merge (auth phase).
// Entirely synthetic (fake chat id, fake google user) — creates, merges, verifies, CLEANS UP.
// Run: npx tsx src/smoke.link.ts

const FAKE_CHAT = 999_000_111;
let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

async function main() {
  // ── setup: a google user (link target) + a telegram-first placeholder with 1 alert + 1 delivery ──
  const [google] = await db
    .insert(users)
    .values({ googleSub: "smoke-link-google-sub", email: "smoke-link@test.local", name: "Smoke Link" })
    .returning();
  const [placeholder] = await db.insert(users).values({}).returning();
  await db.insert(telegramLinks).values({ userId: placeholder.id, chatId: FAKE_CHAT, telegramUsername: "smokelink" });
  const [alert] = await db
    .insert(alerts)
    .values({
      userId: placeholder.id,
      condition: { kind: "absolute", symbol: "BTC", op: "above", value: 99_999_999 },
      symbols: ["BTC"],
      channels: ["telegram", "inapp"],
      status: "cancelled", // terminal → invisible to the watcher; merge moves it regardless of status
      expiresAt: new Date(Date.now() + 60_000),
      evalState: { anchorPrice: 1 },
    })
    .returning();
  const [delivery] = await db
    .insert(deliveries)
    .values({ alertId: alert.id, userId: placeholder.id, channel: "inapp", status: "sent", contextText: "smoke" })
    .returning();

  try {
    // ── the flow the dashboard + bot drive ──
    const minted = await createLinkToken(google.id);
    check("link token minted", minted.ok, minted.ok ? minted.url : minted.reason);
    if (!minted.ok) throw new Error("cannot continue");
    const token = new URL(minted.url).searchParams.get("start")!;

    const linked = await consumeLinkToken(token, FAKE_CHAT, "smokelink");
    check("consume → ok", linked.ok, linked.ok ? undefined : linked.reason);
    check("placeholder's alert counted in merge", linked.ok && !linked.already && linked.mergedAlerts === 1);

    const [movedAlert] = await db.select().from(alerts).where(eq(alerts.id, alert.id));
    check("alert re-owned by google user", movedAlert.userId === google.id);
    const [movedDelivery] = await db.select().from(deliveries).where(eq(deliveries.id, delivery.id));
    check("delivery (inbox history) re-owned", movedDelivery.userId === google.id);
    const gone = await db.select().from(users).where(eq(users.id, placeholder.id));
    check("placeholder user deleted", gone.length === 0);

    const me = await findAuthUser(google.id);
    check("findAuthUser sees the link", me?.chatId === FAKE_CHAT && me.telegramUsername === "smokelink");

    const replay = await consumeLinkToken(token, FAKE_CHAT, "smokelink");
    check("token is one-time", !replay.ok);

    const again = await createLinkToken(google.id);
    if (again.ok) {
      const t2 = new URL(again.url).searchParams.get("start")!;
      const relink = await consumeLinkToken(t2, FAKE_CHAT, "smokelink");
      check("re-linking same chat → already", relink.ok && relink.already);
    }
  } finally {
    // ── cleanup: nothing synthetic survives ──
    await db.delete(deliveries).where(eq(deliveries.id, delivery.id)).catch(() => {});
    await db.delete(alerts).where(eq(alerts.id, alert.id)).catch(() => {});
    await removeActive(alert.id).catch(() => {});
    await db.delete(telegramLinks).where(eq(telegramLinks.chatId, FAKE_CHAT)).catch(() => {});
    await db.delete(users).where(eq(users.id, placeholder.id)).catch(() => {});
    await db.delete(users).where(eq(users.id, google.id)).catch(() => {});
    await redis.del(`tguser:${FAKE_CHAT}`).catch(() => {});
  }

  console.log(`\n${failed === 0 ? "🎉" : "💥"} ${passed} passed, ${failed} failed`);
  await redis.quit();
  await pool.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("💥 suite crashed:", e);
  process.exit(1);
});
