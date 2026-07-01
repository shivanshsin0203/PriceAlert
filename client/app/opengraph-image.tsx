import { ImageResponse } from "next/og";

// OG image (ARCHITECTURE.md §5). Rendered at build/request time by Next.
export const runtime = "edge";
export const alt = "AlertEngine — plain-English price alerts";
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
          padding: 80,
          background: "#0b0d10",
          color: "#e6edf3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 34, color: "#4ade80" }}>⚡ AlertEngine</div>
        <div style={{ fontSize: 68, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
          Price alerts you just say.
        </div>
        <div style={{ fontSize: 30, color: "#9aa7b2", marginTop: 20 }}>
          “ping me if BTC drops 5% in the next hour”
        </div>
      </div>
    ),
    { ...size },
  );
}
