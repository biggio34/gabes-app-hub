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
