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

export type PitchSpot = "inside" | "middle" | "outside";
export type PlateZone = "out-front" | "front-plate" | "mid-plate" | "late";

export const PLATE_FRONT = 0.76;
export const PLATE_MIDDLE = 0.88;
export const FLIGHT_SPEED = 0.36;
export const HR_SMASH = 0.78;
export const HR_MATCH = 0.55;
export const IDEAL_CONTACT: Record<PitchSpot, number> = {
  inside: 0.7,
  middle: 0.82,
  outside: 0.91,
};
export const SPOT_SHIFT: Record<PitchSpot, number> = {
  inside: -32,
  middle: 0,
  outside: 32,
};

export function qualityFromT(t: number) {
  return Math.max(0, 1 - Math.abs(t - SWING_SWEET_T) / SWING_WINDOW);
}

export function pickPitchSpot(rand = Math.random): PitchSpot {
  const roll = rand();
  if (roll < 1 / 3) return "inside";
  if (roll < 2 / 3) return "middle";
  return "outside";
}

export function plateZone(t: number): PlateZone {
  if (t < PLATE_FRONT) return "out-front";
  if (t <= PLATE_MIDDLE) return "front-plate";
  if (t <= 0.98) return "mid-plate";
  return "late";
}

export function contactMatch(t: number, spot: PitchSpot) {
  const zone = plateZone(t);
  if (spot === "inside") {
    if (zone === "out-front") return 1;
    if (zone === "front-plate") return 0.68;
    return 0.22;
  }
  if (spot === "outside") {
    if (zone === "mid-plate") return 1;
    if (zone === "front-plate") return 0.68;
    if (zone === "out-front") return 0.22;
    return 0.4;
  }
  if (zone === "front-plate") return 1;
  if (zone === "out-front" || zone === "mid-plate") return 0.58;
  return 0.28;
}

export function canHomer(smash: number, match: number) {
  return smash >= HR_SMASH && match >= HR_MATCH;
}

export function pitchCall(name: string, spot?: PitchSpot) {
  return (spot ? spot.toUpperCase() + " " : "") + name;
}

export function sprayFromTiming(t: number, kind: string) {
  if (kind === "foul") return t < SWING_SWEET_T ? -1.22 : 1.22;
  if (kind === "miss") return 0;
  if (t < PLATE_FRONT) return Math.max(-1.05, -0.42 - (PLATE_FRONT - t) * 4);
  if (t <= PLATE_MIDDLE) return (t - SWING_SWEET_T) * 0.45;
  return Math.min(1.05, 0.4 + (t - PLATE_MIDDLE) * 4);
}

export function sprayFromSpot(t: number, spot: PitchSpot, kind: string) {
  if (kind === "foul") return t < IDEAL_CONTACT[spot] ? -1.22 : 1.22;
  if (kind === "miss") return 0;
  if (spot === "outside" && t < PLATE_FRONT) {
    return Math.max(-1.05, -0.55 - (PLATE_FRONT - t) * 3);
  }
  if (spot === "inside" && t > PLATE_MIDDLE) {
    return Math.min(0.85, 0.18 + (t - PLATE_MIDDLE) * 2);
  }
  const match = contactMatch(t, spot);
  const ideal = spot === "inside" ? -0.78 : spot === "outside" ? 0.78 : 0;
  const timing = sprayFromTiming(t, kind);
  const mixed = ideal * match + timing * (1 - match);
  return Math.max(-1.12, Math.min(1.12, mixed));
}

export function flightMaxDepth(dist: number) {
  return Math.max(0.28, Math.min(1.18, dist / 260));
}

