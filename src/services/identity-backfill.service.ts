import { db, tableName } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface IdentityBackfillIssue {
  local_player_id: number;
  discord_id: string;
  discord_username: string;
  reason: 'missing_sprocket_profile' | 'duplicate_sprocket_profiles';
  sprocket_player_ids: number[];
}

interface BackfillRow {
  id: number;
  discord_id: string;
  discord_username: string;
  sprocket_player_id: number | null;
  member_id: number | null;
  sprocket_player_ids: number[] | null;
}

export class IdentityBackfillService {
  async backfillTrackmaniaPlayerIdentities(): Promise<IdentityBackfillIssue[]> {
    const playersTable = tableName('players');

    const result = await db.query<BackfillRow>(
      `
      WITH profile_matches AS (
        SELECT
          lp.id AS local_player_id,
          ARRAY_AGG(DISTINCT sp.id) FILTER (WHERE sp.id IS NOT NULL) AS sprocket_player_ids,
          COUNT(DISTINCT sp.id) AS sprocket_profile_count,
          MAX(sp.id) AS sprocket_player_id,
          MAX(m.id) AS member_id,
          COALESCE(
            ARRAY_AGG(DISTINCT mpa."platformAccountId")
            FILTER (WHERE mpa."platformAccountId" IS NOT NULL),
            ARRAY[]::VARCHAR[]
          ) AS platform_account_ids
        FROM ${playersTable} lp
        LEFT JOIN sprocket.user_authentication_account uaa
          ON uaa."accountType" = 'DISCORD'
         AND uaa."accountId" = lp.discord_id
        LEFT JOIN sprocket."user" u ON u.id = uaa."userId"
        LEFT JOIN sprocket.member m ON m."userId" = u.id
        LEFT JOIN sprocket.player sp ON sp."memberId" = m.id
        LEFT JOIN sprocket.game_skill_group gsg ON gsg.id = sp."skillGroupId"
        LEFT JOIN sprocket.game g ON g.id = gsg."gameId" AND g.title = 'Trackmania'
        LEFT JOIN sprocket.member_platform_account mpa ON mpa."memberId" = m.id
        WHERE g.id IS NOT NULL OR uaa."accountId" IS NULL
        GROUP BY lp.id
      ), updated AS (
        UPDATE ${playersTable} lp
        SET sprocket_player_id = pm.sprocket_player_id,
            member_id = pm.member_id,
            platform_account_ids = pm.platform_account_ids,
            updated_at = NOW()
        FROM profile_matches pm
        WHERE lp.id = pm.local_player_id
          AND pm.sprocket_profile_count = 1
        RETURNING lp.id
      )
      SELECT
        lp.id,
        lp.discord_id,
        lp.discord_username,
        pm.sprocket_player_id,
        pm.member_id,
        COALESCE(pm.sprocket_player_ids, ARRAY[]::INTEGER[]) AS sprocket_player_ids
      FROM ${playersTable} lp
      JOIN profile_matches pm ON pm.local_player_id = lp.id
      WHERE pm.sprocket_profile_count <> 1
      ORDER BY lp.id
      `
    );

    const issues = result.rows.map((row) => ({
      local_player_id: row.id,
      discord_id: row.discord_id,
      discord_username: row.discord_username,
      reason:
        (row.sprocket_player_ids || []).length === 0
          ? 'missing_sprocket_profile'
          : 'duplicate_sprocket_profiles',
      sprocket_player_ids: row.sprocket_player_ids || [],
    })) satisfies IdentityBackfillIssue[];

    if (issues.length > 0) {
      logger.warn('Trackmania identity backfill completed with issues', { issues });
    } else {
      logger.info('Trackmania identity backfill completed successfully');
    }

    return issues;
  }
}

export const identityBackfillService = new IdentityBackfillService();
