import { createTeam, listOrgs } from "@/lib/clubs";
import { getRawClient } from "@/lib/db/client";
import { getSupabase, isSupabaseConfigured, throwIfError } from "@/lib/db/supabase";
import { DEFAULT_CLUB_ID } from "@/lib/models";
import {
  ELKS_SEASON_TEAMS,
  emptySoftballState,
  resolveSeedTeam,
  seedOfficialRosters,
  softballStateChanged,
  syncStateTeams,
  type HubTeamRef,
  type SoftballState,
} from "@/lib/elks-roster-seed";

type StoredRow = {
  team_id: string;
  payload: SoftballState | string | null;
  updated_at: string;
};

function parsePayload(payload: SoftballState | string | null | undefined): SoftballState {
  if (!payload) return emptySoftballState();
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as SoftballState;
      return parsed && typeof parsed === "object" ? parsed : emptySoftballState();
    } catch {
      return emptySoftballState();
    }
  }
  return typeof payload === "object" ? payload : emptySoftballState();
}

function payloadPlayers(state: SoftballState | null | undefined) {
  return Array.isArray(state?.players) ? state.players : [];
}

async function readSupabase(key: string) {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("hub_softball_state")
    .select("*")
    .eq("team_id", key)
    .maybeSingle();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      throw new Error("Run supabase/softball-state.sql in the SQL editor.");
    }
    throw new Error(error.message);
  }
  return (data as StoredRow | null) ?? null;
}

async function writeSupabase(key: string, payload: SoftballState) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  throwIfError(
    await supabase.from("hub_softball_state").upsert({
      team_id: key,
      payload,
      updated_at: new Date().toISOString(),
    }),
    "Could not save the roster.",
  );
}

async function readSqlite(key: string) {
  const client = await getRawClient();
  const result = await client.execute({
    sql: "SELECT team_id, payload, updated_at FROM softball_state WHERE team_id = ?",
    args: [key],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    team_id: String(row.team_id),
    payload: parsePayload(row.payload as string),
    updated_at: String(row.updated_at),
  };
}

async function writeSqlite(key: string, payload: SoftballState) {
  const client = await getRawClient();
  await client.execute({
    sql: `INSERT INTO softball_state (team_id, payload, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(team_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    args: [key, JSON.stringify(payload), new Date().toISOString()],
  });
}

export async function readSoftballRow(key: string) {
  if (isSupabaseConfigured()) return readSupabase(key);
  return readSqlite(key);
}

export async function writeSoftballState(key: string, payload: SoftballState) {
  if (isSupabaseConfigured()) {
    await writeSupabase(key, payload);
    return;
  }
  await writeSqlite(key, payload);
}

export async function ensureElksSeasonTeams() {
  const orgs = await listOrgs();
  const club =
    orgs.clubs.find((item) => item.id === DEFAULT_CLUB_ID) ||
    orgs.clubs.find((item) => item.name.trim().toLowerCase() === "mn elks") ||
    orgs.clubs[0];
  if (!club) return [] as HubTeamRef[];

  const teams: HubTeamRef[] = orgs.teams.map((team) => ({
    id: team.id,
    name: team.name,
    clubId: team.clubId,
  }));

  for (const spec of ELKS_SEASON_TEAMS) {
    if (resolveSeedTeam(spec, teams)) continue;
    try {
      const created = await createTeam(club.id, spec.createName, spec.stableId);
      teams.push({
        id: created.id,
        name: created.name,
        clubId: created.clubId,
      });
    } catch {
      const refreshed = await listOrgs();
      teams.splice(
        0,
        teams.length,
        ...refreshed.teams.map((team) => ({
          id: team.id,
          name: team.name,
          clubId: team.clubId,
        })),
      );
    }
  }

  return teams.filter((team) => team.clubId === club.id || !team.clubId);
}

function pickStateRow(
  clubRow: StoredRow | null,
  teamRow: StoredRow | null,
) {
  const clubPlayers = payloadPlayers(parsePayload(clubRow?.payload));
  const teamPlayers = payloadPlayers(parsePayload(teamRow?.payload));
  if (clubPlayers.length) return clubRow;
  if (teamPlayers.length) return teamRow;
  return clubRow || teamRow;
}

export async function loadAccountSoftballState(keys: {
  clubId: string;
  teamId?: string;
}) {
  const clubRow = await readSoftballRow(keys.clubId);
  const teamRow =
    keys.teamId && keys.teamId !== keys.clubId
      ? await readSoftballRow(keys.teamId)
      : null;
  const row = pickStateRow(clubRow, teamRow);
  return {
    state: parsePayload(row?.payload),
    updatedAt: row?.updated_at ?? null,
  };
}

function keepCollections(
  incoming: SoftballState,
  existing: SoftballState,
): SoftballState {
  const incomingPlayers = payloadPlayers(incoming);
  const existingPlayers = payloadPlayers(existing);
  return {
    ...existing,
    ...incoming,
    players: incomingPlayers.length ? incomingPlayers : existingPlayers,
    teams: Array.isArray(incoming.teams) && incoming.teams.length
      ? incoming.teams
      : existing.teams,
    tryouts: Array.isArray(incoming.tryouts) ? incoming.tryouts : existing.tryouts,
    currentTryoutId:
      incoming.currentTryoutId !== undefined
        ? incoming.currentTryoutId
        : existing.currentTryoutId,
    practices: Array.isArray(incoming.practices) ? incoming.practices : existing.practices,
    drills: Array.isArray(incoming.drills) ? incoming.drills : existing.drills,
    templates: Array.isArray(incoming.templates) ? incoming.templates : existing.templates,
  };
}

export async function hydrateAccountSoftballState(
  clubId: string,
  teamId: string | undefined,
  hubTeams: HubTeamRef[],
) {
  const existing = await loadAccountSoftballState({ clubId, teamId });
  const withTeams = syncStateTeams(existing.state, hubTeams);
  const seeded = seedOfficialRosters(withTeams, hubTeams);
  if (softballStateChanged(existing.state, seeded.state) || !existing.updatedAt) {
    seeded.state.updatedAt = Date.now();
    await writeSoftballState(clubId, seeded.state);
  }
  return {
    state: seeded.state,
    updatedAt: new Date().toISOString(),
    added: seeded.added,
    assigned: seeded.assigned,
  };
}

export async function persistAccountSoftballState(
  clubId: string,
  incoming: SoftballState,
  hubTeams: HubTeamRef[],
) {
  const existing = await loadAccountSoftballState({ clubId });
  const base = keepCollections(incoming, existing.state);
  const withTeams = syncStateTeams(base, hubTeams);
  const seeded = seedOfficialRosters(withTeams, hubTeams);
  seeded.state.updatedAt = Date.now();
  await writeSoftballState(clubId, seeded.state);
  return {
    state: seeded.state,
    added: seeded.added,
    assigned: seeded.assigned,
  };
}
