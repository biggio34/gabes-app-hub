import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { softballContext } from "@/lib/softball";
import {
  preserveCoachPrivate,
  stripCoachPrivate,
} from "@/lib/softball-playing-time";

export const runtime = "nodejs";

type SoftballRow = {
  team_id: string;
  payload: Record<string, unknown> | null;
  updated_at: string;
};

function payloadPlayers(payload: Record<string, unknown> | null | undefined) {
  return Array.isArray(payload?.players) ? (payload.players as unknown[]) : [];
}

async function readStateRow(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  teamId: string,
) {
  return supabase.from("hub_softball_state").select("*").eq("team_id", teamId).maybeSingle();
}

async function requireSoftball() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  }
  const context = await softballContext(session);
  if (!context.canAccess) {
    return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  return { context };
}

export async function GET(request: Request) {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  const parentView =
    new URL(request.url).searchParams.get("view") === "parent";
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      state: stripCoachPrivate(null, parentView),
      team: auth.context,
    });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ state: null, team: auth.context });
  }
  const clubId = auth.context.clubId;
  let result = await readStateRow(supabase, clubId);
  const clubPlayers = payloadPlayers((result.data as SoftballRow | null)?.payload);
  if (
    clubPlayers.length === 0 &&
    auth.context.teamId &&
    auth.context.teamId !== clubId
  ) {
    const legacy = await readStateRow(supabase, auth.context.teamId);
    if (payloadPlayers((legacy.data as SoftballRow | null)?.payload).length > 0) {
      result = legacy;
    }
  }
  const { data, error } = result;
  if (error) {
    return NextResponse.json(
      {
        state: null,
        team: auth.context,
        error: /does not exist|schema cache/i.test(error.message)
          ? "Run supabase/softball-state.sql in the SQL editor."
          : error.message,
      },
      { status: 200 },
    );
  }
  const row = data as SoftballRow | null;
  return NextResponse.json({
    state: stripCoachPrivate(row?.payload ?? null, parentView),
    team: auth.context,
    updatedAt: row?.updated_at ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, localOnly: true });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ ok: true, localOnly: true });
  }
  const body = (await request.json().catch(() => null)) as {
    state?: Record<string, unknown>;
  } | null;
  if (!body?.state || typeof body.state !== "object") {
    return NextResponse.json({ error: "Missing softball data." }, { status: 400 });
  }
  const clubRow = await readStateRow(supabase, auth.context.clubId);
  const legacyRow =
    auth.context.teamId && auth.context.teamId !== auth.context.clubId
      ? await readStateRow(supabase, auth.context.teamId)
      : clubRow;
  let payload = preserveCoachPrivate(
    (clubRow.data as SoftballRow | null)?.payload ||
      (legacyRow.data as SoftballRow | null)?.payload,
    { ...body.state },
  );
  if (payloadPlayers(payload).length === 0) {
    const clubPlayers = payloadPlayers((clubRow.data as SoftballRow | null)?.payload);
    const legacyPlayers = payloadPlayers((legacyRow.data as SoftballRow | null)?.payload);
    const recovered = clubPlayers.length ? clubPlayers : legacyPlayers;
    if (recovered.length) {
      payload.players = recovered;
      const source = clubPlayers.length ? clubRow.data : legacyRow.data;
      const teams = (source as SoftballRow | null)?.payload?.teams;
      if ((!Array.isArray(payload.teams) || payload.teams.length === 0) && teams) {
        payload.teams = teams;
      }
    }
  }
  const { error } = await supabase.from("hub_softball_state").upsert({
    team_id: auth.context.clubId,
    payload,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json(
      {
        error: /does not exist|schema cache/i.test(error.message)
          ? "Run supabase/softball-state.sql in the SQL editor."
          : error.message,
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
