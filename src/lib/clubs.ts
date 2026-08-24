import { eq } from "drizzle-orm";
import { readyDb } from "./db/client";
import { isSupabaseConfigured } from "./db/supabase";
import * as supabaseStore from "./db/supabase-store";
import { clubs, teams, userClubs, userTeams } from "./db/schema";
import {
  assignmentLabels,
  slugId,
  type Club,
  type Team,
} from "./models";

export type { Club, Team } from "./models";
export { assignmentLabels } from "./models";

function toClub(row: typeof clubs.$inferSelect): Club {
  return { id: row.id, name: row.name, createdAt: row.createdAt };
}

function toTeam(row: typeof teams.$inferSelect): Team {
  return {
    id: row.id,
    clubId: row.clubId,
    name: row.name,
    createdAt: row.createdAt,
  };
}

export async function listOrgs() {
  if (isSupabaseConfigured()) return supabaseStore.listOrgs();
  const db = await readyDb();
  const [clubRows, teamRows] = await Promise.all([
    db.select().from(clubs),
    db.select().from(teams),
  ]);
  return {
    clubs: clubRows.map(toClub),
    teams: teamRows.map(toTeam),
  };
}

export function clubWithTeams(clubList: Club[], teamList: Team[]) {
  return clubList.map((club) => ({
    ...club,
    teams: teamList.filter((team) => team.clubId === club.id),
  }));
}

export async function createClub(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Club name is required");
  const { clubs: existing } = await listOrgs();
  if (existing.some((club) => club.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("That club already exists");
  }
  const club: Club = {
    id: slugId("club"),
    name: trimmed,
    createdAt: new Date().toISOString(),
  };
  if (isSupabaseConfigured()) {
    await supabaseStore.insertClub(club);
    return club;
  }
  await (await readyDb()).insert(clubs).values(club);
  return club;
}

export async function createTeam(clubId: string, name: string, id?: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Team name is required");
  const { clubs: existingClubs, teams: existingTeams } = await listOrgs();
  if (!existingClubs.some((club) => club.id === clubId)) {
    throw new Error("Club not found");
  }
  if (
    existingTeams.some(
      (team) =>
        team.clubId === clubId && team.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    throw new Error("That team already exists in this club");
  }
  const preferredId = id?.trim();
  if (preferredId && existingTeams.some((team) => team.id === preferredId)) {
    throw new Error("That team already exists in this club");
  }
  const team: Team = {
    id: preferredId || slugId("team"),
    clubId,
    name: trimmed,
    createdAt: new Date().toISOString(),
  };
  if (isSupabaseConfigured()) {
    await supabaseStore.insertTeam(team);
    return team;
  }
  await (await readyDb()).insert(teams).values(team);
  return team;
}

export async function renameTeam(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Team name is required");
  if (trimmed.length > 60) throw new Error("Keep the team name under 60 characters");
  const { teams: existingTeams } = await listOrgs();
  const team = existingTeams.find((item) => item.id === id);
  if (!team) throw new Error("Team not found");
  if (
    existingTeams.some(
      (item) =>
        item.id !== id &&
        item.clubId === team.clubId &&
        item.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    throw new Error("That team already exists in this club");
  }
  const updated: Team = { ...team, name: trimmed };
  if (isSupabaseConfigured()) {
    await supabaseStore.updateTeam(updated);
    return updated;
  }
  await (await readyDb())
    .update(teams)
    .set({ name: trimmed })
    .where(eq(teams.id, id));
  return updated;
}

export async function deleteClub(id: string) {
  if (isSupabaseConfigured()) {
    const orgs = await supabaseStore.listOrgs();
    if (!orgs.clubs.some((club) => club.id === id)) {
      throw new Error("Club not found");
    }
    await supabaseStore.removeClub(id);
    return;
  }
  const db = await readyDb();
  const club = (await db.select().from(clubs).where(eq(clubs.id, id)))[0];
  if (!club) throw new Error("Club not found");
  const clubTeams = await db.select().from(teams).where(eq(teams.clubId, id));
  const teamIds = clubTeams.map((team) => team.id);
  if (teamIds.length) {
    for (const teamId of teamIds) {
      await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    }
  }
  await db.delete(userClubs).where(eq(userClubs.clubId, id));
  await db.delete(teams).where(eq(teams.clubId, id));
  await db.delete(clubs).where(eq(clubs.id, id));
}

export async function deleteTeam(id: string) {
  if (isSupabaseConfigured()) {
    const orgs = await supabaseStore.listOrgs();
    if (!orgs.teams.some((team) => team.id === id)) {
      throw new Error("Team not found");
    }
    await supabaseStore.removeTeam(id);
    return;
  }
  const db = await readyDb();
  const team = (await db.select().from(teams).where(eq(teams.id, id)))[0];
  if (!team) throw new Error("Team not found");
  await db.delete(userTeams).where(eq(userTeams.teamId, id));
  await db.delete(teams).where(eq(teams.id, id));
}

export async function labelsForUser(user: {
  clubIds: string[];
  teamIds: string[];
}) {
  const orgs = await listOrgs();
  return assignmentLabels(user, orgs.clubs, orgs.teams);
}
