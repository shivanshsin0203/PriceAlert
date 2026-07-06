import HeroVisual from "../components/HeroVisual";
import SiteFooter from "../components/SiteFooter";
import SiteNav from "../components/SiteNav";
import TypedDemo from "../components/TypedDemo";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  GoogleG,
  LayersIcon,
  MessageIcon,
  SparklesIcon,
  TargetIcon,
  TelegramIcon,
} from "../components/icons";
import { getSession, SIGN_IN_PATH } from "../lib/auth";
import { LINKS } from "../lib/links";

// Landing (server component). Sign-in is live; the NL box is an honest demo —
// its button links into the real flow (bot + dashboard create the alerts).

const MARQUEE = [
  ["BTC", "Bitcoin"], ["ETH", "Ethereum"], ["SOL", "Solana"], ["DOGE", "Dogecoin"],
  ["XRP", "Ripple"], ["NVDA", "Nvidia"], ["AAPL", "Apple"], ["TSLA", "Tesla"],
  ["MSFT", "Microsoft"], ["RELIANCE", "Reliance"], ["TCS", "TCS"], ["NIFTY", "Nifty 50"],
  ["XAU", "Gold"], ["XAG", "Silver"], ["OIL", "Brent"], ["EUR/USD", "Euro"], ["USD/INR", "Rupee"],
] as const;

