import type { Area } from "./areas";

export type HubApp = {
  slug: string;
  file: string;
  title: string;
  description: string;
  area: Area;
  href?: string;
  external?: boolean;
};

export const hubApps: HubApp[] = [
  {
    slug: "financial-calcs",
    file: "financial-calcs.html",
    title: "Financial Calcs",
    description:
      "Net/gross pay, tax distributions, bi-weekly to monthly, and this year’s retirement contribution rules.",
    area: "financial",
  },
  {
    slug: "calculator",
    file: "calculator.html",
    title: "Calculator",
    description:
      "Big-button calculator with history, scientific functions, memory, and keyboard support.",
    area: "financial",
  },
  {
    slug: "practice-planner",
    file: "practice-planner.html",
    title: "16U Practice Planner",
    description:
      "Drill library, drag-and-drop plans, timeline, and one-page PDF export for MN Elks 16U.",
    area: "softball",
  },
  {
    slug: "lineup",
    file: "lineup.html",
    title: "16U Lineup Builder",
    description: "Positions, batting order, and export for the 16U team.",
    area: "softball",
  },
  {
    slug: "team-formation",
    file: "team-formation.html",
    title: "Team Formation",
    description:
      "Import players, form age-group teams, and use tryout averages plus Offer/Waitlist tags.",
    area: "softball",
  },
  {
    slug: "tryout-evaluator",
    file: "tryout-evaluator.html",
    title: "Tryout Evaluator",
    description:
      "Score tryouts and share the roster with Team Formation.",
    area: "softball",
  },
  {
    slug: "luna-haus-salon",
    file: "luna-haus-salon.html",
    title: "Salon Desk",
    description:
      "Services and prices, tip split, and a local daily walk-in list.",
    area: "luna-haus",
  },
  {
    slug: "luna-haus-social",
    file: "luna-haus-social.html",
    title: "Social Sync",
    description:
      "Copy the latest Luna Haus Facebook post to Google Business. Needs the local sync bot.",
    area: "luna-haus",
  },
  {
    slug: "book-online",
    file: "",
    title: "Book Online",
    description: "Live GlossGenius booking for Luna Haus in St. Michael.",
    area: "luna-haus",
    href: "https://lunahaussalon.glossgenius.com/",
    external: true,
  },
];

export const pathRewrites: Record<string, string> = {
  "/financial-calcs/": "/apps/financial-calcs",
  "/financial-calcs": "/apps/financial-calcs",
  "/calculator/": "/apps/calculator",
  "/calculator": "/apps/calculator",
  "/minnesota-elks-practice-planner/": "/apps/practice-planner",
  "/minnesota-elks-practice-planner": "/apps/practice-planner",
  "/elks-lineup/": "/apps/lineup",
  "/elks-lineup": "/apps/lineup",
  "/mn-elks-team-formation/": "/apps/team-formation",
  "/mn-elks-team-formation": "/apps/team-formation",
  "/softball-tryout-evaluator/": "/apps/tryout-evaluator",
  "/softball-tryout-evaluator": "/apps/tryout-evaluator",
  "/luna-haus-salon/": "/apps/luna-haus-salon",
  "/luna-haus-salon": "/apps/luna-haus-salon",
  "/luna-haus-social/": "/apps/luna-haus-social",
  "/luna-haus-social": "/apps/luna-haus-social",
};

export function rewriteAppHtml(html: string) {
  let next = html;
  for (const [from, to] of Object.entries(pathRewrites)) {
    next = next.replaceAll(`href='${from}'`, `href='${to}'`);
    next = next.replaceAll(`href="${from}"`, `href="${to}"`);
  }
  next = next.replaceAll("../shared/elks-data.js", "/shared/elks-data.js");
  next = next.replaceAll("../sample-roster-import.csv", "/shared/sample-roster-import.csv");
  next = next.replaceAll("../index.html", "/");
  return next;
}
