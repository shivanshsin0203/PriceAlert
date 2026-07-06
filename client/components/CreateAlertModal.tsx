"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type Condition, type SymbolGroups } from "../lib/api";

// Structured create form — the same validated service the Telegram bot uses, no LLM.
// Server guard failures (already-above, market closed, window too short) surface verbatim.
// Two-choice fields are segmented controls, not dropdowns — one tap, state visible.

function Seg<T extends string>({
  value,
  onChange,
  options,
  toned = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string; tone?: "up" | "down" }[];
  toned?: boolean;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          className={
            value === o.v ? `seg-on${toned && o.tone ? ` seg-${o.tone}` : ""}` : undefined
          }
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function CreateAlertModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (note: string | null) => void;
}) {
  const [groups, setGroups] = useState<SymbolGroups["groups"]>([]);
  const [symbol, setSymbol] = useState("BTC");
  const [kind, setKind] = useState<"absolute" | "pct_change">("absolute");
  const [op, setOp] = useState<"above" | "below">("above");
  const [value, setValue] = useState("");
  const [dir, setDir] = useState<"up" | "down">("up");
  const [pct, setPct] = useState("");
  const [winValue, setWinValue] = useState("1");
  const [winUnit, setWinUnit] = useState<"m" | "h">("h");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.symbols().then((s) => setGroups(s.groups)).catch(() => setError("Couldn't load the asset list"));
  }, []);

  // Escape closes (backdrop click already does)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Creation is ALWAYS in the asset's native quote — the number the engine compares.
  // (Display elsewhere follows the user's selected currency; entry never does.)
  const unit =
    symbol === "NIFTY"
      ? { sym: "", hint: "NIFTY is an index — enter the level in index points" }
      : groups.find((g) => g.label === "Indian Stocks")?.symbols.some((s) => s.symbol === symbol)
        ? { sym: "₹", hint: "Indian stocks trade in ₹ (NSE) — enter the level in rupees" }
        : { sym: "$", hint: "Enter the level in US dollars" };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let condition: Condition;
    if (kind === "absolute") {
      const v = Number(value);
      if (!Number.isFinite(v) || v <= 0) return setError("Enter a positive price level");
      condition = { kind: "absolute", symbol, op, value: v };
    } else {
      const p = Number(pct);
      const w = Number(winValue);
      if (!Number.isFinite(p) || p <= 0) return setError("Enter a positive percent");
      if (!Number.isFinite(w) || w <= 0) return setError("Enter a positive window");
      condition = { kind: "pct_change", symbol, dir, pct: p, window: { value: w, unit: winUnit } };
    }

    setBusy(true);
    try {
      const res = await api.createAlert(condition);
      onCreated(res.note);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New alert">
        <div className="modal-head">
          <h2>New alert</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit} className="form">
          <label>
            Asset
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.symbols.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.name} ({s.symbol})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="fgroup">
            Alert type
            <Seg
              value={kind}
              onChange={setKind}
              options={[
                { v: "absolute", label: "Price level" },
                { v: "pct_change", label: "% move in a window" },
              ]}
            />
          </div>

          {kind === "absolute" ? (
            <div className="form-row">
              <div className="fgroup">
                Direction
                <Seg
                  value={op}
                  onChange={setOp}
                  toned
                  options={[
                    { v: "above", label: "▲ goes above", tone: "up" },
                    { v: "below", label: "▼ goes below", tone: "down" },
                  ]}
                />
              </div>
              <label>
                Price {unit.sym && `(${unit.sym})`}
                <input type="number" step="any" min="0" placeholder="e.g. 70000" value={value} onChange={(e) => setValue(e.target.value)} />
              </label>
            </div>
          ) : (
            <>
              <div className="form-row">
                <div className="fgroup">
                  Direction
                  <Seg
                    value={dir}
                    onChange={setDir}
                    toned
                    options={[
                      { v: "up", label: "▲ rises", tone: "up" },
                      { v: "down", label: "▼ drops", tone: "down" },
                    ]}
                  />
                </div>
                <label>
                  Percent
                  <input type="number" step="any" min="0" placeholder="e.g. 5" value={pct} onChange={(e) => setPct(e.target.value)} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Within
                  <input type="number" min="1" value={winValue} onChange={(e) => setWinValue(e.target.value)} />
                </label>
                <div className="fgroup">
                  Unit
                  <Seg
                    value={winUnit}
                    onChange={setWinUnit}
                    options={[
                      { v: "m", label: "minutes" },
                      { v: "h", label: "hours" },
                    ]}
                  />
                </div>
              </div>
              <p className="form-hint">Window is 5 minutes – 24 hours. The window is also the alert&apos;s lifetime.</p>
            </>
          )}

          {kind === "absolute" && <p className="form-hint">{unit.hint}</p>}

          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create alert"}
          </button>
        </form>
      </div>
    </div>
  );
}
