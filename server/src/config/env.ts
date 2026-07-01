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

  // TODO: make required as each feature lands (ARCHITECTURE.md §15)
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  INTERNAL_API_SECRET: z.string().min(16).optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
