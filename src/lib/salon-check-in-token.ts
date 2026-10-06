import { jwtVerify, SignJWT } from "jose";
import { SESSION_SECRET } from "./session-cookie";
import type { CheckInUndoSnapshot } from "./salon-check-in";

function secret() {
  return new TextEncoder().encode(SESSION_SECRET);
}

export async function signCheckInUndo(userId: string, lines: CheckInUndoSnapshot[]) {
  return new SignJWT({ userId, lines })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("20s")
    .sign(secret());
}

export async function readCheckInUndo(token: string, userId: string) {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.userId !== userId || !Array.isArray(payload.lines)) {
      throw new Error("That undo is for a different login.");
    }
    return payload.lines as CheckInUndoSnapshot[];
  } catch (err) {
    if (err instanceof Error && err.message === "That undo is for a different login.") {
      throw err;
    }
    throw new Error("That undo expired. If it was today, use the check-in list at the bottom.");
  }
}
