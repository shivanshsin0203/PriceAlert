"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { TelegramIcon } from "./icons";

// "Connect Telegram" strip (deep-link flow, ARCHITECTURE.md §13): mint a one-time token,
// open t.me/<bot>?start=<token>, then poll /me every 4s until the bot reports the link.
// The token lives 10 min in Redis — polling stops there too.

const POLL_MS = 4_000;
const GIVE_UP_MS = 10 * 60_000;

export default function TelegramBanner({ onLinked }: { onLinked: () => void }) {
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<{ poll?: ReturnType<typeof setInterval>; stop?: ReturnType<typeof setTimeout> }>({});

  useEffect(
    () => () => {
      if (timers.current.poll) clearInterval(timers.current.poll);
      if (timers.current.stop) clearTimeout(timers.current.stop);
    },
    [],
  );

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.telegramLinkToken();
      window.open(url, "_blank", "noopener");
      setWaiting(true);
      timers.current.poll = setInterval(async () => {
        try {
          if ((await api.me()).telegram.linked) {
            clearInterval(timers.current.poll!);
            onLinked();
          }
        } catch {
          /* transient — next poll retries */
        }
      }, POLL_MS);
      timers.current.stop = setTimeout(() => {
        if (timers.current.poll) clearInterval(timers.current.poll);
        setWaiting(false); // token expired — button becomes tappable again
      }, GIVE_UP_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a Telegram link — try again.");
    }
    setBusy(false);
  }

  return (
    <div className="tg-banner">
      <div className="tg-banner-txt">
        <TelegramIcon size={19} />
        <div>
          <b>Connect Telegram</b>
          <p className="tg-banner-sub">
            {waiting
              ? "Waiting… tap Start in the Telegram chat that just opened. Alerts you made in the bot move into this account."
              : "Get alert pings on your phone too — and pull the alerts you already made in the bot into this account."}
          </p>
          {error && <p className="tg-banner-err">{error}</p>}
        </div>
      </div>
      <button className="btn-primary" onClick={connect} disabled={busy || waiting}>
        {waiting ? "Waiting for Telegram…" : "Connect"}
      </button>
    </div>
  );
}
