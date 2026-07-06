"use client";

import { useEffect, useRef, useState } from "react";
import type { MeDTO } from "../lib/api";
import { TelegramIcon } from "./icons";

// Avatar chip + dropdown (profile, telegram status, sign out). In dev-fallback mode
// (email null — the server's DASHBOARD_CHAT_ID identity) there is no session to end,
// so the sign-out link is hidden and the chip says so.

export default function UserMenu({ me }: { me: MeDTO }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

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
