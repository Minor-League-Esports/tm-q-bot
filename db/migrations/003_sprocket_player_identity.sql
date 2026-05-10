CREATE SCHEMA IF NOT EXISTS trackmania;
SET search_path TO trackmania, public;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS sprocket_player_id INTEGER,
  ADD COLUMN IF NOT EXISTS member_id INTEGER,
  ADD COLUMN IF NOT EXISTS platform_account_ids VARCHAR[] DEFAULT ARRAY[]::VARCHAR[];

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_sprocket_player_id
  ON players(sprocket_player_id)
  WHERE sprocket_player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_players_member_id
  ON players(member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_players_platform_account_ids
  ON players USING GIN(platform_account_ids);

UPDATE players lp
SET sprocket_player_id = profile.sprocket_player_id,
    member_id = profile.member_id,
    platform_account_ids = profile.platform_accounts,
    updated_at = NOW()
FROM (
  SELECT
    p.id AS sprocket_player_id,
    m.id AS member_id,
    uaa."accountId" AS discord_id,
    COALESCE(
      ARRAY_AGG(DISTINCT mpa."platformAccountId")
      FILTER (WHERE mpa."platformAccountId" IS NOT NULL),
      ARRAY[]::VARCHAR[]
    ) AS platform_accounts
  FROM sprocket.user_authentication_account uaa
  JOIN sprocket."user" u ON u.id = uaa."userId"
  JOIN sprocket.member m ON m."userId" = u.id
  JOIN sprocket.player p ON p."memberId" = m.id
  JOIN sprocket.game_skill_group gsg ON gsg.id = p."skillGroupId"
  JOIN sprocket.game g ON g.id = gsg."gameId"
  LEFT JOIN sprocket.member_platform_account mpa ON mpa."memberId" = m.id
  WHERE uaa."accountType" = 'DISCORD'
    AND g.title = 'Trackmania'
  GROUP BY p.id, m.id, uaa."accountId"
) profile
WHERE lp.discord_id = profile.discord_id;

DO $$
DECLARE
  duplicate_discord_ids TEXT;
  duplicate_sprocket_ids TEXT;
BEGIN
  SELECT STRING_AGG(discord_id, ', ')
  INTO duplicate_discord_ids
  FROM (
    SELECT uaa."accountId" AS discord_id
    FROM sprocket.user_authentication_account uaa
    JOIN sprocket."user" u ON u.id = uaa."userId"
    JOIN sprocket.member m ON m."userId" = u.id
    JOIN sprocket.player p ON p."memberId" = m.id
    JOIN sprocket.game_skill_group gsg ON gsg.id = p."skillGroupId"
    JOIN sprocket.game g ON g.id = gsg."gameId"
    WHERE uaa."accountType" = 'DISCORD'
      AND g.title = 'Trackmania'
    GROUP BY uaa."accountId"
    HAVING COUNT(DISTINCT p.id) > 1
  ) duplicates;

  IF duplicate_discord_ids IS NOT NULL THEN
    RAISE WARNING 'Duplicate Trackmania Sprocket profiles found for Discord IDs: %', duplicate_discord_ids;
  END IF;

  SELECT STRING_AGG(sprocket_player_id::TEXT, ', ')
  INTO duplicate_sprocket_ids
  FROM (
    SELECT sprocket_player_id
    FROM trackmania.players
    WHERE sprocket_player_id IS NOT NULL
    GROUP BY sprocket_player_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_sprocket_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate sprocket_player_id values after backfill: %', duplicate_sprocket_ids;
  END IF;
END $$;
