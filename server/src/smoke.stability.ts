import { runBrain } from "./brain/deepseek";

// Stability harness: the historically-flaky phrasings, run N times each — a case only
// counts as stable if EVERY run agrees. Run: npx tsx src/smoke.stability.ts
const RUNS = 3;

type Action = { name: string | null; args: Record<string, unknown> };
const alerts = (a: Action) => (a.args.alerts as Record<string, unknown>[]) ?? [];

const CASES: { input: string; label: string; ok: (a: Action) => boolean }[] = [
  // must ASK (the wobbly ones)
  { input: "alert me if BTC drops 5%", label: "no window -> ask", ok: (a) => a.name === null },
  { input: "hows the market today", label: "vague market -> ask", ok: (a) => a.name === null },
  { input: "ping me zomato and swiggy prises by 0.1 % in next 5 min", label: "'by %' no direction -> ask", ok: (a) => a.name === null },
  { input: "ping me oil and btc prises by 0.1 % in next 5 min also give me there current prices", label: "ambiguous dir + mixed intent -> ask", ok: (a) => a.name === null },
  // must CREATE (the stricter checklist must not cause over-asking)
  { input: "alert me when eth and oil goes above 0.1 % in 5 min", label: "'goes above %' x2 -> create 2 up", ok: (a) => a.name === "create_alert" && alerts(a).length === 2 && alerts(a).every((c) => c.dir === "up") },
  { input: "yo alert me when doge moons 10% today", label: "'today' IS a timeframe -> create 1d", ok: (a) => a.name === "create_alert" && (alerts(a)[0]?.window as { unit?: string })?.unit === "d" },
  { input: "cardano drops 3% in 45 min", label: "stated window -> create", ok: (a) => a.name === "create_alert" && alerts(a).length === 1 },
];

async function main() {
  let stable = 0;
  let unstable = 0;
  for (const c of CASES) {
    const results: boolean[] = [];
    const seen: string[] = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await runBrain(c.input, { currency: "USD" });
      results.push(c.ok(r.action));
      seen.push(`${r.action.name ?? "none"}${r.action.name === "create_alert" ? `(${alerts(r.action).length})` : ""}`);
    }
    const allOk = results.every(Boolean);
    allOk ? stable++ : unstable++;
    console.log(`  ${allOk ? "✅" : "❌"} ${c.label} — ${results.filter(Boolean).length}/${RUNS} [${seen.join(", ")}] "${c.input}"`);
  }
  console.log(`\n=== STABILITY: ${stable}/${CASES.length} cases stable across ${RUNS} runs ===`);
  process.exit(unstable > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
