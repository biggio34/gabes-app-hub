export function isoTimestamp(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromMs = new Date(value);
    if (!Number.isNaN(fromMs.getTime())) return fromMs.toISOString();
  }
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 1e11) {
    const fromMs = new Date(asNum);
    if (!Number.isNaN(fromMs.getTime())) return fromMs.toISOString();
  }
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return fallback;
}

export function missingPlayerColumn(message: string) {
  const column =
    message.match(/Could not find the '([^']+)' column/i)?.[1] ||
    message.match(/column "([^"]+)" of relation/i)?.[1] ||
    message.match(/column "([^"]+)" does not exist/i)?.[1] ||
    "";
  return column || null;
}

export function isMissingSchemaError(message: string) {
  return /does not exist|schema cache|PGRST204|PGRST205/i.test(message);
}
