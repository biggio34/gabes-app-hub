import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@libsql/client";
import { AREAS, type Area, type Role } from "@/lib/areas";

type JsonUser = {
  id: string;
  username: string;
  name: string;
  email?: string;
  passwordHash: string;
  role: Role;
  areas?: Area[];
  clubIds?: string[];
  teamIds?: string[];
  createdAt: string;
};

type JsonClub = { id: string; name: string; createdAt: string };
type JsonTeam = { id: string; clubId: string; name: string; createdAt: string };

async function readJson(file: string) {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as {
      users?: JsonUser[];
      clubs?: JsonClub[];
      teams?: JsonTeam[];
    };
  } catch {
    return null;
  }
}

export async function importJsonStoreIfPresent(client: Client) {
  const userCount = await client.execute("SELECT COUNT(*) AS n FROM users");
  if (Number(userCount.rows[0]?.n ?? 0) > 0) return false;

  const files = [
    path.join(process.cwd(), "data", "users.json"),
    path.join("/tmp", "gabes-hub-users.json"),
  ];

  let parsed: {
    users?: JsonUser[];
    clubs?: JsonClub[];
    teams?: JsonTeam[];
  } | null = null;
  for (const file of files) {
    parsed = await readJson(file);
    if (parsed?.users?.length) break;
  }
  if (!parsed?.users?.length) return false;

  for (const club of parsed.clubs ?? []) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO clubs (id, name, created_at) VALUES (?, ?, ?)",
      args: [club.id, club.name, club.createdAt],
    });
  }
  for (const team of parsed.teams ?? []) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO teams (id, club_id, name, created_at) VALUES (?, ?, ?, ?)",
      args: [team.id, team.clubId, team.name, team.createdAt],
    });
  }
  const knownClubs = await client.execute("SELECT id FROM clubs");
  const knownTeams = await client.execute("SELECT id FROM teams");
  const clubSet = new Set(knownClubs.rows.map((row) => String(row.id)));
  const teamSet = new Set(knownTeams.rows.map((row) => String(row.id)));

  for (const user of parsed.users) {
    await client.execute({
      sql: "INSERT OR IGNORE INTO users (id, username, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        user.id,
        user.username,
        user.name,
        user.email || null,
        user.passwordHash,
        user.role,
        user.createdAt,
      ],
    });
    for (const area of user.areas ?? [...AREAS]) {
      await client.execute({
        sql: "INSERT OR IGNORE INTO user_areas (user_id, area) VALUES (?, ?)",
        args: [user.id, area],
      });
    }
    for (const clubId of user.clubIds ?? []) {
      if (!clubSet.has(clubId)) continue;
      await client.execute({
        sql: "INSERT OR IGNORE INTO user_clubs (user_id, club_id) VALUES (?, ?)",
        args: [user.id, clubId],
      });
    }
    for (const teamId of user.teamIds ?? []) {
      if (!teamSet.has(teamId)) continue;
      await client.execute({
        sql: "INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)",
        args: [user.id, teamId],
      });
    }
  }
  return true;
}
