/**
 * Durable softball person identity + season chapters.
 *
 * player.id is the People/player id. It never resets across years.
 * Jersey number is NOT part of that id. It lives on the season chapter.
 * player.number is only this year's roster number (the current chapter).
 */

export const INJURY_STATUSES = ["", "available", "limited", "out"] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

export const PLAYER_CARD_FIELDS = [
  "strengths",
  "developmentFocus",
  "notes",
  "injuryStatus",
  "lastParentConference",
] as const;

export type PlayerCard = {
  strengths: string;
  developmentFocus: string;
  notes: string;
  injuryStatus: InjuryStatus;
  lastParentConference: string;
};

export type SeasonChapter = {
  id: string;
  year: number;
  seasonKey: string;
  teamId: string | null;
  teamName: string;
  number: string;
  position: string;
  position2: string;
  tryoutId: string | null;
  tryoutName: string;
  recommendation: string | null;
  scores: Record<string, number>;
  evalNotes: string;
  card: PlayerCard;
  publishedAt: number | null;
  publishedBy: string | null;
  source: "roster" | "publish" | "prior";
};

export type JsonPlayer = Record<string, unknown> & {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  number?: string;
  position?: string;
  position2?: string;
  birthdate?: string;
  assignedTeamId?: string | null;
  card?: PlayerCard | Record<string, unknown>;
  seasons?: SeasonChapter[] | unknown[];
  scores?: Record<string, number>;
  recommendation?: string | null;
  evalNotes?: string;
  evalTryoutId?: string | null;
};

export type JsonTryout = Record<string, unknown> & {
  id?: string;
  name?: string;
  date?: string;
  evaluations?: Record<string, JsonEval>;
  published?: Record<string, unknown> | null;
};

export type JsonEval = {
  scores?: Record<string, number>;
  recommendation?: string | null;
  notes?: string;
  updatedAt?: number;
};

export type SoftballIdentityState = Record<string, unknown> & {
  players?: JsonPlayer[];
  teams?: { id?: string; name?: string }[];
  tryouts?: JsonTryout[];
  currentSeasonYear?: number;
};

export type PublishInput = {
  tryoutId: string;
  teamId: string;
  teamName: string;
  year?: number;
  jerseys?: Record<string, string>;
  publishedBy?: string;
  publishedAt?: number;
};

const COACH_NOTE_PLACEHOLDER = "";

export function currentSeasonYear(now = new Date()) {
  return now.getUTCFullYear();
}

export function seasonKeyForYear(year: number) {
  return String(year);
}

export function yearFromDate(value: unknown, fallback = currentSeasonYear()) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})/);
  if (match) return Number(match[1]);
  return fallback;
}

export function emptyCard(): PlayerCard {
  return {
    strengths: "",
    developmentFocus: "",
    notes: "",
    injuryStatus: "",
    lastParentConference: "",
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return value == null ? "" : String(value);
}

function asScores(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, number>;
  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) next[key] = n;
  }
  return next;
}

export function normalizeInjuryStatus(value: unknown): InjuryStatus {
  const raw = asString(value).trim().toLowerCase();
  if (raw === "available" || raw === "limited" || raw === "out") return raw;
  return "";
}

export function normalizeCard(raw: unknown): PlayerCard {
  const src = asRecord(raw);
  return {
    strengths: asString(src.strengths).trim(),
    developmentFocus: asString(src.developmentFocus ?? src.development_focus).trim(),
    notes: asString(src.notes),
    injuryStatus: normalizeInjuryStatus(src.injuryStatus ?? src.injury_status),
    lastParentConference: asString(src.lastParentConference ?? src.last_parent_conference).trim(),
  };
}

export function mergeCards(preferred: unknown, other: unknown): PlayerCard {
  const left = normalizeCard(preferred);
  const right = normalizeCard(other);
  return {
    strengths: left.strengths || right.strengths,
    developmentFocus: left.developmentFocus || right.developmentFocus,
    notes: left.notes || right.notes,
    injuryStatus: left.injuryStatus || right.injuryStatus,
    lastParentConference: left.lastParentConference || right.lastParentConference,
  };
}

function seasonId(year: number, existing?: string) {
  if (existing && String(existing).trim()) return String(existing);
  return `season_${year}`;
}

