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
    await client.execute(statement);
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
