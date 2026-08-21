// Creates every table. Safe to run more than once.
//   node scripts/setup-db.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = await readFile(join(here, "..", file), "utf8");
      for (const line of text.split("\n")) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const value = match[2].replace(/^["']|["']$/g, "");
        if (!process.env[match[1]]) process.env[match[1]] = value;
      }
    } catch {
      // no such file, fine
    }
  }
}

await loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

const sql = await readFile(join(here, "..", "db", "schema.sql"), "utf8");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
await client.query(sql);
await client.end();

console.log("Schema created.");
