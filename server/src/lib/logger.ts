// Pipeline logger — one colored, tagged stream so the whole flow is readable at a glance.
// Each stage of the pipeline gets its own color + sign:
//   🤖 BOT (blue)  ·  🧠 BRAIN (magenta)  ·  🔌 REDIS (cyan)  ·  🗄  PG (blue)
//   ⏱  TICK (magenta)  ·  📬 QUEUE (yellow)  ·  🔔 FIRE (green bold)  ·  ⌛ EXPIRE (yellow)
//   📤 DELIVER (green)  ·  ⚠️ warn (yellow)  ·  ❌ error (red)

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const ts = () => `${C.gray}${new Date().toLocaleTimeString("en-GB")}${C.reset}`;

function stage(sign: string, tag: string, color: string, bold = false) {
  const label = `${bold ? C.bold : ""}${color}${sign} ${tag.padEnd(7)}${C.reset}`;
  return (...args: unknown[]) => console.log(`${ts()} ${label}`, ...args);
}

// Legacy API (kept — used across the codebase)
export const logger = {
  info: (...args: unknown[]) => console.log(`${ts()} ${C.blue}[info]${C.reset}`, ...args),
  warn: (...args: unknown[]) => console.warn(`${ts()} ${C.yellow}⚠️ [warn]${C.reset}`, ...args),
  error: (...args: unknown[]) => console.error(`${ts()} ${C.red}❌ [error]${C.reset}`, ...args),
};

// Pipeline-stage loggers
export const plog = {
  bot: stage("🤖", "BOT", C.blue),
  brain: stage("🧠", "BRAIN", C.magenta),
  redis: stage("🔌", "REDIS", C.cyan),
  pg: stage("🗄️", "PG", C.blue),
  tick: stage("⏱️", "TICK", C.magenta),
  queue: stage("📬", "QUEUE", C.yellow),
  fire: stage("🔔", "FIRE", C.green, true),
  expire: stage("⌛", "EXPIRE", C.yellow),
  deliver: stage("📤", "DELIVER", C.green),
  boot: stage("🚀", "BOOT", C.cyan, true),
  ok: stage("✅", "OK", C.green),
  skip: (...args: unknown[]) => console.log(`${ts()} ${C.gray}⏭️  SKIP   `, ...args, C.reset),
  warn: (...args: unknown[]) => console.warn(`${ts()} ${C.yellow}⚠️  WARN  ${C.reset}`, ...args),
  error: (...args: unknown[]) => console.error(`${ts()} ${C.red}❌ ERROR  ${C.reset}`, ...args),
  dim: (...args: unknown[]) => console.log(`${ts()} ${C.dim}`, ...args, C.reset),
};
