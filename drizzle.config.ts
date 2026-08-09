import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Keep Postgres migrations separate from the `drizzle/` directory that Sites
  // reserves for its bound SQLite/D1 database migrations.
  out: "./postgres-migrations",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/stripepros",
  },
});
