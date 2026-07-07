"use client";

import { useCallback, useEffect, useState } from "react";
import AlertCard from "../../components/AlertCard";
import CreateAlertModal from "../../components/CreateAlertModal";
import Logo from "../../components/Logo";
import NotificationBell from "../../components/NotificationBell";
import PriceGraphModal from "../../components/PriceGraphModal";
import TelegramBanner from "../../components/TelegramBanner";
import UserMenu from "../../components/UserMenu";
import { api, ApiError, type AlertDTO, type MeDTO } from "../../lib/api";

// The dashboard. Identity comes from the session JWT via the BFF (dev fallback:
// the server's DASHBOARD_CHAT_ID user). Prices move once a minute server-side,
// so a 20s poll is all the "live" we need.
const POLL_MS = 20_000;

function SkeletonCard() {
  return (
    <div className="skel" aria-hidden="true">
      <div className="skel-line" style={{ width: "52%" }} />
      <div className="skel-line" style={{ width: "34%" }} />
      <div className="skel-line" style={{ width: "72%", marginTop: 26 }} />
      <div className="skel-line" style={{ width: "46%" }} />
      <div className="skel-line" style={{ width: "100%", marginTop: 18, marginBottom: 4 }} />
    </div>
  );
}

export default function DashboardPage() {
  const [alerts, setAlerts] = useState<AlertDTO[] | null>(null);
  const [me, setMe] = useState<MeDTO | null>(null);
  const [currency, setCurrency] = useState<"USD" | "EUR" | "INR">("USD");
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [graphAlert, setGraphAlert] = useState<AlertDTO | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, c, m] = await Promise.all([api.alerts(), api.unreadCount(), api.me()]);
      setAlerts(a.alerts);
      setCurrency(a.currency as "USD" | "EUR" | "INR");
      setUnread(c.unread);
      setMe(m);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        window.location.href = "/?auth_error=signed_out"; // session expired mid-visit
        return;
      }
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
    <>
      <header className="topbar">
        <div className="topbar-in">
          <a href="/" aria-label="PriceAlert home" style={{ textDecoration: "none" }}>
            <Logo />
          </a>
          <div className="dash-actions">
            <select
              className="ccy-select"
              aria-label="Display currency"
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
            {me && (
              <UserMenu
                me={me}
                onUnlinked={() => {
                  setNote("🔓 Telegram disconnected — alerts now land in the bell inbox only. Re-link anytime below.");
                  setTimeout(() => setNote(null), 8000);
                  refresh();
                }}
              />
            )}
          </div>
        </div>
      </header>

      <main className="dash">
        <header className="dash-head">
          <div>
            <h1 className="dash-title">Your alerts</h1>
            <p className="dash-sub">
              Watched every minute ·{" "}
              {me?.telegram.linked ? "fires push here and to Telegram" : "fires land in the bell inbox"}
            </p>
          </div>
        </header>

        {alerts != null && (
          <div className="statrow">
            <div className="stat-tile">
              <div className="stat-tile-k">Active alerts</div>
              <div className="stat-tile-v">{alerts.length}</div>
            </div>
            <div className="stat-tile stat-tile-brand">
              <div className="stat-tile-k">Closest to fire</div>
              <div className="stat-tile-v">
                {(() => {
                  if (alerts.some((a) => a.targetReached)) return "firing now…";
                  const closest = alerts
                    .filter((a) => a.distanceToTarget)
                    .sort((x, y) => x.distanceToTarget!.pct - y.distanceToTarget!.pct)[0];
                  if (!closest) return "—";
                  const d = closest.distanceToTarget!;
                  return (
                    <>
                      {closest.symbol} <small>{d.dir === "up" ? "+" : "−"}{d.pct}% away</small>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile-k">Unread pings</div>
              <div className="stat-tile-v">{unread}</div>
            </div>
            <div className="stat-tile stat-tile-tg">
              <div className="stat-tile-k">Telegram</div>
              <div className="stat-tile-v">
                {me?.telegram.linked
                  ? me.telegram.username
                    ? `@${me.telegram.username}`
                    : "Connected"
                  : "Not linked"}
              </div>
            </div>
          </div>
        )}

        {error && <div className="form-error" role="alert">{error}</div>}
        {note && <div className="dash-note" role="status">{note}</div>}
        {me && !me.telegram.linked && (
          <TelegramBanner
            onLinked={() => {
              setNote("📨 Telegram connected — alerts now ping your phone too.");
              setTimeout(() => setNote(null), 8000);
              refresh();
            }}
          />
        )}

        {alerts === null && !error && (
          <div className="cards">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {alerts?.length === 0 && (
          <div className="dash-empty">
            <div className="dash-empty-mark" aria-hidden="true">
              <Logo size={38} wordmark={false} />
            </div>
            <h3>No alerts yet</h3>
            <p>
              Create one here — or message the Telegram bot, where{" "}
              <code>alert me if BTC drops 5% in an hour</code> works as-is.
            </p>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              Create your first alert
            </button>
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
    </>
  );
}
