import { eq, inArray } from "drizzle-orm";
import { AREAS, type Area } from "./areas";
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
  const [areaRows, clubRows, teamRows] = await Promise.all([
    db.select().from(userAreas).where(inArray(userAreas.userId, ids)),
    db.select().from(userClubs).where(inArray(userClubs.userId, ids)),
    db.select().from(userTeams).where(inArray(userTeams.userId, ids)),
  ]);
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email || undefined,
    passwordHash: row.passwordHash,
    role: row.role as StoredUser["role"],
    areas: areaRows
      .filter((item) => item.userId === row.id)
      .map((item) => item.area as Area),
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
  next: { areas?: Area[]; clubIds?: string[]; teamIds?: string[] },
) {
  const db = await readyDb();
  if (next.areas) {
    await db.delete(userAreas).where(eq(userAreas.userId, userId));
    if (next.areas.length) {
      await db.insert(userAreas).values(
        next.areas.map((area) => ({ userId, area })),
      );
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
    clubIds: assigned.clubIds,
    teamIds: assigned.teamIds,
    createdAt: new Date().toISOString(),
  };
  if (isSupabaseConfigured()) {
    await supabaseStore.insertUser(user);
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
  return user;
}

export async function updateUser(
  id: string,
  patch: {
    name?: string;
    email?: string;
    areas?: Area[];
    password?: string;
    clubIds?: string[];
    teamIds?: string[];
  },
) {
  const current = await findUserById(id);
  if (!current) throw new Error("User not found");

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

  if (isSupabaseConfigured()) {
    await supabaseStore.saveUser(current, {
      areas: Boolean(patch.areas),
      clubs: Boolean(patch.clubIds || patch.teamIds),
      teams: Boolean(patch.clubIds || patch.teamIds),
    });
    return current;
  }
  const db = await readyDb();
  await db
    .update(users)
    .set({
      name: current.name,
      email: current.email ?? null,
      passwordHash: current.passwordHash,
    })
    .where(eq(users.id, id));
  await replaceLinks(id, {
    areas: patch.areas ? current.areas : undefined,
    clubIds: patch.clubIds || patch.teamIds ? current.clubIds : undefined,
    teamIds: patch.clubIds || patch.teamIds ? current.teamIds : undefined,
  });
  return current;
}

export async function deleteUser(id: string) {
  const current = await findUserById(id);
  if (!current) throw new Error("User not found");
  if (current.role === "owner") throw new Error("The owner account cannot be deleted");
  if (isSupabaseConfigured()) {
    await supabaseStore.removeUser(id);
    return;
  }
  const db = await readyDb();
  await db.delete(userAreas).where(eq(userAreas.userId, id));
  await db.delete(userClubs).where(eq(userClubs.userId, id));
  await db.delete(userTeams).where(eq(userTeams.userId, id));
  await db.delete(users).where(eq(users.id, id));
}
