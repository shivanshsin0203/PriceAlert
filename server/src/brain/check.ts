import { runBrain } from "./deepseek";

// Live check of the brain. Run: npx tsx src/brain/check.ts
const cases = [
  "alert me if BTC drops 5% in an hour", // -> create_alert pct_change down
  "notify me when ETH goes above 4000", // -> create_alert absolute above
  "what's the price of solana", // -> get_price SOL
  "change my currency to rupees", // -> change_currency INR
  "show my alerts", // -> list_alerts
  "what's the weather today?", // -> out of scope, name null
  "alert me on bitcoin", // -> missing info, name null (ask)
];

async function main() {
  for (const c of cases) {
    const r = await runBrain(c, { currency: "USD" });
    console.log(`\n> ${c}\n  ${JSON.stringify(r)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
