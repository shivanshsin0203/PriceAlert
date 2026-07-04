# DONE.md — build log & session context

> What is **actually built and verified** so far. Read this + `ARCHITECTURE.md` (the contract)
> at the start of a session. ARCHITECTURE.md says how things must work; this file says what
> exists, what was decided along the way, and what's left. Last updated: **2026-07-04**.

## Status at a glance

| Phase | State |
|---|---|
| 1. Skeletons (Express MVC + Next.js BFF) | ✅ done |
| 2. Price adapters (Binance/Yahoo/gold-api/er-api, keyless) | ✅ done |
| 3. Brain (DeepSeek V3, JSON envelope, Zod re-validation) | ✅ done — 83-check suite |
| 4. Telegram dev bot (@Pricealert_devbot, long-polling) | ✅ done |
| 5. Persistence (Neon PG + Redis + BullMQ watcher + deliveries) | ✅ done — 24-check pipeline suite |
| 6. Dashboard (pre-auth, dummy user) | ✅ done — live-verified 2026-07-04 |
| 7. Design pass on dashboard | ⬜ next (skeleton UI only so far) |
| 8. Auth (Google OAuth via BFF, JWT, deep-link Telegram binding) | ⬜ planned |
| 9. Deploy (VM + PM2 `ecosystem.config.js`, Vercel client) | ⬜ planned |

## Stack (locked — see ARCHITECTURE.md)

- `server/` Express + TS (MVC: routes → controllers → services → models), Drizzle ORM → **Neon Postgres** (truth), **Redis** (hot mirror, self-hosted Docker), **BullMQ** (cron watcher + delivery queue), grammY (Telegram), OpenAI SDK → **DeepSeek V3** (`deepseek-chat`, JSON mode).
- `client/` Next.js 15 App Router + React 19. Browser → **BFF proxy** (`app/api/[...proxy]/route.ts` → `EXPRESS_API_URL`, default `localhost:4000`) — never Express directly, no CORS. Chart: **lightweight-charts v5**.
- Two processes in `server/`: `src/server.ts` (HTTP API) and `src/worker.ts` (bot + watcher + delivery worker). `npm run dev` runs both.

## Operational facts (needed every session)

- Redis: Docker container **`alert-redis`** (redis:7-alpine, AOF, :6379). Start Docker Desktop + container before `npm run dev`.
- Dev user = the real Telegram user, chat_id **1764981523** → `DASHBOARD_CHAT_ID` env (default in `config/env.ts`). Dashboard and bot share this ONE identity — alerts/notifications appear on both surfaces.
- Migrations: `npx drizzle-kit generate` + `migrate` (0000 = base schema, 0001 = `deliveries.dismissed_at`).
- Typecheck needs `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` (heap).
- **Never run `next build` while `next dev` is running** — corrupts `.next`, dashboard 500s (MODULE_NOT_FOUND). Fix: stop dev, `rm -rf .next`, restart.
- Test suites (all in `server/src/`): `smoke.ts` (83 brain checks) · `smoke.pipeline.ts` (24, sends REAL telegram msgs) · `smoke.stability.ts` (7 flaky phrasings ×3) · `smoke.absurd.ts` (29 hostile inputs).

## Core engine behavior (phases 2–5, all verified)

- Symbols: 13 crypto, 15 US stocks, 15 Indian stocks (₹, NSE via Yahoo, ZOMATO→ETERNAL), NIFTY, OIL alertable; XAU/XAG + 5 forex pairs **price-only**. Registry pattern; all fetches have a 6s hard timeout (`adapters/http.ts`).
- Alert = one-shot `Condition`: `absolute` (above/below level, 24h lifetime) or `pct_change` (dir/pct/window, window 5min–24h = lifetime, **anchor price stored at creation**).
- Create path (`alert.service.createAlert`, used by BOT and DASHBOARD): live price → guards (already-true, market-closed for %, min window) → PG insert → Redis hot copy (`active_alerts` SET + `alert:{id}` HASH). Every failure = specific friendly reason, never silence.
- Watcher: BullMQ repeatable job `* * * * *`. Tick = expiry check FIRST (batched ⌛ per user), then parallel price fetch per unique symbol (45s Redis price cache), evaluate, fire.
- Fire order (crash-safe): PG transition (guarded `WHERE status='active'`) → insert deliveries (UNIQUE(alert_id,channel) dedupe) → enqueue → Redis SREM. Delivery worker = event-driven (BZPOPMIN), retries ×5 exp backoff, 403 = UnrecoverableError.
- **Every fire/expiry writes BOTH channels**: `telegram` (push, lands ~2–3s) + `inapp` (the dashboard bell inbox row). Symmetry is structural — channels are hardcoded at insert and fire time.
- Fire message: deterministic core + AI-grounded 💡 sentence (`groundedFireContext`, 6s timeout, falls back silently) + "Not financial advice", HTML parse_mode.
- Brain rules that took iteration (see `brain/prompt.ts`): %-without-direction → ask; "goes above N%" = pct up; pre-emit checklist; vague "hows the market" → brief answer not 10 symbols; user-stated timeframe only (never default 1h silently).
- Redis outage: bot degrades gracefully, watcher skips, auto-rehydrate from PG on reconnect (`rehydrateActive`/`healActive`).