export function normalizeSeason(raw: unknown): SeasonChapter | null {
  const src = asRecord(raw);
  const year = Number(src.year);
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  const key = asString(src.seasonKey).trim() || seasonKeyForYear(year);
  const source = src.source;
  return {
    id: seasonId(year, asString(src.id)),
    year,
    seasonKey: key,
    teamId: src.teamId ? asString(src.teamId) : null,
    teamName: asString(src.teamName),
    number: asString(src.number),
    position: asString(src.position),
    position2: asString(src.position2),
    tryoutId: src.tryoutId ? asString(src.tryoutId) : null,
    tryoutName: asString(src.tryoutName),
    recommendation: src.recommendation ? asString(src.recommendation) : null,
    scores: asScores(src.scores),
    evalNotes: asString(src.evalNotes),
    card: normalizeCard(src.card),
    publishedAt: typeof src.publishedAt === "number" ? src.publishedAt : src.publishedAt ? Number(src.publishedAt) || null : null,
    publishedBy: src.publishedBy ? asString(src.publishedBy) : null,
    source: source === "publish" || source === "prior" || source === "roster" ? source : "roster",
  };
}

export function normalizeSeasons(raw: unknown): SeasonChapter[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, SeasonChapter>();
  for (const item of raw) {
    const season = normalizeSeason(item);
    if (!season) continue;
    byKey.set(season.seasonKey, season);
  }
  return [...byKey.values()].sort((a, b) => b.year - a.year);
}

export function mergeSeasonLists(current: unknown, incoming: unknown): SeasonChapter[] {
  const byKey = new Map<string, SeasonChapter>();
  for (const season of normalizeSeasons(current)) {
    byKey.set(season.seasonKey, season);
  }
  for (const season of normalizeSeasons(incoming)) {
    const existing = byKey.get(season.seasonKey);
    if (!existing) {
      byKey.set(season.seasonKey, season);
      continue;
    }
    byKey.set(season.seasonKey, {
      ...existing,
      ...season,
      id: existing.id || season.id,
      year: season.year || existing.year,
      seasonKey: existing.seasonKey,
      number: season.number !== "" ? season.number : existing.number,
      position: season.position || existing.position,
      position2: season.position2 || existing.position2,
      teamId: season.teamId || existing.teamId,
      teamName: season.teamName || existing.teamName,
      tryoutId: season.tryoutId || existing.tryoutId,
      tryoutName: season.tryoutName || existing.tryoutName,
      recommendation: season.recommendation || existing.recommendation,
      scores: Object.keys(season.scores).length ? season.scores : existing.scores,
      evalNotes: season.evalNotes || existing.evalNotes,
      card: mergeCards(season.card, existing.card),
      publishedAt: season.publishedAt || existing.publishedAt,
      publishedBy: season.publishedBy || existing.publishedBy,
      source: season.source || existing.source,
    });
  }
  return [...byKey.values()].sort((a, b) => b.year - a.year);
}

/** Name + birthdate only. Jersey number is never part of the person id. */
export function personIdentityKey(player: JsonPlayer | null | undefined) {
  if (!player) return "";
  const first = asString(player.firstName).trim();
  const last = asString(player.lastName).trim();
  const name = `${first} ${last}`.trim() || asString(player.name).trim();
  const normalized = name.toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized === "unnamed") return "";
  return `${normalized}|${asString(player.birthdate).trim()}`;
}

export function durablePlayerId(player: JsonPlayer | null | undefined) {
  return player?.id != null && String(player.id).trim() ? String(player.id) : "";
}

export function upsertSeasonChapter(
  seasons: SeasonChapter[],
  patch: Partial<SeasonChapter> & { year: number },
): SeasonChapter[] {
  const year = Number(patch.year);
  if (!Number.isFinite(year)) return normalizeSeasons(seasons);
  const key = patch.seasonKey || seasonKeyForYear(year);
  const existing = normalizeSeasons(seasons).find((item) => item.seasonKey === key);
  const next: SeasonChapter = {
    id: existing?.id || patch.id || seasonId(year),
    year,
    seasonKey: key,
    teamId: patch.teamId !== undefined && patch.teamId ? patch.teamId : existing?.teamId || null,
    teamName:
      patch.teamName !== undefined && asString(patch.teamName).trim()
        ? asString(patch.teamName)
        : existing?.teamName || "",
    number: patch.number !== undefined ? asString(patch.number) : existing?.number || "",
    position: patch.position !== undefined ? asString(patch.position) : existing?.position || "",
    position2: patch.position2 !== undefined ? asString(patch.position2) : existing?.position2 || "",
    tryoutId: patch.tryoutId !== undefined ? patch.tryoutId : existing?.tryoutId || null,
    tryoutName: patch.tryoutName !== undefined ? asString(patch.tryoutName) : existing?.tryoutName || "",
    recommendation:
      patch.recommendation !== undefined ? patch.recommendation : existing?.recommendation || null,
    scores: patch.scores ? asScores(patch.scores) : existing?.scores || {},
    evalNotes: patch.evalNotes !== undefined ? asString(patch.evalNotes) : existing?.evalNotes || "",
    card: normalizeCard(patch.card || existing?.card),
    publishedAt: patch.publishedAt !== undefined ? patch.publishedAt : existing?.publishedAt || null,
    publishedBy: patch.publishedBy !== undefined ? patch.publishedBy : existing?.publishedBy || null,
    source: patch.source || existing?.source || "roster",
  };
  return mergeSeasonLists(
    normalizeSeasons(seasons).filter((item) => item.seasonKey !== key),
    [next],
  );
}

