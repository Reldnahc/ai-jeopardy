// backend/config/pg.ts
import { Pool } from "pg";
import { env } from "./env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,

  // Optional but recommended defaults
  max: 10, // max connections
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// TODO use this
export async function verifyDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select 1");
  } finally {
    client.release();
  }
}
