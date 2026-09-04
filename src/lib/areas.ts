export const AREAS = ["financial", "softball", "luna-haus"] as const;

export type Area = (typeof AREAS)[number];

export type Role = "owner" | "member";

export const areaMeta: Record<
  Area,
  { label: string; blurb: string; accent: string }
> = {
  financial: {
    label: "Financial",
    blurb: "Advisory calculators and your number-crunching desk.",
    accent: "emerald",
  },
  softball: {
    label: "Softball",
    blurb: "MN Elks club and 16U team tools.",
    accent: "red",
  },
  "luna-haus": {
    label: "Luna Haus Salon",
    blurb: "Salon desk, booking, and supply orders.",
    accent: "rose",
  },
};

export function isArea(value: string): value is Area {
  return (AREAS as readonly string[]).includes(value);
}

/** Extra Softball tools. Stored in a sibling softball_state / hub_softball_state blob. */
export const HUB_FEATURES = ["wrist-coach"] as const;
export type HubFeature = (typeof HUB_FEATURES)[number];
export const WRIST_COACH_FEATURE: HubFeature = "wrist-coach";

export function isHubFeature(value: string): value is HubFeature {
  return (HUB_FEATURES as readonly string[]).includes(value);
}

/** Areas and extra tools stored together in user_areas / hub_user_areas. */
export function areaAndFeatureLinks(user: {
  areas?: readonly string[] | null;
  features?: readonly string[] | null;
}) {
  return {
    areas: (user.areas ?? []).filter(isArea),
    features: (user.features ?? []).filter(isHubFeature),
  };
}

export const USER_FEATURES_BLOB_PREFIX = "user-features:";

export function userFeaturesBlobKey(userId: string) {
  return `${USER_FEATURES_BLOB_PREFIX}${userId}`;
}

export function mergeUserFeatures(
  fromAreas: readonly string[] | null | undefined,
  fromBlob: readonly string[] | null | undefined,
): HubFeature[] {
  return [...new Set([...(fromAreas ?? []), ...(fromBlob ?? [])].filter(isHubFeature))];
}

export function wristCoachAllowed(user: {
  role: string;
  areas: readonly string[];
  features?: readonly string[];
}) {
  if (user.role === "owner") return true;
  return user.areas.includes("softball") && (user.features ?? []).includes(WRIST_COACH_FEATURE);
}
