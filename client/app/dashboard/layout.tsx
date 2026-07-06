import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your live price alerts — watched every minute.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
