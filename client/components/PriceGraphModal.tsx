"use client";

import {
  AreaSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { api, type AlertDTO, type AlertHistoryResp } from "../lib/api";

// Click a card → price history from alert creation to now with the alert's own truth
// overlaid: target line, creation-price line (for % alerts), created/fired markers.
//
// Perf: the chart is created ONCE and mutated in place — recreating it on every 30s
// refresh (the old approach) flashes and resets the user's zoom/crosshair.

// lightweight-charts renders timestamps as UTC — shift by the local offset so the
// axis shows wall-clock time (the standard approach for this library).
const TZ_OFF = -new Date().getTimezoneOffset() * 60;
const toChartTime = (ms: number) => (Math.floor(ms / 1000) + TZ_OFF) as UTCTimestamp;

// Sensible decimals per price magnitude (DOGE ≠ BTC).
function precisionFor(p: number): number {
  if (p >= 1000) return 2;
  if (p >= 1) return 2;
  if (p >= 0.01) return 4;
  return 6;
}

function StatItem({ k, v, tone }: { k: string; v: string; tone?: "up" | "down" | "target" }) {
  return (
    <div className="stat">
      <span className="stat-k">{k}</span>
      <span className={`stat-v${tone ? ` stat-${tone}` : ""}`}>{v}</span>
    </div>
  );
}

// The same numbers the chart draws, as plain figures below it. "When created" is the
// alert's baseline price (the engine calls it the anchor): % moves are measured from it.
function GraphStats({ a, lastPoint }: { a: AlertDTO; lastPoint: { t: number; p: number } | null }) {
  const currentFmt =
    a.currentPriceFmt ??
    (lastPoint ? `${lastPoint.p.toLocaleString("en-US", { maximumFractionDigits: precisionFor(lastPoint.p) })} (last)` : "—");
  const moved = a.movedFromAnchorPct;
  const local = (ms: number) =>
    new Date(ms).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="stats">
      <StatItem k="Now" v={currentFmt} />
      <StatItem k="When created" v={a.anchorPriceFmt} />
      <StatItem k="Target" v={a.targetPriceFmt} tone="target" />
      <StatItem
        k="Change since created"
        v={moved != null ? `${moved >= 0 ? "+" : ""}${moved}%` : "—"}
        tone={moved != null && moved >= 0 ? "up" : "down"}
      />
      {a.distanceToTarget && a.status === "active" && (
        <StatItem k="Still needs" v={`${a.distanceToTarget.dir === "up" ? "+" : "−"}${a.distanceToTarget.pct}%`} />
      )}
      <StatItem k="Created" v={local(a.createdAt)} />
      {a.triggeredAt ? (
        <StatItem k="Fired" v={local(a.triggeredAt)} tone="up" />
      ) : (
        <StatItem k={a.status === "active" ? "Expires" : "Expired"} v={local(a.expiresAt)} />
      )}
    </div>
  );
}

export default function PriceGraphModal({ alert, onClose }: { alert: AlertDTO; onClose: () => void }) {
  const [data, setData] = useState<AlertHistoryResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

  // fetch (+ refresh while active)
  useEffect(() => {
    let stop = false;
    const load = () =>
      api
        .alertHistory(alert.id)
        .then((d) => !stop && setData(d))
        .catch((e) => !stop && setError(e instanceof Error ? e.message : "Failed to load history"));
    load();
    const t = alert.status === "active" ? setInterval(load, 30_000) : undefined;
    return () => {
      stop = true;
      if (t) clearInterval(t);
    };
  }, [alert.id, alert.status]);

  // create the chart ONCE
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: "#0b0d10" },
        textColor: "#9aa7b2",
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1a2026" } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#232a31", rightOffset: 3 },
      rightPriceScale: { borderColor: "#232a31" },
      crosshair: {
        horzLine: { color: "#4a5866", labelBackgroundColor: "#232a31" },
        vertLine: { color: "#4a5866", labelBackgroundColor: "#232a31" },
      },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#38bdf8",
      lineWidth: 2,
      topColor: "rgba(56, 189, 248, 0.25)",
      bottomColor: "rgba(56, 189, 248, 0.0)",
      priceLineVisible: true,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // update data in place on every (re)fetch — zoom/crosshair survive
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!data || !series || !chart) return;

    const a = data.alert;
    const firstRender = priceLinesRef.current.length === 0;

    // ascending, unique seconds (library requirement)
    const pts = data.history.series
      .map((pt) => ({ time: toChartTime(pt.t), value: pt.p }))
      .sort((x, y) => x.time - y.time)
      .filter((pt, i, arr) => i === 0 || pt.time !== arr[i - 1].time);
    series.setData(pts);

    const prec = precisionFor(a.targetPrice || pts[pts.length - 1]?.value || 1);
    series.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: 1 / 10 ** prec } });

    // overlay lines are static per alert — draw once
    if (firstRender) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: a.targetPrice,
          color: "#4ade80",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          title: "target",
        }),
      );
      if (a.condition.kind === "pct_change") {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: a.anchorPrice,
            color: "#6b7683",
            lineStyle: LineStyle.Dotted,
            lineWidth: 1,
            title: "created",
          }),
        );
      }
    }

    // markers must sit on existing points — snap to the nearest series time
    if (pts.length > 0) {
      const snap = (ms: number): UTCTimestamp => {
        const s = toChartTime(ms);
        let best = pts[0].time;
        for (const p of pts) if (Math.abs(p.time - s) < Math.abs(best - s)) best = p.time;
        return best;
      };
      const markers: SeriesMarker<Time>[] = [
        { time: snap(a.createdAt), position: "belowBar", color: "#38bdf8", shape: "arrowUp", text: "created" },
      ];
      if (a.triggeredAt) {
        markers.push({ time: snap(a.triggeredAt), position: "aboveBar", color: "#4ade80", shape: "circle", text: "fired" });
      }
      if (!markersRef.current) markersRef.current = createSeriesMarkers(series, markers);
      else markersRef.current.setMarkers(markers);
    }

    if (firstRender) chart.timeScale().fitContent(); // only on first paint — keep the user's zoom after
  }, [data]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{alert.label}</h2>
            <p className="modal-sub">{(data?.alert ?? alert).description}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {error && <div className="form-error">{error}</div>}
        <div ref={boxRef} className="chart-box">
          {!data && !error && <div className="chart-loading">Loading price history…</div>}
        </div>

        {data && <GraphStats a={data.alert} lastPoint={data.history.series.at(-1) ?? null} />}

        {data && (
          <p className="chart-note">
            {data.history.series.length} points · {data.history.interval} candles · local time ·{" "}
            {data.alert.status === "active" ? "live — refreshes every 30s" : `alert ${data.alert.status}`}
            {data.history.series.length === 0 && " · no market data in this window (market likely closed since creation)"}
          </p>
        )}
      </div>
    </div>
  );
}
