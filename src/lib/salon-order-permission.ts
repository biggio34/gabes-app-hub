import type { SessionUser } from "./auth";

/**
 * Purchasing logins that may mark lines ordered. Owner is always allowed.
 * lhp-test is the preview-only purchasing login. A real hub user with that
 * username or id would get the same permission.
 */
const BUILTIN_ORDER_LOGINS = ["lhp", "lhp-test", "user-lhp-test"];

/**
 * Extra usernames or user ids, comma-separated.
 * Read at call time so Netlify can grant Brooke later without a code change.
 * Example: SALON_CAN_MARK_ORDERED=brooke
 */
function extraOrderLogins() {
  const raw = process.env["SALON_CAN_MARK_ORDERED"] ?? "";
  return raw
    .split(/[,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function canMarkOrdered(user: Pick<SessionUser, "role" | "username" | "id">) {
  if (user.role === "owner") return true;
  const allowed = new Set([...BUILTIN_ORDER_LOGINS, ...extraOrderLogins()]);
  const username = user.username.trim().toLowerCase();
  const id = user.id.trim().toLowerCase();
  return allowed.has(username) || allowed.has(id);
}

export function patchSetsOrderedQty(patch: { orderedQty?: unknown; status?: unknown }) {
  if (patch.orderedQty !== undefined) return true;
  return patch.status === "ordered";
}
