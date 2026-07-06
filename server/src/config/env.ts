import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/**
 * Zod-validated environment (ARCHITECTURE.md §3 rule 2, §15).
 * Only what the skeleton needs is required now; the rest become required as
 * features land — flip them from `.optional()` to required when wired.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(), // required (DB phase)

  REDIS_URL: z.string(), // required (persistence phase)

  // Auth phase (§4.1, §6): JWT_SECRET is SHARED with the Next BFF (it verifies the
  // cookie; we mint + verify on /api). INTERNAL_API_SECRET proves the caller is our BFF.
  JWT_SECRET: z.string().min(32),
  INTERNAL_API_SECRET: z.string().min(16),
  TELEGRAM_BOT_TOKEN: z.string(), // required (bot phase)
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(), // deep-link linking needs it (t.me/<username>?start=…)
  DEEPSEEK_API_KEY: z.string(), // required (brain phase)
  PUBLIC_BASE_URL: z.string().url().optional(),

  // Dashboard dev phase (pre-auth): all /api requests act as this Telegram-first user.
  // Replaced by the JWT identity when auth lands — nothing else changes.
  DASHBOARD_CHAT_ID: z.coerce.number().int().default(1764981523),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
