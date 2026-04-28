import { readFileSync } from "fs";
import { join } from "path";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/openbrain");

const migrationFile = join(import.meta.dir, "../../drizzle/0000_initial.sql");
const migration = readFileSync(migrationFile, "utf-8");

await sql.unsafe(migration);
console.log("Migration applied successfully");
await sql.end();
