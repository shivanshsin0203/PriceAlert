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

These four are stored by Telegram, NOT by our code — you must set them by hand once.
(The **command list** is set automatically by the app — `setMyCommands` on boot in polling
mode, or `dist/scripts/set-webhook.js` in production — so `/setcommands` below is optional.)

Open a chat with **@BotFather** and send, one at a time:

1. **`/setuserpic`** → pick **@Pricealert_devbot** → send `telegram-avatar.png` **as a photo**
   (not as a file/document). Telegram crops it to a circle — the artwork is centered for that.
   This is the avatar shown in every chat and the chat list.
2. **`/setname`** → pick the bot → send: `PriceAlert`
   (display name; the @username itself can't be changed after creation.)
3. **`/setabouttext`** → pick the bot → send:
   `Plain-English price alerts. Watched every minute, pinged the moment it happens. Not financial advice.`
   (short blurb on the bot's profile page — max 120 chars.)
4. **`/setdescription`** → pick the bot → send:
   `Say it like you'd say it to a friend — "alert me if BTC drops 5% in the next hour". I watch the market every minute and ping you the moment it happens. One-shot alerts, no spam. Not financial advice.`
   (the big "What can this bot do?" box shown in an empty chat before the user taps Start.)
5. *(optional — the app sets these too)* **`/setcommands`** → pick the bot → send:
   ```
   help - how to phrase alerts that work first try
   list - your active alerts, each with a delete button
   price - quick price check
   assets - everything I can watch
   unlink - disconnect this chat from the web account
   ```
   (`start` is implicit — Telegram always shows it — so it's omitted here.)

**At deploy (phase 9) — user decision: ONE bot.** @Pricealert_devbot IS the product bot
(tried and tested); it keeps its token and simply switches transport to webhook on the VM
(`TELEGRAM_MODE=webhook`). Brand it once with the steps above — done. Trade-off accepted:
while the production webhook is set, local long-polling won't receive updates (Telegram
allows one transport at a time) — to dev-test the bot later, either temporarily
`deleteWebhook` or create a separate dev bot then.
