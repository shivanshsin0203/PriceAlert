"use client";

import { useEffect, useState } from "react";

// The NL alert box, demo form: cycles real example sentences with a typing
// effect. It's honest about being a demo — the button is a live link into the
// real flow (sign-in or dashboard), not a dead disabled control.
// Reduced-motion users get a static example, no typing.

const EXAMPLES = [
  "ping me if BTC drops 5% in the next hour",
  "alert me when ETH goes above 4,200",
  "tell me if NVDA falls 3% today",
  "let me know when gold crosses 2,700",
  "NIFTY below 24,000 → ping me",
];

const TYPE_MS = 42;
const ERASE_MS = 16;
const HOLD_MS = 2300;

export default function TypedDemo({ signedIn }: { signedIn: boolean }) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(EXAMPLES[0]);
      return;
    }
    let idx = 0;
    let pos = 0;
    let erasing = false;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      const phrase = EXAMPLES[idx];
      if (!erasing) {
        pos++;
        setText(phrase.slice(0, pos));
        if (pos === phrase.length) {
          erasing = true;
          timer = setTimeout(step, HOLD_MS);
        } else {
          timer = setTimeout(step, TYPE_MS);
        }
      } else {
        pos--;
        setText(phrase.slice(0, pos));
        if (pos === 0) {
          erasing = false;
          idx = (idx + 1) % EXAMPLES.length;
          timer = setTimeout(step, 350);
        } else {
          timer = setTimeout(step, ERASE_MS);
        }
      }
    };
    timer = setTimeout(step, 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      <div className="nlbox">
        <input
          type="text"
          value={text}
          readOnly
          tabIndex={-1}
          aria-label="Example alert: ping me if BTC drops 5% in the next hour"
        />
        <a className="btn-primary" href={signedIn ? "/dashboard" : "/api/auth/google"}>
          {signedIn ? "Create it →" : "Sign in to create"}
        </a>
      </div>
      <p className="nlbox-hint">
        Live in the <b>Telegram bot</b> today — plus a structured builder in the dashboard.
      </p>
    </div>
  );
}