## Dashboard (phase 6 — built & live-verified 2026-07-04)

**Server REST** (`/api`, all behind `dashboardUser` middleware — the future-JWT seam):
- `GET/POST/DELETE /alerts` — same `createAlert` service as bot, NO LLM. Guard reasons surface verbatim as 422.
- `GET /alerts/:id/history` — graph data **fetched on demand** from provider 1m candles (Binance klines / Yahoo chart; ≥16h span drops to 5m). NO price storage. 15-min lead-in before creation; terminal alerts freeze at fire/expiry moment; live tail from price cache; Redis 30s cache (`hist:{id}`). Terminal stats use last charted point as "current".
- `GET /notifications` + `/unread-count`, `POST /read-all`, `DELETE /:id` — bell reads the existing `inapp` delivery rows. Dismiss = soft delete (`dismissed_at`), audit survives. `read` column existed since schema day one.
- `GET /symbols` (grouped, drives create form) · `POST /me/currency` (same pref as bot's change_currency — two-way sync, reflected ≤1 poll).
- Serializer computes: `targetPrice` (pct → anchor±%), `distanceToTarget` ("needs +2.4% rise"), `movedFromAnchorPct`, `progressPct`, **`targetReached`** (condition already met → card shows "🎯 target reached — firing on the next check" instead of a nonsense flipped sign), all price strings pre-formatted.
- **Currency display rule (user decision)**: creation ALWAYS in asset's native quote (crypto/US $, Indian ₹, NIFTY points — form shows the unit); display in user's selected currency **with native in parens** (`₹167,875 ($1,761)`); Indian/NIFTY never converted.

**Client** (`client/`, working skeleton — design pass pending):
- `/dashboard`: cards grid (name, condition, live price, needs-%, labeled journey bar, countdown ticking every 30s), polls alerts+unread every **20s**.
- Components: `AlertCard`, `CreateAlertModal` (grouped dropdown, native-currency hint, guard errors shown verbatim), `NotificationBell` (badge, read-all on open, per-row dismiss, optimistic), `PriceGraphModal`.
- Graph: chart created ONCE and mutated in place (zoom/crosshair survive 30s refreshes), area gradient, per-asset decimals (DOGE 4–6, BTC 2), **local-time axis** (tz-offset shift), target line + "created" (anchor) dotted line + created/fired markers (snapped to nearest candle), stats strip below: Now · When created · Target · Change since created · Still needs · Created · Fired/Expires.
- Anchor is never called "anchor" in UI — it's "When created" (= price at alert creation, baseline for % math).

**Verified live (2026-07-04)**: absolute + pct create/fire/expire via REST; fire landed in bell AND Telegram (13/13 terminal alerts have both channels sent); timing measured (inapp +1.8s, telegram +2.6–3.1s after fire — bell lag is purely the 20s poll, by design); market-closed + min-window guards; delete idempotency (200→404); currency flip USD↔INR live; `targetReached` 8/8 unit sweep; `next build` + both typechecks clean.

## Known trade-offs (deliberate, not bugs)

- Bell ≤20s behind Telegram (poll vs push). SSE is the upgrade path if ever wanted.
- Fired cards vanish on next poll (bell/Telegram are the instant signal).
- Stock/NIFTY graphs gap outside market hours (no data exists — any approach would).
- Journey bar ~0% for far absolute targets (the "needs +X%" line carries the meaning).
- `nl_input` never populated (bot doesn't store the original sentence) — cosmetic, maybe later.

## Deferred / open items

- `/history` command in bot (deliveries table has everything; ~20 lines).
- Parallelize AI-context calls when multiple alerts fire in one tick (serial ~1.5s each).
- Per-user rate limiting before anything goes public.
- Graceful shutdown (SIGTERM worker close).
- Design pass on dashboard → then **auth**: Google OAuth in BFF, JWT cookie, `dashboardUser` middleware swapped for JWT verify, deep-link `/start <token>` Telegram binding, `INTERNAL_API_SECRET` between BFF and Express.