function MarqueeChips() {
  return (
    <>
      {MARQUEE.map(([sym, name]) => (
        <span className="marq-chip" key={sym}>
          <b>{sym}</b> {name}
        </span>
      ))}
    </>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const authError =
    sp.auth_error === "signed_out" ? "Please sign in to open the dashboard." : sp.auth_error;

  return (
    <>
      <SiteNav signedIn={!!session} />

      <main>
        {/* ── hero ── */}
        <div className="container">
          <section className="hero">
            <div>
              <span className="eyebrow">Market alerts · checked every minute</span>
              <h1>
                Price alerts you just <em>say</em>.
              </h1>
              <p className="hero-sub">
                Type <strong>“ping me if BTC drops 5% in the next hour.”</strong> PriceAlert turns
                it into a machine-checked rule, watches the market every minute, and pings you on
                Telegram and in-app — with a grounded note on what moved.
              </p>

              {authError && <div className="auth-error">⚠️ {authError}</div>}

              <TypedDemo signedIn={!!session} />

              <div className="hero-ctas" style={{ marginTop: 26 }}>
                {session ? (
                  <a className="btn-google" href="/dashboard">
                    {session.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="cta-avatar" src={session.avatar} alt="" width={18} height={18} />
                    ) : (
                      <GoogleG />
                    )}
                    Continue as {session.name?.split(" ")[0] ?? session.email}
                  </a>
                ) : (
                  <a className="btn-google" href={SIGN_IN_PATH}>
                    <GoogleG />
                    Continue with Google
                  </a>
                )}
                <a className="btn-ghost" href="#how">How it works</a>
              </div>
              <p className="hero-hint">Free · one-shot alerts, no spam · no card required</p>
            </div>

            <HeroVisual />
          </section>
        </div>

        {/* ── supported assets (decorative — duplicated for the loop) ── */}
        <div className="marq" aria-hidden="true">
          <div className="marq-track">
            <MarqueeChips />
            <MarqueeChips />
          </div>
        </div>

        {/* ── how it works ── */}
        <section className="sect" id="how">
          <div className="container">
            <div className="sect-head">
              <span className="eyebrow">How it works</span>
              <h2>Say it once. It&apos;s watched every minute.</h2>
            </div>
            <div className="steps">
              <div className="step">
                <span className="step-n">STEP 1</span>
                <h3>Say it</h3>
                <p>
                  <code>BTC under 55k</code> · <code>Nvidia drops 3% today</code> — typed on the web
                  or sent to the Telegram bot. Both land in the same account.
                </p>
              </div>
              <div className="step">
                <span className="step-n">STEP 2</span>
                <h3>We watch</h3>
                <p>
                  A deterministic engine evaluates every active alert against live prices, once a
                  minute. The AI never decides whether an alert fires.
                </p>
              </div>
              <div className="step">
                <span className="step-n">STEP 3</span>
                <h3>You get pinged</h3>
                <p>
                  Telegram push plus an in-app inbox row — with real numbers explaining what moved
                  and why it matched. Fires once, then it&apos;s done.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── the engine: NL → rule ── */}
        <section className="sect" id="engine">
          <div className="container">
            <div className="sect-head">
              <span className="eyebrow">The engine</span>
              <h2>A sentence becomes a machine-checked rule.</h2>
              <p>
                The model parses your words into a strict, validated condition. From there it&apos;s
                pure deterministic code — no guessing, no hallucinated fires.
              </p>
            </div>

            <div className="xform">
              <div className="xform-card">
                <div className="xform-label">You say</div>
                <div className="xform-say">ping me if BTC drops 5% in the next hour</div>
              </div>
              <div className="xform-mid">
                <ArrowRightIcon />
                <span>parse · validate</span>
              </div>
              <div className="xform-card">
                <div className="xform-label">The engine stores</div>
                <pre className="xform-code">
{`{
  `}<span className="k">&quot;kind&quot;</span><span className="p">:</span> <span className="s">&quot;pct_change&quot;</span><span className="p">,</span>{`
  `}<span className="k">&quot;symbol&quot;</span><span className="p">:</span> <span className="s">&quot;BTC&quot;</span><span className="p">,</span>{`
  `}<span className="k">&quot;dir&quot;</span><span className="p">:</span> <span className="s">&quot;down&quot;</span><span className="p">,</span>{`
  `}<span className="k">&quot;pct&quot;</span><span className="p">:</span> <span className="n">5</span><span className="p">,</span>{`
  `}<span className="k">&quot;window&quot;</span><span className="p">:</span> <span className="p">{"{"}</span> <span className="k">&quot;value&quot;</span><span className="p">:</span> <span className="n">1</span><span className="p">,</span> <span className="k">&quot;unit&quot;</span><span className="p">:</span> <span className="s">&quot;h&quot;</span> <span className="p">{"}"}</span>{`
}`}
                </pre>
              </div>
            </div>

            <div className="xform-foot">
              <span><CheckIcon /> Validated against a strict schema before it&apos;s ever stored</span>
              <span><CheckIcon /> Evaluated every minute by deterministic code</span>
              <span><CheckIcon /> Ambiguous input gets a clarifying question, not a guess</span>
            </div>
          </div>
        </section>

        {/* ── features ── */}
        <section className="sect" id="features">
          <div className="container">
            <div className="sect-head">
              <span className="eyebrow">Features</span>
              <h2>Small engine, serious plumbing.</h2>
            </div>
            <div className="feats">
              <div className="feat">
                <div className="feat-icon"><SparklesIcon /></div>
                <h3>Plain English in</h3>
                <p>Levels, percent moves, directions and time windows — phrased however you&apos;d say them. No forms required in the bot.</p>
              </div>
              <div className="feat">
                <div className="feat-icon"><ClockIcon /></div>
                <h3>A tick every minute</h3>
                <p>One shared price fetch per symbol per tick, however many alerts watch it. Fires land seconds after the cross.</p>
              </div>
              <div className="feat">
                <div className="feat-icon"><TelegramIcon /></div>
                <h3>Delivery that retries</h3>
                <p>Telegram pushes ride a queue with retries; every fire also writes a durable in-app inbox row that can&apos;t get lost.</p>
              </div>
              <div className="feat">
                <div className="feat-icon"><MessageIcon /></div>
                <h3>Grounded context</h3>
                <p>Each fire carries one or two sentences built only from real numbers — the move, the window, the 24h range. Always disclaimed.</p>
              </div>
              <div className="feat">
                <div className="feat-icon"><LayersIcon /></div>
                <h3>Multi-asset</h3>
                <p>Crypto, US and Indian stocks, NIFTY, gold and oil are alertable; metals and major forex pairs on price watch.</p>
              </div>
              <div className="feat">
                <div className="feat-icon"><TargetIcon /></div>
                <h3>One-shot by design</h3>
                <p>An alert fires once and retires — no cooldown tuning, no re-fire spam. History stays in your inbox and delivery log.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── telegram ── */}
        <section className="sect" id="telegram">
          <div className="container tgs">
            <div className="tgs-copy">
              <span className="eyebrow">Telegram</span>
              <h2>The same engine, in your pocket.</h2>
              <p>
                Link Telegram once with a single tap — a deep link, no passwords, no copy-paste.
                From then on the bot and the web dashboard are <b>one account</b>: alerts made in
                either place fire to both.
              </p>
              <ul className="tgs-points">
                <li><CheckIcon /> Create alerts in plain English from any chat</li>
                <li><CheckIcon /> One-tap connect — alerts you already made in the bot merge into your account</li>
                <li><CheckIcon /> Slash commands and buttons for the boring stuff; AI only where it earns its keep</li>
              </ul>
              <div style={{ marginTop: 28 }}>
                <a className="btn-ghost" href={LINKS.bot} target="_blank" rel="noreferrer">
                  <TelegramIcon size={16} /> Open {LINKS.botHandle}
                </a>
              </div>
            </div>

            <div className="chat" aria-label="Example Telegram conversation">
              <div className="chat-head">
                <span className="chat-ava"><TelegramIcon size={16} /></span>
                <div className="chat-title">
                  PriceAlert
                  <small>bot</small>
                </div>
              </div>
              <div className="bubble bubble-user">
                alert me if BTC drops 5% in the next hour
                <div className="bubble-time">14:02</div>
              </div>
              <div className="bubble bubble-bot">
                ✅ <b>Watching BTC.</b> I&apos;ll ping you if it drops 5% within 1 hour (by 15:02).
                One-shot — it fires once, then it&apos;s done.
                <div className="bubble-time">14:02</div>
              </div>
              <div className="bubble bubble-bot bubble-fire">
                🔔 <b>BTC −5.0% in 38 min</b> — now $66,405.
                <br />💡 Bitcoin slid alongside a broad crypto pullback this afternoon. Not
                financial advice.
                <div className="bubble-time">14:40</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── final CTA ── */}
        <section className="cta-band">
          <div className="container">
            <h2>Catch the next cross.</h2>
            <p>Sign in, say the alert, and let the watcher do the staring.</p>
            <div className="cta-band-row">
              {session ? (
                <a className="btn-primary" href="/dashboard">Open dashboard</a>
              ) : (
                <a className="btn-google" href={SIGN_IN_PATH}><GoogleG /> Continue with Google</a>
              )}
              <a className="btn-ghost" href="/support">Questions? Support</a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