export function seasonYearForState(state: SoftballIdentityState | null | undefined, fallbackDate?: unknown) {
  if (state && Number.isFinite(Number(state.currentSeasonYear))) {
    return Number(state.currentSeasonYear);
  }
  return yearFromDate(fallbackDate, currentSeasonYear());
}

export function teamNameFromState(
  state: SoftballIdentityState | null | undefined,
  teamId: string | null | undefined,
) {
  if (!teamId) return "";
  const team = (state?.teams || []).find((item) => item && item.id === teamId);
  return team?.name || "";
}

/**
 * Keep this year's chapter in sync with the live roster row.
 * Other years are left alone, including their jersey numbers.
 */
export function touchCurrentSeason(
  player: JsonPlayer,
  opts: {
    year: number;
    teamName?: string;
    source?: SeasonChapter["source"];
  },
): JsonPlayer {
  const year = opts.year;
  const seasons = normalizeSeasons(player.seasons);
  const teamId = player.assignedTeamId ? String(player.assignedTeamId) : null;
  const next = upsertSeasonChapter(seasons, {
    year,
    teamId,
    teamName: opts.teamName || "",
    number: asString(player.number),
    position: asString(player.position),
    position2: asString(player.position2),
    card: normalizeCard(player.card),
    source: opts.source || "roster",
  });
  return { ...player, seasons: next, card: normalizeCard(player.card) };
}

export function updatePlayerCard(player: JsonPlayer, patch: Partial<PlayerCard>): JsonPlayer {
  const card = { ...normalizeCard(player.card), ...normalizeCard(patch) };
  return { ...player, card };
}

export function addPriorSeason(
  player: JsonPlayer,
  patch: Partial<SeasonChapter> & { year: number },
  currentYear = currentSeasonYear(),
): JsonPlayer {
  const seasons = upsertSeasonChapter(normalizeSeasons(player.seasons), {
    ...patch,
    source: patch.source || "prior",
  });
  const next: JsonPlayer = { ...player, seasons, card: normalizeCard(player.card) };
  if (patch.year === currentYear && patch.number !== undefined) {
    next.number = asString(patch.number);
  }
  return next;
}

