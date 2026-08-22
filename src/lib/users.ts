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

const dataFile = path.join(process.cwd(), "data", "users.json");

async function ensureStore() {
  await mkdir(path.dirname(dataFile), { recursive: true });
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as { users: StoredUser[] };
    if (parsed.users?.length) return parsed.users;
  } catch {
    // first run
  }

  const password = process.env.HUB_ADMIN_PASSWORD || "FransenHub2026";
  const owner: StoredUser = {
    id: "user-gabe",
    username: "gabe",
    name: "Gabe Fransen",
    passwordHash: await hashPassword(password),
    role: "owner",
    areas: [...AREAS],
    createdAt: new Date().toISOString(),
  };
  await writeFile(dataFile, JSON.stringify({ users: [owner] }, null, 2));
  return [owner];
}

async function save(users: StoredUser[]) {
  await mkdir(path.dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify({ users }, null, 2));
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
  await save(users);
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
  await save(users);
  return current;
}

export async function deleteUser(id: string) {
  const users = await ensureStore();
  const target = users.find((user) => user.id === id);
  if (!target) throw new Error("User not found");
  if (target.role === "owner") throw new Error("The owner account cannot be deleted");
  await save(users.filter((user) => user.id !== id));
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
