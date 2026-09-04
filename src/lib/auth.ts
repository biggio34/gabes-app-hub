import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { Area, HubFeature, Role } from "./areas";
import { wristCoachAllowed } from "./areas";
import { SESSION_COOKIE, SESSION_SECRET } from "./session-cookie";

export { SESSION_COOKIE };

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  areas: Area[];
  features: HubFeature[];
};

export function sessionFromStored(user: {
  id: string;
  username: string;
  name: string;
  role: Role;
  areas: Area[];
  features?: HubFeature[];
}): SessionUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    areas: user.areas,
    features: user.features ?? [],
  };
}

function secret() {
  return new TextEncoder().encode(SESSION_SECRET);
}

export async function hashPassword(password: string) {
  return hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (
      typeof payload.id !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.role !== "string" ||
      !Array.isArray(payload.areas)
    ) {
      return null;
    }
    return {
      id: payload.id,
      username: payload.username,
      name: typeof payload.name === "string" ? payload.name : payload.username,
      role: payload.role as Role,
      areas: payload.areas as Area[],
      features: Array.isArray(payload.features)
        ? (payload.features.filter((item): item is HubFeature => typeof item === "string") as HubFeature[])
        : [],
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

export function canAccessArea(user: SessionUser, area: Area) {
  return user.role === "owner" || user.areas.includes(area);
}

export { wristCoachAllowed };

export function canUseWristCoach(user: SessionUser) {
  return wristCoachAllowed(user);
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
