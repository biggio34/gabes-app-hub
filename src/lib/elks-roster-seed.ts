const DEFAULT_CLUB_ID = "club-mn-elks";
const DEFAULT_TEAM_ID = "team-16u-fransen";

export type SeedPlayer = {
  firstName: string;
  lastName: string;
  number: string;
};

export type SeedTeamSpec = {
  key: string;
  age: string;
  coach: string;
  createName: string;
  stableId: string;
  players: SeedPlayer[];
};

export type HubTeamRef = {
  id: string;
  name: string;
  clubId?: string;
};

export type SoftballPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  number: string;
  position: string;
  assignedTeamId: string | null;
  [key: string]: unknown;
};

export type SoftballState = {
  players?: SoftballPlayer[];
  teams?: Array<{ id: string; name: string; ageGroup?: string }>;
  tryouts?: unknown[];
  currentTryoutId?: string | null;
  practices?: unknown[];
  drills?: unknown[];
  templates?: unknown[];
  updatedAt?: number;
  version?: number;
  [key: string]: unknown;
};

export const ELKS_SEASON = "2026-2027";

export const ELKS_SEASON_TEAMS: SeedTeamSpec[] = [
  {
    key: "12u-uttke",
    age: "12U",
    coach: "Uttke",
    createName: "12U Uttke - 2026-2027",
    stableId: "team-12u-uttke",
    players: [
      { firstName: "Eleanor", lastName: "Anderson", number: "5" },
      { firstName: "Maci", lastName: "Bursch", number: "88" },
      { firstName: "Madison", lastName: "Bursch", number: "20" },
      { firstName: "Kaia", lastName: "Curti", number: "77" },
      { firstName: "Ellie", lastName: "Cyrus", number: "46" },
      { firstName: "Esme", lastName: "Diedrich", number: "21" },
      { firstName: "Evelyn", lastName: "Eilrich", number: "35" },
      { firstName: "Victoria", lastName: "Fritch", number: "11" },
      { firstName: "Gabrielle", lastName: "Hanson", number: "9" },
      { firstName: "Mia", lastName: "Robinson", number: "1" },
      { firstName: "Willow", lastName: "Uttke", number: "10" },
      { firstName: "Emaray", lastName: "Welle", number: "14" },
    ],
  },
  {
    key: "14u-churchich",
    age: "14U",
    coach: "Churchich",
    createName: "14U Churchich - 2026-2027",
    stableId: "team-14u-churchich",
    players: [
      { firstName: "Nora", lastName: "Bates", number: "16" },
      { firstName: "Natalie", lastName: "Bowar", number: "24" },
      { firstName: "Ava", lastName: "Cagle", number: "29" },
      { firstName: "Madelyn", lastName: "Churchich", number: "6" },
      { firstName: "Sadie", lastName: "Cooksey", number: "15" },
      { firstName: "Abby", lastName: "Engelmann", number: "32" },
      { firstName: "Anabella", lastName: "Jacobs", number: "47" },
      { firstName: "Mavis", lastName: "Matsche", number: "11" },
      { firstName: "Raina", lastName: "Peterman", number: "2" },
      { firstName: "Elliott", lastName: "Powell", number: "72" },
      { firstName: "Alexis", lastName: "Thorson", number: "22" },
      { firstName: "Madison", lastName: "Thorson", number: "21" },
    ],
  },
  {
    key: "14u-hermes",
    age: "14U",
    coach: "Hermes",
    createName: "14U Hermes - 2026-2027",
    stableId: "team-14u-hermes",
    players: [
      { firstName: "Gretchen", lastName: "Gasper", number: "12" },
      { firstName: "Jocelyn", lastName: "Hawks", number: "9" },
      { firstName: "Skye", lastName: "Holtan", number: "27" },
      { firstName: "Lydia", lastName: "Lynch", number: "17" },
      { firstName: "Annali", lastName: "Murphy", number: "13" },
      { firstName: "Michaela", lastName: "Sherman", number: "52" },
      { firstName: "Brinley", lastName: "Sweeter", number: "3" },
      { firstName: "Skylynn", lastName: "Tibbetts", number: "26" },
      { firstName: "Jaelynn", lastName: "Vodicka", number: "1" },
      { firstName: "Nailani", lastName: "Woolison", number: "8" },
    ],
  },
  {
    key: "16u-fransen",
    age: "16U",
    coach: "Fransen",
    createName: "16U Fransen",
    stableId: DEFAULT_TEAM_ID,
    players: [
      { firstName: "Emily", lastName: "Artmann", number: "4" },
      { firstName: "Macie", lastName: "Backman", number: "7" },
      { firstName: "Madison", lastName: "Burggraff", number: "11" },
      { firstName: "Alexa", lastName: "Dakis", number: "00" },
      { firstName: "Savanah", lastName: "Emmans", number: "45" },
      { firstName: "Tenley", lastName: "Fransen", number: "10" },
      { firstName: "Molly", lastName: "Johnson", number: "27" },
      { firstName: "Ava", lastName: "Kirkpatrick", number: "5" },
      { firstName: "Lucy", lastName: "Nilsen", number: "26" },
      { firstName: "Kiana", lastName: "Pegues", number: "17" },
      { firstName: "Avaiyah", lastName: "Sandford", number: "9" },
      { firstName: "MaKayla", lastName: "Uttke", number: "12" },
      { firstName: "Paisyn", lastName: "Wiley", number: "8" },
    ],
  },
  {
    key: "16u-stephany",
    age: "16U",
    coach: "Stephany",
    createName: "16U Stephany - 2026-2027",
    stableId: "team-16u-stephany",
    players: [
      { firstName: "Jayda", lastName: "Allen", number: "14" },
      { firstName: "Madelyn", lastName: "Bentley", number: "23" },
      { firstName: "Kaylee", lastName: "Brown", number: "1" },
      { firstName: "Hailee", lastName: "Clinton", number: "13" },
      { firstName: "Anna", lastName: "Cummings", number: "6" },
      { firstName: "Macy", lastName: "Eull", number: "4" },
      { firstName: "Faith", lastName: "Funk", number: "10" },
      { firstName: "Addisyn", lastName: "Hoff", number: "9" },
      { firstName: "Celia", lastName: "Houghton", number: "11" },
      { firstName: "Mia", lastName: "Lindenfelser", number: "3" },
      { firstName: "Emma", lastName: "Maudal", number: "39" },
      { firstName: "Mary", lastName: "Pugh", number: "8" },
      { firstName: "Addison", lastName: "Vaith", number: "15" },
    ],
  },
];

