#!/usr/bin/env node
// Creates a portal login, or resets the password/role of an existing one.
//
//   npm run create-admin -- --email you@fabricvton.com --name "Your Name"
//   npm run create-user  -- --email someone@beatband.in --password "..." --name "..."
//
// Reads DATABASE_URL from .env.local. If --password is omitted a strong one is generated and printed.

import { randomBytes, scrypt } from "node:crypto";
import { parseArgs } from "node:util";
import pg from "pg";

const DOMAINS = { "fabricvton.com": "fabricvton", "beatband.in": "beatband", "naaradh.com": "naaradh" };

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "member" },
  },
});

function fail(message) {
  console.error(`\n  ✖ ${message}\n`);
  process.exit(1);
}

const email = values.email?.trim().toLowerCase();
if (!email || !email.includes("@")) fail("Pass --email you@company.com");
const companyId = DOMAINS[email.split("@")[1]];
if (!companyId) fail(`Email must end with ${Object.keys(DOMAINS).map((d) => "@" + d).join(", ")}`);
if (!["admin", "member"].includes(values.role)) fail("--role must be admin or member");
if (!process.env.DATABASE_URL) fail("DATABASE_URL is missing (run through npm so .env.local is loaded)");

const password = values.password ?? randomBytes(12).toString("base64url");
if (password.length < 8) fail("Password must be at least 8 characters");

// Same format as src/lib/auth/password.ts: scrypt$<salt>$<key>
const salt = randomBytes(16);
const key = await new Promise((resolve, reject) =>
  scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) =>
    error ? reject(error) : resolve(derived)
  )
);
const hash = `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;

// Show which database is being changed. Note: a DATABASE_URL already exported in
// your shell takes priority over .env.local.
const host = new URL(process.env.DATABASE_URL).hostname.split(".")[0];
console.log(`\n  Database: ${host}`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(
    `INSERT INTO auth_users (email, name, company_id, role, password_hash, created_by)
     VALUES ($1, $2, $3, $4, $5, 'setup script')
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = true,
           failed_attempts = 0, locked_until = NULL, name = coalesce(EXCLUDED.name, auth_users.name)
     RETURNING (xmax = 0) AS created`,
    [email, values.name?.trim() || null, companyId, values.role, hash]
  );
  await client.query(
    `INSERT INTO audit_log (user_email, company_id, action, details) VALUES ($1, $2, $3, $4)`,
    [email, companyId, result.rows[0].created ? "user_created" : "user_updated", JSON.stringify({ email, role: values.role, via: "setup script" })]
  );
  console.log(`\n  ✔ ${result.rows[0].created ? "Created" : "Updated"} ${values.role} ${email} (${companyId})`);
  if (!values.password) console.log(`    Password: ${password}   ← save it now, it won't be shown again`);
  console.log("");
} finally {
  await client.end();
}
