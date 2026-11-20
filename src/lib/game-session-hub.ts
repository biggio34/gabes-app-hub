import { DEFAULT_SUPABASE_URL, supabaseUrl } from "@/lib/db/supabase";

type RevisionListener = (revision: number) => void;

const channels = new Map<string, Set<RevisionListener>>();

export function publishGameRevision(clubId: string, revision: number) {
  const set = channels.get(clubId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(revision);
    } catch {
      // A disconnected local listener should not block the save.
    }
  }
}

export function subscribeGameRevision(clubId: string, listener: RevisionListener) {
  let set = channels.get(clubId);
  if (!set) {
    set = new Set();
    channels.set(clubId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) channels.delete(clubId);
  };
}

function broadcastBase() {
  const override = process.env.GAME_SYNC_BROADCAST_URL;
  if (override) return override.replace(/\/$/, "");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return "";
  return (process.env.SUPABASE_URL || supabaseUrl() || DEFAULT_SUPABASE_URL).replace(/\/$/, "");
}

/**
 * Tell open browsers that a new revision exists. The message is only
 * `{ revision }`. Game data stays behind the signed-in hub API.
 * This is one short HTTP call inside the save request, not a held-open stream.
 */
export async function broadcastGameRevision(clubId: string, revision: number) {
  publishGameRevision(clubId, revision);
  if (!/^[A-Za-z0-9_-]+$/.test(clubId)) return;
  const base = broadcastBase();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || (process.env.GAME_SYNC_BROADCAST_URL ? "local-broadcast" : "");
  if (!base || !key) return;
  const topic = `game-manager:${clubId}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  try {
    const direct = await fetch(`${base}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/revision`, {
      method: "POST",
      headers,
      body: JSON.stringify({ revision }),
      signal: AbortSignal.timeout(2500),
    });
    if (direct.ok || direct.status === 202) return;
    if (direct.status !== 404 && direct.status !== 405) return;
    await fetch(`${base}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: [{ topic, event: "revision", payload: { revision }, private: false }],
      }),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // The save already landed. Phones catch up when they wake or on the slow fallback.
  }
}
