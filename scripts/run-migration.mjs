#!/usr/bin/env node
// Applies one SQL migration file to the database in DATABASE_URL.
//
//   npm run migrate -- db/migrations/007_admin_portal_login.sql
//
// Migrations in db/migrations are written to be safe to run more than once.
// Note: a DATABASE_URL already exported in your shell takes priority over .env.local.

import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("\n  ✖ Pass the migration file, e.g. npm run migrate -- db/migrations/007_admin_portal_login.sql\n");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("\n  ✖ DATABASE_URL is missing\n");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
console.log(`\n  Database: ${new URL(process.env.DATABASE_URL).hostname.split(".")[0]}`);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(sql);
  console.log(`  ✔ Applied ${file}\n`);
} finally {
  await client.end();
}
