import { eq } from "drizzle-orm";
import { isSupabaseConfigured, getSupabase } from "@/lib/db/supabase";
import { readyDb } from "@/lib/db/client";
import { players, softballState } from "@/lib/db/schema";

type JsonPlayer = Record<string, unknown> & { id?: string };

const PLAYER_KEYS = [
  "id",
  "firstName",
  "lastName",
  "name",
  "number",
  "position",
  "position2",
  "birthdate",
  "originalTeam",
  "assignedTeamId",
  "createdAt",
] as const;

function asPlayers(value: unknown) {
  return Array.isArray(value) ? (value as JsonPlayer[]) : [];
}

function extraFromPlayer(player: JsonPlayer) {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(player)) {
    if (!(PLAYER_KEYS as readonly string[]).includes(key) && key !== "clubId") {
      extra[key] = value;
    }
  }
  return extra;
}

function rowToPlayer(row: {
  id: string;
  assignedTeamId: string | null;
  firstName: string;
  lastName: string;
  name: string;
  number: string;
  position: string;
  position2: string;
  birthdate: string;
  originalTeam: string;
  extra: unknown;
  createdAt: string;
}): JsonPlayer {
  const extra =
    typeof row.extra === "string"
      ? (JSON.parse(row.extra || "{}") as Record<string, unknown>)
      : ((row.extra || {}) as Record<string, unknown>);
  return {
    ...extra,
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    name: row.name,
    number: row.number,
    position: row.position,
    position2: row.position2,
    birthdate: row.birthdate,
    originalTeam: row.originalTeam,
    assignedTeamId: row.assignedTeamId || extra.assignedTeamId || null,
    createdAt: row.createdAt,
  };
}

function mergePlayerLists(jsonPlayers: JsonPlayer[], dbPlayers: JsonPlayer[]) {
  const byId = new Map<string, JsonPlayer>();
  jsonPlayers.forEach((player) => {
    if (player?.id) byId.set(String(player.id), player);
  });
  dbPlayers.forEach((player) => {
    if (!player?.id) return;
    const current = byId.get(String(player.id));
    if (!current) {
      byId.set(String(player.id), player);
      return;
    }
    const merged = {
      ...current,
      ...player,
      scores: current.scores || player.scores,
      photo: current.photo || player.photo,
    };
    merged.assignedTeamId =
      current.assignedTeamId || player.assignedTeamId || merged.assignedTeamId || null;
    byId.set(String(player.id), merged);
  });
  return [...byId.values()];
}

async function listSqlitePlayers(clubId: string) {
  const db = await readyDb();
  const rows = await db.select().from(players).where(eq(players.clubId, clubId));
  return rows.map(rowToPlayer);
}

async function listSupabasePlayers(clubId: string) {
  const supabase = getSupabase();
  if (!supabase) return [];
  const result = await supabase.from("hub_players").select("*").eq("club_id", clubId);
  if (result.error) {
    if (/does not exist|schema cache/i.test(result.error.message)) return [];
    throw new Error(result.error.message);
  }
  return (result.data || []).map((row) =>
    rowToPlayer({
      id: String(row.id),
      assignedTeamId: (row.assigned_team_id as string | null) ?? null,
      firstName: String(row.first_name || ""),
      lastName: String(row.last_name || ""),
      name: String(row.name || ""),
      number: String(row.number || ""),
      position: String(row.position || ""),
      position2: String(row.position2 || ""),
      birthdate: String(row.birthdate || ""),
      originalTeam: String(row.original_team || ""),
      extra: row.extra,
      createdAt: String(row.created_at || new Date().toISOString()),
    }),
  );
}

async function upsertSqlitePlayers(clubId: string, list: JsonPlayer[]) {
  const db = await readyDb();
  const now = new Date().toISOString();
  const keep = new Set(list.map((player) => String(player.id)));
  const existing = await db.select({ id: players.id }).from(players).where(eq(players.clubId, clubId));
  for (const row of existing) {
    if (!keep.has(row.id)) {
      await db.delete(players).where(eq(players.id, row.id));
    }
  }
  for (const player of list) {
    if (!player?.id) continue;
    const record = {
      id: String(player.id),
      clubId,
      assignedTeamId: player.assignedTeamId ? String(player.assignedTeamId) : null,
      firstName: String(player.firstName || ""),
      lastName: String(player.lastName || ""),
      name: String(player.name || ""),
      number: String(player.number || ""),
      position: String(player.position || ""),
      position2: String(player.position2 || ""),
      birthdate: String(player.birthdate || ""),
      originalTeam: String(player.originalTeam || ""),
      extra: JSON.stringify(extraFromPlayer(player)),
      createdAt: String(player.createdAt || now),
      updatedAt: now,
    };
    await db.delete(players).where(eq(players.id, record.id));
    await db.insert(players).values(record);
  }
}

