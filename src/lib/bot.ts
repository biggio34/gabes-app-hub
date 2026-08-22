import {
  money,
  restockQty,
  stockStatus,
  supplierLabel,
  unitPrice,
} from "./catalog";
import { buildOrderDraft, reminderEmail } from "./email";
import {
  countdownLabel,
  formatChicago,
  isMondayMorningWindow,
  nextMondayNineCentral,
} from "./reminder";
import type { AppState, Product } from "./types";

export type BotAction =
  | { type: "fill-suggested"; supplierId?: Product["supplierId"] }
  | { type: "add-product"; productId: string; qty: number; useSixPack: boolean }
  | { type: "none" };

export type BotReply = {
  text: string;
  action: BotAction;
};

function lowItems(state: AppState) {
  return state.products
    .filter((product) => stockStatus(product) !== "ok")
    .sort((a, b) => a.onHand - b.onHand || a.name.localeCompare(b.name));
}

function findProducts(state: AppState, query: string) {
  const q = query.toLowerCase();
  return state.products.filter((product) => {
    const hay = `${product.name} ${product.brand} ${product.sku ?? ""}`.toLowerCase();
    return q.split(/\s+/).every((token) => hay.includes(token));
  });
}

function listLow(state: AppState) {
  const items = lowItems(state);
  if (items.length === 0) {
    return "Nothing is below par. Floor is covered until the next color-heavy week.";
  }
  const lines = items
    .slice(0, 12)
    .map((product) => {
      const qty = restockQty(product, true);
      const pack = product.sixPackPrice != null ? `, 6-pack to ${qty}` : `, order ${qty}`;
      return `• ${product.brand} ${product.name} — ${product.onHand} on hand / par ${product.par}${pack}`;
    })
    .join("\n");
  const extra =
    items.length > 12 ? `\n…and ${items.length - 12} more on Inventory.` : "";
  return `${items.length} item${items.length === 1 ? "" : "s"} need a restock:\n${lines}${extra}`;
}

export function replyTo(input: string, state: AppState): BotReply {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { text: "Say what’s low, draft Paul, or Monday ping.", action: { type: "none" } };
  }

  if (/(help|what can you|commands)/.test(lower)) {
    return {
      text: "I can:\n• tell you what’s low\n• fill Paul’s Beauty Bell cart with 6-packs\n• draft the email to Paul\n• write the Monday 9 Central ping\n• add a product to the order if you name it\n• show the next reminder time",
      action: { type: "none" },
    };
  }

  if (/(monday|reminder|ping|9 central|nine central)/.test(lower)) {
    const next = nextMondayNineCentral();
    const email = reminderEmail(state.settings, lowItems(state).length);
    const due = isMondayMorningWindow()
      ? "It’s Monday morning Central — this is the window."
      : `Next ping: ${formatChicago(next)} (${countdownLabel(next)}).`;
    return {
      text: `${due}\n\nSubject: ${email.subject}\n\n${email.body}`,
      action: { type: "none" },
    };
  }

  if (/(draft|email|write).*(paul|order|beauty|ebw)|email paul|send paul/.test(lower)) {
    const draft = buildOrderDraft(
      state.products,
      state.cart,
      state.settings,
      "beautybell",
    );
    if (draft.lines.length === 0) {
      return {
        text: "The Beauty Bell cart is empty. I can fill it with everything below par, then draft Paul.",
        action: { type: "none" },
      };
    }
    return {
      text: `Draft for ${state.settings.supplierName}:\n\nSubject: ${draft.subject}\n\n${draft.body}`,
      action: { type: "none" },
    };
  }

  if (/(fill|build|suggest|restock|order this|what should i order|weekly order)/.test(lower)) {
    const supplierId = /saloncentric|redken/.test(lower)
      ? "saloncentric"
      : /paul|beauty|avyna|tailor|ebw/.test(lower)
        ? "beautybell"
        : "beautybell";
    const low = lowItems(state).filter((product) => product.supplierId === supplierId);
    if (low.length === 0) {
      return {
        text: `${supplierLabel[supplierId]} is at par. Nothing to add.`,
        action: { type: "none" },
      };
    }
    return {
      text: `Filling the ${supplierLabel[supplierId]} cart with 6-pack restocks for ${low.length} low item${low.length === 1 ? "" : "s"}. Open Order to review and email.`,
      action: { type: "fill-suggested", supplierId },
    };
  }

  if (/(what's low|whats low|low stock|below par|out of|need to order)/.test(lower)) {
    return { text: listLow(state), action: { type: "none" } };
  }

  const addMatch = lower.match(
    /(?:add|order|put)\s+(\d+|a|one|six|a six[- ]pack)?\s*(.+)/,
  );
  if (addMatch) {
    const qtyToken = addMatch[1] ?? "1";
    const name = addMatch[2].replace(/\bto (the )?(cart|order)\b/g, "").trim();
    const matches = findProducts(state, name);
    if (matches.length === 1) {
      const product = matches[0];
      const useSix =
        /six|6-pack|6 pack/.test(qtyToken + lower) && product.sixPackPrice != null;
      const qty =
        qtyToken === "six" || useSix
          ? 6
          : qtyToken === "a" || qtyToken === "one" || !qtyToken
            ? 1
            : Number(qtyToken);
      return {
        text: `Added ${qty} × ${product.brand} ${product.name} at ${money(unitPrice(product, useSix))} each${useSix ? " (6-pack)" : ""}.`,
        action: {
          type: "add-product",
          productId: product.id,
          qty: Number.isFinite(qty) ? qty : 1,
          useSixPack: useSix,
        },
      };
    }
    if (matches.length > 1) {
      return {
        text: `A few matches:\n${matches
          .slice(0, 6)
          .map((product) => `• ${product.brand} ${product.name}`)
          .join("\n")}\nName one exactly and I’ll add it.`,
        action: { type: "none" },
      };
    }
  }

  if (/(paul|beauty bell|ebw|sunberg)/.test(lower)) {
    return {
      text: `${state.settings.supplierName} at ${state.settings.supplierCompany}. ${state.settings.supplierEmail} · ${state.settings.supplierPhone}. Avyna prices were due to rise 5–15% after June 23 — confirm against the latest list before you send.`,
      action: { type: "none" },
    };
  }

  if (/(6[- ]pack|six pack)/.test(lower)) {
    return {
      text: "Paul’s note: 6-pack pricing is the best price on the Avyna and Tailor's lists. When I fill a restock I round up to six whenever a 6-pack price exists.",
      action: { type: "none" },
    };
  }

  const named = findProducts(state, lower);
  if (named.length === 1) {
    const product = named[0];
    const status = stockStatus(product);
    return {
      text: `${product.brand} ${product.name}: ${product.onHand} on hand, par ${product.par} (${status}). ${money(product.singlePrice)} each${product.sixPackPrice != null ? `, ${money(product.sixPackPrice)} on a 6-pack` : ""}. Supplier: ${supplierLabel[product.supplierId]}.`,
      action: { type: "none" },
    };
  }

  return {
    text: `${listLow(state)}\n\nTry “fill Paul’s order”, “draft Paul”, or “Monday ping”.`,
    action: { type: "none" },
  };
}
