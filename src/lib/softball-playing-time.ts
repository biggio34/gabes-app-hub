type PlayingTimePayload = {
  version?: number;
  games?: unknown[];
  lockReasons?: unknown[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Parents never receive the coach reason log. */
export function stripCoachPrivate(
  state: Record<string, unknown> | null,
  parentView: boolean,
): Record<string, unknown> | null {
  if (!state || !parentView) return state;
  const playingTime = asRecord(state.playingTime);
  if (!playingTime) return state;
  const next = { ...playingTime };
  delete next.lockReasons;
  return { ...state, playingTime: next };
}

/**
 * Keep coach-only reasons when a parent (or older client) saves without that key.
 * Does not invent roster data — players/teams stay on the incoming payload.
 */
export function preserveCoachPrivate(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { ...incoming };
  const incomingPt = asRecord(payload.playingTime);
  const existingPt = asRecord(existing?.playingTime);
  if (
    incomingPt &&
    existingPt &&
    !Object.prototype.hasOwnProperty.call(incomingPt, "lockReasons") &&
    Array.isArray((existingPt as PlayingTimePayload).lockReasons)
  ) {
    payload.playingTime = {
      ...incomingPt,
      lockReasons: (existingPt as PlayingTimePayload).lockReasons,
    };
  }
  return payload;
}
