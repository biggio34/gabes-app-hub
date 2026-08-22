import { AREAS, type Area } from "./areas";
import { hashPassword } from "./auth";
import {
  cleanAssignments,
  ensureData,
  ownerPasswordValue,
  persist,
  publicUser,
  slugId,
  type StoredUser,
} from "./hub-store";

export type { StoredUser } from "./hub-store";
export { publicUser } from "./hub-store";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function listUsers() {
  const data = await ensureData();
  return data.users;
}

export async function findUserByUsername(username: string) {
  const users = await listUsers();
  return (
    users.find((user) => user.username.toLowerCase() === username.toLowerCase()) ??
    null
  );
}

export async function findUserById(id: string) {
  const users = await listUsers();
  return users.find((user) => user.id === id) ?? null;
}

export function matchesOwnerPassword(user: StoredUser, password: string) {
  return user.role === "owner" && password === ownerPasswordValue();
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
  const data = await ensureData();
  const username = input.username.trim().toLowerCase();
  const email = normalizeEmail(input.email);
  if (!username) throw new Error("Username is required");
  if (!isValidEmail(email)) throw new Error("A real email address is required");
  if (data.users.some((user) => user.username === username)) {
    throw new Error("That username is already taken");
  }
  if (input.password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  const assigned = cleanAssignments(data, input.clubIds, input.teamIds);
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
  data.users.push(user);
  await persist(data);
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
  const data = await ensureData();
  const index = data.users.findIndex((user) => user.id === id);
  if (index < 0) throw new Error("User not found");
  const current = data.users[index];
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
    const assigned = cleanAssignments(
      data,
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
  data.users[index] = current;
  await persist(data);
  return current;
}

export async function deleteUser(id: string) {
  const data = await ensureData();
  const target = data.users.find((user) => user.id === id);
  if (!target) throw new Error("User not found");
  if (target.role === "owner") throw new Error("The owner account cannot be deleted");
  data.users = data.users.filter((user) => user.id !== id);
  await persist(data);
}
