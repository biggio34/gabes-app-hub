import { getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";

type Listener = (document: unknown) => void;

const channels = new Map<string, Set<Listener>>();

export function publishGameDocument(clubId: string, document: unknown) {
  const set = channels.get(clubId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(document);
    } catch {
      // A disconnected browser should not block the save.
    }
  }
}

export function subscribeGameDocument(clubId: string, listener: Listener) {
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

export function subscribeSupabaseGameDocuments(clubId: string, onDocument: (document: unknown) => void) {
  if (!isSupabaseConfigured() || !/^[A-Za-z0-9_-]+$/.test(clubId)) return () => {};
  const supabase = getSupabase();
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`game-manager-${clubId}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "hub_game_manager",
        filter: `club_id=eq.${clubId}`,
      },
      (payload) => {
        const row = payload.new as { payload?: unknown } | null;
        if (row && row.payload && typeof row.payload === "object") onDocument(row.payload);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
