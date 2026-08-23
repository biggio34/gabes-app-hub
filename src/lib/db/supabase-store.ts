import { AREAS, type Area } from "@/lib/areas";
import { hashPassword } from "@/lib/auth";
import {
  DEFAULT_CLUB_ID,
  DEFAULT_TEAM_ID,
  slugId,
  type Club,
  type StoredUser,
  type Team,
} from "@/lib/models";
import { ownerPasswordValue } from "./client";
import { getSupabase, throwIfError } from "./supabase";

type UserRow = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  password_hash: string;
  role: StoredUser["role"];
  created_at: string;
};

const ready = {
  promise: null as Promise<void> | null,
};

async function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!ready.promise) ready.promise = seed(supabase);
  await ready.promise;
  return supabase;
}

async function seed(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const clubs = throwIfError(
    await supabase.from("hub_clubs").select("id"),
    "Could not read clubs from Supabase.",
  );
  if (!clubs?.length) {
    throwIfError(
      await supabase.from("hub_clubs").insert({
        id: DEFAULT_CLUB_ID,
        name: "MN Elks",
      }),
      "Could not create MN Elks.",
    );
    throwIfError(
      await supabase.from("hub_teams").insert({
        id: DEFAULT_TEAM_ID,
        club_id: DEFAULT_CLUB_ID,
        name: "16U Fransen",
      }),
      "Could not create 16U Fransen.",
    );
  }

  const users = throwIfError(
    await supabase.from("hub_users").select("id"),
    "Could not read people from Supabase.",
  );
  if (users?.length) return;

  const now = new Date().toISOString();
  throwIfError(
    await supabase.from("hub_users").insert({
      id: "user-gabe",
      username: "gabe",
      name: "Gabe Fransen",
      email: process.env.GMAIL_USER || null,
      password_hash: await hashPassword(ownerPasswordValue()),
      role: "owner",
      created_at: now,
    }),
    "Could not create the owner login.",
  );
  throwIfError(
    await supabase.from("hub_user_areas").insert(
      AREAS.map((area) => ({ user_id: "user-gabe", area })),
    ),
    "Could not assign owner areas.",
  );
  await supabase.from("hub_user_clubs").insert({
    user_id: "user-gabe",
    club_id: DEFAULT_CLUB_ID,
  });
  await supabase.from("hub_user_teams").insert({
    user_id: "user-gabe",
    team_id: DEFAULT_TEAM_ID,
  });
}

async function hydrate(rows: UserRow[]): Promise<StoredUser[]> {
  if (rows.length === 0) return [];
  const supabase = await client();
  const ids = rows.map((row) => row.id);
  const [areas, clubLinks, teamLinks] = await Promise.all([
    throwIfError(
      await supabase.from("hub_user_areas").select("*").in("user_id", ids),
      "Could not read areas.",
    ),
    throwIfError(
      await supabase.from("hub_user_clubs").select("*").in("user_id", ids),
      "Could not read club assignments.",
    ),
    throwIfError(
      await supabase.from("hub_user_teams").select("*").in("user_id", ids),
      "Could not read team assignments.",
    ),
  ]);
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email || undefined,
    passwordHash: row.password_hash,
    role: row.role,
    areas: (areas ?? [])
      .filter((item) => item.user_id === row.id)
      .map((item) => item.area as Area),
    clubIds: (clubLinks ?? [])
      .filter((item) => item.user_id === row.id)
      .map((item) => item.club_id as string),
    teamIds: (teamLinks ?? [])
      .filter((item) => item.user_id === row.id)
      .map((item) => item.team_id as string),
    createdAt: row.created_at,
  }));
}

export async function listUsers() {
  const supabase = await client();
  const rows = throwIfError(
    await supabase.from("hub_users").select("*"),
    "Could not list people.",
  ) as UserRow[];
  return hydrate(rows ?? []);
}

export async function findUserByUsername(username: string) {
  const supabase = await client();
  const rows = throwIfError(
    await supabase
      .from("hub_users")
      .select("*")
      .eq("username", username.trim().toLowerCase()),
    "Could not find that person.",
  ) as UserRow[];
  const [user] = await hydrate(rows ?? []);
  return user ?? null;
}

export async function findUserById(id: string) {
  const supabase = await client();
  const rows = throwIfError(
    await supabase.from("hub_users").select("*").eq("id", id),
    "Could not find that person.",
  ) as UserRow[];
  const [user] = await hydrate(rows ?? []);
  return user ?? null;
}

