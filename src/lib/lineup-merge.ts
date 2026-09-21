type JsonRecord = Record<string, unknown> & { id?: string; updatedAt?: unknown; lastUpdated?: unknown };

function asRecords(value: unknown) {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

function recordUpdatedAt(item: JsonRecord | null | undefined) {
  if (!item) return 0;
  const raw = item.updatedAt != null ? item.updatedAt : item.lastUpdated;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) return asNum;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function noIdRecordKey(item: JsonRecord) {
  try {
    return JSON.stringify(item);
  } catch {
    return "";
  }
}

function gameContentUpdatedAt(item: JsonRecord | null | undefined) {
  if (!item) return 0;
  const raw = item.contentUpdatedAt;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) return asNum;
  return recordUpdatedAt(item);
}

function removedGameIdsOf(record: Record<string, unknown> | null | undefined) {
  const ids = Array.isArray(record?.removedGameIds) ? record.removedGameIds : [];
  return ids.map((id) => String(id || "")).filter(Boolean);
}

function mergeGameLists(current: unknown, incoming: unknown, removed: Set<string>) {
  const byId = new Map<string, JsonRecord>();
  const noId: JsonRecord[] = [];
  const seenNoId = new Set<string>();
  const ingest = (list: unknown) => {
    for (const item of asRecords(list)) {
      if (!item || typeof item !== "object") continue;
      const id = item.id != null ? String(item.id) : "";
      if (id && removed.has(id)) continue;
      if (!id) {
        const key = noIdRecordKey(item);
        if (key && seenNoId.has(key)) continue;
        if (key) seenNoId.add(key);
        noId.push(item);
        continue;
      }
      const existing = byId.get(id);
      if (!existing || gameContentUpdatedAt(item) >= gameContentUpdatedAt(existing)) {
        byId.set(id, item);
      }
    }
  };
  ingest(current);
  ingest(incoming);
  return [...byId.values(), ...noId];
}

export function mergeLineupMaps(current: unknown, incoming: unknown) {
  const left =
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, Record<string, unknown>>)
      : {};
  const right =
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
      ? (incoming as Record<string, Record<string, unknown>>)
      : {};
  const next: Record<string, Record<string, unknown>> = {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const teamId of keys) {
    const local = left[teamId] || {};
    const remote = right[teamId] || {};
    const localAt = recordUpdatedAt(local as JsonRecord);
    const remoteAt = recordUpdatedAt(remote as JsonRecord);
    const newer = remoteAt >= localAt ? remote : local;
    const older = newer === remote ? local : remote;
    const removed = new Set([...removedGameIdsOf(local), ...removedGameIdsOf(remote)]);
    const games = mergeGameLists(local.games, remote.games, removed);
    let currentGameId = (newer.currentGameId || older.currentGameId || null) as string | null;
    if (currentGameId && !games.some((game) => String(game.id) === String(currentGameId))) {
      currentGameId = games[0]?.id != null ? String(games[0].id) : null;
    }
    next[teamId] = {
      version: 2,
      games,
      currentGameId,
      removedGameIds: [...removed],
      teamName: String(newer.teamName || older.teamName || ""),
      lastUpdated: Math.max(localAt, remoteAt),
    };
  }
  return next;
}

export function payloadWithLineup(
  current: Record<string, unknown> | null | undefined,
  lineupTeamId: string,
  lineup: unknown,
) {
  const payload = { ...(current || {}) };
  payload.lineups = mergeLineupMaps(payload.lineups, { [lineupTeamId]: lineup });
  payload.updatedAt = Date.now();
  return payload;
}
