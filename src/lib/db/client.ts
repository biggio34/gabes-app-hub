import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { hashPassword } from "@/lib/auth";
import { AREAS } from "@/lib/areas";
import {
  DEFAULT_CLUB_ID,
  DEFAULT_TEAM_ID,
} from "@/lib/models";
import * as schema from "./schema";
import { importJsonStoreIfPresent } from "./import-json";
import { isSupabaseConfigured } from "./supabase";

const SCHEMA_SQL = [
  "PRAGMA foreign_keys = ON",
  `CREATE TABLE IF NOT EXISTS clubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_areas (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    area TEXT NOT NULL,
    PRIMARY KEY (user_id, area)
  )`,
  `CREATE TABLE IF NOT EXISTS user_clubs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, club_id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_teams (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, team_id)
  )`,
  `CREATE TABLE IF NOT EXISTS softball_state (
    club_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL,
    assigned_team_id TEXT,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    number TEXT NOT NULL DEFAULT '',
    position TEXT NOT NULL DEFAULT '',
    position2 TEXT NOT NULL DEFAULT '',
    birthdate TEXT NOT NULL DEFAULT '',
    original_team TEXT NOT NULL DEFAULT '',
    extra TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS salon_orders (
    id TEXT PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(year, month)
  )`,
  `CREATE TABLE IF NOT EXISTS salon_order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES salon_orders(id) ON DELETE CASCADE,
    preferred_vendor TEXT NOT NULL DEFAULT '',
    brand TEXT NOT NULL DEFAULT '',
    product TEXT NOT NULL,
    size TEXT NOT NULL DEFAULT '',
    shade TEXT NOT NULL DEFAULT '',
    qty INTEGER NOT NULL DEFAULT 1,
    ordered_qty INTEGER NOT NULL DEFAULT 0,
    received_qty INTEGER NOT NULL DEFAULT 0,
    leftover TEXT NOT NULL DEFAULT '',
    sku TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    actual_vendor TEXT NOT NULL DEFAULT '',
    vendor_order_number TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    requested_by_user_id TEXT NOT NULL,
    requested_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `ALTER TABLE salon_order_items ADD COLUMN sku TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE salon_order_items ADD COLUMN vendor_order_number TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE salon_order_items ADD COLUMN ordered_qty INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE salon_order_items ADD COLUMN received_qty INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE salon_order_items ADD COLUMN leftover TEXT NOT NULL DEFAULT ''`,
  `UPDATE salon_order_items SET ordered_qty = qty, received_qty = qty WHERE status = 'received' AND received_qty = 0`,
  `UPDATE salon_order_items SET ordered_qty = qty WHERE status = 'ordered' AND ordered_qty = 0`,
  `UPDATE salon_order_items SET leftover = 'oos' WHERE status = 'out_of_stock' AND leftover = ''`,
];

type HubDb = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  hubClient?: Client;
  hubDb?: HubDb;
  hubReady?: Promise<void>;
};

export function ownerPasswordValue() {
  return process.env.HUB_ADMIN_PASSWORD || "FransenHub2026";
}

export function isRemoteDatabase() {
  return isSupabaseConfigured();
}

function databaseUrl() {
  const hosted = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  if (hosted) return hosted;
  if (process.env.NETLIFY) return "file:/tmp/gabes-hub.db";
  const file = path.join(process.cwd(), "data", "hub.db");
  mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file}`;
}

function getClient() {
  if (!globalForDb.hubClient) {
    globalForDb.hubClient = createClient({
      url: databaseUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return globalForDb.hubClient;
}

export function getDb() {
  if (!globalForDb.hubDb) {
    globalForDb.hubDb = drizzle(getClient(), { schema });
  }
  return globalForDb.hubDb;
}

export async function readyDb() {
  if (!globalForDb.hubReady) {
    globalForDb.hubReady = initialize();
  }
  await globalForDb.hubReady;
  return getDb();
}

async function initialize() {
  const client = getClient();
  for (const statement of SCHEMA_SQL) {
    try {
      await client.execute(statement);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!/duplicate column/i.test(message)) throw err;
    }
  }

  const clubCount = await client.execute("SELECT COUNT(*) AS n FROM clubs");
  if (Number(clubCount.rows[0]?.n ?? 0) === 0) {
    const now = new Date().toISOString();
    await client.execute({
      sql: "INSERT INTO clubs (id, name, created_at) VALUES (?, ?, ?)",
      args: [DEFAULT_CLUB_ID, "MN Elks", now],
    });
    await client.execute({
      sql: "INSERT INTO teams (id, club_id, name, created_at) VALUES (?, ?, ?, ?)",
      args: [DEFAULT_TEAM_ID, DEFAULT_CLUB_ID, "16U Fransen", now],
    });
  }

  const imported = await importJsonStoreIfPresent(client);
  if (imported) return;

  const userCount = await client.execute("SELECT COUNT(*) AS n FROM users");
  if (Number(userCount.rows[0]?.n ?? 0) === 0) {
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(ownerPasswordValue());
    await client.execute({
      sql: "INSERT INTO users (id, username, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        "user-gabe",
        "gabe",
        "Gabe Fransen",
        process.env.GMAIL_USER || null,
        passwordHash,
        "owner",
        now,
      ],
    });
    for (const area of AREAS) {
      await client.execute({
        sql: "INSERT INTO user_areas (user_id, area) VALUES (?, ?)",
        args: ["user-gabe", area],
      });
    }
    await client.execute({
      sql: "INSERT INTO user_clubs (user_id, club_id) VALUES (?, ?)",
      args: ["user-gabe", DEFAULT_CLUB_ID],
    });
    await client.execute({
      sql: "INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)",
      args: ["user-gabe", DEFAULT_TEAM_ID],
    });
  }
}
