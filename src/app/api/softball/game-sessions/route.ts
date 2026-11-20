import { NextResponse } from "next/server";
import { requireGameManager } from "@/lib/game-session-auth";
import { readGameDocument, writeGameDocument } from "@/lib/game-session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireGameManager();
  if ("error" in auth && auth.error) return auth.error;
  try {
    const result = await readGameDocument(auth.clubId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read Game Manager." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireGameManager();
  if ("error" in auth && auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as {
    expectedRevision?: unknown;
    document?: unknown;
  } | null;
  if (!body || typeof body.document !== "object" || body.document == null) {
    return NextResponse.json({ error: "Missing Game Manager data." }, { status: 400 });
  }
  if (typeof body.expectedRevision !== "number" || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) {
    return NextResponse.json({ error: "Missing revision." }, { status: 400 });
  }
  try {
    const result = await writeGameDocument(auth.clubId, body.expectedRevision, body.document);
    if (result.conflict) {
      return NextResponse.json(
        {
          conflict: true,
          document: result.document,
          revision: result.revision,
          updatedAt: result.updatedAt,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      conflict: false,
      document: result.document,
      revision: result.revision,
      updatedAt: result.updatedAt,
      stored: result.stored,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save Game Manager." },
      { status: 400 },
    );
  }
}
