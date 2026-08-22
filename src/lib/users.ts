import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { AREAS, type Area, type Role } from "./areas";
import { hashPassword } from "./auth";

export type StoredUser = {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
  role: Role;
  areas: Area[];
  createdAt: string;
};

const storePaths = [
  path.join(process.cwd(), "data", "users.json"),
  path.join("/tmp", "gabes-hub-users.json"),
];

let memoryUsers: StoredUser[] | null = null;

function ownerPassword() {
  return process.env.HUB_ADMIN_PASSWORD || "FransenHub2026";
}

async function ownerUser(): Promise<StoredUser> {
  return {
    id: "user-gabe",
    username: "gabe",
    name: "Gabe Fransen",
    passwordHash: await hashPassword(ownerPassword()),
    role: "owner",
    areas: [...AREAS],
    createdAt: new Date().toISOString(),
  };
}

async function readStore(file: string): Promise<StoredUser[] | null> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { users?: StoredUser[] };
    if (parsed.users?.length) return parsed.users;
  } catch {
    // missing or unreadable
  }
  return null;
}

async function writeStore(file: string, users: StoredUser[]): Promise<boolean> {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ users }, null, 2));
    return true;
  } catch {
    return false;
  }
}

async function persist(users: StoredUser[]) {
  memoryUsers = users;
  for (const file of storePaths) {
    if (await writeStore(file, users)) return;
  }
}

async function ensureStore() {
  if (memoryUsers?.length) return memoryUsers;

  for (const file of storePaths) {
    const users = await readStore(file);
    if (users) {
      memoryUsers = users;
      return users;
    }
  }

  const users = [await ownerUser()];
  await persist(users);
  return users;
}

export async function listUsers() {
  return ensureStore();
}

export async function findUserByUsername(username: string) {
  const users = await ensureStore();
  return (
    users.find((user) => user.username.toLowerCase() === username.toLowerCase()) ??
    null
  );
}

export async function findUserById(id: string) {
  const users = await ensureStore();
  return users.find((user) => user.id === id) ?? null;
}

export function matchesOwnerPassword(user: StoredUser, password: string) {
  return user.role === "owner" && password === ownerPassword();
}

export async function createUser(input: {
  username: string;
  name: string;
  password: string;
  areas: Area[];
}) {
  const users = await ensureStore();
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error("Username is required");
  if (users.some((user) => user.username === username)) {
    throw new Error("That username is already taken");
  }
  if (input.password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  const user: StoredUser = {
    id: `user-${Date.now()}`,
    username,
    name: input.name.trim() || username,
    passwordHash: await hashPassword(input.password),
    role: "member",
    areas: input.areas.filter((area) => AREAS.includes(area)),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await persist(users);
  return user;
}

export async function updateUser(
  id: string,
  patch: { name?: string; areas?: Area[]; password?: string },
) {
  const users = await ensureStore();
  const index = users.findIndex((user) => user.id === id);
  if (index < 0) throw new Error("User not found");
  const current = users[index];
  if (patch.name) current.name = patch.name.trim();
  if (patch.areas) {
    current.areas = patch.areas.filter((area) => AREAS.includes(area));
    if (current.role === "owner") current.areas = [...AREAS];
  }
  if (patch.password) {
    if (patch.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }
    current.passwordHash = await hashPassword(patch.password);
  }
  users[index] = current;
  await persist(users);
  return current;
}

export async function deleteUser(id: string) {
  const users = await ensureStore();
  const target = users.find((user) => user.id === id);
  if (!target) throw new Error("User not found");
  if (target.role === "owner") throw new Error("The owner account cannot be deleted");
  await persist(users.filter((user) => user.id !== id));
}

export function publicUser(user: StoredUser) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    areas: user.areas,
  };
}
