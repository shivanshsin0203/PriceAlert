import { z } from "zod";
import { ALERTABLE, PRICEABLE } from "../adapters/symbols";

const AlertSymbol = z.enum(ALERTABLE as [string, ...string[]]); // create_alert
const PriceSymbol = z.enum(PRICEABLE as [string, ...string[]]); // get_price (broader)
const Window = z.object({ value: z.number().positive(), unit: z.enum(["m", "h", "d"]) });

export const windowMinutes = (w: { value: number; unit: "m" | "h" | "d" }) =>
  w.unit === "m" ? w.value : w.unit === "h" ? w.value * 60 : w.value * 1440;

// One alert condition (phase 1: threshold | percent)
export const Condition = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("absolute"),
    symbol: AlertSymbol,
    op: z.enum(["above", "below"]),
    value: z.number().positive(),
  }),
  z.object({
    kind: z.literal("pct_change"),
    symbol: AlertSymbol,
    dir: z.enum(["up", "down"]),
    pct: z.number().positive(),
    window: Window,
  }),
]);
export type Condition = z.infer<typeof Condition>;

// create_alert args = 1..15 conditions ("alert on all indian stocks if they rise 5%")
export const CreateAlertArgs = z.object({ alerts: z.array(Condition).min(1).max(15) });
export type CreateAlertArgs = z.infer<typeof CreateAlertArgs>;

export const GetPriceArgs = z.object({
  symbols: z.array(PriceSymbol).min(1),
  currency: z.enum(["USD", "EUR", "INR"]).optional(), // one-off display currency ("gold price in inr")
});
export const ChangeCurrencyArgs = z.object({ currency: z.enum(["USD", "EUR", "INR"]) });

// Strict output envelope. args is loose here, then validated per-function below.
export const Envelope = z.object({
  message: z.string(),
  action: z.object({
    name: z.enum(["create_alert", "get_price", "change_currency", "list_alerts"]).nullable(),
    args: z.record(z.any()).default({}),
  }),
});
export type Envelope = z.infer<typeof Envelope>;

export function validateArgs(name: string, args: unknown) {
  switch (name) {
    case "create_alert": {
      // normalize the model's output to {alerts:[...]}: accept a bare condition,
      // {condition:{...}}, or {alerts:[...]}; drop invalid entries, keep valid ones
      const o = (args ?? {}) as Record<string, unknown>;
      const raw: unknown[] = Array.isArray(o.alerts)
        ? o.alerts
        : "condition" in o
          ? [o.condition]
          : [o];
      const valid = raw.filter((c) => Condition.safeParse(c).success);
      return CreateAlertArgs.safeParse({ alerts: valid });
    }
    case "get_price":
      return GetPriceArgs.safeParse(args);
    case "change_currency":
      return ChangeCurrencyArgs.safeParse(args);
    case "list_alerts":
      return z.object({}).safeParse({});
    default:
      return null;
  }
}
