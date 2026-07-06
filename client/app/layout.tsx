import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Type system: Space Grotesk carries the headlines, IBM Plex Sans the UI,
// IBM Plex Mono every number/ticker/condition (terminal heritage — prices are data).
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "PriceAlert — plain-English price alerts",
    template: "%s · PriceAlert",
  },
  description:
    "Write a market alert in plain English. PriceAlert watches prices every minute and pings you on Telegram + in-app with a grounded explanation.",
};

export const viewport: Viewport = {
  themeColor: "#0B0F14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
