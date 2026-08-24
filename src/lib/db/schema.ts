import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  teamId: text("team_id").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});
