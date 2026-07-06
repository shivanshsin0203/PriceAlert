import Logo from "./Logo";
import { GitHubIcon } from "./icons";
import { LINKS } from "../lib/links";
import { SIGN_IN_PATH } from "../lib/auth";

// Sticky marketing nav (landing + support). Server component — session state
// comes in as a prop so each page decides it once.

export default function SiteNav({ signedIn }: { signedIn: boolean }) {
  return (
    <nav className="site-nav">
      <div className="container site-nav-in">
        <a href="/" aria-label="PriceAlert home" style={{ textDecoration: "none" }}>
          <Logo />
        </a>
        <div className="site-nav-links">
          <a href="/#how">How it works</a>
          <a href="/#features">Features</a>
          <a href="/#telegram">Telegram</a>
          <a href="/support">Support</a>
        </div>
        <div className="site-nav-cta">
          <a className="site-nav-gh" href={LINKS.github} target="_blank" rel="noreferrer" aria-label="GitHub repository">
            <GitHubIcon size={19} />
          </a>
          {signedIn ? (
            <a className="btn-primary" href="/dashboard">Open dashboard</a>
          ) : (
            <a className="btn-primary" href={SIGN_IN_PATH}>Sign in</a>
          )}
        </div>
      </div>
    </nav>
  );
}
