/**
 * Preview-only stand-in for Brooke. Not a row in hub_users.
 *
 * Netlify sets CONTEXT while the site builds, and does not inject it into
 * the Next.js server function. A runtime read of process.env.CONTEXT is
 * therefore empty on deploy previews, and NODE_ENV is "production" there
 * too, so the gate used to stay shut. next.config.ts copies CONTEXT into
 * NETLIFY_CONTEXT, which Next inlines into this module at build time.
 * The request host is a second signal when that value is missing.
 */

const PRODUCTION_HOST = "gabes-app-hub.netlify.app";
const PREVIEW_HOST_SUFFIX = `--${PRODUCTION_HOST}`;

function readNetlifyContext() {
  // Dot access so Next replaces this with the build-time CONTEXT string.
  // That copy wins: a production build stays "production" even if a runtime
  // CONTEXT variable is added later.
  const inlined = (process.env.NETLIFY_CONTEXT ?? "").trim();
  if (inlined) return inlined;
  return (process.env["CONTEXT"] ?? "").trim();
}

function hostNames(hostHeader: string) {
  return hostHeader
    .split(",")
    .map((part) => part.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean);
}

function isProductionHost(host: string) {
  return host === PRODUCTION_HOST;
}

function isPreviewHost(host: string) {
  return host.endsWith(PREVIEW_HOST_SUFFIX) && host.length > PREVIEW_HOST_SUFFIX.length;
}

export function previewRequestHost(request: {
  url: string;
  headers: { get(name: string): string | null };
}) {
  let urlHost = "";
  try {
    urlHost = new URL(request.url).host;
  } catch {
    urlHost = "";
  }
  return [request.headers.get("x-forwarded-host"), request.headers.get("host"), urlHost]
    .filter((part) => !!part?.trim())
    .join(",");
}

export function previewBrookeLoginEnabled(hostHeader?: string | null) {
  const context = readNetlifyContext();
  if (context === "production") return false;
  if (context === "deploy-preview" || context === "branch-deploy") return true;

  const hosts = hostNames(hostHeader ?? "");
  if (hosts.some(isProductionHost)) return false;
  if (hosts.some(isPreviewHost)) return true;

  return process.env["NODE_ENV"] !== "production";
}
