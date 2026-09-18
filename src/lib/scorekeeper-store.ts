import { eq } from "drizzle-orm";
import { readyDb } from "@/lib/db/client";
import { softballState } from "@/lib/db/schema";
import { getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { normalizeStore, scorekeeperBlobKey, type ScorekeeperStore } from "@/lib/scorekeeper";

function isMissingTable(message: string) {
  return /does not exist|schema cache/i.test(message);
}

export async function readScorekeeperStore(userId: string) {
  const key = scorekeeperBlobKey(userId);
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      return {
        store: normalizeStore(null, userId),
        stored: "supabase" as const,
        updatedAt: null as string | null,
      };
    }
    const result = await supabase.from("hub_softball_state").select("*").eq("team_id", key).maybeSingle();
    if (result.error) {
      if (isMissingTable(result.error.message)) {
        return {
          store: normalizeStore(null, userId),
          stored: "supabase" as const,
          updatedAt: null as string | null,
        };
      }
      throw new Error(result.error.message);
    }
    const row = result.data as { payload?: unknown; updated_at?: string } | null;
    return {
      store: normalizeStore(row?.payload, userId),
      stored: "supabase" as const,
      updatedAt: row?.updated_at ?? null,
    };
  }

  const db = await readyDb();
  const rows = await db.select().from(softballState).where(eq(softballState.clubId, key));
  const row = rows[0];
  const payload = row ? (JSON.parse(row.payload) as unknown) : null;
  return {
    store: normalizeStore(payload, userId),
    stored: "sqlite" as const,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function writeScorekeeperStore(userId: string, incoming: unknown) {
  const store: ScorekeeperStore = normalizeStore(incoming, userId);
  store.userId = userId;
  store.updatedAt = Date.now();
  const key = scorekeeperBlobKey(userId);
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.from("hub_softball_state").upsert({
      team_id: key,
      payload: store,
      updated_at: now,
    });
    if (result.error) {
      throw new Error(
        isMissingTable(result.error.message)
          ? "Run supabase/softball-state.sql so Scorekeeper can save."
          : result.error.message,
      );
    }
    return { ok: true as const, stored: "supabase" as const, store };
  }

  const db = await readyDb();
  await db.delete(softballState).where(eq(softballState.clubId, key));
  await db.insert(softballState).values({
    clubId: key,
    payload: JSON.stringify(store),
    updatedAt: now,
  });
  return { ok: true as const, stored: "sqlite" as const, store };
}