export function mergePlayerIdentity(preferred: JsonPlayer, other?: JsonPlayer | null): JsonPlayer {
  const base = { ...(other || {}), ...preferred };
  const preferredId = durablePlayerId(preferred);
  const otherId = durablePlayerId(other);
  base.id = preferredId || otherId || base.id;
  base.card = mergeCards(preferred.card, other?.card);
  base.seasons = mergeSeasonLists(other?.seasons, preferred.seasons);
  if (preferred.number !== undefined) base.number = asString(preferred.number);
  else if (other?.number !== undefined) base.number = asString(other.number);
  return base;
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripCardNotes(card: PlayerCard): PlayerCard {
  return { ...card, notes: COACH_NOTE_PLACEHOLDER };
}

export function stripCoachOnlyNotes<T extends SoftballIdentityState>(state: T): T {
  const next = cloneState(state);
  next.players = (next.players || []).map((player) => {
    const card = normalizeCard(player.card);
    const seasons = normalizeSeasons(player.seasons).map((season) => ({
      ...season,
      card: stripCardNotes(season.card),
    }));
    return { ...player, card: stripCardNotes(card), seasons };
  });
  return next;
}

export function preserveCoachOnlyNotes(
  current: SoftballIdentityState | null | undefined,
  incoming: SoftballIdentityState,
  opts?: { canEditCoachNotes?: boolean },
): SoftballIdentityState {
  const next = cloneState(incoming);
  const currentById = new Map(
    (current?.players || []).filter((player) => durablePlayerId(player)).map((player) => [
      durablePlayerId(player),
      player,
    ]),
  );
  next.players = (next.players || []).map((player) => {
    const existing = currentById.get(durablePlayerId(player));
    const incomingCard = normalizeCard(player.card);
    const existingCard = normalizeCard(existing?.card);
    const canEdit = opts?.canEditCoachNotes === true;
    const card = {
      ...incomingCard,
      notes: canEdit ? incomingCard.notes : existingCard.notes,
    };
    const incomingSeasons = normalizeSeasons(player.seasons);
    const existingSeasons = normalizeSeasons(existing?.seasons);
    const seasons = mergeSeasonLists(existingSeasons, incomingSeasons).map((season) => {
      const prior = existingSeasons.find((item) => item.seasonKey === season.seasonKey);
      if (canEdit) return season;
      return {
        ...season,
        card: { ...season.card, notes: prior?.card.notes || season.card.notes || "" },
      };
    });
    return {
      ...player,
      id: durablePlayerId(player) || durablePlayerId(existing) || player.id,
      card,
      seasons,
    };
  });
  return next;
}

export function applyIdentityOnWrite(
  current: SoftballIdentityState | null | undefined,
  incoming: SoftballIdentityState,
  opts?: { canEditCoachNotes?: boolean; year?: number },
): SoftballIdentityState {
  const year = opts?.year || seasonYearForState(incoming) || seasonYearForState(current);
  const preserved = preserveCoachOnlyNotes(current, incoming, opts);
  const currentById = new Map(
    (current?.players || []).filter((player) => durablePlayerId(player)).map((player) => [
      durablePlayerId(player),
      player,
    ]),
  );
  preserved.players = (preserved.players || []).map((player) => {
    const existing = currentById.get(durablePlayerId(player));
    const merged = existing ? mergePlayerIdentity(player, existing) : { ...player, card: normalizeCard(player.card), seasons: normalizeSeasons(player.seasons) };
    const teamName = teamNameFromState(preserved, merged.assignedTeamId ? String(merged.assignedTeamId) : null);
    return touchCurrentSeason(merged, { year, teamName });
  });
  if (preserved.currentSeasonYear == null) preserved.currentSeasonYear = year;
  return preserved;
}

export type PublishResult = {
  state: SoftballIdentityState;
  year: number;
  tryoutId: string;
  teamId: string;
  assignedPlayerIds: string[];
  decisionCounts: Record<string, number>;
};

export function publishTryoutToRoster(
  state: SoftballIdentityState,
  input: PublishInput,
): PublishResult {
  const next = cloneState(state);
  const tryout = (next.tryouts || []).find((item) => item && item.id === input.tryoutId);
  if (!tryout) {
    throw new Error("That tryout was not found.");
  }
  const year = input.year || yearFromDate(tryout.date, seasonYearForState(next));
  const publishedAt = input.publishedAt || Date.now();
  const evaluations = tryout.evaluations && typeof tryout.evaluations === "object" ? tryout.evaluations : {};
  const assignedPlayerIds: string[] = [];
  const decisionCounts: Record<string, number> = { offer: 0, waitlist: 0, look: 0, pass: 0, none: 0 };
  const playersById = new Map(
    (next.players || []).filter((player) => durablePlayerId(player)).map((player) => [
      durablePlayerId(player),
      player,
    ]),
  );

  for (const [playerId, evaluation] of Object.entries(evaluations)) {
    const player = playersById.get(playerId);
    if (!player) continue;
    const rec = evaluation?.recommendation ? String(evaluation.recommendation) : "";
    if (rec) decisionCounts[rec] = (decisionCounts[rec] || 0) + 1;
    else decisionCounts.none += 1;

    const jerseyFromPublish = input.jerseys && Object.prototype.hasOwnProperty.call(input.jerseys, playerId)
      ? asString(input.jerseys[playerId]).trim()
      : "";
    const thisSeasonNumber =
      rec === "offer"
        ? jerseyFromPublish || asString(player.number)
        : asString(player.number);

    if (rec === "offer") {
      player.assignedTeamId = input.teamId;
      player.number = thisSeasonNumber;
      assignedPlayerIds.push(playerId);
    }

    const seasons = upsertSeasonChapter(normalizeSeasons(player.seasons), {
      year,
      teamId: rec === "offer" ? input.teamId : player.assignedTeamId ? String(player.assignedTeamId) : null,
      teamName: rec === "offer" ? input.teamName : teamNameFromState(next, player.assignedTeamId ? String(player.assignedTeamId) : null),
      number: rec === "offer" ? thisSeasonNumber : asString(player.number),
      position: asString(player.position),
      position2: asString(player.position2),
      tryoutId: String(tryout.id),
      tryoutName: asString(tryout.name),
      recommendation: rec || null,
      scores: asScores(evaluation?.scores),
      evalNotes: asString(evaluation?.notes),
      card: normalizeCard(player.card),
      publishedAt,
      publishedBy: input.publishedBy || null,
      source: "publish",
    });
    player.seasons = seasons;
    player.card = normalizeCard(player.card);
    player.id = playerId;
  }

  tryout.published = {
    at: publishedAt,
    year,
    teamId: input.teamId,
    teamName: input.teamName,
    assignedPlayerIds,
    publishedBy: input.publishedBy || null,
  };
  tryout.updatedAt = publishedAt;
  next.currentSeasonYear = year;
  next.players = next.players || [];
  return {
    state: next,
    year,
    tryoutId: String(tryout.id),
    teamId: input.teamId,
    assignedPlayerIds,
    decisionCounts,
  };
}

export function canSeeCoachNotes(role: string | null | undefined) {
  return role === "owner";
}
