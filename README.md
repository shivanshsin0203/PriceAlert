<div align="center">

<img src="brand/logo-mark.svg" alt="PriceAlert" width="88" />

# PriceAlert

**Write a market alert in plain English. Get pinged on Telegram the moment it triggers — with a grounded, AI-written explanation of what actually happened.**

*"ping me if BTC drops 5% in the next hour"* → parsed into a machine-checked rule → watched every minute → delivered to Telegram + an in-app inbox.

[![Live app](https://img.shields.io/badge/live-www.pricealert.store-F5A524?style=flat-square)](https://www.pricealert.store)
[![Telegram bot](https://img.shields.io/badge/bot-%40Pricealert__devbot-229ED9?style=flat-square&logo=telegram&logoColor=white)](https://t.me/Pricealert_devbot)
![TypeScript](https://img.shields.io/badge/TypeScript-everywhere-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/status-live%20in%20production-2ea043?style=flat-square)

**[Live site](https://www.pricealert.store) · [Try the bot](https://t.me/Pricealert_devbot) · [Product spec](./planning.md) · [Architecture](./ARCHITECTURE.md) · [Build log](./DONE.md)**

</div>

---

## Table of contents

- [What this is](#what-this-is)
- [The differentiator — why the AI isn't a gimmick](#the-differentiator--why-the-ai-isnt-a-gimmick)
- [See it in action](#see-it-in-action)
- [Feature overview](#feature-overview)
- [How it works](#how-it-works)
- [Where AI is used — exactly three places](#where-ai-is-used--exactly-three-places)
- [System architecture](#system-architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Data model & alert lifecycle](#data-model--alert-lifecycle)
- [Supported assets](#supported-assets)
- [The Telegram bot](#the-telegram-bot)
- [Running it locally](#running-it-locally)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
- [Design decisions worth knowing](#design-decisions-worth-knowing)
- [Roadmap & known limitations](#roadmap--known-limitations)
- [Non-goals](#non-goals)
- [Author](#author)

---

## What this is

Price-alert apps are a commodity — every exchange ships "notify me when BTC > $70k". PriceAlert exists to answer a sharper question: **what does an alerts product look like when a language model is doing something a dropdown genuinely can't?**

You describe what you care about the way you'd say it to a friend, and the system turns that sentence into a **structured, validated condition**, watches the market on a ~1-minute schedule, and the moment the condition is met it fires a notification to **Telegram and an in-app inbox** — each carrying a short, *grounded* explanation of the move (real numbers, no invention, always disclaimed).

It's built as a **portfolio-grade, production-deployed** system: a real Express API and background worker on a VM, a Next.js frontend on Vercel, Postgres as the source of truth, Redis as a hot mirror + queue backing, and a Telegram bot that's the primary interaction surface.

> The AI never decides *whether* an alert fired — that's deterministic and crash-safe. The AI only **parses** your input and **writes context**. That split is deliberate and load-bearing.

---

## The differentiator — why the AI isn't a gimmick

The project is only interesting if the natural-language layer buys something a form can't. So the engine is built around conditions that are **painful to click through a UI but trivial to say out loud:**

| You say… | It becomes… |
|---|---|
| "BTC above 70000" | absolute threshold ✅ **shipped** |
| "ETH drops 5% in the next hour" | % change over a window ✅ **shipped** |
| "alert on **all** Indian stocks if they rise 5%" | 15 conditions in one sentence ✅ **shipped** |
| "ETH 10% below its 24h high" | relative-to-extreme 🔜 *roadmap* |
| "BTC moves ±3% either direction in 15m" | volatility 🔜 *roadmap* |
| "SOL crosses above its 7-day average" | moving-average cross 🔜 *roadmap* |

v1 ships **absolute + % change** working end-to-end across every supported asset, including multi-alert creation from a single sentence. The advanced conditions are scaffolded in the schema (a Zod discriminated union) and are the next build phase.

---

## See it in action

No demo video — the bot *is* the demo. Here's what a real conversation looks like.

**Natural language → machine-checked rule (the showpiece):**

```
You:  ping me if bitcoin drops 5% in the next hour

Bot:  ✅ Alert created
      BTC — down 5% within 1h
      Anchor price: $63,410  ·  fires if it hits ~$60,240
      I'll watch it every minute and ping you the moment it triggers.
```

Under the hood, that sentence is parsed by the LLM into a strict envelope, then **re-validated with Zod** before anything touches the database:

```jsonc
{
  "message": "✅ Alert created — I'll watch BTC for a 5% drop within the hour.",
  "action": {
    "name": "create_alert",
    "args": {
      "alerts": [
        {
          "kind": "pct_change",
          "symbol": "BTC",
          "dir": "down",
          "pct": 5,
          "window": { "value": 1, "unit": "h" }
        }
      ]
    }
  }
}
```

**When it fires**, the delivery is deterministic core + a grounded AI sentence:

```
🔔 BTC dropped 5% in the last hour
Now: $60,190  ·  was $63,410 when you set this  ·  −5.08%

💡 BTC is down ~5.1% over the past hour, sliding from a 24h high near
   $64,100 as the broader market pulls back.

Not financial advice.
```

The 💡 line is **grounded** — the recent move, 24h high/low, and % change are computed deterministically and fed into the prompt. If the model is slow or unreachable (6s timeout), the message still sends without it. The AI is never on the critical path for *correctness*.

---

## Feature overview

- 🧠 **Natural-language alert creation** from both the Telegram bot and (soon) the web — one shared backend, no double implementation.
- ✅ **Zod-validated at every boundary** — request bodies, env vars, LLM output, and every external API response are re-validated before they're trusted.
- ⏱️ **Minute-resolution watcher** — a BullMQ repeatable job evaluates every active alert; crash-safe and idempotent.
- 📨 **Dual-channel delivery** — every fire and expiry writes **both** a Telegram push and an in-app inbox row. Symmetry is structural, not best-effort.
- 🔁 **One-shot lifecycle** — alerts fire once then deactivate. No spam, no cooldown bookkeeping.
- 🔗 **Google sign-in + Telegram deep-link binding** — identity is your Google account; Telegram is a delivery channel you link with one tap (and can revoke).
- 📊 **Dashboard** — cards grid with live price, distance-to-trigger, a journey bar, countdown, and an on-demand price graph per alert (fetched from provider candles, never stored).
- 🌐 **Multi-asset, adapter-based engine** — crypto (primary), US stocks, Indian stocks/NIFTY, oil, gold/silver, forex. Adding an asset = adding one adapter.
- 🛡️ **Hardened** — 15 creates/hour/user rate limit, graceful shutdown, Redis outage tolerance with auto-rehydrate from Postgres, and per-user Telegram revocation.

---

## How it works

```
  "ping me if BTC drops 5% in the next hour"
                 │
                 ▼
        ┌─────────────────┐   DeepSeek V3 (JSON mode) emits a strict envelope,
        │  1. BRAIN       │   then Zod RE-VALIDATES it. Invalid entries dropped,
        │  NL → Condition │   never guessed. Ambiguity → the bot asks first.
        └────────┬────────┘
                 │  validated Condition (absolute | pct_change)
                 ▼
        ┌─────────────────┐   Postgres INSERT (source of truth) → Redis hot copy
        │  2. STORE       │   (active_alerts SET + alert:{id} HASH). Anchor price
        │  PG + Redis     │   captured at creation for % math.
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐   BullMQ repeatable job, every minute:
        │  3. WATCH       │   expiry check FIRST (batched ⌛) → parallel price fetch
        │  eval loop      │   per unique symbol (45s cache) → evaluate → fire.
        └────────┬────────┘
                 │  match
                 ▼
        ┌─────────────────┐   Crash-safe order: guarded PG transition →
        │  4. NOTIFY      │   insert deliveries (UNIQUE dedupe) → enqueue →
        │  TG + in-app    │   Redis SREM. Delivery worker: retries ×5, backoff.
        └─────────────────┘
```

**Why polling, not streaming?** A scheduled ~1-minute poll is reliable, simple, and avoids the always-on-connection trap that strands this kind of build halfway. Live streaming is an explicit v2 idea, not v1.

**Why the deterministic/AI split?** Firing decisions must be exact and reproducible under crash recovery. So the *condition evaluation* is plain arithmetic; the model only ever touches the fuzzy edges — turning a sentence into structure on the way in, and writing a grounded sentence on the way out.

---

## Where AI is used — exactly three places

1. **NL → structured condition** *(core, load-bearing)* — the showpiece. User text becomes a validated object. Its robustness is the project's quality bar (see [Testing](#testing) — 83-check brain suite, hostile-input suite, stability suite).
2. **Clarification on ambiguity** — "alert me when bitcoin goes crazy" or a % with no direction → the bot asks a clarifying question instead of hallucinating an alert. Handling the unhappy path is the point.
3. **Grounded market context on trigger** — a 1–2 sentence explanation when an alert fires, grounded in real data fed into the prompt, neutral in tone, and always disclaimed. Never "you should…", never invented.

**The model:** DeepSeek V3 (`deepseek-chat`, non-reasoning) via the OpenAI-compatible SDK, in JSON mode. Reads (list alerts, get a price) are **plain lookups** — a cheap intent check routes them, so the model is only invoked on the creation path. AI calls happen only on **create** and on **fire**.

---

## System architecture

```
   Browser
     │  (first-party, httpOnly JWT cookie on the Vercel domain)
     ▼
┌─────────────────────────┐   server-to-server (JWT forward + INTERNAL_API_SECRET)
│  Next.js on Vercel      │ ──────────────────────────────────────────────┐
│  · SSR pages, OG images │                                                │
│  · Google OAuth         │                                                │
│  · BFF proxy (/api/*)   │                                                ▼
└─────────────────────────┘                                  ┌──────────────────────────────┐
                                                             │  VM (always-on)              │
   Telegram  ──webhook──────────────────────────────────────▶│                              │
                                                             │  API process (Express, MVC)  │
                                                             │   · /api/* domain endpoints  │
                                                             │   · /bot telegram webhook    │
                                                             │                              │
                                                             │  Worker process              │
                                                             │   · BullMQ repeatable "tick" │
                                                             │   · watcher (eval loop)      │
                                                             │   · delivery workers         │
                                                             └───────┬───────────┬──────────┘
                                                                     │           │
                                                          ┌──────────▼──┐   ┌────▼─────────┐
                                                          │ Neon Postgres│   │ Redis (VM)   │
                                                          │ source of    │   │ hot mirror + │
                                                          │ truth        │   │ BullMQ + TTLs│
                                                          └──────────────┘   └──────────────┘
```

**Key architectural rules** (full detail in [`ARCHITECTURE.md`](./ARCHITECTURE.md)):

- **MVC on the server** — routes → thin controllers → services (business logic) → models (Drizzle data access). Controllers never hold logic; services never touch `req`/`res`.
- **BFF pattern** — the browser only ever talks to the Vercel host. Next.js proxies `/api/*` to Express server-to-server (no CORS, secrets never reach the client).
- **Postgres is the single source of truth**; Redis is a *derived* hot mirror — anything in Redis is rebuildable from Postgres, and is (auto-rehydrate on reconnect).
- **DTOs, not DB rows** — every endpoint returns a purpose-specific Zod response DTO. Internal fields (`eval_state`, `google_sub`, raw condition internals) are never serialized out.
- **Two separate folders, not a monorepo, no shared package** — `server/` and `client/` install and deploy independently; the server is authoritative and always re-validates.
- **Idempotency & crash safety** — the watcher tick and delivery are safe to run twice.

---

## Tech stack

| Concern | Choice |
|---|---|
| Language | **TypeScript** everywhere |
| Backend | **Node + Express**, MVC structure, on an always-on VM |
| Frontend | **Next.js 15** (App Router, React 19) on **Vercel** — SSR + OG images + BFF proxy |
| Validation | **Zod** at every boundary; types inferred via `z.infer` |
| Database | **Postgres on Neon** (serverless) via **Drizzle ORM** — source of truth |
| Hot store / cache / queue backing | **Redis** (self-hosted on the VM) |
| Scheduler | **BullMQ** repeatable job (every minute) |
| Delivery | **BullMQ** queue + worker (retries ×5, exponential backoff) |
| Process model | Separate **API** and **worker** processes |
| Auth | **Google OAuth** (custom, via BFF) → **HS256 JWT** in an httpOnly cookie; Express verifies |
| AI | **DeepSeek V3** (`deepseek-chat`), OpenAI-compatible SDK, JSON mode |
| Bot | **grammY** (Telegram) — polling in dev, webhook in prod |
| Charts | **lightweight-charts v5** (dashboard graphs) |

---

## Repository layout

Two independent projects. No shared package — the server is authoritative and re-validates everything.

```
finance/
├── server/                       # Express API + background worker (Node · TS)
│   └── src/
│       ├── server.ts             # HTTP API process entrypoint
│       ├── worker.ts             # bot + watcher + delivery worker process
│       ├── brain/                # DeepSeek client, prompt, Zod condition schema
│       ├── adapters/             # price sources: binance, yahoo, gold-api, forex (+ registry)
│       ├── engine/               # deterministic condition evaluation
│       ├── queues/               # BullMQ queues + workers
│       ├── services/             # watcher, notify, alert, history, telegram-link, price
│       ├── controllers/          # thin HTTP handlers
│       ├── routes/               # /api/* + /internal + /bot
│       ├── models/               # Drizzle schema + repos (alerts, users, deliveries)
│       ├── serializers/          # model → response DTO
│       ├── cache/                # Redis: active set, price, chat history, rate limit
│       ├── bot/                  # grammY bot (intent routing + NL creation)
│       ├── middleware/           # auth (requireUser) + central error handling
│       └── smoke*.ts             # test suites (see Testing)
│
├── client/                       # Next.js frontend + BFF proxy (Vercel)
│   ├── app/
│   │   ├── page.tsx              # landing (animated hero, NL→JSON demo, feature cards)
│   │   ├── dashboard/            # alert cards, create modal, bell, graph modal
│   │   ├── support/              # solo-dev support page + FAQ
│   │   └── api/                  # [...proxy] BFF + Google OAuth routes
│   ├── components/               # AlertCard, CreateAlertModal, NotificationBell, …
│   └── lib/                      # api, auth, session, links
│
├── brand/                        # logo/favicon/OG/avatar sources + BotFather guide
├── deploy/                       # nginx configs (http-bootstrap + full)
├── docker-compose.yml            # api/worker/redis/nginx/certbot (containerized path)
├── ARCHITECTURE.md               # implementation spec (locked decisions)
├── planning.md                   # product spec (what/why)
├── DEPLOY.md                     # production runbook
└── DONE.md                       # build log — what's actually built & verified
```

---

## Data model & alert lifecycle

An alert is a **one-shot** `Condition`, one of two kinds (a Zod discriminated union, ready to extend):

```ts
type Condition =
  | { kind: "absolute";   symbol: Symbol; op: "above" | "below"; value: number }
  | { kind: "pct_change"; symbol: Symbol; dir: "up" | "down"; pct: number;
      window: { value: number; unit: "m" | "h" | "d" } };
```

- **absolute** — fires when price crosses a level; 24h lifetime.
- **pct_change** — fires when price moves `pct`% in `dir` within `window` (5min–24h); the **anchor price is captured at creation** so the % is measured from a fixed baseline, not a sliding one.

**Lifecycle:** `active → triggered` (one-shot; deactivates) or `active → expired` (window elapsed). Expiry is checked **before** price evaluation each tick, with a batched ⌛ ping per user. Every fire and expiry is logged as a delivery row (`telegram` + `inapp`, deduped by `UNIQUE(alert_id, channel)`), so the dashboard bell and the user's record are one and the same audit trail.

---

## Supported assets

The engine is **asset-agnostic** — it never knows whether a symbol is BTC, gold, AAPL, or USD/INR. Only the data source differs, and that plugs in as a swappable adapter.

| Asset | Source | Alertable? | Notes |
|---|---|---|---|
| **Crypto** (13 symbols) | Binance (keyless) | ✅ full | Primary. Always-live, volatile, full free history. |
| **US stocks** (15, MAANG+) | Finnhub / Yahoo | ✅ full | US market hours. |
| **Indian stocks** (15) + **NIFTY** | Yahoo | ✅ full | ₹/NSE; graphs gap outside NSE hours. |
| **Oil** | Yahoo | ✅ | ~24/5. |
| **Gold / Silver** (XAU/XAG) | gold-api.com | 💲 price-only | History is paid → chart from Yahoo. |
| **Forex** (5 pairs vs USD) | ExchangeRate-API | 💲 price-only | Free tier updates ~daily; threshold-only by design. |

> **Known limitation:** NSE firewalls cloud/datacenter IPs, so Indian equities are only reachable via Yahoo, and even that is occasionally flaky — handled gracefully, never a hard crash. The VM runs in **ap-south-1 (Mumbai)** because Binance geo-blocks US IPs.

Every adapter fetch has a **6-second hard timeout**; tick price fetches run in parallel per unique symbol with a 45-second Redis cache.

---

## The Telegram bot

The bot is the primary surface, and it's designed around a simple principle: **don't route every message through the AI.**

- **Alert creation = natural language** → the model (the one path that invokes it).
- **Repetitive actions = inline keyboard buttons** (My alerts · Get a price · New alert · Delete) — buttons beat typing for the boring stuff.
- **A tiny set of slash commands** (`/start`, `/help`, `/assets`, `/unlink`) for discoverability via Telegram's autocomplete menu.
- **Reads (list / price) are plain lookups** — a cheap intent check handles them, faster and cheaper than a model call.
- **Unrecognized input → a helpful fallback**, never a silent fail or a hallucinated alert.

**Account linking** is a deep-link flow: the dashboard mints a one-time token → `t.me/<bot>?start=<token>` → the bot receives the token + chat identity → binds. Telegram-first users (who message the bot before ever signing in) are auto-created, and **merged** into a Google account on link. Linking is encouraged but **not a hard gate** — you can create alerts and get in-app notifications without ever touching Telegram. You can `/unlink` or disconnect from the dashboard at any time.

---

## Running it locally

**Prerequisites:** Node 20+, Docker (for Redis), a Neon Postgres URL, a Telegram bot token, and a DeepSeek API key.

```bash
# 1. Redis (hot store + queue backing)
docker run -d --name alert-redis -p 6379:6379 redis:7-alpine \
  redis-server --appendonly yes

# 2. Server — ONE command runs the API (:4000) + worker together
cd server
cp .env.example .env          # then fill it in (see below)
npm install
npm run db:migrate            # apply Drizzle migrations to Neon
npm run dev                   # health: http://localhost:4000/health

# 3. Client (Next.js on :3000)
cd ../client
cp .env.example .env.local    # then fill it in
npm install
npm run dev                   # http://localhost:3000
```

`npm run dev` in `server/` uses `concurrently` to run the API and worker processes side by side. Start Redis **before** it.

> **Dev auth shortcut:** with `GOOGLE_CLIENT_ID` empty, the app runs in dev-fallback mode — no sign-in required; the dashboard acts as the `DASHBOARD_CHAT_ID` Telegram user, so you can build against real alerts without wiring OAuth first.

---

## Environment variables

**`server/.env`**

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (source of truth) |
| `REDIS_URL` | Redis URL (default `redis://localhost:6379`) |
| `JWT_SECRET` | HS256 signing secret — **must be identical** to the client's |
| `INTERNAL_API_SECRET` | Shared secret proving a request came from the BFF |
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_MODE` | `polling` (dev) · `webhook` (prod) · `off` (local after deploy) |
| `TELEGRAM_WEBHOOK_SECRET` | Required (≥16 chars) when mode is `webhook` |
| `TELEGRAM_BOT_USERNAME` | For `t.me` deep-link account linking |
| `DEEPSEEK_API_KEY` | The brain (OpenAI-compatible endpoint) |
| `PUBLIC_BASE_URL` | This API's public URL (webhook target) |
| `FINNHUB_API_KEY` | Optional — US stock quotes |

**`client/.env.local`**

| Var | Purpose |
|---|---|
| `EXPRESS_API_URL` | Backend base URL for server-to-server BFF calls |
| `APP_URL` | Public origin of this Next app (Google redirects here) |
| `JWT_SECRET` / `INTERNAL_API_SECRET` | **Must exactly match** `server/.env` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth web client; empty = dev-fallback mode |

> ⚠️ `JWT_SECRET` and `INTERNAL_API_SECRET` must be **identical across both projects** — mismatches make the BFF and API disagree and every `/api/*` call 401s. None of the client secrets carry a `NEXT_PUBLIC_` prefix, so they stay on Vercel's functions and never reach the browser. Never prefix them `NEXT_PUBLIC_`.

---

## Testing

The brain and pipeline are covered by dedicated smoke suites in `server/src/` (run with `tsx`):

| Suite | What it checks |
|---|---|
| `smoke.ts` | **83 brain checks** — NL → condition correctness across phrasings |
| `smoke.pipeline.ts` | **24 checks, sends REAL Telegram messages** — full create → watch → fire → notify loop |
| `smoke.stability.ts` | 7 flaky phrasings × 3 runs — output determinism |
| `smoke.absurd.ts` | 29 hostile / adversarial inputs — refusals, no hallucinated alerts |
| `smoke.link.ts` | 13 checks — Telegram link/merge, one-time token, unlink, idempotency (synthetic + self-cleaning) |

```bash
cd server
npm run smoke            # brain suite
npm run smoke:pipeline   # end-to-end (sends real Telegram pushes)
npm run typecheck        # tsc --noEmit
```

---

## Deployment

**Live now:**
- **Client** → Vercel at **[www.pricealert.store](https://www.pricealert.store)**
- **Backend** (API + worker + Redis) → a Mumbai VM behind Caddy, with the Telegram bot in **webhook** mode
- **Database** → Neon Postgres

Two supported deploy shapes are in the repo:
- **Docker Compose** (`docker-compose.yml` + `deploy/`) — api/worker share one image, plus `redis` (AOF, `noeviction`, named volume), `nginx`, and `certbot`. Bootstrap: http-only nginx conf → issue cert (Let's Encrypt, `--staging` dry-run first) → full conf.
- **PM2 / process-based** — build `dist` on the box, run `pricealert-api` and `pricealert-worker` as two processes.

The **transport flips at deploy**: dev uses long-polling; production sets `TELEGRAM_MODE=webhook` and registers the webhook via `src/scripts/set-webhook.ts`. There is **one bot** for dev and prod, so after deploying, local `.env` must set `TELEGRAM_MODE=off` — otherwise a local `npm run dev` in polling mode would delete the production webhook.

Full step-by-step runbook: **[`DEPLOY.md`](./DEPLOY.md)**.

---

## Design decisions worth knowing

- **Deterministic firing, AI only at the edges.** The model never decides whether a condition fired. Correctness is plain arithmetic; the LLM parses input and writes context. This is what makes crash recovery safe.
- **One-shot only.** No recurring alerts, no cooldown bookkeeping — the simplest lifecycle that can't spam you.
- **Both channels, always.** Fires and expiries write a Telegram row *and* an in-app row at insert time. The dashboard bell and Telegram are the same audit trail, not two code paths that can drift.
- **On-demand graphs, no price storage.** Alert history graphs are fetched live from provider candles and cached 30s in Redis — the system never warehouses prices.
- **Redis is disposable.** On a Redis outage the bot degrades gracefully and the watcher skips; on reconnect it auto-rehydrates the active set from Postgres.
- **Color discipline in the UI** — amber = brand/alert, green/red = market direction *only*, Telegram blue only where Telegram is meant.

---

## Roadmap & known limitations

**Next up (the differentiator):**
- Advanced NL conditions — relative-to-extreme, volatility, moving-average cross, compound (`rel_extreme`, `volatility`, `ma_cross` are scaffolded in the schema).
- **"Would this have fired?" backtest** — run a new alert against the last ~7 days and show if/when it would have triggered.
- **Web NL create box** — the landing-page natural-language input is currently a visual demo; the brain service exists, it needs one endpoint + one wired input to become live web NL creation (the bot already does full NL creation today).

**Deliberate limitations (not bugs):**
- The in-app bell is ≤20s behind Telegram (poll vs push) — SSE is the upgrade path.
- Stock/NIFTY graphs gap outside market hours (no data exists to draw).
- Indian equities depend on Yahoo (NSE blocks cloud IPs) and can be occasionally flaky.
- Forex is threshold-only (free feeds update ~daily).

---

## Non-goals

This is an **alerts-only** tool, by design:

- ❌ No price **prediction**.
- ❌ No investment advice or buy/sell recommendations — every fire says *"Not financial advice."*
- ❌ No trade execution, no money movement.
- ❌ No live streaming in v1 (polling is intentional).

---

## Author

Built by **Shivansh Singh** — a solo, production-deployed portfolio project aimed at AI-first engineering.

- 🌐 Live: **[www.pricealert.store](https://www.pricealert.store)**
- 🤖 Bot: **[@Pricealert_devbot](https://t.me/Pricealert_devbot)**
- 💻 GitHub: **[shivanshsin0203/PriceAlert](https://github.com/shivanshsin0203/PriceAlert)**
- 🐦 X: **[@ShivanshSi0203](https://x.com/ShivanshSi0203)**
- 🐛 Found a bug? **[Open an issue](https://github.com/shivanshsin0203/PriceAlert/issues)**

<div align="center">

*Read the [product spec](./planning.md), the [architecture](./ARCHITECTURE.md), or the [build log](./DONE.md) for the full story.*

</div>
