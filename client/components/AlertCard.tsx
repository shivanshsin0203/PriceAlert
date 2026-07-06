"use client";

import type { AlertDTO } from "../lib/api";

// One active alert. Click (or Enter/Space) opens the graph; the ✕ cancels
// (stopPropagation so it doesn't also open the graph).

function minutesLeft(expiresAt: number): number {
  return Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
}

function remaining(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 120) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.round(mins / 60)}h`;
}

function ConditionPill({ a }: { a: AlertDTO }) {
  const c = a.condition;
  const up = c.kind === "absolute" ? c.op === "above" : c.dir === "up";
  return (
    <span className="card-cond">
      <span className={up ? "cond-up" : "cond-down"}>{up ? "▲" : "▼"}</span>
      {c.kind === "absolute"
        ? `${c.op} ${a.targetPriceFmt}`
        : `${up ? "+" : "−"}${c.pct}% in ${c.window.value}${c.window.unit}`}
    </span>
  );
}

export default function AlertCard({
  alert,
  onOpen,
  onDelete,
}: {
  alert: AlertDTO;
  onOpen: (a: AlertDTO) => void;
  onDelete: (a: AlertDTO) => void;
}) {
  const mins = minutesLeft(alert.expiresAt);
  return (
    <div
      className="card"
      onClick={() => onOpen(alert)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(alert);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${alert.name} alert — open graph`}
    >
      <div className="card-top">
        <div className="card-id">
          <span className="card-tick">{alert.symbol}</span>
          <div style={{ minWidth: 0 }}>
            <div className="card-name">{alert.name}</div>
            <div className="card-sym">
              {alert.condition.kind === "absolute" ? "price level" : "% move"}
            </div>
          </div>
        </div>
        <button
          className="card-del"
          title="Cancel alert"
          aria-label={`Cancel ${alert.name} alert`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(alert);
          }}
        >
          ✕
        </button>
      </div>

      <ConditionPill a={alert} />

      <div className="card-prices">
        <span className="card-now">
          {alert.currentPriceFmt ?? "—"}
          {alert.movedFromAnchorPct != null && (
            <span className={`card-delta ${alert.movedFromAnchorPct >= 0 ? "up" : "down"}`}>
              {alert.movedFromAnchorPct >= 0 ? "+" : ""}{alert.movedFromAnchorPct}%
            </span>
          )}
        </span>
        <span className="card-target">
          target
          <b>{alert.targetPriceFmt}</b>
        </span>
      </div>

      {alert.targetReached ? (
        <div className="card-distance card-reached">🎯 target reached — firing on the next check…</div>
      ) : (
        alert.distanceToTarget && (
          <div className="card-distance">
            needs <b>{alert.distanceToTarget.dir === "up" ? "+" : "−"}{alert.distanceToTarget.pct}%</b>{" "}
            {alert.distanceToTarget.dir === "up" ? "rise" : "drop"} to fire
          </div>
        )
      )}

      {alert.progressPct != null && (
        <div className="progress-block" title="Share of the journey from creation price to target covered so far">
          <div className="progress">
            <div className="progress-fill" style={{ width: `${alert.progressPct}%` }} />
          </div>
          <div className="progress-labels">
            <span>created {alert.anchorPriceFmt}</span>
            <span>{alert.progressPct}% of the way</span>
          </div>
        </div>
      )}

      <div className="card-foot">
        <span className={`card-foot-exp${mins < 15 ? " card-foot-soon" : ""}`}>
          expires in {remaining(mins)}
        </span>
        <span className="card-hint">view graph →</span>
      </div>
    </div>
  );
}
