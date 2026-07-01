import { sql } from "drizzle-orm";
import { db, pool } from "./db";

// Quick DB sanity check: list public tables. Run: npm run db:check
async function main() {
  const res = await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  );
  console.log(
    "Tables:",
    res.rows.map((r) => (r as { table_name: string }).table_name),
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
