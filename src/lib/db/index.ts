import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL ?? "lime.db");
const sqlite = new Database(dbPath);

// WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
