import type { Metadata } from "next";
import SiteFooter from "../../components/SiteFooter";
import SiteNav from "../../components/SiteNav";
import { GitHubIcon, MailIcon, XIcon } from "../../components/icons";
import { getSession } from "../../lib/auth";
import { LINKS } from "../../lib/links";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with PriceAlert — bug reports on GitHub, quick questions on X, or email.",
};

// Support: one honest page for a one-person project. Contact routes + the
// questions people actually ask, no ticket-system theater.

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do alerts actually fire?",
    a: (
      <p>
        A watcher evaluates every active alert against live prices once a minute. The check is
        plain deterministic code — the AI only parses your sentence when the alert is created and
        writes the short context note when it fires. If the condition is met, you get a Telegram
        push (if linked) and an in-app inbox notification within seconds.
      </p>
    ),
  },
  {
    q: "Why did my alert fire only once?",
    a: (
      <p>
        By design. Every alert is <strong>one-shot</strong>: it fires, then retires. That&apos;s what
        keeps the pings meaningful — no re-fire spam every minute while the price hovers around
        your level. If you want to keep watching, create the alert again in one sentence.
      </p>
    ),
  },
  {
    q: "How does Telegram linking work?",
    a: (
      <p>
        From the dashboard, hit <strong>Connect</strong> — it opens the bot with a one-time link
        token and you tap <code>Start</code>. That&apos;s it: no password, no code to copy. Any
        alerts you had already created in the bot are merged into your account, and from then on
        alerts made anywhere fire to both Telegram and the dashboard.
      </p>
    ),
  },
  {
    q: "Which assets can I watch?",
    a: (
      <p>
        Crypto (BTC, ETH, SOL and more), large US stocks (Nvidia, Apple, Tesla…), Indian stocks and
        NIFTY, gold and oil. Metals and major forex pairs are available for price lookups. Indian
        market data comes via a free public source and can occasionally lag — a known limitation.
      </p>
    ),
  },
  {
    q: "Is this financial advice?",
    a: (
      <p>
        No. PriceAlert watches prices and tells you when a condition you defined became true —
        nothing else. It never predicts, never recommends, and never touches money or trades. Every
        AI-written context note is grounded in real numbers and carries a disclaimer.
      </p>
    ),
  },
  {
    q: "What does it cost?",
    a: (
      <p>
        Nothing. It&apos;s a portfolio project I run at my own (small) expense. No card, no paid
        tier, no data resale. If it&apos;s ever at risk of falling over from load, rate limits come
        before price tags.
      </p>
    ),
  },
  {
    q: "What data do you store about me?",
    a: (
      <p>
        Your Google name, email and avatar (for sign-in), your Telegram chat id if you link it, and
        the alerts + notification history you create. That&apos;s the whole list. Deleting an alert
        deletes it; nothing is shared or sold.
      </p>
    ),
  },
];

export default async function SupportPage() {
  const session = await getSession();

  return (
    <>
      <SiteNav signedIn={!!session} />

      <main className="support">
        <div className="container">
          <header className="support-head">
            <span className="eyebrow">Support</span>
            <h1>A real person answers.</h1>
            <p>
              PriceAlert is built and run by <b>one developer</b> — me, Shivansh. There&apos;s no
              support team and no chatbot maze: pick whichever channel suits the problem and
              I&apos;ll get back to you as fast as a solo dev honestly can.
            </p>
          </header>

          <div className="contact-grid">
            <a className="contact-card" href={LINKS.issues} target="_blank" rel="noreferrer">
              <div className="feat-icon"><GitHubIcon /></div>
              <h3>Bugs &amp; feature requests</h3>
              <p>The best channel for anything reproducible — it stays tracked until it&apos;s fixed, in the open.</p>
              <span>github.com/shivanshsin0203/PriceAlert/issues →</span>
            </a>
            <a className="contact-card" href={LINKS.x} target="_blank" rel="noreferrer">
              <div className="feat-icon"><XIcon /></div>
              <h3>Quick questions</h3>
              <p>DMs are open on X — fastest route for &quot;is this supposed to happen?&quot; questions.</p>
              <span>{LINKS.xHandle} →</span>
            </a>
            <a className="contact-card" href={`mailto:${LINKS.email}`}>
              <div className="feat-icon"><MailIcon /></div>
              <h3>Account &amp; privacy</h3>
              <p>For anything involving your account or data — email keeps it off the public record.</p>
              <span>{LINKS.email}</span>
            </a>
          </div>

          <h2>Frequently asked</h2>
          <div className="faq">
            {FAQ.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}</summary>
                {a}
              </details>
            ))}
          </div>

          <div className="report-note">
            <b>Reporting a bug? Two details cut the round-trips:</b>
            <p>
              the alert&apos;s exact wording (or its condition from the dashboard card) and roughly
              when it happened — timestamps let me line your report up with the watcher&apos;s logs.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
