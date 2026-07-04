"use client";

import type { AlertDTO } from "../lib/api";

// One active alert. Click = open the graph; the ✕ cancels (stopPropagation so it
// doesn't also open the graph).

function remaining(expiresAt: number): string {
  const mins = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
  if (mins < 60) return `${mins}m`;
  if (mins < 120) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.round(mins / 60)}h`;
}

function conditionLine(a: AlertDTO): string {
  const c = a.condition;
  if (c.kind === "absolute") return `${c.op === "above" ? "▲ above" : "▼ below"} ${a.targetPriceFmt}`;
  return `${c.dir === "up" ? "▲ +" : "▼ −"}${c.pct}% in ${c.window.value}${c.window.unit}`;
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
  return (
    <div className="card" onClick={() => onOpen(alert)} role="button" tabIndex={0}>
      <div className="card-top">
        <div>
          <div className="card-name">{alert.name}</div>
          <div className="card-sym">{alert.symbol}</div>
        </div>
        <button
          className="card-del"
          title="Cancel alert"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(alert);
          }}
        >
          ✕
        </button>
      </div>

      <div className="card-cond">{conditionLine(alert)}</div>

      <div className="card-prices">
        <span className="card-now">{alert.currentPriceFmt ?? "—"}</span>
        <span className="card-target">target {alert.targetPriceFmt}</span>
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
        <span>expires in {remaining(alert.expiresAt)}</span>
        <span className="card-hint">click for graph →</span>
      </div>
    </div>
  );
}
