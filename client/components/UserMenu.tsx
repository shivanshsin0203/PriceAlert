"use client";

import { useEffect, useRef, useState } from "react";
import { api, type MeDTO } from "../lib/api";
import { TelegramIcon } from "./icons";

// Avatar chip + dropdown (profile, telegram status, sign out). In dev-fallback mode
// (email null — the server's DASHBOARD_CHAT_ID identity) there is no session to end,
// so the sign-out link is hidden and the chip says so.
// "Disconnect Telegram" is two-tap (arm, then confirm) — recoverable, but a mis-click
// shouldn't silently cut phone delivery.

export default function UserMenu({ me, onUnlinked }: { me: MeDTO; onUnlinked?: () => void }) {
  const [open, setOpen] = useState(false);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setArming(false);
      return;
    }
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function unlink() {
    if (!arming) return setArming(true);
    setBusy(true);
    try {
      await api.telegramUnlink();
      setOpen(false);
      onUnlinked?.();
    } catch {
      /* transient — the menu stays open, user can retry */
    }
    setBusy(false);
    setArming(false);
  }

  const initial = (me.name ?? me.email ?? "D").charAt(0).toUpperCase();

  return (
    <div className="user-wrap" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)} title={me.email ?? "dev user"} aria-label="Account menu">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="user-avatar" src={me.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="user-avatar user-initial">{initial}</span>
        )}
      </button>
      {open && (
        <div className="user-panel">
          <div className="user-id">
            <div className="user-name">{me.name ?? "Dev user"}</div>
            <div className="user-email">{me.email ?? "local dev identity (no sign-in)"}</div>
          </div>
          <div className={`user-tg${me.telegram.linked ? " user-tg-on" : ""}`}>
            <TelegramIcon size={15} />
            {me.telegram.linked
              ? `Telegram connected${me.telegram.username ? ` · @${me.telegram.username}` : ""}`
              : "Telegram not connected"}
          </div>
          {me.telegram.linked && (
            <button className={`user-unlink${arming ? " user-unlink-arm" : ""}`} onClick={unlink} disabled={busy}>
              {busy ? "Disconnecting…" : arming ? "Tap again to confirm disconnect" : "Disconnect Telegram"}
            </button>
          )}
          {me.email && (
            <a className="user-signout" href="/api/auth/logout">
              Sign out
            </a>
          )}
        </div>
      )}
    </div>
  );
}
