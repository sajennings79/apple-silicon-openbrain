#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("usage: bun run scripts/apply-migration.ts <path.sql>");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/openbrain");
const text = readFileSync(file, "utf8");
await sql.unsafe(text);
console.log(`Applied ${file}`);
await sql.end();
