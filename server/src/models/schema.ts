import {
  bigint,
  boolean,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Enums (ARCHITECTURE.md §8) ──
export const currencyCode = pgEnum("currency_code", ["EUR", "USD", "INR"]);
export const alertStatus = pgEnum("alert_status", [
  "active",
  "triggered",
  "paused",
  "expired",
  "cancelled",
]);
export const deliveryChannel = pgEnum("delivery_channel", ["inapp", "telegram"]);
export const deliveryStatus = pgEnum("delivery_status", ["pending", "sent", "failed"]);

// ── users ── (email nullable: a user can be Telegram-first, before Google sign-in)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  googleSub: text("google_sub").unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  preferredCurrency: currencyCode("preferred_currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── alerts ── (the core rule; one-shot)
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: alertStatus("status").notNull().default("active"),
    nlInput: text("nl_input"),
    label: text("label"),
    condition: jsonb("condition").notNull(),
    symbols: text("symbols").array().notNull(),
    channels: deliveryChannel("channels").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    evalState: jsonb("eval_state"),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_alerts_status").on(t.status),
    index("idx_alerts_user").on(t.userId),
    index("idx_alerts_symbols").using("gin", t.symbols),
  ],
);

// ── telegram_links ── (chat_id ↔ user, 1:1)
export const telegramLinks = pgTable("telegram_links", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  chatId: bigint("chat_id", { mode: "number" }).notNull().unique(),
  telegramUsername: text("telegram_username"),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── deliveries ── (in-app inbox + fire/delivery history)
export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: deliveryChannel("channel").notNull(),
    status: deliveryStatus("status").notNull().default("pending"),
    price: numeric("price"),
    contextText: text("context_text"),
    payload: jsonb("payload"),
    read: boolean("read").notNull().default(false),
    firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // one-shot: hard guard against duplicate fire (ARCHITECTURE.md §11)
    uniqueIndex("uq_deliveries_alert_channel").on(t.alertId, t.channel),
    index("idx_deliveries_inbox").on(t.userId, t.firedAt),
    index("idx_deliveries_alert").on(t.alertId),
  ],
);
