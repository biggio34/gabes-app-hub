import { canAccessArea } from "@/lib/auth";
import { listOrgs } from "@/lib/clubs";
import { DEFAULT_TEAM_ID } from "@/lib/models";
import { findUserById } from "@/lib/users";
import type { SessionUser } from "@/lib/auth";

export async function softballContext(session: SessionUser) {
  const stored = await findUserById(session.id);
  const orgs = await listOrgs();
  const teamId = stored?.teamIds[0] || DEFAULT_TEAM_ID;
  const team = orgs.teams.find((item) => item.id === teamId) || orgs.teams[0];
  const club = team
    ? orgs.clubs.find((item) => item.id === team.clubId)
    : orgs.clubs[0];
  return {
    canAccess: canAccessArea(session, "softball"),
    teamId: team?.id || DEFAULT_TEAM_ID,
    teamName: team?.name || "16U Fransen",
    clubName: club?.name || "MN Elks",
  };
}
