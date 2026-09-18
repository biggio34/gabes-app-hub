export const SCOREKEEPER_BLOB_PREFIX = "scorekeeper:";
export const SCOREKEEPER_MAX_GAMES = 40;

export function scorekeeperBlobKey(userId: string) {
  return `${SCOREKEEPER_BLOB_PREFIX}${String(userId || "").trim()}`;
}

export function isScorekeeperBlobKey(value: string) {
  return value.startsWith(SCOREKEEPER_BLOB_PREFIX);
}

export type ScorekeeperGame = {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  startedAt: number;
  endedAt?: number;
};

export type ScorekeeperStore = {
  userId: string;
  live: ScorekeeperGame | null;
  last: ScorekeeperGame | null;
  games: ScorekeeperGame[];
  updatedAt: number;
};

export function parseScore(value: unknown) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function cleanName(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
}

function stamp(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizeGame(raw: unknown, ended: boolean): ScorekeeperGame | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const home = cleanName(item.home);
  const away = cleanName(item.away);
  if (!home || !away) return null;
  const startedAt = stamp(item.startedAt) || Date.now();
  const id = String(item.id || "").trim() || `game-${startedAt}`;
  const game: ScorekeeperGame = {
    id,
    home,
    away,
    homeScore: parseScore(item.homeScore),
    awayScore: parseScore(item.awayScore),
    startedAt,
  };
  if (ended) {
    game.endedAt = stamp(item.endedAt) || startedAt;
  }
  return game;
}

function byEndedAt(left: ScorekeeperGame, right: ScorekeeperGame) {
  return (right.endedAt || right.startedAt) - (left.endedAt || left.startedAt);
}

export function mergeGames(left: ScorekeeperGame[], right: ScorekeeperGame[]) {
  const byId = new Map<string, ScorekeeperGame>();
  [...left, ...right].forEach((game) => {
    const existing = byId.get(game.id);
    if (!existing) {
      byId.set(game.id, game);
      return;
    }
    const existingAt = existing.endedAt || existing.startedAt;
    const nextAt = game.endedAt || game.startedAt;
    if (nextAt >= existingAt) byId.set(game.id, game);
  });
  return [...byId.values()].sort(byEndedAt).slice(0, SCOREKEEPER_MAX_GAMES);
}

export function emptyScorekeeperStore(userId: string, now = Date.now()): ScorekeeperStore {
  return {
    userId,
    live: null,
    last: null,
    games: [],
    updatedAt: now,
  };
}

export function storeIsEmpty(store: ScorekeeperStore) {
  return !store.live && !store.last && store.games.length === 0;
}

export function normalizeStore(raw: unknown, userId: string, now = Date.now()): ScorekeeperStore {
  const empty = emptyScorekeeperStore(userId, now);
  if (!raw || typeof raw !== "object") return empty;
  const item = raw as Record<string, unknown>;
  const live = normalizeGame(item.live, false);
  const last = normalizeGame(item.last, true);
  const gamesRaw = Array.isArray(item.games) ? item.games : [];
  const games = mergeGames(
    gamesRaw.map((game) => normalizeGame(game, true)).filter((game): game is ScorekeeperGame => !!game),
    last ? [last] : [],
  );
  return {
    userId,
    live,
    last,
    games,
    updatedAt: stamp(item.updatedAt) || now,
  };
}

export function mergeStores(server: ScorekeeperStore, local: ScorekeeperStore, userId: string, now = Date.now()) {
  const live =
    server.live && local.live
      ? (server.updatedAt >= local.updatedAt ? server.live : local.live)
      : server.live || local.live;
  const last =
    server.last && local.last
      ? (server.updatedAt >= local.updatedAt ? server.last : local.last)
      : server.last || local.last;
  return normalizeStore(
    {
      live,
      last,
      games: mergeGames(server.games, local.games),
      updatedAt: Math.max(server.updatedAt, local.updatedAt, now),
    },
    userId,
    now,
  );
}
