import { db } from '../db/index.js';
import { League } from '../types.js';
import { logger } from '../utils/logger.js';

export interface SprocketTrackmaniaProfile {
  sprocket_player_id: number;
  member_id: number;
  discord_id: string;
  skill_group_id: number;
  skill_group_code: string | null;
  skill_group_name: string | null;
  platform_accounts: string[];
}

export interface SprocketTrackmaniaSkillGroup {
  skill_group_id: number;
  code: string | null;
  description: string | null;
}

interface InsertIdRow {
  id: number;
}

interface CountRow {
  count: string;
}

export class SprocketService {
  private skillGroupCache: SprocketTrackmaniaSkillGroup[] | null = null;

  async getTrackmaniaSkillGroups(): Promise<SprocketTrackmaniaSkillGroup[]> {
    if (this.skillGroupCache) {
      return this.skillGroupCache;
    }

    const result = await db.query<SprocketTrackmaniaSkillGroup>(
      `
      SELECT
        gsg.id AS skill_group_id,
        gsgp.code,
        gsgp.description
      FROM sprocket.game_skill_group gsg
      JOIN sprocket.game g ON g.id = gsg."gameId"
      LEFT JOIN sprocket.game_skill_group_profile gsgp ON gsgp."skillGroupId" = gsg.id
      WHERE g.title = 'Trackmania'
      ORDER BY gsg.id
      `,
    );

    this.skillGroupCache = result.rows;
    return result.rows;
  }

  async getTrackmaniaProfileByDiscordId(
    discordId: string,
  ): Promise<SprocketTrackmaniaProfile | null> {
    try {
      const result = await db.query<SprocketTrackmaniaProfile>(
        `
        SELECT
          p.id AS sprocket_player_id,
          m.id AS member_id,
          uaa."accountId" AS discord_id,
          gsg.id AS skill_group_id,
          gsgp.code AS skill_group_code,
          gsgp.description AS skill_group_name,
          COALESCE(
            ARRAY_AGG(DISTINCT mpa."platformAccountId")
            FILTER (WHERE mpa."platformAccountId" IS NOT NULL),
            ARRAY[]::VARCHAR[]
          ) AS platform_accounts
        FROM sprocket.user_authentication_account uaa
        JOIN sprocket.user u ON u.id = uaa."userId"
        JOIN sprocket.member m ON m."userId" = u.id
        JOIN sprocket.player p ON p."memberId" = m.id
        JOIN sprocket.game_skill_group gsg ON gsg.id = p."skillGroupId"
        JOIN sprocket.game g ON g.id = gsg."gameId"
        LEFT JOIN sprocket.game_skill_group_profile gsgp ON gsgp."skillGroupId" = gsg.id
        LEFT JOIN sprocket.member_platform_account mpa ON mpa."memberId" = m.id
        WHERE uaa."accountType" = 'DISCORD'
          AND uaa."accountId" = $1
          AND g.title = 'Trackmania'
        GROUP BY p.id, m.id, uaa."accountId", gsg.id, gsgp.code, gsgp.description
        LIMIT 1
        `,
        [discordId],
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting Trackmania profile by Discord ID:', { discordId, error });
      throw error;
    }
  }

  async getTrackmaniaProfileByPlatformAccountId(
    platformAccountId: string,
  ): Promise<SprocketTrackmaniaProfile | null> {
    try {
      const result = await db.query<SprocketTrackmaniaProfile>(
        `
        SELECT
          p.id AS sprocket_player_id,
          m.id AS member_id,
          uaa."accountId" AS discord_id,
          gsg.id AS skill_group_id,
          gsgp.code AS skill_group_code,
          gsgp.description AS skill_group_name,
          COALESCE(
            ARRAY_AGG(DISTINCT mpa."platformAccountId")
            FILTER (WHERE mpa."platformAccountId" IS NOT NULL),
            ARRAY[]::VARCHAR[]
          ) AS platform_accounts
        FROM sprocket.member_platform_account lookup_mpa
        JOIN sprocket.member m ON m.id = lookup_mpa."memberId"
        JOIN sprocket.player p ON p."memberId" = m.id
        JOIN sprocket.game_skill_group gsg ON gsg.id = p."skillGroupId"
        JOIN sprocket.game g ON g.id = gsg."gameId"
        LEFT JOIN sprocket.game_skill_group_profile gsgp ON gsgp."skillGroupId" = gsg.id
        LEFT JOIN sprocket.member_platform_account mpa ON mpa."memberId" = m.id
        LEFT JOIN sprocket.user u ON u.id = m."userId"
        LEFT JOIN sprocket.user_authentication_account uaa
          ON uaa."userId" = u.id
         AND uaa."accountType" = 'DISCORD'
        WHERE lookup_mpa."platformAccountId" = $1
          AND g.title = 'Trackmania'
        GROUP BY p.id, m.id, uaa."accountId", gsg.id, gsgp.code, gsgp.description
        LIMIT 1
        `,
        [platformAccountId],
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting Trackmania profile by platform account ID:', {
        platformAccountId,
        error,
      });
      throw error;
    }
  }

