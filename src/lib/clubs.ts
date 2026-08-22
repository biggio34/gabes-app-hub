import {
  assignmentLabels,
  ensureData,
  persist,
  slugId,
  type Club,
  type Team,
} from "./hub-store";

export type { Club, Team } from "./hub-store";
export { assignmentLabels } from "./hub-store";

export async function listOrgs() {
  const data = await ensureData();
  return { clubs: data.clubs, teams: data.teams };
}

export function clubWithTeams(clubs: Club[], teams: Team[]) {
  return clubs.map((club) => ({
    ...club,
    teams: teams.filter((team) => team.clubId === club.id),
  }));
}

export async function createClub(name: string) {
  const data = await ensureData();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Club name is required");
  if (data.clubs.some((club) => club.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("That club already exists");
  }
  const club: Club = {
    id: slugId("club"),
    name: trimmed,
    createdAt: new Date().toISOString(),
  };
  data.clubs.push(club);
  await persist(data);
  return club;
}

export async function createTeam(clubId: string, name: string) {
  const data = await ensureData();
  const club = data.clubs.find((item) => item.id === clubId);
  if (!club) throw new Error("Club not found");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Team name is required");
  if (
    data.teams.some(
      (team) =>
        team.clubId === clubId && team.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    throw new Error("That team already exists in this club");
  }
  const team: Team = {
    id: slugId("team"),
    clubId,
    name: trimmed,
    createdAt: new Date().toISOString(),
  };
  data.teams.push(team);
  await persist(data);
  return team;
}

export async function deleteClub(id: string) {
  const data = await ensureData();
  if (!data.clubs.some((club) => club.id === id)) {
    throw new Error("Club not found");
  }
  data.clubs = data.clubs.filter((club) => club.id !== id);
  data.teams = data.teams.filter((team) => team.clubId !== id);
  for (const user of data.users) {
    user.clubIds = user.clubIds.filter((clubId) => clubId !== id);
    user.teamIds = user.teamIds.filter((teamId) =>
      data.teams.some((team) => team.id === teamId),
    );
  }
  await persist(data);
}

export async function deleteTeam(id: string) {
  const data = await ensureData();
  if (!data.teams.some((team) => team.id === id)) {
    throw new Error("Team not found");
  }
  data.teams = data.teams.filter((team) => team.id !== id);
  for (const user of data.users) {
    user.teamIds = user.teamIds.filter((teamId) => teamId !== id);
  }
  await persist(data);
}

export async function labelsForUser(user: {
  clubIds: string[];
  teamIds: string[];
}) {
  const { clubs, teams } = await listOrgs();
  return assignmentLabels(user, clubs, teams);
}
