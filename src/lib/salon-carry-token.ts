import { jwtVerify, SignJWT } from "jose";
import { SESSION_SECRET } from "./session-cookie";

export type CarryUndoLine = {
  id: string;
  prevOrderedQty: number;
  prevLeftover: string;
  prevStatus: string;
  createdItemId: string;
  createdKind: "pending" | "ordered";
};

function secret() {
  return new TextEncoder().encode(SESSION_SECRET);
}

export async function signCarryUndo(userId: string, lines: CarryUndoLine[]) {
  return new SignJWT({ userId, lines })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secret());
}

export async function readCarryUndo(token: string, userId: string) {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.userId !== userId || !Array.isArray(payload.lines)) {
      throw new Error("That undo is for a different login.");
    }
    return payload.lines as CarryUndoLine[];
  } catch (err) {
    if (err instanceof Error && err.message === "That undo is for a different login.") {
      throw err;
    }
    throw new Error("That undo expired.");
  }
}
