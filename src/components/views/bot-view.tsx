"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { replyTo } from "@/lib/bot";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const chips = [
  "What's low?",
  "Fill Paul's order",
  "Draft Paul",
  "Monday ping",
];

export function BotView() {
  const store = useStore();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [store.messages.length]);

  function send(text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    store.addMessage("user", cleaned);
    const reply = replyTo(cleaned, store);
    if (reply.action.type === "fill-suggested") {
      store.stockSuggestedOrder(reply.action.supplierId);
    }
    if (reply.action.type === "add-product") {
      store.addToCart(
        reply.action.productId,
        reply.action.qty,
        reply.action.useSixPack,
      );
    }
    store.addMessage("bot", reply.text);
    setDraft("");
  }

  return (
    <div className="grid min-h-[70dvh] gap-4">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Purchasing bot</h1>
        <p className="text-sm text-muted-foreground">
          Same desk as the Grok Bot chat. Low stock, 6-packs, and the Monday
          ping.
        </p>
      </div>

      <ScrollArea className="h-[52dvh] rounded-2xl border border-border bg-card">
        <div className="grid gap-3 p-4">
          {store.messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[42rem] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {message.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Button key={chip} size="sm" variant="outline" onClick={() => send(chip)}>
            {chip}
          </Button>
        ))}
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask what’s low, or tell me to add 6 of 7N…"
          className="min-h-12 resize-none"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
        />
        <Button type="submit" size="icon" aria-label="Send">
          <Send />
        </Button>
      </form>
    </div>
  );
}