export function normalizePersonName(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function playerIdentityKey(name: string, number: string) {
  return `${normalizePersonName(name)}|${String(number ?? "").trim()}`;
}

export function displayPlayerName(player: {
  firstName?: string;
  lastName?: string;
  name?: string;
}) {
  const joined = [player.firstName, player.lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return joined || String(player.name || "").trim();
}

export function matchesSeedTeam(teamName: string, spec: SeedTeamSpec) {
  const name = normalizePersonName(teamName).replace(/\//g, "-");
  return name.includes(spec.age.toLowerCase()) && name.includes(spec.coach.toLowerCase());
}

export function resolveSeedTeam(
  spec: SeedTeamSpec,
  hubTeams: HubTeamRef[],
): HubTeamRef | null {
  const clubTeams = hubTeams.filter(
    (team) => !team.clubId || team.clubId === DEFAULT_CLUB_ID,
  );
  const pool = clubTeams.length ? clubTeams : hubTeams;
  const matches = pool.filter((team) => matchesSeedTeam(team.name, spec));
  if (!matches.length) return null;
  const withSeason = matches.find((team) =>
    normalizePersonName(team.name).includes("2026"),
  );
  return withSeason || matches[0];
}

function slugPart(value: string) {
  return normalizePersonName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function seedPlayerId(teamKey: string, player: SeedPlayer) {
  return `seed-p-${teamKey}-${slugPart(player.firstName + " " + player.lastName)}-${slugPart(player.number) || "x"}`;
}

function asPlayer(value: unknown): SoftballPlayer | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const firstName = String(raw.firstName || "").trim();
  const lastName = String(raw.lastName || "").trim();
  const name =
    [firstName, lastName].filter(Boolean).join(" ") ||
    String(raw.name || "").trim() ||
    "Unnamed";
  return {
    ...raw,
    id: String(raw.id || ""),
    firstName,
    lastName,
    name,
    number: raw.number == null ? "" : String(raw.number),
    position: raw.position == null ? "" : String(raw.position),
    assignedTeamId:
      typeof raw.assignedTeamId === "string" && raw.assignedTeamId
        ? raw.assignedTeamId
        : typeof raw.teamId === "string" && raw.teamId
          ? raw.teamId
          : null,
  };
}

export function emptySoftballState(): SoftballState {
  return {
    players: [],
    teams: [],
    tryouts: [],
    currentTryoutId: null,
    practices: [],
    drills: [],
    templates: [],
    updatedAt: 0,
    version: 1,
  };
}

function copyArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? [...(value as T[])] : [...fallback];
}

export function mergeSoftballStates(
  remote: SoftballState | null | undefined,
  local: SoftballState | null | undefined,
): SoftballState {
  const server = remote && typeof remote === "object" ? remote : emptySoftballState();
  const client = local && typeof local === "object" ? local : emptySoftballState();
  const merged: SoftballState = {
    ...server,
    tryouts: copyArray(server.tryouts?.length ? server.tryouts : client.tryouts, []),
    currentTryoutId:
      server.currentTryoutId ?? client.currentTryoutId ?? null,
    practices: copyArray(
      Array.isArray(server.practices) && server.practices.length
        ? server.practices
        : client.practices,
      [],
    ),
    drills: copyArray(
      Array.isArray(server.drills) && server.drills.length
        ? server.drills
        : client.drills,
      [],
    ),
    templates: copyArray(
      Array.isArray(server.templates) && server.templates.length
        ? server.templates
        : client.templates,
      [],
    ),
    teams: copyArray(server.teams?.length ? server.teams : client.teams, []),
    version: Number(server.version || client.version || 1),
  };

  const byId = new Map<string, SoftballPlayer>();
  const byIdentity = new Map<string, SoftballPlayer>();

  function ingest(list: unknown, preferIncomingAssignment: boolean) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const player = asPlayer(item);
      if (!player) continue;
      const identity = playerIdentityKey(displayPlayerName(player), player.number);
      const existing =
        (player.id && byId.get(player.id)) || byIdentity.get(identity);
      if (!existing) {
        if (player.id) byId.set(player.id, player);
        byIdentity.set(identity, player);
        continue;
      }
      if (preferIncomingAssignment && player.assignedTeamId && !existing.assignedTeamId) {
        existing.assignedTeamId = player.assignedTeamId;
      }
      if (!existing.firstName && player.firstName) existing.firstName = player.firstName;
      if (!existing.lastName && player.lastName) existing.lastName = player.lastName;
      if (!existing.number && player.number) existing.number = player.number;
      if (!existing.position && player.position) existing.position = player.position;
      if (!existing.name && player.name) existing.name = player.name;
    }
  }

  ingest(server.players, false);
  ingest(client.players, true);
  merged.players = [...byIdentity.values()];
  return merged;
}

