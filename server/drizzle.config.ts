// Drizzle config — activated in the DB step (ARCHITECTURE.md §8).
// Install then: npm i drizzle-orm pg && npm i -D drizzle-kit @types/pg
export default {
  schema: "./src/models/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
};
