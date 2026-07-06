"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type NotificationDTO } from "../lib/api";
import { BellIcon } from "./icons";

// The bell — a reader over the inapp delivery rows the engine already writes.
// Badge = unread count (polled by the parent); opening the panel marks all read;
// per-row ✕ dismisses (soft delete server-side, audit row survives).

export default function NotificationBell({
  unread,
  onUnreadCleared,
}: {
  unread: number;
  onUnreadCleared: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.notifications();
      setItems(res.notifications);
    } catch {
      setItems([]);
    }
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
      // opening the panel clears the badge
      api.markAllRead().then(onUnreadCleared).catch(() => {});
    }
  }

  async function dismiss(id: string) {
    setItems((cur) => cur?.filter((n) => n.id !== id) ?? null); // optimistic
    try {
      await api.dismissNotification(id);
    } catch {
      load(); // restore truth on failure
    }
  }

  // click-away closes the panel
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="bell-wrap" ref={boxRef}>
      <button className="bell-btn" onClick={toggle} title="Notifications" aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}>
        <BellIcon size={18} />
        {unread > 0 && <span className="bell-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel">
          <div className="bell-panel-head">Notifications</div>
          {items === null && <div className="bell-empty">Loading…</div>}
          {items?.length === 0 && <div className="bell-empty">Nothing here yet — fired and expired alerts land here.</div>}
          {items?.map((n) => (
            <div key={n.id} className={`notif ${n.read ? "" : "notif-unread"}`}>
              <div className="notif-body">
                <div className="notif-kind">
                  <b>{n.kind === "fire" ? "● FIRED" : "○ EXPIRED"}</b> · {new Date(n.firedAt).toLocaleString()}
                </div>
                <div className="notif-text">{n.text}</div>
              </div>
              <button className="icon-btn" title="Delete" aria-label="Delete notification" onClick={() => dismiss(n.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
