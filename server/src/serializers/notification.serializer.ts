import type { DeliveryRow } from "../models/deliveries.repo";

// Bell dropdown DTO. contextText is stored as Telegram HTML (<b>/<i>) — the dashboard
// gets a plain-text version; the client renders it as text, never as HTML (no injection).

export type NotificationDTO = {
  id: string;
  alertId: string;
  kind: "fire" | "expiry";
  text: string;
  read: boolean;
  firedAt: number; // ms epoch
};

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function serializeNotification(d: DeliveryRow): NotificationDTO {
  const kind = ((d.payload as { kind?: string })?.kind === "expiry" ? "expiry" : "fire") as "fire" | "expiry";
  return {
    id: d.id,
    alertId: d.alertId,
    kind,
    text: strip(d.contextText ?? "Alert update"),
    read: d.read,
    firedAt: d.firedAt.getTime(),
  };
}
