import { requireGameManager } from "@/lib/game-session-auth";
import { subscribeGameDocument, subscribeSupabaseGameDocuments } from "@/lib/game-session-hub";
import { isSupabaseConfigured } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
      const unsubscribeLocal = subscribeGameDocument(clubId, (document) => {
        send("document", { document });
      });
      const unsubscribeRemote = isSupabaseConfigured()
        ? subscribeSupabaseGameDocuments(clubId, (document) => {
            send("document", { document });
          })
        : () => {};
      const ping = setInterval(() => send("ping", {}), 15000);
      const abort = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribeLocal();
        unsubscribeRemote();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      request.signal.addEventListener("abort", abort);
      send("ready", { clubId });
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
