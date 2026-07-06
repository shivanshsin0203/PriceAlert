// The PriceAlert mark: a rising price line whose last tick becomes a ping.
// Amber = the alert (brand). Green/red are reserved for market direction and
// never used decoratively — that discipline is part of the visual identity.
// Same geometry as app/icon.svg and brand/telegram-avatar (keep in sync).

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M7 36 L17 25.5 L23 30.5 L33 16"
        stroke="var(--brand, #F5A524)"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="33" cy="16" r="3.4" fill="var(--brand, #F5A524)" />
      <path
        d="M36.9 8.7 A8 8 0 0 1 40.9 18.9"
        stroke="var(--brand, #F5A524)"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M39.4 3.9 A13.4 13.4 0 0 1 46.1 21"
        stroke="var(--brand, #F5A524)"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

export default function Logo({ size = 26, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      {wordmark && (
        <span className="logo-word">
          Price<em>Alert</em>
        </span>
      )}
    </span>
  );
}
