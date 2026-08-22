const TZ = "America/Chicago";

type Parts = {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function chicagoParts(date: Date): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function addDays(year: number, month: number, day: number, extra: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + extra));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

export function dateAtChicago(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour + 5, minute, 0));
  for (let i = 0; i < 16; i++) {
    const p = chicagoParts(guess);
    const have = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const want = Date.UTC(year, month - 1, day, hour, minute);
    const deltaMs = want - have;
    if (Math.abs(deltaMs) < 1000) return guess;
    guess = new Date(guess.getTime() + deltaMs);
  }
  return guess;
}

export function nextMondayNineCentral(from = new Date()): Date {
  const p = chicagoParts(from);
  const weekdayIndex = WEEKDAYS.indexOf(p.weekday);
  let add = (1 - weekdayIndex + 7) % 7;
  if (add === 0 && (p.hour > 9 || (p.hour === 9 && p.minute > 0))) {
    add = 7;
  }
  const target = addDays(p.year, p.month, p.day, add);
  return dateAtChicago(target.year, target.month, target.day, 9, 0);
}

export function isMondayMorningWindow(from = new Date()): boolean {
  const p = chicagoParts(from);
  return p.weekday === "Mon" && p.hour >= 8 && p.hour < 12;
}

export function formatChicago(date: Date, withTime = true) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(withTime
      ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
      : {}),
  }).format(date);
}

export function countdownLabel(target: Date, from = new Date()) {
  const ms = Math.max(0, target.getTime() - from.getTime());
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
