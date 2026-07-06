# PriceAlert brand assets

The mark: a rising price line whose last tick becomes a ping. Amber `#F5A524` on ink navy
`#0B0F14`. Amber = the alert/brand; green/red are reserved for market direction in the UI.

| File | Use |
|---|---|
| `logo-mark.svg` / `logo-mark-512.png` | The bare mark (transparent) — README, socials |
| `telegram-avatar.svg` / `telegram-avatar.png` | 512×512 bot profile picture (circle-crop safe) |
| `client/components/Logo.tsx` | The mark + wordmark used across the site |
| `client/app/icon.svg` | Favicon (dark tile variant) |

Keep the geometry in sync across all four if the mark ever changes.

## Applying the logo + name to the Telegram bot (BotFather)

Open a chat with **@BotFather** in Telegram and send, one at a time:

1. `/setuserpic` → pick **@Pricealert_devbot** → send `telegram-avatar.png` **as a photo**
   (not as a file). Telegram crops it to a circle — the artwork is already centered for that.
2. `/setname` → pick the bot → send: `PriceAlert`
   (this is the display name; the @username can't be changed)
3. `/setabouttext` → pick the bot → send:
   `Plain-English price alerts. Watched every minute, pinged the moment it happens. Not financial advice.`
   (shows on the bot's profile page)
4. `/setdescription` → pick the bot → send:
   `Say it like you'd say it to a friend — "alert me if BTC drops 5% in the next hour". I'll parse it, watch the market every minute, and ping you when it happens. One-shot alerts, no spam. Not financial advice.`
   (shows in the empty chat before /start — the "What can this bot do?" box)
5. `/setcommands` → pick the bot → send this block:
   ```
   start - what I do + examples
   help - how to phrase alerts that work first try
   list - your active alerts
   price - quick price check
   assets - everything I can watch
   ```

**At deploy (phase 9) — user decision: ONE bot.** @Pricealert_devbot IS the product bot
(tried and tested); it keeps its token and simply switches transport to webhook on the VM
(`TELEGRAM_MODE=webhook`). Brand it once with the steps above — done. Trade-off accepted:
while the production webhook is set, local long-polling won't receive updates (Telegram
allows one transport at a time) — to dev-test the bot later, either temporarily
`deleteWebhook` or create a separate dev bot then.
