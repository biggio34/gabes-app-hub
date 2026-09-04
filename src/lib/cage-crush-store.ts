import { eq } from "drizzle-orm";
import { readyDb } from "@/lib/db/client";
import { softballState } from "@/lib/db/schema";
import { getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import {
  CAGE_CRUSH_BLOB_KEY,
  normalizeBoard,
  upsertWeeklyScore,
  type CageCrushBoard,
} from "@/lib/cage-crush";

function isMissingTable(message: string) {
  return /does not exist|schema cache/i.test(message);
}

async function readRaw() {
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) return { payload: null as unknown, stored: "supabase" as const };
    const result = await supabase
      .from("hub_softball_state")
      .select("*")
      .eq("team_id", CAGE_CRUSH_BLOB_KEY)
      .maybeSingle();
    if (result.error) {
      if (isMissingTable(result.error.message)) {
        return { payload: null as unknown, stored: "supabase" as const };
      }
      throw new Error(result.error.message);
    }
    const row = result.data as { payload?: unknown } | null;
    return { payload: row?.payload ?? null, stored: "supabase" as const };
  }

  const db = await readyDb();
  const rows = await db.select().from(softballState).where(eq(softballState.clubId, CAGE_CRUSH_BLOB_KEY));
  const row = rows[0];
  return {
    payload: row ? (JSON.parse(row.payload) as unknown) : null,
    stored: "sqlite" as const,
  };
}

async function writeBoard(board: CageCrushBoard, stored: "supabase" | "sqlite") {
  const now = new Date().toISOString();
  if (stored === "supabase" || isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.from("hub_softball_state").upsert({
      team_id: CAGE_CRUSH_BLOB_KEY,
      payload: board,
      updated_at: now,
    });
    if (result.error) {
      throw new Error(
        isMissingTable(result.error.message)
          ? "Run supabase/softball-state.sql so Cage Crush can save."
          : result.error.message,
      );
    }
    return { stored: "supabase" as const, board };
  }

  const db = await readyDb();
  await db.delete(softballState).where(eq(softballState.clubId, CAGE_CRUSH_BLOB_KEY));
  await db.insert(softballState).values({
    clubId: CAGE_CRUSH_BLOB_KEY,
    payload: JSON.stringify(board),
    updatedAt: now,
  });
  return { stored: "sqlite" as const, board };
}

export async function readCageCrushBoard(nowMs = Date.now()) {
  const raw = await readRaw();
  return {
    board: normalizeBoard(raw.payload, nowMs),
    stored: raw.stored,
  };
}

export async function submitCageCrushScore(
  incoming: { userId: string; name: string; score: number },
  nowMs = Date.now(),
) {
  const raw = await readRaw();
  const current = normalizeBoard(raw.payload, nowMs);
  const next = upsertWeeklyScore(current, incoming, nowMs);
  if (!next.improved) {
    return { stored: raw.stored, board: current, improved: false };
  }
  const saved = await writeBoard(next.board, raw.stored);
  return { ...saved, improved: true };
}
