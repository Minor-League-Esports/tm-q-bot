-- Trackmania Scrim Bot Database Schema

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  discord_id VARCHAR(20) UNIQUE NOT NULL,
  discord_username VARCHAR(255) NOT NULL,
  league VARCHAR(50) NOT NULL CHECK (league IN ('Academy', 'Champion', 'Master')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_players_discord_id ON players(discord_id);
CREATE INDEX idx_players_league ON players(league);

-- Queue bans table
CREATE TABLE IF NOT EXISTS queue_bans (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  ban_start TIMESTAMP NOT NULL,
  ban_end TIMESTAMP NOT NULL,
  reason VARCHAR(255) NOT NULL,
  dodge_count INTEGER DEFAULT 1,
  is_manual BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_queue_bans_player_id ON queue_bans(player_id);
CREATE INDEX idx_queue_bans_ban_end ON queue_bans(ban_end);

-- Maps table
CREATE TABLE IF NOT EXISTS maps (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  uid VARCHAR(27) UNIQUE NOT NULL,
  author VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_maps_is_active ON maps(is_active);

-- Map play history table
CREATE TABLE IF NOT EXISTS map_play_history (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
  played_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_map_play_history_player_id ON map_play_history(player_id);
CREATE INDEX idx_map_play_history_map_id ON map_play_history(map_id);
CREATE INDEX idx_map_play_history_played_at ON map_play_history(played_at);

-- Scrims table
CREATE TABLE IF NOT EXISTS scrims (
  id SERIAL PRIMARY KEY,
  scrim_uid VARCHAR(36) UNIQUE NOT NULL,
  league VARCHAR(50) NOT NULL CHECK (league IN ('Academy', 'Champion', 'Master')),
  status VARCHAR(20) NOT NULL CHECK (status IN ('checking_in', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  checkin_deadline TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_scrims_scrim_uid ON scrims(scrim_uid);
CREATE INDEX idx_scrims_status ON scrims(status);
CREATE INDEX idx_scrims_league ON scrims(league);

-- Scrim players table
CREATE TABLE IF NOT EXISTS scrim_players (
  id SERIAL PRIMARY KEY,
  scrim_id INTEGER REFERENCES scrims(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  checked_in BOOLEAN DEFAULT FALSE,
  checkin_at TIMESTAMP,
  UNIQUE(scrim_id, player_id)
);

CREATE INDEX idx_scrim_players_scrim_id ON scrim_players(scrim_id);
CREATE INDEX idx_scrim_players_player_id ON scrim_players(player_id);

-- Scrim maps table
CREATE TABLE IF NOT EXISTS scrim_maps (
  id SERIAL PRIMARY KEY,
  scrim_id INTEGER REFERENCES scrims(id) ON DELETE CASCADE,
  map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
  map_order INTEGER NOT NULL
);

CREATE INDEX idx_scrim_maps_scrim_id ON scrim_maps(scrim_id);

-- Scrim results table (for future use)
CREATE TABLE IF NOT EXISTS scrim_results (
  id SERIAL PRIMARY KEY,
  scrim_id INTEGER REFERENCES scrims(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  final_position INTEGER NOT NULL CHECK (final_position BETWEEN 1 AND 4),
  total_time INTEGER, -- milliseconds
  replay_file_url VARCHAR(512),
  submitted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scrim_results_scrim_id ON scrim_results(scrim_id);
CREATE INDEX idx_scrim_results_player_id ON scrim_results(player_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on players table
CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for active bans (for quick lookups)
CREATE OR REPLACE VIEW active_bans AS
SELECT
    qb.id,
    qb.player_id,
    p.discord_id,
    p.discord_username,
    qb.ban_start,
    qb.ban_end,
    qb.reason,
    qb.dodge_count,
    qb.is_manual
FROM queue_bans qb
JOIN players p ON qb.player_id = p.id
WHERE qb.ban_end > NOW();

-- View for recent dodge counts (last 24 hours)
CREATE OR REPLACE VIEW recent_dodges AS
SELECT
    player_id,
    COUNT(*) as dodge_count,
    MAX(ban_start) as last_dodge
FROM queue_bans
WHERE
    is_manual = FALSE
    AND ban_start > NOW() - INTERVAL '24 hours'
GROUP BY player_id;
