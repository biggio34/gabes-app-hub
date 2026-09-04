import { eq, inArray } from "drizzle-orm";
import {
  AREAS,
  HUB_FEATURES,
  areaAndFeatureLinks,
  isHubFeature,
  mergeUserFeatures,
  type Area,
  type HubFeature,
} from "./areas";
import { hashPassword } from "./auth";
import { ownerPasswordValue, readyDb } from "./db/client";
import { isSupabaseConfigured } from "./db/supabase";
import * as supabaseStore from "./db/supabase-store";
import { clubs, teams, userAreas, userClubs, userTeams, users } from "./db/schema";
import {
  publicUser,
  slugId,
  type StoredUser,
} from "./models";
import {
  deleteUserFeatures,
  readUserFeaturesMap,
  writeUserFeatures,
} from "./user-features-store";

export type { StoredUser } from "./models";
export { publicUser } from "./models";
export { ownerPasswordValue } from "./db/client";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function hydrate(rows: (typeof users.$inferSelect)[]): Promise<StoredUser[]> {
  if (rows.length === 0) return [];
  const db = await readyDb();
  const ids = rows.map((row) => row.id);
  const [areaRows, clubRows, teamRows, featureMap] = await Promise.all([
    db.select().from(userAreas).where(inArray(userAreas.userId, ids)),
    db.select().from(userClubs).where(inArray(userClubs.userId, ids)),
    db.select().from(userTeams).where(inArray(userTeams.userId, ids)),
    readUserFeaturesMap(ids),
  ]);
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email || undefined,
    passwordHash: row.passwordHash,
    role: row.role as StoredUser["role"],
    areas: areaRows
      .filter((item) => item.userId === row.id && AREAS.includes(item.area as Area))
      .map((item) => item.area as Area),
    features: mergeUserFeatures(
      areaRows
        .filter((item) => item.userId === row.id && isHubFeature(item.area))
        .map((item) => item.area),
      featureMap.get(row.id),
    ),
    clubIds: clubRows
      .filter((item) => item.userId === row.id)
      .map((item) => item.clubId),
    teamIds: teamRows
      .filter((item) => item.userId === row.id)
      .map((item) => item.teamId),
    createdAt: row.createdAt,
  }));
}

export async function listUsers() {
  if (isSupabaseConfigured()) return supabaseStore.listUsers();
  const db = await readyDb();
  const rows = await db.select().from(users);
  return hydrate(rows);
}

export async function findUserByUsername(username: string) {
  if (isSupabaseConfigured()) return supabaseStore.findUserByUsername(username);
  const db = await readyDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.username, username.trim().toLowerCase()));
  const [user] = await hydrate(rows);
  return user ?? null;
}

export async function findUserById(id: string) {
  if (isSupabaseConfigured()) return supabaseStore.findUserById(id);
  const db = await readyDb();
  const rows = await db.select().from(users).where(eq(users.id, id));
  const [user] = await hydrate(rows);
  return user ?? null;
}

export function matchesOwnerPassword(user: StoredUser, password: string) {
  return user.role === "owner" && password === ownerPasswordValue();
}

async function validAssignments(clubIds: string[] = [], teamIds: string[] = []) {
  const db = await readyDb();
  const clubRows = clubIds.length
    ? await db.select({ id: clubs.id }).from(clubs).where(inArray(clubs.id, clubIds))
    : [];
  const teamRows = teamIds.length
    ? await db.select({ id: teams.id }).from(teams).where(inArray(teams.id, teamIds))
    : [];
  return {
    clubIds: clubRows.map((row) => row.id),
    teamIds: teamRows.map((row) => row.id),
  };
}

async function replaceLinks(
  userId: string,
  next: { areas?: Area[]; features?: HubFeature[]; clubIds?: string[]; teamIds?: string[] },
) {
  const db = await readyDb();
  if (next.areas) {
    const areaRows = next.areas.map((area) => ({ userId, area }));
    await db.delete(userAreas).where(eq(userAreas.userId, userId));
    if (areaRows.length) {
      await db.insert(userAreas).values(areaRows);
    }
  }
  if (next.clubIds) {
    await db.delete(userClubs).where(eq(userClubs.userId, userId));
    if (next.clubIds.length) {
      await db.insert(userClubs).values(
        next.clubIds.map((clubId) => ({ userId, clubId })),
      );
    }
  }
  if (next.teamIds) {
    await db.delete(userTeams).where(eq(userTeams.userId, userId));
    if (next.teamIds.length) {
      await db.insert(userTeams).values(
        next.teamIds.map((teamId) => ({ userId, teamId })),
      );
    }
  }
}

