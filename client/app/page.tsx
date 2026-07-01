// Scrappy landing page (server component). Real NL alert box + auth wired in later steps.
export default function Home() {
  return (
    <main className="wrap">
      <span className="badge">⚡ AlertEngine</span>

      <h1>
        Price alerts you just <em>say</em>.
      </h1>

      <p className="sub">
        Type <strong>“ping me if BTC drops 5% in the next hour”</strong>. We parse it into a
        structured condition, watch the market every minute, and notify you on Telegram + in-app —
        with a short, grounded explanation of what happened.
      </p>

      <div className="box" aria-label="natural-language alert (demo)">
        <input
          type="text"
          placeholder="alert me if ETH falls 10% from its 24h high…"
          defaultValue=""
          readOnly
        />
        <button type="button" disabled title="Coming soon">
          Create alert
        </button>
      </div>
      <p className="hint">Demo input — live parsing &amp; sign-in land in the next build steps.</p>

      <section className="grid">
        <div className="card">
          <h3>🧠 Understands intent</h3>
          <p>Relative, volatility, and moving-average conditions that a dropdown can’t express.</p>
        </div>
        <div className="card">
          <h3>⏱ Watches every minute</h3>
          <p>A one-minute poller evaluates every active alert deterministically — no guessing.</p>
        </div>
        <div className="card">
          <h3>📨 Telegram + in-app</h3>
          <p>Reliable delivery with retries, plus an in-app inbox and full fire history.</p>
        </div>
        <div className="card">
          <h3>🪙 Multi-asset</h3>
          <p>Crypto first, then stocks, metals, oil, and forex via pluggable adapters.</p>
        </div>
      </section>

      <footer>Not financial advice. Alerts only — no predictions, no trades.</footer>
    </main>
  );
}
