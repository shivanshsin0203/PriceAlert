# DONE.md — build log & session context

> What is **actually built and verified** so far. Read this + `ARCHITECTURE.md` (the contract)
> at the start of a session. ARCHITECTURE.md says how things must work; this file says what
> exists, what was decided along the way, and what's left. Last updated: **2026-07-06**.

## Status at a glance

| Phase | State |
|---|---|
| 1. Skeletons (Express MVC + Next.js BFF) | ✅ done |
| 2. Price adapters (Binance/Yahoo/gold-api/er-api, keyless) | ✅ done |
| 3. Brain (DeepSeek V3, JSON envelope, Zod re-validation) | ✅ done — 83-check suite |
| 4. Telegram dev bot (@Pricealert_devbot, long-polling) | ✅ done |
| 5. Persistence (Neon PG + Redis + BullMQ watcher + deliveries) | ✅ done — 24-check pipeline suite |
| 6. Dashboard (pre-auth, dummy user) | ✅ done — live-verified 2026-07-04 |
| 7. Landing page + dashboard design pass | ✅ done 2026-07-05 (landing w/ sign-in, user menu, TG banner, CSS polish) |
| 8. Auth (Google OAuth via BFF, JWT, deep-link Telegram binding) | ✅ built 2026-07-05 — 9-check link suite + curl seam tests; creds added; **pending: live browser test of consent + phone /start tap** |
| 8.5 UI/UX + brand ("PriceAlert") | ✅ done 2026-07-06 — logo/favicon/OG/bot avatar, design system, landing + support + dashboard redesign |
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
- Test suites (all in `server/src/`): `smoke.ts` (83 brain checks) · `smoke.pipeline.ts` (24, sends REAL telegram msgs) · `smoke.stability.ts` (7 flaky phrasings ×3) · `smoke.absurd.ts` (29 hostile inputs) · `smoke.link.ts` (9 telegram link/merge checks, synthetic + self-cleaning).

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

## Auth (phase 8 — built 2026-07-05, locked decisions)

