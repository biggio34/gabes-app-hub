import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { AREAS, type Area, type Role } from "./areas";
import { hashPassword } from "./auth";

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

export type HubData = {
  users: StoredUser[];
  clubs: Club[];
  teams: Team[];
};

const storePaths = [
  path.join(process.cwd(), "data", "users.json"),
  path.join("/tmp", "gabes-hub-users.json"),
];

export const DEFAULT_CLUB_ID = "club-mn-elks";
export const DEFAULT_TEAM_ID = "team-16u-fransen";

let memory: HubData | null = null;

function ownerPassword() {
  return process.env.HUB_ADMIN_PASSWORD || "FransenHub2026";
}

export function nowIso() {
  return new Date().toISOString();
}

export function slugId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function defaultClubs(): Club[] {
  return [
    {
      id: DEFAULT_CLUB_ID,
      name: "MN Elks",
      createdAt: nowIso(),
    },
  ];
}

function defaultTeams(): Team[] {
  return [
    {
      id: DEFAULT_TEAM_ID,
      clubId: DEFAULT_CLUB_ID,
      name: "16U Fransen",
      createdAt: nowIso(),
    },
  ];
}

async function ownerUser(): Promise<StoredUser> {
  return {
    id: "user-gabe",
    username: "gabe",
    name: "Gabe Fransen",
    email: process.env.GMAIL_USER || undefined,
    passwordHash: await hashPassword(ownerPassword()),
    role: "owner",
    areas: [...AREAS],
    clubIds: [DEFAULT_CLUB_ID],
    teamIds: [DEFAULT_TEAM_ID],
    createdAt: nowIso(),
  };
}

function normalizeUser(user: StoredUser): StoredUser {
  return {
    ...user,
    clubIds: Array.isArray(user.clubIds) ? user.clubIds : [],
    teamIds: Array.isArray(user.teamIds) ? user.teamIds : [],
  };
}

function normalizeData(raw: Partial<HubData> | null): HubData | null {
  if (!raw?.users?.length) return null;
  const clubs = raw.clubs?.length ? raw.clubs : defaultClubs();
  const teams = raw.teams?.length ? raw.teams : defaultTeams();
  return {
    users: raw.users.map(normalizeUser),
    clubs,
    teams,
  };
}

async function blobStore() {
  if (!process.env.NETLIFY) return null;
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: "gabes-hub", consistency: "strong" });
  } catch {
    return null;
  }
}

async function readBlobs(): Promise<HubData | null> {
  try {
    const store = await blobStore();
    if (!store) return null;
    const parsed = (await store.get("users", { type: "json" })) as Partial<HubData> | null;
    return normalizeData(parsed);
  } catch {
    return null;
  }
}

async function writeBlobs(data: HubData) {
  try {
    const store = await blobStore();
    if (!store) return false;
    await store.setJSON("users", data);
    return true;
  } catch {
    return false;
  }
}

async function readFileStore(file: string): Promise<HubData | null> {
  try {
    const raw = await readFile(file, "utf8");
    return normalizeData(JSON.parse(raw) as Partial<HubData>);
  } catch {
    return null;
  }
}

async function writeFileStore(file: string, data: HubData) {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

export async function persist(data: HubData) {
  memory = data;
  if (await writeBlobs(data)) return;
  for (const file of storePaths) {
    if (await writeFileStore(file, data)) return;
  }
}

export async function ensureData(): Promise<HubData> {
  const fromBlobs = await readBlobs();
  if (fromBlobs) {
    memory = fromBlobs;
    return fromBlobs;
  }
  if (memory) return memory;

  for (const file of storePaths) {
    const data = await readFileStore(file);
    if (data) {
      memory = data;
      return data;
    }
  }

  const data: HubData = {
    users: [await ownerUser()],
    clubs: defaultClubs(),
    teams: defaultTeams(),
  };
  await persist(data);
  return data;
}

export function ownerPasswordValue() {
  return ownerPassword();
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

export function cleanAssignments(
  data: HubData,
  clubIds: string[] = [],
  teamIds: string[] = [],
) {
  const validClubIds = clubIds.filter((id) =>
    data.clubs.some((club) => club.id === id),
  );
  const validTeamIds = teamIds.filter((id) =>
    data.teams.some((team) => team.id === id),
  );
  return { clubIds: validClubIds, teamIds: validTeamIds };
}
