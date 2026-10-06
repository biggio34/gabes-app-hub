import { verifyPassword } from "./auth";
import type { SessionUser } from "./auth";
import { previewBrookeLoginEnabled } from "./preview-brooke-gate";

/**
 * Preview-only purchasing login. Same gate as brooke-test: deploy previews,
 * branch deploys, and local next dev. A production build rejects it.
 * Not a row in hub_users.
 */
export const PREVIEW_LHP_USERNAME = "lhp-test";
export const PREVIEW_LHP_NAME = "LHP (Test)";
export const PREVIEW_LHP_ID = "user-lhp-test";

const PREVIEW_LHP_PASSWORD_HASH =
  "$2b$10$V48NpYHUlhcbeRE.HwA0ie/y05plx/GFhBYJX46iBXin1g/UTFV8a";

export function isPreviewLhpUsername(username: string) {
  return username.trim().toLowerCase() === PREVIEW_LHP_USERNAME;
}

export async function previewLhpPasswordMatches(password: string) {
  return verifyPassword(password, PREVIEW_LHP_PASSWORD_HASH);
}

export function previewLhpSession(): SessionUser {
  return {
    id: PREVIEW_LHP_ID,
    username: PREVIEW_LHP_USERNAME,
    name: PREVIEW_LHP_NAME,
    role: "member",
    areas: ["luna-haus"],
    features: [],
  };
}

export function previewLhpLoginEnabled(hostHeader?: string | null) {
  return previewBrookeLoginEnabled(hostHeader);
}