  async countDiscordLinkedTrackmaniaProfiles(): Promise<number> {
    const result = await db.query<CountRow>(
      `
      SELECT COUNT(*)::text AS count
      FROM sprocket.user_authentication_account uaa
      JOIN sprocket.user u ON u.id = uaa."userId"
      JOIN sprocket.member m ON m."userId" = u.id
      JOIN sprocket.player p ON p."memberId" = m.id
      JOIN sprocket.game_skill_group gsg ON gsg.id = p."skillGroupId"
      JOIN sprocket.game g ON g.id = gsg."gameId"
      WHERE uaa."accountType" = 'DISCORD'
        AND g.title = 'Trackmania'
      `,
    );

    return Number(result.rows[0]?.count || 0);
  }

  async countPlatformLinkedTrackmaniaProfiles(): Promise<number> {
    const result = await db.query<CountRow>(
      `
      SELECT COUNT(*)::text AS count
      FROM sprocket.member_platform_account mpa
      JOIN sprocket.member m ON m.id = mpa."memberId"
      JOIN sprocket.player p ON p."memberId" = m.id
      JOIN sprocket.game_skill_group gsg ON gsg.id = p."skillGroupId"
      JOIN sprocket.game g ON g.id = gsg."gameId"
      WHERE g.title = 'Trackmania'
      `,
    );

    return Number(result.rows[0]?.count || 0);
  }

  deriveLeague(skillGroup: Pick<SprocketTrackmaniaSkillGroup, 'code' | 'description'>): League | null {
    const code = (skillGroup.code || '').trim().toUpperCase();
    const description = (skillGroup.description || '').trim().toLowerCase();

    if (code === 'AL' || description.includes('academy')) {
      return 'Academy';
    }
    if (code === 'CL' || description.includes('champion')) {
      return 'Champion';
    }
    if (code === 'ML' || description.includes('master')) {
      return 'Master';
    }

    return null;
  }

  async getSkillGroupIdForLeague(league: League): Promise<number | null> {
    const skillGroups = await this.getTrackmaniaSkillGroups();
    const match = skillGroups.find((group) => this.deriveLeague(group) === league);
    return match?.skill_group_id ?? null;
  }

  async createMatchParentAndMatch(
    client: { query: <T = InsertIdRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> },
    league: League,
    submissionId: string,
  ): Promise<{ matchParentId: number; matchId: number }> {
    const skillGroupId = await this.getSkillGroupIdForLeague(league);
    if (!skillGroupId) {
      throw new Error(`No Trackmania skill group configured for league ${league}`);
    }

    const scrimMetaResult = await client.query<InsertIdRow>(
      `
      INSERT INTO sprocket.scrim_meta ("isCompetitive")
      VALUES (TRUE)
      RETURNING id
      `,
    );
    const scrimMetaId = scrimMetaResult.rows[0]?.id;

    const matchParentResult = await client.query<InsertIdRow>(
      `
      INSERT INTO sprocket.match_parent ("scrimMetaId")
      VALUES ($1)
      RETURNING id
      `,
      [scrimMetaId],
    );
    const matchParentId = matchParentResult.rows[0]?.id;

    const matchResult = await client.query<InsertIdRow>(
      `
      INSERT INTO sprocket.match ("skillGroupId", "matchParentId", "submissionId")
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [skillGroupId, matchParentId, submissionId],
    );

    return {
      matchParentId,
      matchId: matchResult.rows[0]?.id,
    };
  }
}

export const sprocketService = new SprocketService();
