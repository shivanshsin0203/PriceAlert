import { z } from "zod";
import { Condition, windowMinutes } from "../brain/schema";

// Dashboard create — the SAME Condition schema the bot's brain output is validated
// against, so both surfaces obey identical rules. One condition per request (the
// structured form creates one at a time; multi-create stays an LLM/bot feature).
export const CreateAlertBody = z
  .object({ condition: Condition })
  .refine((b) => b.condition.kind !== "pct_change" || windowMinutes(b.condition.window) <= 1440, {
    message: "Alerts can watch at most a 24-hour window",
  });
export type CreateAlertBody = z.infer<typeof CreateAlertBody>;

export const AlertIdParam = z.object({ id: z.string().uuid() });
