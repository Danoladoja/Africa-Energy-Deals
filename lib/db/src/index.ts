import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Append search_path to the connection options so pg_trgm functions are always
// resolvable from the public schema on every connection in the pool.
function buildConnectionString(base: string): string {
  try {
    const url = new URL(base);
    const existingOptions = url.searchParams.get("options") ?? "";
    const searchPathOption = "-c search_path=public";
    url.searchParams.set(
      "options",
      existingOptions ? `${existingOptions} ${searchPathOption}` : searchPathOption,
    );
    return url.toString();
  } catch {
    // If the URL is malformed, return as-is and let PostgreSQL error naturally.
    return base;
  }
}

export const pool = new Pool({
  connectionString: buildConnectionString(process.env.DATABASE_URL),
});

export const db = drizzle(pool, { schema });

export * from "./schema";
