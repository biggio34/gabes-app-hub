import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { requireGameManager } from "@/lib/game-session-auth";
import { subscribeGameRevision } from "@/lib/game-session-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Local-dev stand-in for the Realtime revision ping. Production Game Manager
 * does not call this. When Supabase is configured the route refuses the stream
 * so a serverless function is not held open.
 */
export async function GET(request: Request) {
  if (isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Game Manager live updates use Supabase Realtime. This stream is for local dev only." },
      { status: 404 },
    );
  }
  const auth = await requireGameManager();
  if ("error" in auth && auth.error) return auth.error;
  const clubId = auth.clubId;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const unsubscribe = subscribeGameRevision(clubId, (revision) => {
        send("revision", { revision });
      });
      const abort = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      request.signal.addEventListener("abort", abort);
      send("ready", {});
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
