export const CAGE_CRUSH_BLOB_KEY = "cage-crush:week";
export const CAGE_CRUSH_TZ = "America/Chicago";
export const CAGE_CRUSH_BOARD_LIMIT = 25;

export type CageCrushEntry = {
  userId: string;
  name: string;
  score: number;
  at: number;
};

export type CageCrushBoard = {
  weekId: string;
  resetsAt: number;
  entries: CageCrushEntry[];
};

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type Wall = {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function chicagoWall(nowMs: number): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAGE_CRUSH_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    weekday: get("weekday"),
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

function addDays(year: number, month: number, day: number, extra: number) {
  const utc = Date.UTC(year, month - 1, day + extra);
  const next = new Date(utc);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

export function chicagoWallToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
) {
  let guess = Date.UTC(year, month - 1, day, hour + 6, minute, second);
  for (let i = 0; i < 4; i += 1) {
    const wall = chicagoWall(guess);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    const got = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    const delta = wanted - got;
    if (delta === 0) break;
    guess += delta;
  }
  return guess;
}

export function cageCrushWeek(nowMs = Date.now()) {
  const wall = chicagoWall(nowMs);
  const dow = WEEKDAY[wall.weekday] ?? 0;
  const pastReset =
    dow === 0 && (wall.hour > 23 || (wall.hour === 23 && wall.minute >= 59));
  const daysUntilSunday = pastReset ? 7 : (7 - dow) % 7;
  const end = addDays(wall.year, wall.month, wall.day, daysUntilSunday);
  const weekId = `${end.year}-${pad(end.month)}-${pad(end.day)}`;
  const resetsAt = chicagoWallToUtcMs(end.year, end.month, end.day, 23, 59, 0);
  return { weekId, resetsAt };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function emptyBoard(nowMs = Date.now()): CageCrushBoard {
  const week = cageCrushWeek(nowMs);
  return { weekId: week.weekId, resetsAt: week.resetsAt, entries: [] };
}

export function normalizeBoard(raw: unknown, nowMs = Date.now()): CageCrushBoard {
  const week = cageCrushWeek(nowMs);
  const item = asRecord(raw);
  if (!item || String(item.weekId || "") !== week.weekId) {
    return emptyBoard(nowMs);
  }
  const entries = (Array.isArray(item.entries) ? item.entries : [])
    .map((row) => {
      const rec = asRecord(row);
      if (!rec) return null;
      const userId = String(rec.userId || "").trim();
      const score = Math.round(Number(rec.score) || 0);
      if (!userId || score <= 0) return null;
      return {
        userId,
        name: String(rec.name || "Player").trim() || "Player",
        score: Math.min(99999, score),
        at: Number(rec.at) || nowMs,
      } satisfies CageCrushEntry;
    })
    .filter((row): row is CageCrushEntry => Boolean(row))
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, CAGE_CRUSH_BOARD_LIMIT);
  return { weekId: week.weekId, resetsAt: week.resetsAt, entries };
}

export function upsertWeeklyScore(
  board: CageCrushBoard,
  incoming: { userId: string; name: string; score: number },
  nowMs = Date.now(),
) {
  const next = normalizeBoard(board, nowMs);
  const score = Math.min(99999, Math.max(0, Math.round(Number(incoming.score) || 0)));
  if (!incoming.userId || score <= 0) return { board: next, improved: false };
  const existing = next.entries.find((row) => row.userId === incoming.userId);
  if (existing && score <= existing.score) {
    return { board: next, improved: false };
  }
  const entry: CageCrushEntry = {
    userId: incoming.userId,
    name: incoming.name.trim() || existing?.name || "Player",
    score,
    at: nowMs,
  };
  const entries = next.entries.filter((row) => row.userId !== incoming.userId);
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score || a.at - b.at);
  return {
    board: {
      ...next,
      entries: entries.slice(0, CAGE_CRUSH_BOARD_LIMIT),
    },
    improved: true,
  };
}

export function isCageCrushBlobKey(value: string) {
  return value === CAGE_CRUSH_BLOB_KEY;
}

export const SWING_SWEET_T = 0.82;
export const SWING_WINDOW = 0.3;

export function qualityFromT(t: number) {
  return Math.max(0, 1 - Math.abs(t - SWING_SWEET_T) / SWING_WINDOW);
}

export function sprayFromTiming(t: number, kind: string) {
  const delta = t - SWING_SWEET_T;
  if (kind === "foul") return delta < 0 ? -1.22 : 1.22;
  if (kind === "miss") return 0;
  if (Math.abs(delta) <= 0.035) return delta * 1.6;
  return Math.max(-1.05, Math.min(1.05, delta / 0.12));
}

export function flightLift(kind: string, t: number) {
  const onTime = Math.abs(t - SWING_SWEET_T) <= 0.045;
  if (kind === "homer") return onTime ? 128 : 108;
  if (kind === "triple") return onTime ? 96 : 76;
  if (kind === "double") return onTime ? 86 : 68;
  if (kind === "single") return onTime ? 74 : 56;
  return 32;
}

export function smashValue(cycleT: number) {
  const u = ((cycleT % 2) + 2) % 2;
  if (u <= 1) return u * u;
  const t = u - 1;
  return (1 - t) * (1 - t);
}

export function smashCarry(base: number, smash: number) {
  const s = Math.max(0, Math.min(1, smash));
  return base * (0.5 + s);
}

export function smashLaunch(base: number, smash: number) {
  const s = Math.max(0, Math.min(1, smash));
  return base * (0.75 + s * 0.7);
}

export function pitcherCanCatch(
  ball: { lift: number },
  flight: { kind: string; side: number },
) {
  if (ball.lift > 14) return false;
  if (flight.kind === "homer" || flight.kind === "triple" || flight.kind === "double") return false;
  if (Math.abs(flight.side) > 0.2) return false;
  return true;
}

export function swingWhy(
  hit: { kind: string; label: string },
  pitchName: string | undefined,
  t: number,
) {
  const name = pitchName ? pitchName.toLowerCase() : "pitch";
  if (hit.label === "TAKE") return "Took the pitch";
  const delta = t - SWING_SWEET_T;
  const abs = Math.abs(delta);
  const side = delta < 0 ? "early" : "late";
  const field = delta < 0 ? "left" : "right";
  if (hit.kind === "miss") {
    return (abs > 0.16 ? "Way " + side : side.charAt(0).toUpperCase() + side.slice(1)) + " on the " + name;
  }
  if (hit.kind === "foul" || hit.kind === "out") {
    return "Weak contact · " + (abs <= 0.07 ? "just off" : "a little " + side);
  }
  if (abs <= 0.035) return "Perfect · up the middle";
  if (abs <= 0.07) return "A hair " + side + " · " + field + " field";
  return "A little " + side + " · ripped to " + field;
}

export function airBallHitsFielder(
  ball: { x: number; y: number; lift: number; r: number },
  fielder: { x: number; y: number; scale: number },
) {
  if (ball.lift < 6) return false;
  const cx = fielder.x;
  const cy = fielder.y - 16 * fielder.scale;
  const reach = 18 * fielder.scale + ball.r;
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  return dx * dx + dy * dy <= reach * reach;
}
