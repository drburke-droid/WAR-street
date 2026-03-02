-- WAR STREET schema for Supabase SQL editor
-- Run this once to create all tables

-- Players table with all pricing fields
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  mlb_id INTEGER UNIQUE,
  fangraphs_id INTEGER,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  position TEXT NOT NULL,
  player_type TEXT NOT NULL CHECK (player_type IN ('H', 'P')),
  eligible_positions TEXT[] NOT NULL,
  projected_war NUMERIC(4,1),
  war_ytd NUMERIC(4,1) DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  current_price INTEGER DEFAULT 500000,
  prev_price INTEGER DEFAULT 500000,
  season_ops NUMERIC(5,3),    -- hitters only
  recent_ops NUMERIC(5,3),    -- hitters: recent 3-game OPS
  season_era NUMERIC(5,2),    -- pitchers only
  recent_era NUMERIC(5,2),    -- pitchers: recent 3-game ERA
  hard_hit_pct NUMERIC(4,1),
  ownership_pct NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Owners table
CREATE TABLE IF NOT EXISTS owners (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  budget_remaining INTEGER DEFAULT 300000000,
  transactions_this_week INTEGER DEFAULT 0,
  total_war NUMERIC(5,1) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Migration: add auth columns to existing owners table
-- ALTER TABLE owners ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
-- ALTER TABLE owners ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Roster entries (shared ownership allowed — multiple owners can hold same player)
CREATE TABLE IF NOT EXISTS roster_entries (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES owners(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  purchase_price INTEGER NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(owner_id, slot)
);

-- Transaction log
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES owners(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
  price INTEGER NOT NULL,
  slot TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_roster_owner ON roster_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_roster_player ON roster_entries(player_id);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team);
