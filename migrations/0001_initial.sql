-- Quiniela 2.0 — SQLite schema for Cloudflare D1 (ported from Rails schema.rb)

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  provider TEXT,
  uid TEXT,
  name TEXT,
  picture TEXT,
  image TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  level INTEGER NOT NULL,
  small_points INTEGER NOT NULL,
  big_points INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  "group" TEXT NOT NULL,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL,
  date TEXT NOT NULL,
  phase_id INTEGER NOT NULL REFERENCES phases(id),
  team1_id INTEGER REFERENCES teams(id),
  team2_id INTEGER REFERENCES teams(id),
  team1_score INTEGER,
  team2_score INTEGER,
  team1_label TEXT,
  team2_label TEXT,
  ready INTEGER NOT NULL DEFAULT 1,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  is_closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE prediction_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, tournament_id)
);

CREATE TABLE predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_set_id INTEGER NOT NULL REFERENCES prediction_sets(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  score1 INTEGER,
  score2 INTEGER,
  points INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(prediction_set_id, match_id)
);

CREATE TABLE leaderboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1,
  private INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE leaderboards_users (
  leaderboard_id INTEGER NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (leaderboard_id, user_id)
);

CREATE TABLE invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leaderboard_id INTEGER NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(leaderboard_id, user_id)
);

CREATE INDEX idx_matches_tournament ON matches(tournament_id);
CREATE INDEX idx_predictions_set ON predictions(prediction_set_id);
CREATE INDEX idx_prediction_sets_user ON prediction_sets(user_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
