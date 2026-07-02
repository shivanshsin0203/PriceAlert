import { getHistory, getPrice } from "./registry";

// Live sanity check for the free adapters. Run: npx tsx src/adapters/check.ts
async function probe(label: string, fn: () => Promise<unknown>) {
  try {
    console.log(label, await fn());
  } catch (e) {
    console.log(`${label} FAILED:`, (e as Error).message);
  }
}

async function main() {
  await probe("BTC price:", () => getPrice("BTC"));
  await probe("BTC 1h candles (len):", async () => (await getHistory("BTC", "1h", 3)).length);
  await probe("XAU (gold):", () => getPrice("XAU"));
  await probe("USDINR:", () => getPrice("USDINR"));
  await probe("OIL:", () => getPrice("OIL"));
  await probe("AAPL:", () => getPrice("AAPL"));
  await probe("NIFTY:", () => getPrice("NIFTY"));
}

main();
