import { money, supplierLabel, unitPrice } from "./catalog";
import type { CartLine, Product, PurchaseOrder, Settings } from "./types";
import { formatChicago, nextMondayNineCentral } from "./reminder";

export function buildOrderDraft(
  products: Product[],
  cart: CartLine[],
  settings: Settings,
  supplierId: Product["supplierId"],
) {
  const lines = cart
    .map((line) => {
      const product = products.find((item) => item.id === line.productId);
      if (!product || product.supplierId !== supplierId) return null;
      return {
        product,
        qty: line.qty,
        useSixPack: line.useSixPack && product.sixPackPrice != null,
        unit: unitPrice(product, line.useSixPack),
      };
    })
    .filter((line): line is NonNullable<typeof line> => line != null);

  const total = lines.reduce((sum, line) => sum + line.qty * line.unit, 0);
  const brands = [...new Set(lines.map((line) => line.product.brand))].join(
    " / ",
  );
  const subject = `Luna Haus order — ${brands || supplierLabel[supplierId]}`;

  const grouped = new Map<string, typeof lines>();
  for (const line of lines) {
    const key = line.product.brand;
    grouped.set(key, [...(grouped.get(key) ?? []), line]);
  }

  const blocks = [...grouped.entries()]
    .map(([brand, brandLines]) => {
      const rows = brandLines
        .map((line) => {
          const pack = line.useSixPack ? " (6-pack pricing)" : "";
          return `- ${line.qty} × ${line.product.name} — ${money(line.unit)} each${pack}`;
        })
        .join("\n");
      return `${brand}\n${rows}`;
    })
    .join("\n\n");

  const body = `Paul,

Please put this on the next run for ${settings.salonName} (St. Michael):

${blocks || "(no lines yet)"}

Estimated total: ${money(total)}
6-pack pricing where marked — that's the best price on the lists.

Thank you!
${settings.ownerName}
${settings.fromEmail}`;

  return { subject, body, total, lines };
}

export function reminderEmail(settings: Settings, lowCount: number) {
  const when = formatChicago(nextMondayNineCentral());
  const subject = "Luna Haus Purchasing — Monday restock";
  const body = `Monday purchasing check for ${settings.salonName}.

${lowCount} item${lowCount === 1 ? "" : "s"} are below par right now. Open the purchasing app, review the restock list, and send Paul the Beauty Bell order if anything is short.

This ping is the same Monday 9 Central reminder we tested. Next one: ${when}.

Reply in the purchasing bot if you got it.`;
  return { subject, body };
}

export function mailtoHref(to: string[], subject: string, body: string) {
  const params = new URLSearchParams({
    subject,
    body,
  });
  return `mailto:${to.join(",")}?${params.toString()}`;
}

export function orderFromCart(
  products: Product[],
  cart: CartLine[],
  settings: Settings,
  supplierId: Product["supplierId"],
  notes = "",
): PurchaseOrder | null {
  const draft = buildOrderDraft(products, cart, settings, supplierId);
  if (draft.lines.length === 0) return null;
  return {
    id: `po-${Date.now()}`,
    createdAt: new Date().toISOString(),
    supplierId,
    status: "draft",
    notes,
    emailSubject: draft.subject,
    emailBody: draft.body,
    lines: draft.lines.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      qty: line.qty,
      unitPrice: line.unit,
      useSixPack: line.useSixPack,
    })),
  };
}
