import { eq, inArray } from "drizzle-orm";
import {
  USER_FEATURES_BLOB_PREFIX,
  isHubFeature,
  userFeaturesBlobKey,
  type HubFeature,
} from "./areas";
import { readyDb } from "./db/client";
import { softballState } from "./db/schema";
import { getSupabase, isSupabaseConfigured } from "./db/supabase";

export { mergeUserFeatures, userFeaturesBlobKey, USER_FEATURES_BLOB_PREFIX } from "./areas";

function featuresFromPayload(raw: unknown): HubFeature[] {
  if (Array.isArray(raw)) return raw.filter(isHubFeature);
  if (raw && typeof raw === "object") {
    const features = (raw as { features?: unknown }).features;
    if (Array.isArray(features)) return features.filter(isHubFeature);
  }
  return [];
}

function isMissingTable(message: string) {
  return /does not exist|schema cache/i.test(message);
}

export async function readUserFeaturesMap(userIds: string[]) {
  const map = new Map<string, HubFeature[]>();
  if (!userIds.length) return map;
  const keys = userIds.map(userFeaturesBlobKey);

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) return map;
    const result = await supabase.from("hub_softball_state").select("*").in("team_id", keys);
    if (result.error) {
      if (isMissingTable(result.error.message)) return map;
      throw new Error(result.error.message);
    }
    for (const row of result.data ?? []) {
      const key = String((row as { team_id?: string }).team_id || "");
      const userId = key.slice(USER_FEATURES_BLOB_PREFIX.length);
      if (!userId) continue;
      map.set(userId, featuresFromPayload((row as { payload?: unknown }).payload));
    }
    return map;
  }

  const db = await readyDb();
  const rows = await db.select().from(softballState).where(inArray(softballState.clubId, keys));
  for (const row of rows) {
    const userId = row.clubId.slice(USER_FEATURES_BLOB_PREFIX.length);
    if (!userId) continue;
    let payload: unknown = row.payload;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      payload = null;
    }
    map.set(userId, featuresFromPayload(payload));
  }
  return map;
}

export async function writeUserFeatures(userId: string, features: HubFeature[]) {
  const key = userFeaturesBlobKey(userId);
  const payload = { features: features.filter(isHubFeature) };
  const now = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase.from("hub_softball_state").upsert({
      team_id: key,
      payload,
      updated_at: now,
    });
    if (result.error) {
      throw new Error(
        isMissingTable(result.error.message)
          ? "Run supabase/softball-state.sql so People can save Wrist Coach."
          : result.error.message,
      );
    }
    return;
  }

  const db = await readyDb();
  await db.delete(softballState).where(eq(softballState.clubId, key));
  await db.insert(softballState).values({
    clubId: key,
    payload: JSON.stringify(payload),
    updatedAt: now,
  });
}

export async function deleteUserFeatures(userId: string) {
  const key = userFeaturesBlobKey(userId);
  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) return;
    const result = await supabase.from("hub_softball_state").delete().eq("team_id", key);
    if (result.error && !isMissingTable(result.error.message)) {
      throw new Error(result.error.message);
    }
    return;
  }
  const db = await readyDb();
  await db.delete(softballState).where(eq(softballState.clubId, key));
}