async function upsertSupabasePlayers(clubId: string, list: JsonPlayer[]) {
  const supabase = getSupabase();
  if (!supabase) return;
  const now = new Date().toISOString();
  const keep = list.map((player) => String(player.id)).filter(Boolean);
  const existing = await supabase.from("hub_players").select("id").eq("club_id", clubId);
  if (!existing.error && existing.data) {
    const remove = existing.data
      .map((row) => String(row.id))
      .filter((id) => !keep.includes(id));
    if (remove.length) {
      await supabase.from("hub_players").delete().in("id", remove);
    }
  }
  if (!list.length) return;
  const rows = list
    .filter((player) => player?.id)
    .map((player) => ({
      id: String(player.id),
      club_id: clubId,
      assigned_team_id: player.assignedTeamId ? String(player.assignedTeamId) : null,
      first_name: String(player.firstName || ""),
      last_name: String(player.lastName || ""),
      name: String(player.name || ""),
      number: String(player.number || ""),
      position: String(player.position || ""),
      position2: String(player.position2 || ""),
      birthdate: String(player.birthdate || ""),
      original_team: String(player.originalTeam || ""),
      extra: extraFromPlayer(player),
      created_at: String(player.createdAt || now),
      updated_at: now,
    }));
  const result = await supabase.from("hub_players").upsert(rows);
  if (result.error && !/does not exist|schema cache/i.test(result.error.message)) {
    throw new Error(result.error.message);
  }
}

async function readSupabasePayload(clubId: string, teamId: string) {
  const supabase = getSupabase();
  if (!supabase) return { payload: null as Record<string, unknown> | null, updatedAt: null as string | null };
  let result = await supabase.from("hub_softball_state").select("*").eq("team_id", clubId).maybeSingle();
  const clubPlayers = asPlayers((result.data as { payload?: Record<string, unknown> } | null)?.payload?.players);
  if (clubPlayers.length === 0 && teamId && teamId !== clubId && teamId !== "all") {
    const legacy = await supabase.from("hub_softball_state").select("*").eq("team_id", teamId).maybeSingle();
    if (asPlayers((legacy.data as { payload?: Record<string, unknown> } | null)?.payload?.players).length) {
      result = legacy;
    }
  }
  if (result.error) {
    throw new Error(
      /does not exist|schema cache/i.test(result.error.message)
        ? "Run supabase/hub.sql in the SQL editor so softball data can save."
        : result.error.message,
    );
  }
  const row = result.data as { payload?: Record<string, unknown>; updated_at?: string } | null;
  return { payload: row?.payload ?? null, updatedAt: row?.updated_at ?? null };
}

export async function readSoftballState(clubId: string, teamId: string) {
  if (isSupabaseConfigured()) {
    const remote = await readSupabasePayload(clubId, teamId);
    const dbPlayers = await listSupabasePlayers(clubId);
    if (!remote.payload && !dbPlayers.length) {
      return { state: null as Record<string, unknown> | null, updatedAt: remote.updatedAt, stored: "supabase" as const };
    }
    const payload = { ...(remote.payload || {}) };
    payload.players = mergePlayerLists(asPlayers(payload.players), dbPlayers);
    return { state: payload, updatedAt: remote.updatedAt, stored: "supabase" as const };
  }

  const db = await readyDb();
  const rows = await db.select().from(softballState).where(eq(softballState.clubId, clubId));
  const row = rows[0];
  const payload = row ? (JSON.parse(row.payload) as Record<string, unknown>) : {};
  const dbPlayers = await listSqlitePlayers(clubId);
  payload.players = mergePlayerLists(asPlayers(payload.players), dbPlayers);
  if (!row && !dbPlayers.length) {
    return { state: null as Record<string, unknown> | null, updatedAt: null, stored: "sqlite" as const };
  }
  return { state: payload, updatedAt: row?.updatedAt ?? null, stored: "sqlite" as const };
}

export async function writeSoftballState(
  clubId: string,
  teamId: string,
  incoming: Record<string, unknown>,
) {
  const payload = { ...incoming };
  const current = await readSoftballState(clubId, teamId);
  if (asPlayers(payload.players).length === 0 && asPlayers(current.state?.players).length > 0) {
    payload.players = current.state?.players;
    if ((!Array.isArray(payload.teams) || payload.teams.length === 0) && current.state?.teams) {
      payload.teams = current.state.teams;
    }
  }
  const now = new Date().toISOString();
  payload.updatedAt = Date.now();

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.from("hub_softball_state").upsert({
      team_id: clubId,
      payload,
      updated_at: now,
    });
    if (result.error) {
      throw new Error(
        /does not exist|schema cache/i.test(result.error.message)
          ? "Run supabase/hub.sql in the SQL editor so softball data can save."
          : result.error.message,
      );
    }
    if (asPlayers(payload.players).length > 0) {
      await upsertSupabasePlayers(clubId, asPlayers(payload.players));
    }
    return { ok: true as const, stored: "supabase" as const };
  }

  const db = await readyDb();
  await db.delete(softballState).where(eq(softballState.clubId, clubId));
  await db.insert(softballState).values({
    clubId,
    payload: JSON.stringify(payload),
    updatedAt: now,
  });
  if (asPlayers(payload.players).length > 0) {
    await upsertSqlitePlayers(clubId, asPlayers(payload.players));
  }
  return { ok: true as const, stored: "sqlite" as const };
}
