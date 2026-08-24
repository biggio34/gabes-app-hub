import { canAccessArea } from "@/lib/auth";
import { listOrgs } from "@/lib/clubs";
import { DEFAULT_CLUB_ID, DEFAULT_TEAM_ID } from "@/lib/models";
import { findUserById } from "@/lib/users";
import type { SessionUser } from "@/lib/auth";

export type HubSoftballTeam = {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
};

export async function softballContext(session: SessionUser) {
  const stored = await findUserById(session.id);
  const orgs = await listOrgs();
  const clubById = new Map(orgs.clubs.map((club) => [club.id, club]));

  let visibleTeams = orgs.teams;
  if (session.role !== "owner" && stored) {
    const assignedTeams = new Set(stored.teamIds);
    const assignedClubs = new Set(stored.clubIds);
    const filtered = orgs.teams.filter(
      (team) => assignedTeams.has(team.id) || assignedClubs.has(team.clubId),
    );
    if (filtered.length) visibleTeams = filtered;
  }

  const preferredId = stored?.teamIds[0] || DEFAULT_TEAM_ID;
  const team =
    visibleTeams.find((item) => item.id === preferredId) ||
    visibleTeams[0] ||
    orgs.teams[0];
  const club = team
    ? clubById.get(team.clubId)
    : orgs.clubs[0];

  const teams: HubSoftballTeam[] = visibleTeams.map((item) => ({
    id: item.id,
    name: item.name,
    clubId: item.clubId,
    clubName: clubById.get(item.clubId)?.name || club?.name || "MN Elks",
  }));

  const clubs = orgs.clubs
    .filter(
      (item) =>
        session.role === "owner" || teams.some((teamItem) => teamItem.clubId === item.id),
    )
    .map((item) => ({ id: item.id, name: item.name }));

  return {
    canAccess: canAccessArea(session, "softball"),
    role: session.role,
    clubId: club?.id || DEFAULT_CLUB_ID,
    clubName: club?.name || "MN Elks",
    teamId: team?.id || DEFAULT_TEAM_ID,
    teamName: team?.name || "16U Fransen",
    teams,
    clubs,
  };
}

export function canUseSoftballTeam(
  context: Awaited<ReturnType<typeof softballContext>>,
  teamId?: string,
) {
  if (!teamId || teamId === "all") return true;
  if (!context.teams.length) return teamId === context.teamId;
  return context.teams.some((team) => team.id === teamId);
}