export function syncStateTeams(
  state: SoftballState,
  hubTeams: HubTeamRef[],
): SoftballState {
  if (!hubTeams.length) return state;
  const next = {
    ...state,
    teams: Array.isArray(state.teams) ? [...state.teams] : [],
    players: Array.isArray(state.players) ? [...state.players] : [],
  };

  function namesMatch(left: string, right: string) {
    const a = normalizePersonName(left);
    const b = normalizePersonName(right);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  for (const hubTeam of hubTeams) {
    const ageMatch = String(hubTeam.name || "").match(/(\d{1,2})\s*U/i);
    const age = ageMatch ? `${ageMatch[1]}U` : "16U";
    const duplicate = next.teams.find(
      (team) => team.id !== hubTeam.id && namesMatch(team.name, hubTeam.name),
    );
    if (duplicate) {
      next.players = next.players.map((player) =>
        player.assignedTeamId === duplicate.id
          ? { ...player, assignedTeamId: hubTeam.id }
          : player,
      );
      next.teams = next.teams.filter((team) => team.id !== duplicate.id);
    }
    const existing = next.teams.find((team) => team.id === hubTeam.id);
    if (existing) {
      existing.name = hubTeam.name;
      if (!existing.ageGroup) existing.ageGroup = age;
    } else {
      next.teams.push({ id: hubTeam.id, name: hubTeam.name, ageGroup: age });
    }
  }

  const knownIds = new Set(next.teams.map((team) => team.id));
  const hubIds = new Set(hubTeams.map((team) => team.id));
  next.players = next.players.map((player) => {
    if (!player.assignedTeamId || knownIds.has(player.assignedTeamId)) {
      return player;
    }
    if (hubIds.size === 1) {
      return { ...player, assignedTeamId: hubTeams[0].id };
    }
    return player;
  });
  return next;
}

export function seedOfficialRosters(
  state: SoftballState,
  hubTeams: HubTeamRef[],
): { state: SoftballState; added: number; assigned: number } {
  const players = Array.isArray(state.players)
    ? state.players.map((player) => ({ ...player }))
    : [];
  const teams = Array.isArray(state.teams) ? [...state.teams] : [];
  const next: SoftballState = {
    ...state,
    players,
    teams,
  };
  let added = 0;
  let assigned = 0;
  const now = Date.now();

  for (const spec of ELKS_SEASON_TEAMS) {
    const team = resolveSeedTeam(spec, hubTeams);
    if (!team) continue;
    if (!teams.some((item) => item.id === team.id)) {
      teams.push({
        id: team.id,
        name: team.name,
        ageGroup: spec.age,
      });
    }

    for (const seed of spec.players) {
      const fullName = `${seed.firstName} ${seed.lastName}`;
      const identity = playerIdentityKey(fullName, seed.number);
      const existing = players.find(
        (player) =>
          playerIdentityKey(displayPlayerName(player), player.number) === identity,
      );
      if (existing) {
        if (existing.assignedTeamId === team.id) continue;
        existing.assignedTeamId = team.id;
        assigned += 1;
        continue;
      }
      players.push({
        id: seedPlayerId(spec.key, seed),
        firstName: seed.firstName,
        lastName: seed.lastName,
        name: fullName,
        number: seed.number,
        position: "",
        assignedTeamId: team.id,
        birthdate: "",
        originalTeam: "",
        position2: "",
        photo: "",
        scores: {},
        recommendation: null,
        evalNotes: "",
        evalUpdatedAt: null,
        evalTryoutId: null,
        createdAt: now,
      });
      added += 1;
    }
  }

  next.updatedAt = Date.now();
  next.elksSeasonSeed = ELKS_SEASON;
  return { state: next, added, assigned };
}

export function softballStateChanged(
  before: SoftballState | null | undefined,
  after: SoftballState,
) {
  const previousPlayers = Array.isArray(before?.players) ? before.players : [];
  const nextPlayers = after.players || [];
  if (previousPlayers.length !== nextPlayers.length) return true;
  const previousKeys = new Set(
    previousPlayers.map(
      (player) =>
        `${playerIdentityKey(displayPlayerName(player), String(player.number ?? ""))}|${player.assignedTeamId || ""}`,
    ),
  );
  return nextPlayers.some(
    (player) =>
      !previousKeys.has(
        `${playerIdentityKey(displayPlayerName(player), player.number)}|${player.assignedTeamId || ""}`,
      ),
  );
}
