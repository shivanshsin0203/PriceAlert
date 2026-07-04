"use client";

import { useCallback, useEffect, useState } from "react";
import AlertCard from "../../components/AlertCard";
import CreateAlertModal from "../../components/CreateAlertModal";
import NotificationBell from "../../components/NotificationBell";
import PriceGraphModal from "../../components/PriceGraphModal";
import { api, type AlertDTO } from "../../lib/api";

// The dashboard (dev phase, pre-auth: acts as the DASHBOARD_CHAT_ID user).
// Prices move once a minute server-side, so a 20s poll is all the "live" we need.
const POLL_MS = 20_000;

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<AlertDTO[] | null>(null);
  const [currency, setCurrency] = useState<"USD" | "EUR" | "INR">("USD");
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [graphAlert, setGraphAlert] = useState<AlertDTO | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([api.alerts(), api.unreadCount()]);
      setAlerts(a.alerts);
      setCurrency(a.currency as "USD" | "EUR" | "INR");
      setUnread(c.unread);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the API");
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // countdowns ("expires in 4m") re-render every 30s without hitting the API
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  async function handleDelete(a: AlertDTO) {
    setAlerts((cur) => cur?.filter((x) => x.id !== a.id) ?? null); // optimistic
    try {
      await api.deleteAlert(a.id);
    } catch {
      refresh(); // restore truth
    }
  }

  function handleCreated(n: string | null) {
    setShowCreate(false);
    setNote(n);
    refresh();
    if (n) setTimeout(() => setNote(null), 8000);
  }

  return (
    <main className="dash">
      <header className="dash-head">
        <div>
          <h1 className="dash-title">Your alerts</h1>
          <p className="dash-sub">Watched every minute · fires push here and to Telegram</p>
        </div>
        <div className="dash-actions">
          <select
            className="ccy-select"
            title="Display currency (creation always uses the asset's native currency)"
            value={currency}
            onChange={async (e) => {
              const c = e.target.value as "USD" | "EUR" | "INR";
              setCurrency(c); // optimistic
              try {
                await api.setCurrency(c);
                refresh();
              } catch {
                refresh(); // restore truth
              }
            }}
          >
            <option value="USD">$ USD</option>
            <option value="EUR">€ EUR</option>
            <option value="INR">₹ INR</option>
          </select>
          <NotificationBell unread={unread} onUnreadCleared={() => setUnread(0)} />
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New alert</button>
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}
      {note && <div className="dash-note">{note}</div>}

      {alerts === null && !error && <p className="dash-sub">Loading…</p>}

      {alerts?.length === 0 && (
        <div className="dash-empty">
          <p>No active alerts.</p>
          <p className="dash-sub">Create one here, or message the Telegram bot — both land in the same place.</p>
        </div>
      )}

      <div className="cards">
        {alerts?.map((a) => (
          <AlertCard key={a.id} alert={a} onOpen={setGraphAlert} onDelete={handleDelete} />
        ))}
      </div>

      {showCreate && <CreateAlertModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
      {graphAlert && <PriceGraphModal alert={graphAlert} onClose={() => setGraphAlert(null)} />}
    </main>
  );
}
