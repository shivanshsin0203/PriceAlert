import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlertEngine — plain-English price alerts",
  description:
    "Write a market alert in plain English. We watch prices every minute and ping you on Telegram + in-app with a grounded explanation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
