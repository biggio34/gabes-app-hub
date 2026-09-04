import { eq } from "drizzle-orm";
import { readyDb } from "@/lib/db/client";
import { softballState } from "@/lib/db/schema";
import { getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { normalizeBook, wristCoachBlobKey, type WristBook } from "@/lib/wrist-coach";

function isMissingTable(message: string) {
  return /does not exist|schema cache/i.test(message);
}

export async function readWristCoachBook(userId: string, title?: string) {
  const key = wristCoachBlobKey(userId);
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) {
      return { book: normalizeBook(null, userId, title), stored: "supabase" as const, updatedAt: null as string | null };
    }
    const result = await supabase.from("hub_softball_state").select("*").eq("team_id", key).maybeSingle();
    if (result.error) {
      if (isMissingTable(result.error.message)) {
        return { book: normalizeBook(null, userId, title), stored: "supabase" as const, updatedAt: null as string | null };
      }
      throw new Error(result.error.message);
    }
    const row = result.data as { payload?: unknown; updated_at?: string } | null;
    return {
      book: normalizeBook(row?.payload, userId, title),
      stored: "supabase" as const,
      updatedAt: row?.updated_at ?? null,
    };
  }

  const db = await readyDb();
  const rows = await db.select().from(softballState).where(eq(softballState.clubId, key));
  const row = rows[0];
  const payload = row ? (JSON.parse(row.payload) as unknown) : null;
  return {
    book: normalizeBook(payload, userId, title),
    stored: "sqlite" as const,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function writeWristCoachBook(userId: string, incoming: unknown, title?: string) {
  const book = normalizeBook(incoming, userId, title);
  book.userId = userId;
  book.updatedAt = Date.now();
  const key = wristCoachBlobKey(userId);
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.from("hub_softball_state").upsert({
      team_id: key,
      payload: book,
      updated_at: now,
    });
    if (result.error) {
      throw new Error(
        isMissingTable(result.error.message)
          ? "Run supabase/softball-state.sql so Wrist Coach can save."
          : result.error.message,
      );
    }
    return { ok: true as const, stored: "supabase" as const, book };
  }

  const db = await readyDb();
  await db.delete(softballState).where(eq(softballState.clubId, key));
  await db.insert(softballState).values({
    clubId: key,
    payload: JSON.stringify(book),
    updatedAt: now,
  });
  return { ok: true as const, stored: "sqlite" as const, book };
}

export function isWristCoachBlobKey(value: string) {
  return value.startsWith("wrist-coach:");
}
