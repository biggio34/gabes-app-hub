import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { softballContext } from "@/lib/softball";

export const runtime = "nodejs";

type SoftballRow = {
  team_id: string;
  payload: Record<string, unknown> | null;
  updated_at: string;
};

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

export async function GET() {
  const auth = await requireSoftball();
  if (auth.error) return auth.error;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ state: null, team: auth.context });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ state: null, team: auth.context });
  }
  const clubId = auth.context.clubId;
  let result = await supabase
    .from("hub_softball_state")
    .select("*")
    .eq("team_id", clubId)
    .maybeSingle();
  if (!result.data && auth.context.teamId && auth.context.teamId !== clubId) {
    result = await supabase
      .from("hub_softball_state")
      .select("*")
      .eq("team_id", auth.context.teamId)
      .maybeSingle();
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
    state: row?.payload ?? null,
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
  const { error } = await supabase.from("hub_softball_state").upsert({
    team_id: auth.context.clubId,
    payload: body.state,
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