export function flightLift(kind: string, t: number, spot?: PitchSpot) {
  const ideal = spot ? IDEAL_CONTACT[spot] : SWING_SWEET_T;
  const onTime = Math.abs(t - ideal) <= 0.045;
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

export type SwingKind = "miss" | "foul" | "out" | "single" | "double" | "triple" | "homer";

export type SwingEval = {
  kind: SwingKind;
  label: string;
  pts: number;
  out: boolean;
  dist: number;
  side: number;
  why: string;
  match: number;
};

export function swingWhy(
  hit: { kind: string; label: string },
  pitchName: string | undefined,
  t: number,
  spot?: PitchSpot,
) {
  const name = pitchName ? pitchName.toLowerCase() : "pitch";
  if (hit.label === "TAKE") return "Took the pitch";
  const delta = t - SWING_SWEET_T;
  const abs = Math.abs(delta);
  const side = delta < 0 ? "early" : "late";
  const zone = plateZone(t);
  if (hit.kind === "miss") {
    return (abs > 0.16 ? "Way " + side : side.charAt(0).toUpperCase() + side.slice(1)) + " on the " + name;
  }
  if (hit.label === "CAUGHT") return "Caught in the air";
  if (spot === "outside" && zone === "out-front") return "Rolled over the outside pitch";
  if (spot === "inside" && (zone === "mid-plate" || zone === "late")) {
    return "Jammed on the inside pitch";
  }
  if (hit.kind === "foul" || hit.kind === "out") {
    return "Weak contact · " + (abs <= 0.07 ? "just off" : "a little " + side);
  }
  if (spot === "inside" && zone === "out-front") return "Inside · out front · left";
  if (spot === "middle" && zone === "front-plate") return "Middle · front of the plate";
  if (spot === "outside" && zone === "mid-plate") return "Outside · mid-plate · right";
  if (t < PLATE_FRONT) return "Out in front · left field";
  if (t <= PLATE_MIDDLE) return "Front of the plate · up the middle";
  return "Middle of the plate · right field";
}

export function evaluateSwing(opts: {
  t: number;
  spot: PitchSpot;
  smash: number;
  streak?: number;
  pitchId?: string;
  pitchName?: string;
}): SwingEval {
  const t = opts.t;
  const spot = opts.spot;
  const smash = Math.max(0, Math.min(1, opts.smash));
  const streak = opts.streak || 0;
  const nearBall = Math.max(0, 1 - Math.abs(t - SWING_SWEET_T) / 0.34);
  const match = contactMatch(t, spot);
  const name = opts.pitchName;

  if (nearBall < 0.12) {
    const miss: SwingEval = {
      kind: "miss",
      label: "WHIFF",
      pts: 0,
      out: true,
      dist: 0,
      side: 0,
      why: "",
      match,
    };
    miss.why = swingWhy(miss, name, t, spot);
    return miss;
  }

  let juice = (0.22 + 0.78 * match) * (0.4 + 0.6 * smash);
  if (opts.pitchId === "fb" || opts.pitchId === "rs") juice += 0.03;
  if (match < 0.45) juice = Math.min(juice, 0.52);

  let kind: SwingKind;
  let label: string;
  let pts: number;
  let out: boolean;
  let baseDist: number;

  if (juice < 0.28) {
    kind = "foul";
    label = "FOUL";
    pts = 0;
    out = false;
    baseDist = 40 + juice * 40;
  } else if (juice < 0.4) {
    kind = "out";
    label = "WEAK OUT";
    pts = 0;
    out = true;
    baseDist = 70 + juice * 50;
  } else if (canHomer(smash, match) && juice >= 0.7) {
    kind = "homer";
    label = "GONE";
    pts = 12 + Math.round(20 + juice * 30) + streak * 3;
    out = false;
    baseDist = 280 + juice * 40;
  } else if (juice < 0.55) {
    kind = "single";
    label = "SINGLE";
    pts = 2 + streak;
    out = false;
    baseDist = 120 + juice * 40;
  } else if (juice < 0.68) {
    kind = "double";
    label = "DOUBLE";
    pts = 4 + streak * 2;
    out = false;
    baseDist = 180 + juice * 40;
  } else if (juice < 0.82) {
    kind = "triple";
    label = "GAP TRIPLE";
    pts = 7 + streak * 2;
    out = false;
    baseDist = 230 + juice * 30;
  } else {
    kind = "homer";
    label = "GONE";
    pts = 12 + Math.round(20 + juice * 30) + streak * 3;
    out = false;
    baseDist = 280 + juice * 40;
  }

  const dist = smashCarry(baseDist, smash * (0.45 + 0.55 * match));
  return {
    kind,
    label,
    pts,
    out,
    dist,
    side: sprayFromSpot(t, spot, kind),
    why: swingWhy({ kind, label }, name, t, spot),
    match,
  };
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