- **Custom OAuth + plain HS256 JWT** (the §6 TBD, confirmed with user — NOT Auth.js). Flow: browser → `client/app/api/auth/google` → Google consent → `…/auth/callback` exchanges the code server-side (client_secret never in browser), decodes the id_token (trusted: came from Google over TLS; `aud` checked), POSTs profile → Express `POST /internal/auth/login` (guarded by `x-internal-secret`) → upsert by `google_sub` (fallback: email) → **Express mints the JWT** (`lib/jwt.ts`, node:crypto, 7d) → BFF sets it as httpOnly `session` cookie → done.
- **Both trust proofs on /api/** (`auth.middleware.ts` `requireUser`): `x-internal-secret` (caller is our BFF) + `Bearer` JWT (who). **Dev fallback**: no JWT + `NODE_ENV=development` → acts as `DASHBOARD_CHAT_ID` user, so the dashboard works before Google creds exist. Production has no fallback. `/symbols` stays public (static list). Client `middleware.ts` gates `/dashboard` (jose verify, edge); gate is open while Google creds are empty (dev mode).
- **Secrets**: `JWT_SECRET` + `INTERNAL_API_SECRET` generated, in `server/.env` AND `client/.env.local` (must stay identical). `GOOGLE_CLIENT_ID/SECRET` empty in `client/.env.local` = dev-fallback mode. `TELEGRAM_BOT_USERNAME=Pricealert_devbot` added (deep links).
- **chatId is now nullable end-to-end** (Google-only users): `HotAlert.chatId: number|null` (Redis hash stores `""`), `loadActiveWithChat` LEFT join, fire/expiry write telegram rows **only if linked at fire time** (`channelsFor`), watcher expiry batching skips null chats. Linking later + `rehydrateActive()` upgrades hot copies in place → pre-link alerts start delivering to Telegram too.
- **Telegram deep-link + MERGE** (user decision: "link + merge"): dashboard `POST /api/me/telegram/link-token` → Redis `verify:{token}` (10 min, one-time via GETDEL) → `t.me/<bot>?start=<token>` → bot `/start <token>` → `telegram-link.service.consumeLinkToken`: if the chat belongs to an email-less placeholder user, its **alerts + deliveries are re-owned** by the Google user in one transaction, placeholder deleted, chat cache invalidated, active set rehydrated. A chat owned by a *real* (email≠null) account is refused. `GET /api/me` returns profile + `telegram.{linked,username}`; dashboard banner polls it every 4s while waiting.
- **Verified**: `smoke.link.ts` (9 checks — merge, one-time token, re-link idempotency, synthetic data w/ cleanup) · curl seam tests on a throwaway :4001 instance (login mints JWT; `/api/me` + `/api/alerts` scoped per user; tampered JWT/missing/wrong secret → 401; dev fallback resolves chat-1764981523 user; link-token lands in Redis) · both typechecks clean. **Not yet verified live**: the actual Google consent hop (creds pending) and a real phone `/start` tap.
- ⚠️ A test user (`google-sub-test-1`, the real gmail) exists in `users` from seam testing — the first real sign-in adopts this row via the email-match branch (google_sub gets overwritten). Harmless.
- ⚠️ After pulling these changes: restart Express AND `next dev` (new env vars + BFF headers), or the BFF/API will disagree on the internal secret.

## UI/UX + brand (phase 8.5 — done 2026-07-06)

- **Brand = "PriceAlert"** (matches the GitHub repo). Mark: a rising price line whose last tick
  becomes a ping — amber `#F5A524` on ink navy `#0B0F14`. **Color discipline (locked):** amber =
  alert/brand, green/red = market direction ONLY, Telegram blue only where Telegram is meant,
  `#4da3ff` blue = market data (chart series). Assets: `client/components/Logo.tsx` (inline mark +
  wordmark), `client/app/icon.svg` (favicon tile), `brand/` (SVG sources + 512px PNGs via sharp,
  `brand/README.md` = the BotFather guide: /setuserpic /setname /setabouttext /setdescription
  /setcommands). Bot START text + brain prompt renamed AlertEngine → PriceAlert.
- **Design system** (`globals.css`, full token rewrite): Space Grotesk (display) + IBM Plex Sans
  (UI) + IBM Plex Mono (all numbers/tickers/prices, tabular-nums) via `next/font/google`
  (`layout.tsx`); metadataBase from `APP_URL`, `%s · PriceAlert` title template, themeColor.
- **Landing** rebuilt (`app/page.tsx`): sticky glass `SiteNav`, hero with animated `HeroVisual`
  (price line draws → crosses dashed target → amber ping + Telegram toast; pure CSS/SVG,
  reduced-motion renders final state), `TypedDemo` NL box (typing loop; button is a real link to
  sign-in/dashboard, NOT disabled), asset marquee, "sentence → machine-checked rule" JSON section,
  6 feature cards (inline SVG icons, no emoji), Telegram chat mock, CTA band, `SiteFooter`
  (GitHub / issues / X / email / support — all links in `lib/links.ts`; bot link is the dev bot,
  swap at deploy).
- **Support page** (`app/support/page.tsx`): solo-dev voice, 3 contact cards (GitHub issues, X
  DMs, email), 7-question FAQ (native `<details>`), bug-report checklist note.
- **Dashboard pass**: sticky topbar w/ logo, count chip, skeleton loaders, redesigned empty state,
  AlertCard (ticker badge, condition pill w/ up/down arrows, mono prices, <15m amber countdown,
  Enter/Space opens graph), CreateAlertModal segmented controls (type/direction/unit), SVG bell,
  restyled panels, chart re-themed (blue series, amber target line + fired marker), Esc closes modals.
- **A11y/quality pass** (vercel web-design-guidelines audit): color-scheme dark, focus-visible ring,
  prefers-reduced-motion everywhere, aria-labels on icon buttons, role=status/alert on toasts,
  scroll-margin under sticky nav, overscroll containment, h1→h2→h3 hierarchy, text-wrap balance.
- Verified: both typechecks clean; landing/support/icon 200 on dev; dashboard 307 w/o session.
  (`next build` NOT run — dev server was live; run it before deploy.)

## Hardening (2026-07-06, same session as 8.5)

- **Rate limit**: 15 successful alert-creations/hour/user (`CREATES_PER_HOUR` in constants) — enforced at the top of `createAlert`, so bot AND dashboard share it; guard failures don't burn quota; fail-open on Redis errors; friendly reason surfaces verbatim on both. Live-tested: 16 rapid creates → 15×201 + 422. Bulk bot creates can eat the whole quota in one message (cap = one constant if that ever hurts).
- **Telegram revocation + visibility** (the "bot never logs out" answer — expiry is wrong, revocation is right): bot `/unlink` (inline-keyboard confirm; placeholder chats refused — their link IS their identity), dashboard **Disconnect Telegram** in the user menu (two-tap confirm, `POST /api/me/telegram/unlink`, idempotent) which also notifies the chat it was cut off; link-success replies now name the account (masked email `sin…@gmail.com`) + "Not you? /unlink". Unlink keeps alerts on the account (in-app delivery continues; rehydrate nulls hot-copy chatId). `smoke.link.ts` grew to **13 checks** (unlink by chat/user, idempotency, refusals).

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
- Auth follow-up: live browser test of consent + `/dashboard` redirect + phone `/start` tap (merges the real chat-1764981523 placeholder into the Google account). Creds are in `client/.env.local`.
- Landing NL alert box still a visual demo (no web NL create endpoint yet — planning.md §6/§14 wants NL creation on the web; the brain service exists, needs ~1 endpoint + 1 input wired on the dashboard).
- planning.md §2 differentiator conditions (`rel_extreme`, `volatility`, `ma_cross`) + backtest: NOT built (v1 ships absolute + pct_change; ARCHITECTURE.md §16 step 5).
- Telegram bot avatar/name: user applies `brand/README.md` BotFather steps (assets ready).
- **One bot, not two (user decision 2026-07-06, FINAL)**: @Pricealert_devbot is THE bot in production too — keep the token, flip `TELEGRAM_MODE` polling→webhook at deploy. Agreed policy: bot-behavior changes are tested in production (solo-scale, own chat); engine/web work stays local against a separate Neon dev branch. **Phase-9 guard (required)**: `TELEGRAM_MODE=off` becomes the local default after deploy — grammY's `bot.start()` deletes an existing webhook, so a habitual local `npm run dev` with polling would silently kill the production bot.
- **Deploy approach (user decision 2026-07-06)**: backend on **EC2 with Docker Compose** — one image built from `server/`, run as two services (`api` → `dist/server.js`, `worker` → `dist/worker.js`) + `redis:7-alpine` service with AOF on a **named volume** and `maxmemory-policy noeviction` (BullMQ requirement). Docker `restart: unless-stopped` replaces PM2 (ARCHITECTURE.md §2 "VM + PM2" amended). Client stays on Vercel.
- `next build` before deploy (skipped this session — dev server was running).
