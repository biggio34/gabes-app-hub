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

/** Extra Softball tools. Stored in user_areas, not a top-level hub area. */
export const HUB_FEATURES = ["wrist-coach"] as const;
export type HubFeature = (typeof HUB_FEATURES)[number];
export const WRIST_COACH_FEATURE: HubFeature = "wrist-coach";

export function isHubFeature(value: string): value is HubFeature {
  return (HUB_FEATURES as readonly string[]).includes(value);
}

export function wristCoachAllowed(user: {
  role: string;
  areas: readonly string[];
  features?: readonly string[];
}) {
  if (user.role === "owner") return true;
  return user.areas.includes("softball") && (user.features ?? []).includes(WRIST_COACH_FEATURE);
}
