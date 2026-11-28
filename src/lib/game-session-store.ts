import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
import { readyDb } from "@/lib/db/client";
import { gameManagerState } from "@/lib/db/schema";
import { DEFAULT_SUPABASE_URL, getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { isMissingSchemaError } from "@/lib/softball-write-helpers";
import { broadcastGameRevision } from "@/lib/game-session-hub";

const require = createRequire(import.meta.url);
const GameManager = require("../../content/shared/game-manager.js") as {
  emptyDocument: () => GameDocument;
  normalizeDocument: (raw: unknown) => GameDocument;
  stampDocument: (doc: GameDocument, revision: number, opId: string, now: number) => GameDocument;
};

type GameDocument = {
  revision: number;
  updatedAt: number;
  appliedOpIds: string[];
  active: { teamId: string; gameId: string } | null;
  teams: Record<string, unknown>;
};

function anonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

function withRealtime<T extends object>(clubId: string, result: T) {
  const key = anonKey();
  if (!key) return result;
  return Object.assign({}, result, {
    realtime: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
      anonKey: key,
      clubId,
    },
  });
}

function syncOffResult() {
  return {
    document: GameManager.emptyDocument(),
    revision: 0,
    updatedAt: null as string | null,
    stored: "supabase" as const,
    sync: "off" as const,
    live: "none" as const,
    conflict: false as const,
  };
}

function emptyResult(stored: "supabase" | "sqlite") {
  return {
    document: GameManager.emptyDocument(),
    revision: 0,
    updatedAt: null as string | null,
    stored,
    sync: "on" as const,
    live: stored === "supabase" ? "broadcast" as const : "sse" as const,
  };
}

function stampIncoming(incoming: unknown, revision: number) {
  const normalized = GameManager.normalizeDocument(incoming);
  return GameManager.stampDocument(normalized, revision, "", Date.now());
}

export async function readGameDocument(clubId: string) {
  if (isSupabaseConfigured()) {
    if (!anonKey()) return syncOffResult();
    const supabase = getSupabase();
    if (!supabase) return syncOffResult();
    const result = await supabase.from("hub_game_manager").select("*").eq("club_id", clubId).maybeSingle();
    if (result.error) {
      if (isMissingSchemaError(result.error.message)) return syncOffResult();
      throw new Error(result.error.message);
    }
    const row = result.data as { payload?: unknown; revision?: number; updated_at?: string } | null;
    if (!row) return withRealtime(clubId, emptyResult("supabase"));
    const document = GameManager.normalizeDocument(row.payload);
    document.revision = Number(row.revision) || document.revision;
    return withRealtime(clubId, {
      document,
      revision: document.revision,
      updatedAt: row.updated_at ?? null,
      stored: "supabase" as const,
      sync: "on" as const,
      live: "broadcast" as const,
    });
  }

  const db = await readyDb();
  const rows = await db.select().from(gameManagerState).where(eq(gameManagerState.clubId, clubId));
  const row = rows[0];
  if (!row) return emptyResult("sqlite");
  const document = GameManager.normalizeDocument(JSON.parse(row.payload) as unknown);
  document.revision = row.revision;
  return {
    document,
    revision: row.revision,
    updatedAt: row.updatedAt,
    stored: "sqlite" as const,
    sync: "on" as const,
    live: "sse" as const,
  };
}

export async function writeGameDocument(clubId: string, expectedRevision: number, incoming: unknown) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("Missing revision.");
  }
  if (isSupabaseConfigured()) {
    if (!anonKey()) return syncOffResult();
    return writeSupabase(clubId, expectedRevision, incoming);
  }
  return writeSqlite(clubId, expectedRevision, incoming);
}

async function writeSqlite(clubId: string, expectedRevision: number, incoming: unknown) {
  const db = await readyDb();
  const now = new Date().toISOString();
  const result = await db.transaction(async (tx) => {
    const rows = await tx.select().from(gameManagerState).where(eq(gameManagerState.clubId, clubId));
    const row = rows[0];
    const currentRevision = row ? row.revision : 0;
    const currentDoc = row
      ? GameManager.normalizeDocument(JSON.parse(row.payload) as unknown)
      : GameManager.emptyDocument();
    if (currentRevision !== expectedRevision) {
      currentDoc.revision = currentRevision;
      return {
        conflict: true as const,
        document: currentDoc,
        revision: currentRevision,
        updatedAt: row?.updatedAt ?? null,
        stored: "sqlite" as const,
        sync: "on" as const,
        live: "sse" as const,
      };
    }
    const stamped = stampIncoming(incoming, expectedRevision + 1);
    const payload = JSON.stringify(stamped);
    if (row) {
      await tx
        .update(gameManagerState)
        .set({ payload, revision: stamped.revision, updatedAt: now })
        .where(eq(gameManagerState.clubId, clubId));
    } else {
      await tx.insert(gameManagerState).values({
        clubId,
        payload,
        revision: stamped.revision,
        updatedAt: now,
      });
    }
    return {
      conflict: false as const,
      document: stamped,
      revision: stamped.revision,
      updatedAt: now,
      stored: "sqlite" as const,
      sync: "on" as const,
      live: "sse" as const,
    };
  });
  if (!result.conflict) await broadcastGameRevision(clubId, result.revision);
  return result;
}

async function writeSupabase(clubId: string, expectedRevision: number, incoming: unknown) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  const now = new Date().toISOString();
  const stamped = stampIncoming(incoming, expectedRevision + 1);
  const updated = await supabase
    .from("hub_game_manager")
    .update({
      payload: stamped,
      revision: stamped.revision,
      updated_at: now,
    })
    .eq("club_id", clubId)
    .eq("revision", expectedRevision)
    .select()
    .maybeSingle();
  if (updated.error) {
    if (isMissingSchemaError(updated.error.message)) return syncOffResult();
    throw new Error(updated.error.message);
  }
  if (updated.data) {
    await broadcastGameRevision(clubId, stamped.revision);
    return {
      conflict: false as const,
      document: stamped,
      revision: stamped.revision,
      updatedAt: now,
      stored: "supabase" as const,
      sync: "on" as const,
      live: "broadcast" as const,
    };
  }

  if (expectedRevision === 0) {
    const inserted = await supabase
      .from("hub_game_manager")
      .insert({
        club_id: clubId,
        payload: stamped,
        revision: stamped.revision,
        updated_at: now,
      })
      .select()
      .maybeSingle();
    if (!inserted.error && inserted.data) {
      await broadcastGameRevision(clubId, stamped.revision);
      return {
        conflict: false as const,
        document: stamped,
        revision: stamped.revision,
        updatedAt: now,
        stored: "supabase" as const,
        sync: "on" as const,
        live: "broadcast" as const,
      };
    }
    if (inserted.error && isMissingSchemaError(inserted.error.message)) return syncOffResult();
  }

  const current = await readGameDocument(clubId);
  if (current.sync === "off") return syncOffResult();
  return {
    conflict: true as const,
    document: current.document,
    revision: current.revision,
    updatedAt: current.updatedAt,
    stored: "supabase" as const,
    sync: "on" as const,
    live: "broadcast" as const,
  };
}
