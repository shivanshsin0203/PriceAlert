import { TelegramIcon } from "./icons";

// The signature landing element: a price line draws itself, crosses the dashed
// target, a ping fires at the crossing point, and the Telegram notification
// slides in. Pure SVG + CSS keyframes (globals.css .hv-*) — no JS, and
// prefers-reduced-motion renders the finished state instantly.

const PRICE_PATH =
  "M0 196 L28 182 L52 188 L84 163 L108 170 L138 146 L162 152 L192 130 " +
  "L218 138 L248 118 L272 98 L298 110 L326 90 L352 97 L382 80 L404 70 " +
  "L428 58 L452 64 L478 46 L504 52";

export default function HeroVisual() {
  return (
    <div className="hv" aria-hidden="true">
      <div className="hv-chart">
        <div className="hv-head">
          <span className="hv-pair"><b>BTC</b> / USD</span>
          <span className="hv-live">● LIVE · 1M</span>
        </div>
        <svg viewBox="0 0 520 250" role="presentation">
          <defs>
            <linearGradient id="hv-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4da3ff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#4da3ff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* grid */}
          {[50, 100, 150, 200].map((y) => (
            <line key={y} x1="0" y1={y} x2="520" y2={y} stroke="#1c2733" strokeWidth="1" />
          ))}

          {/* the alert's target */}
          <line x1="0" y1="70" x2="520" y2="70" stroke="#f5a524" strokeWidth="1.3" strokeDasharray="5 7" opacity="0.85" />
          <text x="10" y="60" fill="#f5a524" fontSize="10.5" letterSpacing="1.5" style={{ fontFamily: "var(--font-mono-stack)" }}>
            TARGET 70,000
          </text>

          {/* price history */}
          <path className="hv-price-fill" d={`${PRICE_PATH} L504 250 L0 250 Z`} fill="url(#hv-fill)" />
          <path
            className="hv-price-line"
            d={PRICE_PATH}
            pathLength={1000}
            fill="none"
            stroke="#4da3ff"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* the crossing moment */}
          <circle className="hv-ping-ring" cx="404" cy="70" r="13" fill="none" stroke="#f5a524" strokeWidth="2" />
          <circle className="hv-ping-ring hv-ping-ring2" cx="404" cy="70" r="13" fill="none" stroke="#f5a524" strokeWidth="1.4" />
          <circle className="hv-ping-dot" cx="404" cy="70" r="4.2" fill="#f5a524" />
        </svg>
      </div>

      <div className="hv-toast">
        <div className="hv-toast-head">
          <TelegramIcon size={14} />
          PriceAlert
          <time>now</time>
        </div>
        <div className="hv-toast-body">
          <b>🔔 BTC crossed $70,000</b> — now $70,014, +2.3% in the last hour.
          <br />
          💡 Bitcoin broke $70k after a steady two-hour climb. Not financial advice.
        </div>
      </div>
    </div>
  );
}
