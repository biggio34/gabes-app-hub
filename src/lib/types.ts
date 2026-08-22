export type Brand = "Avyna" | "Tailor's" | "Redken" | "Custom";

export type Category = "color" | "care" | "styling" | "treatment" | "backbar";

export type SupplierId = "beautybell" | "saloncentric" | "other";

export type Product = {
  id: string;
  name: string;
  brand: Brand;
  sku?: string;
  category: Category;
  supplierId: SupplierId;
  unit: string;
  singlePrice: number;
  sixPackPrice?: number;
  onHand: number;
  par: number;
  notes?: string;
};

export type CartLine = {
  productId: string;
  qty: number;
  useSixPack: boolean;
};

export type OrderLine = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  useSixPack: boolean;
};

export type OrderStatus = "draft" | "sent" | "received";

export type PurchaseOrder = {
  id: string;
  createdAt: string;
  supplierId: SupplierId;
  status: OrderStatus;
  lines: OrderLine[];
  notes: string;
  emailSubject: string;
  emailBody: string;
};

export type Settings = {
  salonName: string;
  ownerName: string;
  fromEmail: string;
  reminderEmails: string[];
  supplierName: string;
  supplierEmail: string;
  supplierCompany: string;
  supplierPhone: string;
};

export type ChatRole = "user" | "bot";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
};

export type AppState = {
  products: Product[];
  cart: CartLine[];
  orders: PurchaseOrder[];
  settings: Settings;
  messages: ChatMessage[];
  reminderArmed: boolean;
};