export async function createUser(input: {
  username: string;
  name: string;
  email: string;
  password: string;
  areas: Area[];
  features?: HubFeature[];
  clubIds?: string[];
  teamIds?: string[];
}) {
  const username = input.username.trim().toLowerCase();
  const email = normalizeEmail(input.email);
  if (!username) throw new Error("Username is required");
  if (!isValidEmail(email)) throw new Error("A real email address is required");
  if (await findUserByUsername(username)) {
    throw new Error("That username is already taken");
  }
  if (input.password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  const assigned = isSupabaseConfigured()
    ? await supabaseStore.checkAssignments(input.clubIds, input.teamIds)
    : await validAssignments(input.clubIds, input.teamIds);
  const user: StoredUser = {
    id: slugId("user"),
    username,
    name: input.name.trim() || username,
    email,
    passwordHash: await hashPassword(input.password),
    role: "member",
    areas: input.areas.filter((area) => AREAS.includes(area)),
    features: (input.features ?? []).filter(isHubFeature),
    clubIds: assigned.clubIds,
    teamIds: assigned.teamIds,
    createdAt: new Date().toISOString(),
  };
  if (user.features.includes("wrist-coach") && !user.areas.includes("softball")) {
    user.areas = [...user.areas, "softball"];
  }
  if (isSupabaseConfigured()) {
    await supabaseStore.insertUser(user);
    await writeUserFeatures(user.id, user.features);
    return user;
  }
  const db = await readyDb();
  await db.insert(users).values({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    role: user.role,
    createdAt: user.createdAt,
  });
  await replaceLinks(user.id, user);
  await writeUserFeatures(user.id, user.features);
  return user;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export async function updateUser(
  id: string,
  patch: {
    name?: string;
    email?: string;
    username?: string;
    areas?: Area[];
    features?: HubFeature[];
    password?: string;
    clubIds?: string[];
    teamIds?: string[];
  },
) {
  const current = await findUserById(id);
  if (!current) throw new Error("User not found");
  current.features = current.features ?? [];

  if (patch.username !== undefined) {
    const username = normalizeUsername(patch.username);
    if (!username) throw new Error("Username is required");
    if (username.length < 2) throw new Error("Username must be at least 2 characters");
    if (/\s/.test(username)) throw new Error("Username cannot have spaces");
    const taken = await findUserByUsername(username);
    if (taken && taken.id !== id) {
      throw new Error("That username is already taken");
    }
    current.username = username;
  }

  if (patch.name) current.name = patch.name.trim();
  if (patch.email !== undefined) {
    const email = normalizeEmail(patch.email);
    if (email && !isValidEmail(email)) {
      throw new Error("That email address does not look right");
    }
    current.email = email || undefined;
  }
  if (patch.areas) {
    current.areas = patch.areas.filter((area) => AREAS.includes(area));
    if (current.role === "owner") current.areas = [...AREAS];
  }
  if (patch.features !== undefined) {
    current.features = patch.features.filter(isHubFeature);
    if (current.role === "owner") current.features = [...HUB_FEATURES];
  }
  if (current.features.includes("wrist-coach") && !current.areas.includes("softball")) {
    current.areas = [...current.areas, "softball"];
  }
  if (!current.areas.includes("softball") && current.role !== "owner") {
    current.features = current.features.filter((feature) => feature !== "wrist-coach");
  }
  if (patch.clubIds || patch.teamIds) {
    const assigned = isSupabaseConfigured()
      ? await supabaseStore.checkAssignments(
          patch.clubIds ?? current.clubIds,
          patch.teamIds ?? current.teamIds,
        )
      : await validAssignments(
          patch.clubIds ?? current.clubIds,
          patch.teamIds ?? current.teamIds,
        );
    current.clubIds = assigned.clubIds;
    current.teamIds = assigned.teamIds;
  }
  if (patch.password) {
    if (patch.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    current.passwordHash = await hashPassword(patch.password);
  }

  const touchAreas = patch.areas !== undefined || patch.features !== undefined;
  if (isSupabaseConfigured()) {
    await supabaseStore.saveUser(current, {
      areas: touchAreas,
      clubs: Boolean(patch.clubIds || patch.teamIds),
      teams: Boolean(patch.clubIds || patch.teamIds),
    });
    if (touchAreas) await writeUserFeatures(id, current.features);
    return current;
  }
  const db = await readyDb();
  await db
    .update(users)
    .set({
      username: current.username,
      name: current.name,
      email: current.email ?? null,
      passwordHash: current.passwordHash,
    })
    .where(eq(users.id, id));
  const links = areaAndFeatureLinks(current);
  await replaceLinks(id, {
    areas: touchAreas ? links.areas : undefined,
    clubIds: patch.clubIds || patch.teamIds ? current.clubIds : undefined,
    teamIds: patch.clubIds || patch.teamIds ? current.teamIds : undefined,
  });
  if (touchAreas) await writeUserFeatures(id, current.features);
  return current;
}

export async function deleteUser(id: string) {
  const current = await findUserById(id);
  if (!current) throw new Error("User not found");
  if (current.role === "owner") throw new Error("The owner account cannot be deleted");
  if (isSupabaseConfigured()) {
    await supabaseStore.removeUser(id);
    await deleteUserFeatures(id);
    return;
  }
  const db = await readyDb();
  await db.delete(userAreas).where(eq(userAreas.userId, id));
  await db.delete(userClubs).where(eq(userClubs.userId, id));
  await db.delete(userTeams).where(eq(userTeams.userId, id));
  await db.delete(users).where(eq(users.id, id));
  await deleteUserFeatures(id);
}
