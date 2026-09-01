import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clubs = sqliteTable("clubs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  clubId: text("club_id").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
});

export const userAreas = sqliteTable(
  "user_areas",
  {
    userId: text("user_id").notNull(),
    area: text("area").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.area] }),
  }),
);

export const userClubs = sqliteTable(
  "user_clubs",
  {
    userId: text("user_id").notNull(),
    clubId: text("club_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.clubId] }),
  }),
);

export const userTeams = sqliteTable(
  "user_teams",
  {
    userId: text("user_id").notNull(),
    teamId: text("team_id").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.teamId] }),
  }),
);

export const softballState = sqliteTable("softball_state", {
  clubId: text("club_id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  clubId: text("club_id").notNull(),
  assignedTeamId: text("assigned_team_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  name: text("name").notNull(),
  number: text("number").notNull(),
  position: text("position").notNull(),
  position2: text("position2").notNull(),
  birthdate: text("birthdate").notNull(),
  originalTeam: text("original_team").notNull(),
  extra: text("extra").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const salonOrders = sqliteTable("salon_orders", {
  id: text("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const salonOrderItems = sqliteTable("salon_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  preferredVendor: text("preferred_vendor").notNull(),
  brand: text("brand").notNull(),
  product: text("product").notNull(),
  size: text("size").notNull(),
  shade: text("shade").notNull(),
  qty: integer("qty").notNull(),
  sku: text("sku").notNull(),
  note: text("note").notNull(),
  actualVendor: text("actual_vendor").notNull(),
  vendorOrderNumber: text("vendor_order_number").notNull(),
  status: text("status").notNull(),
  requestedByUserId: text("requested_by_user_id").notNull(),
  requestedByName: text("requested_by_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
