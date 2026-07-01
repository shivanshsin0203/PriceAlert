# AI Price Alert Engine

Write a market alert in **plain English** → the system parses it into a structured condition, watches
prices every minute, and notifies you on **Telegram + in-app** with a short, grounded explanation.

- **Product spec:** [`planning.md`](./planning.md)
- **Implementation spec:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) ← read before coding

## Layout

| Folder | What | Stack |
|---|---|---|
| [`server/`](./server) | API (Express, MVC) + worker (watcher/delivery) | Node · Express · Drizzle · Neon · Redis · BullMQ |
| [`client/`](./client) | Frontend + BFF proxy | Next.js (Vercel) |

Two independent projects (separate installs/deploys, no shared package — see ARCHITECTURE.md §5).

## Run locally

```bash
# server — one command runs API (:4000) + worker together
cd server && npm install && npm run dev        # health: http://localhost:4000/health

# client (Next.js on :3000)
cd client && npm install && npm run dev        # http://localhost:3000
```

Copy `.env.example → .env` (server) and `.env.example → .env.local` (client) and fill in as features land.
