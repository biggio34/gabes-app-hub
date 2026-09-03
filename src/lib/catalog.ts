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
    slug: "roster",
    file: "roster.html",
    title: "Team Roster",
    description:
      "Shared People/player list. Open a girl for her card and season history on one id that never resets. Positions stay on the player. Jersey number is per season.",
    area: "softball",
  },
  {
    slug: "practice-planner",
    file: "practice-planner.html",
    title: "Practice Planner",
    description:
      "Drill library and practice plans with optional parallel stations for the team you pick from People.",
    area: "softball",
  },
  {
    slug: "lineup",
    file: "lineup.html",
    title: "Lineup Builder",
    description: "Game lineups from the Team Roster for the team you pick.",
    area: "softball",
  },
  {
    slug: "team-formation",
    file: "team-formation.html",
    title: "Team Formation",
    description:
      "Put shared-roster players onto the teams from People, using tryout scores.",
    area: "softball",
  },
  {
    slug: "tryout-evaluator",
    file: "tryout-evaluator.html",
    title: "Tryout Evaluator",
    description:
      "Score tryouts. Offer/Waitlist/Pass stay as decisions. Owner Publish writes Offers onto Team Roster on the same People ids.",
    area: "softball",
  },
  {
    slug: "supply-orders",
    file: "",
    title: "Supply Orders",
    description:
      "Request inventory and track it from pending to received, including out of stock.",
    area: "luna-haus",
    href: "/salon/orders",
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
  "/roster/": "/apps/roster",
  "/roster": "/apps/roster",
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
