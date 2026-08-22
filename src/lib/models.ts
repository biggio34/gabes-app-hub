import type { Area, Role } from "./areas";

export type Club = {
  id: string;
  name: string;
  createdAt: string;
};

export type Team = {
  id: string;
  clubId: string;
  name: string;
  createdAt: string;
};

export type StoredUser = {
  id: string;
  username: string;
  name: string;
  email?: string;
  passwordHash: string;
  role: Role;
  areas: Area[];
  clubIds: string[];
  teamIds: string[];
  createdAt: string;
};

export const DEFAULT_CLUB_ID = "club-mn-elks";
export const DEFAULT_TEAM_ID = "team-16u-fransen";

export function slugId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export function publicUser(user: StoredUser) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email ?? "",
    role: user.role,
    areas: user.areas,
    clubIds: user.clubIds,
    teamIds: user.teamIds,
  };
}

export function assignmentLabels(
  user: Pick<StoredUser, "clubIds" | "teamIds">,
  clubs: Club[],
  teams: Team[],
) {
  const labels: string[] = [];
  for (const clubId of user.clubIds) {
    const club = clubs.find((item) => item.id === clubId);
    if (!club) continue;
    const onATeam = teams.some(
      (team) => team.clubId === clubId && user.teamIds.includes(team.id),
    );
    if (!onATeam) labels.push(`${club.name} (whole club)`);
  }
  for (const teamId of user.teamIds) {
    const team = teams.find((item) => item.id === teamId);
    if (!team) continue;
    const club = clubs.find((item) => item.id === team.clubId);
    labels.push(club ? `${club.name} · ${team.name}` : team.name);
  }
  return labels;
}
