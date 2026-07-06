import Logo from "./Logo";
import { GitHubIcon, MailIcon, TelegramIcon, XIcon } from "./icons";
import { LINKS } from "../lib/links";

// Shared footer (landing + support). One solo-dev voice, real links only.

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p>
              A plain-English price-alert engine. Say the alert, and a deterministic watcher
              checks the market every minute until it happens. Built and run solo by Shivansh.
            </p>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <ul>
              <li><a href="/#how">How it works</a></li>
              <li><a href="/#features">Features</a></li>
              <li><a href={LINKS.bot} target="_blank" rel="noreferrer">Telegram bot</a></li>
              <li><a href="/dashboard">Dashboard</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Developer</h5>
            <ul>
              <li>
                <a href={LINKS.github} target="_blank" rel="noreferrer">
                  <GitHubIcon size={15} /> GitHub
                </a>
              </li>
              <li>
                <a href={LINKS.issues} target="_blank" rel="noreferrer">
                  <GitHubIcon size={15} /> Report an issue
                </a>
              </li>
              <li>
                <a href={LINKS.x} target="_blank" rel="noreferrer">
                  <XIcon size={14} /> {LINKS.xHandle}
                </a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Contact</h5>
            <ul>
              <li><a href="/support">Support</a></li>
              <li>
                <a href={`mailto:${LINKS.email}`}>
                  <MailIcon size={15} /> Email me
                </a>
              </li>
              <li>
                <a href={LINKS.bot} target="_blank" rel="noreferrer">
                  <TelegramIcon size={15} /> {LINKS.botHandle}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <span>© 2026 PriceAlert · built by a solo dev</span>
          <span>Not financial advice. Alerts only — no predictions, no trades.</span>
        </div>
      </div>
    </footer>
  );
}
