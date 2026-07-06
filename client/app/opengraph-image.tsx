import { ImageResponse } from "next/og";

// OG image (ARCHITECTURE.md §5). Rendered at build/request time by Next.
// Mirrors the brand: ink navy, amber mark (price line → ping), mono example sentence.
export const runtime = "edge";
export const alt = "PriceAlert — plain-English price alerts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 90,
          background: "linear-gradient(135deg, #0B0F14 0%, #0D141D 60%, #11202b 100%)",
          color: "#E8EDF2",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 48 48" fill="none">
            <path
              d="M7 36 L17 25.5 L23 30.5 L33 16"
              stroke="#F5A524"
              strokeWidth="4.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="33" cy="16" r="3.4" fill="#F5A524" />
            <path d="M36.9 8.7 A8 8 0 0 1 40.9 18.9" stroke="#F5A524" strokeWidth="2.6" strokeLinecap="round" opacity="0.75" />
            <path d="M39.4 3.9 A13.4 13.4 0 0 1 46.1 21" stroke="#F5A524" strokeWidth="2.6" strokeLinecap="round" opacity="0.4" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, display: "flex" }}>
            <span>Price</span>
            <span style={{ color: "#F5A524" }}>Alert</span>
          </div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 700, marginTop: 36, lineHeight: 1.08, letterSpacing: -2 }}>
          Price alerts you just say.
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#8A97A5",
            marginTop: 30,
            padding: "18px 28px",
            border: "1px solid #24303d",
            borderRadius: 14,
            background: "#101720",
            display: "flex",
          }}
        >
          “ping me if BTC drops 5% in the next hour”
        </div>
        <div style={{ fontSize: 24, color: "#5C6875", marginTop: 28 }}>
          Watched every minute · Telegram + in-app · not financial advice
        </div>
      </div>
    ),
    { ...size },
  );
}