async function validAssignments(clubIds: string[] = [], teamIds: string[] = []) {
  const supabase = await client();
  const clubs = clubIds.length
    ? throwIfError(
        await supabase.from("hub_clubs").select("id").in("id", clubIds),
        "Could not check clubs.",
      )
    : [];
  const teams = teamIds.length
    ? throwIfError(
        await supabase.from("hub_teams").select("id").in("id", teamIds),
        "Could not check teams.",
      )
    : [];
  return {
    clubIds: (clubs ?? []).map((row) => row.id as string),
    teamIds: (teams ?? []).map((row) => row.id as string),
  };
}

async function replaceLinks(
  userId: string,
  next: { areas?: Area[]; clubIds?: string[]; teamIds?: string[] },
) {
  const supabase = await client();
  if (next.areas) {
    throwIfError(
      await supabase.from("hub_user_areas").delete().eq("user_id", userId),
      "Could not update areas.",
    );
    if (next.areas.length) {
      throwIfError(
        await supabase.from("hub_user_areas").insert(
          next.areas.map((area) => ({ user_id: userId, area })),
        ),
        "Could not update areas.",
      );
    }
  }
  if (next.clubIds) {
    throwIfError(
      await supabase.from("hub_user_clubs").delete().eq("user_id", userId),
      "Could not update clubs.",
    );
    if (next.clubIds.length) {
      throwIfError(
        await supabase.from("hub_user_clubs").insert(
          next.clubIds.map((clubId) => ({ user_id: userId, club_id: clubId })),
        ),
        "Could not update clubs.",
      );
    }
  }
  if (next.teamIds) {
    throwIfError(
      await supabase.from("hub_user_teams").delete().eq("user_id", userId),
      "Could not update teams.",
    );
    if (next.teamIds.length) {
      throwIfError(
        await supabase.from("hub_user_teams").insert(
          next.teamIds.map((teamId) => ({ user_id: userId, team_id: teamId })),
        ),
        "Could not update teams.",
      );
    }
  }
}

export async function insertUser(user: StoredUser) {
  const supabase = await client();
  throwIfError(
    await supabase.from("hub_users").insert({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email ?? null,
      password_hash: user.passwordHash,
      role: user.role,
      created_at: user.createdAt,
    }),
    "Could not add that person.",
  );
  await replaceLinks(user.id, user);
}

export async function saveUser(
  user: StoredUser,
  patch: { areas?: boolean; clubs?: boolean; teams?: boolean },
) {
  const supabase = await client();
  throwIfError(
    await supabase
      .from("hub_users")
      .update({
        name: user.name,
        email: user.email ?? null,
        password_hash: user.passwordHash,
      })
      .eq("id", user.id),
    "Could not update that person.",
  );
  await replaceLinks(user.id, {
    areas: patch.areas ? user.areas : undefined,
    clubIds: patch.clubs ? user.clubIds : undefined,
    teamIds: patch.teams ? user.teamIds : undefined,
  });
}

export async function removeUser(id: string) {
  const supabase = await client();
  throwIfError(
    await supabase.from("hub_users").delete().eq("id", id),
    "Could not remove that person.",
  );
}

export async function checkAssignments(clubIds?: string[], teamIds?: string[]) {
  return validAssignments(clubIds, teamIds);
}

export async function listOrgs() {
  const supabase = await client();
  const [clubRows, teamRows] = await Promise.all([
    throwIfError(await supabase.from("hub_clubs").select("*"), "Could not list clubs."),
    throwIfError(await supabase.from("hub_teams").select("*"), "Could not list teams."),
  ]);
  return {
    clubs: (clubRows ?? []).map(
      (row): Club => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
      }),
    ),
    teams: (teamRows ?? []).map(
      (row): Team => ({
        id: row.id,
        clubId: row.club_id,
        name: row.name,
        createdAt: row.created_at,
      }),
    ),
  };
}

export async function insertClub(club: Club) {
  const supabase = await client();
  throwIfError(
    await supabase.from("hub_clubs").insert({
      id: club.id,
      name: club.name,
      created_at: club.createdAt,
    }),
    "Could not add club.",
  );
}

export async function insertTeam(team: Team) {
  const supabase = await client();
  throwIfError(
    await supabase.from("hub_teams").insert({
      id: team.id,
      club_id: team.clubId,
      name: team.name,
      created_at: team.createdAt,
    }),
    "Could not add team.",
  );
}

export async function updateTeam(team: Team) {
  const supabase = await client();
  throwIfError(
    await supabase.from("hub_teams").update({ name: team.name }).eq("id", team.id),
    "Could not rename team.",
  );
}

export async function removeClub(id: string) {
  const supabase = await client();
  throwIfError(
    await supabase.from("hub_clubs").delete().eq("id", id),
    "Could not remove club.",
  );
}

export async function removeTeam(id: string) {
  const supabase = await client();
  throwIfError(
    await supabase.from("hub_teams").delete().eq("id", id),
    "Could not remove team.",
  );
}

export { slugId };
