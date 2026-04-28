import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../lib/config.js";
import * as schema from "./schema.js";

const sql = postgres(config.databaseUrl);
export const db = drizzle(sql, { schema });
export { sql as pg };
