CREATE SCHEMA IF NOT EXISTS trackmania;
SET search_path TO trackmania, public;

ALTER TABLE scrims
  ADD COLUMN IF NOT EXISTS sprocket_match_parent_id INTEGER,
  ADD COLUMN IF NOT EXISTS sprocket_match_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trackmania_scrims_sprocket_match_parent_id_key'
  ) THEN
    ALTER TABLE scrims
      ADD CONSTRAINT trackmania_scrims_sprocket_match_parent_id_key UNIQUE (sprocket_match_parent_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trackmania_scrims_sprocket_match_id_key'
  ) THEN
    ALTER TABLE scrims
      ADD CONSTRAINT trackmania_scrims_sprocket_match_id_key UNIQUE (sprocket_match_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scrims_sprocket_match_parent_id ON scrims(sprocket_match_parent_id);
CREATE INDEX IF NOT EXISTS idx_scrims_sprocket_match_id ON scrims(sprocket_match_id);
