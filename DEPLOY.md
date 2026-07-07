# DEPLOY.md — production runbook (phase 9)

> Locked strategy: ARCHITECTURE.md §19. Backend = EC2 Mumbai + Docker Compose
> (api / worker / redis / nginx / certbot). Client = Vercel. ONE bot — transport
> flips to webhook here; local dev sets `TELEGRAM_MODE=off` from now on.

## 0. Pre-flight (on the laptop)

- [ ] Live auth test passed locally (Google consent → dashboard → phone /start tap)
- [ ] `next build` clean · both `tsc --noEmit` clean · smoke suites pass
- [ ] Everything committed & pushed
- [ ] BotFather branding applied (avatar/name/about/description — `brand/README.md`) ✅ done
- [ ] Buy the domain (see below).

### Domain model — ONE domain, two hosts (decided: Hostinger)

Buy **one** domain on Hostinger (**domain registration only — skip their web hosting**, we don't use it).
It serves two hosts via DNS; you do NOT need a second domain:

| Host | Points at | Purpose |
|---|---|---|
| `pricealert.xyz` (apex) / `www` | **Vercel** | the client (what users visit) |
| `api.pricealert.xyz` (subdomain) | **EC2 Elastic IP** | the API + Telegram webhook |

The API subdomain is invisible to users (BFF pattern — the browser only ever talks to the Vercel
host); it just needs to exist and hold a valid cert so Telegram's webhook and certbot are happy.
Below, `API_DOMAIN` = `api.<yourdomain>`, `APP_URL` = the client's final URL (custom domain or `*.vercel.app`).

> **Decide the client's final URL before §8** — whatever you register as the Google redirect URI must
> match the URL users actually sign in on, or you'll configure Google twice.

## 1. AWS: launch the instance (Mumbai — ap-south-1; US regions are geo-blocked by Binance)

1. EC2 → Launch: **Ubuntu 24.04 LTS**, **t3.micro** (free tier), 20 GB gp3.
2. Key pair: create/download `.pem`.
3. Security group inbound: **22** (My IP only), **80**, **443** (Anywhere). Nothing else — Redis/API are never exposed.
4. Allocate an **Elastic IP** and associate it (IP survives stop/start; free while attached to a running instance).
5. Billing: AWS Budgets → a **$5 alarm** so a free-tier overage can't surprise you.

## 2. DNS (Hostinger hPanel → DNS Zone Editor)

Add one **A record**: name `api`, points to the **Elastic IP**, TTL 300. (Vercel gives you the
apex/`www` records for the client in §8 — add those here too, at Hostinger.) Keeping DNS at
Hostinger is simpler than moving nameservers to Vercel. Verify: `nslookup API_DOMAIN` resolves to the Elastic IP.

## 3. Prepare the box

```bash
ssh -i key.pem ubuntu@API_DOMAIN
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu   # re-login after this
# t3.micro has 1GB — add swap so image builds don't OOM:
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
git clone https://github.com/shivanshsin0203/PriceAlert.git && cd PriceAlert
```

## 4. Production env (`server/.env` ON THE BOX — never committed)

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=<Neon PRODUCTION url>
# REDIS_URL is injected by compose (redis://redis:6379) — do not set here
JWT_SECRET=<FRESH 64-hex — openssl rand -hex 32>          # must equal Vercel's
INTERNAL_API_SECRET=<FRESH 48-hex — openssl rand -hex 24> # must equal Vercel's
TELEGRAM_BOT_TOKEN=<same bot>
TELEGRAM_MODE=webhook
TELEGRAM_WEBHOOK_SECRET=<FRESH — openssl rand -hex 24>
TELEGRAM_BOT_USERNAME=Pricealert_devbot
DEEPSEEK_API_KEY=<key>
PUBLIC_BASE_URL=https://API_DOMAIN
DASHBOARD_CHAT_ID=0        # dev fallback is disabled in production anyway
```

Same day, on the LAPTOP: set `TELEGRAM_MODE=off` in local `server/.env` (see §19 guard),
and create a **Neon dev branch** — local `DATABASE_URL` moves to it; main is production now.

## 5. First certificate (chicken-and-egg bootstrap)

```bash
sed -i 's/API_DOMAIN/api.yourdomain.xyz/g' deploy/nginx.conf deploy/nginx.http.conf
# 1) start nginx with the HTTP-only config:
#    edit docker-compose.yml nginx volume → ./deploy/nginx.http.conf
docker compose up -d nginx
# 2) DRY RUN FIRST (Let's Encrypt real certs are rate-limited to 5/domain/week —
#    --staging proves DNS + webroot wiring without burning that budget):
docker compose run --rm certbot certonly --webroot -w /var/www/certbot --staging \
  -d api.yourdomain.xyz --email you@example.com --agree-tos --no-eff-email
#    …only once that succeeds, issue the REAL cert (add --force-renewal to replace the staging one):
docker compose run --rm certbot certonly --webroot -w /var/www/certbot --force-renewal \
  -d api.yourdomain.xyz --email you@example.com --agree-tos --no-eff-email
# 3) switch the nginx volume back to ./deploy/nginx.conf, then:
docker compose down && docker compose up -d --build
```

## 6. Migrate + verify

```bash
# from the LAPTOP (drizzle-kit is a devDependency; Neon is reachable anywhere):
cd server && DATABASE_URL=<prod url> npx drizzle-kit migrate
# on the box:
curl -s https://API_DOMAIN/health          # {"status":"ok",...}
docker compose logs worker | tail -20      # watcher ticking, redis ✓, "TELEGRAM_MODE=webhook — no polling"
```

## 7. Point Telegram at it

```bash
docker compose exec api node dist/scripts/set-webhook.js        # set + commands + prints info
# from the phone: /start → bot replies via webhook. --info / --delete also available.
```

## 8. Vercel (client — via CLI)

```bash
npm i -g vercel
cd client
vercel login
vercel link          # first run: pick scope + project; run from client/ so it IS the project root
```

Set env vars (all **server-only** — none carry a `NEXT_PUBLIC_` prefix, so they stay on Vercel's
functions and never reach the browser; `GOOGLE_CLIENT_SECRET`/`JWT_SECRET`/`INTERNAL_API_SECRET` are
safe here **only** because of that — never prefix them `NEXT_PUBLIC_`):

```bash
vercel env add EXPRESS_API_URL production        # https://API_DOMAIN
vercel env add APP_URL production                # the client's final URL (custom domain or *.vercel.app)
vercel env add JWT_SECRET production             # FRESH prod value — must EQUAL the box's
vercel env add INTERNAL_API_SECRET production    # FRESH prod value — must EQUAL the box's
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel --prod                                    # deploy
```

Custom domain (optional but recommended for a portfolio): `vercel domains add <yourdomain>` →
Vercel prints the apex/`www` DNS records → add them at **Hostinger** (§2). Set `APP_URL` to this domain.

Google Cloud console → APIs & Services → Credentials → your OAuth client → add:
- **Authorized redirect URI:** `${APP_URL}/api/auth/callback`
- **Authorized JavaScript origin:** `${APP_URL}`

> If you later move the client from `*.vercel.app` to a custom domain, update `APP_URL` **and** the
> Google redirect URI together — the callback's `redirect_uri` must match exactly.

## 9. Production smoke

- [ ] Landing + /support render on the Vercel URL
- [ ] Google sign-in → dashboard
- [ ] Connect Telegram → /start tap → linked (banner flips)
- [ ] Create alert (dashboard + bot) → fires → Telegram push + bell row
- [ ] /unlink → dashboard banner returns · re-link works
- [ ] `docker compose restart` → rehydrate logs, alerts keep firing

## Day-2 ops

- Deploy: `git pull && docker compose up -d --build`
- Logs: `docker compose logs -f worker` (rotated: 10MB×3 per service)
- Bot testing later: it's PRODUCTION — quiet-hours only, or `--delete` the webhook temporarily (re-`set-webhook` after!)
