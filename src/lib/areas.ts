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
