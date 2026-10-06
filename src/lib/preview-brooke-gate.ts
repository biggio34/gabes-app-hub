/**
 * Preview-only stand-in for Brooke. Not a row in hub_users.
 * On for local `next dev` and Netlify deploy previews / branch deploys.
 * Off when Netlify CONTEXT is production, including a production build
 * that does not inject CONTEXT at runtime.
 */
export function previewBrookeLoginEnabled() {
  const context = process.env["CONTEXT"] ?? "";
  if (context === "production") return false;
  if (context === "deploy-preview" || context === "branch-deploy") return true;
  return process.env["NODE_ENV"] !== "production";
}
