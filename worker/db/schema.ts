import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  provider: text("provider"),
  uid: text("uid"),
  name: text("name"),
  picture: text("picture"),
  image: text("image"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  admin: integer("admin", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const tournaments = sqliteTable("tournaments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const phases = sqliteTable("phases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  level: integer("level").notNull(),
  smallPoints: integer("small_points").notNull(),
  bigPoints: integer("big_points").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  tournamentId: integer("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  group: text("group").notNull(),
  tournamentId: integer("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: integer("number").notNull(),
  date: text("date").notNull(),
  phaseId: integer("phase_id")
    .notNull()
    .references(() => phases.id),
  team1Id: integer("team1_id").references(() => teams.id),
  team2Id: integer("team2_id").references(() => teams.id),
  team1Score: integer("team1_score"),
  team2Score: integer("team2_score"),
  team1Label: text("team1_label"),
  team2Label: text("team2_label"),
  ready: integer("ready", { mode: "boolean" }).notNull().default(true),
  tournamentId: integer("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  isClosed: integer("is_closed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const predictionSets = sqliteTable("prediction_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tournamentId: integer("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const predictions = sqliteTable("predictions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  predictionSetId: integer("prediction_set_id")
    .notNull()
    .references(() => predictionSets.id, { onDelete: "cascade" }),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  score1: integer("score1"),
  score2: integer("score2"),
  points: integer("points"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const leaderboards = sqliteTable("leaderboards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  code: text("code").notNull(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  private: integer("private", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const leaderboardsUsers = sqliteTable(
  "leaderboards_users",
  {
    leaderboardId: integer("leaderboard_id")
      .notNull()
      .references(() => leaderboards.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.leaderboardId, t.userId] })]
);

export const invitations = sqliteTable("invitations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leaderboardId: integer("leaderboard_id")
    .notNull()
    .references(() => leaderboards.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
