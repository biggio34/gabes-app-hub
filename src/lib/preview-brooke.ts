import { verifyPassword } from "./auth";
import type { SessionUser } from "./auth";
import { previewBrookeLoginEnabled, previewRequestHost } from "./preview-brooke-gate";

export { previewBrookeLoginEnabled, previewRequestHost };

/**
 * Preview-only stand-in for Brooke. Not a row in hub_users, so it never
 * appears on the live People page and never shares her password.
 */
export const PREVIEW_BROOKE_USERNAME = "brooke-test";
export const PREVIEW_BROOKE_NAME = "Brooke (Test)";
export const PREVIEW_BROOKE_ID = "user-brooke-test";

const PREVIEW_BROOKE_PASSWORD_HASH =
  "$2b$10$SOxxWVv0juSsidz3zX99QetLIALbx/Hd4l3ljxAIh3LL7cPJJM4qq";

export function isPreviewBrookeUsername(username: string) {
  return username.trim().toLowerCase() === PREVIEW_BROOKE_USERNAME;
}

export async function previewBrookePasswordMatches(password: string) {
  return verifyPassword(password, PREVIEW_BROOKE_PASSWORD_HASH);
}

export function previewBrookeSession(): SessionUser {
  return {
    id: PREVIEW_BROOKE_ID,
    username: PREVIEW_BROOKE_USERNAME,
    name: PREVIEW_BROOKE_NAME,
    role: "member",
    areas: ["luna-haus"],
    features: [],
  };
}
