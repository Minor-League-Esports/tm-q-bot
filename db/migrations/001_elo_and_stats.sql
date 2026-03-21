CREATE SCHEMA IF NOT EXISTS trackmania;
SET search_path TO trackmania, public;

-- Elo Ratings
CREATE TABLE IF NOT EXISTS elo_ratings (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  league VARCHAR(50) NOT NULL CHECK (league IN ('Academy', 'Champion', 'Master')),
  rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(player_id, league)
);

CREATE INDEX idx_elo_ratings_player_league ON elo_ratings(player_id, league);
CREATE INDEX idx_elo_ratings_rating ON elo_ratings(rating);

-- Elo History
CREATE TABLE IF NOT EXISTS elo_history (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  scrim_id INTEGER REFERENCES scrims(id) ON DELETE CASCADE,
  old_rating INTEGER NOT NULL,
  new_rating INTEGER NOT NULL,
  change_amount INTEGER GENERATED ALWAYS AS (new_rating - old_rating) STORED,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_elo_history_player_id ON elo_history(player_id);
CREATE INDEX idx_elo_history_scrim_id ON elo_history(scrim_id);

-- Detailed Match Stats (from Parser)
CREATE TABLE IF NOT EXISTS match_player_stats (
  id SERIAL PRIMARY KEY,
  scrim_id INTEGER REFERENCES scrims(id) ON DELETE CASCADE,
  map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  
  -- Stats from parser
  team_id INTEGER NOT NULL CHECK (team_id IN (1, 2)),
  points INTEGER DEFAULT 0,
  is_finished BOOLEAN DEFAULT FALSE,
  is_dnf BOOLEAN DEFAULT FALSE,
  
  round_points INTEGER[],
  nb_respawns INTEGER DEFAULT 0,
  respawn_times INTEGER[], -- milliseconds
  best_time INTEGER, -- milliseconds
  cp_times INTEGER[], -- milliseconds
  respawn_time_loss INTEGER[], -- milliseconds
  nb_respawns_by_cp INTEGER[],
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_match_player_stats_scrim_id ON match_player_stats(scrim_id);
CREATE INDEX idx_match_player_stats_player_id ON match_player_stats(player_id);

-- Add winner info and match type to scrims
ALTER TABLE scrims ADD COLUMN IF NOT EXISTS winner_team INTEGER CHECK (winner_team IN (1, 2));
ALTER TABLE scrims ADD COLUMN IF NOT EXISTS match_type VARCHAR(20) DEFAULT 'QUEUE' CHECK (match_type IN ('QUEUE', 'SCHEDULED'));
ALTER TABLE scrims ADD COLUMN IF NOT EXISTS elo_processed BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_scrims_elo_processed ON scrims(elo_processed);
