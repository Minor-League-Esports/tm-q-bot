import { db } from '../db/index.js';
import { League } from '../types.js';
import { logger } from '../utils/logger.js';
import { sprocketService } from './sprocket.service.js';

export interface RosterSlotRow {
  slot_id: number;
  team_id: number;
  team_name: string;
  franchise_id: number;
  franchise_name: string;
  role_id: number;
  role_name: string;
  player_id: number | null;
  member_id: number | null;
  discord_id: string | null;
}

interface IdRow {
  id: number;
}

type DbClient = {
  query: <T = IdRow>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export class RosterService {
  async addPlayer(discordId: string, franchise: string, slot: string, league: League): Promise<RosterSlotRow> {
    const profile = await sprocketService.getTrackmaniaProfileByDiscordId(discordId);
    if (!profile) {
      throw new Error(`No Trackmania Sprocket profile found for Discord ID ${discordId}`);
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const teamId = await this.resolveTeamId(client, franchise, league);
      const roleId = await this.resolveRosterRoleId(client, slot, league);
      const targetSlot = await this.resolveRosterSlotId(client, teamId, roleId);

      await client.query(
        'UPDATE sprocket.roster_slot SET "playerId" = NULL WHERE "playerId" = $1',
        [profile.sprocket_player_id]
      );
      await client.query(
        'UPDATE sprocket.roster_slot SET "playerId" = $1 WHERE id = $2',
        [profile.sprocket_player_id, targetSlot]
      );

      await client.query('COMMIT');
      const rows = await this.showFranchise(franchise, league);
      const updated = rows.find((row) => row.slot_id === targetSlot);
      if (!updated) {
        throw new Error('Roster slot was updated but could not be reloaded');
      }
      logger.info('Trackmania roster player added', { discordId, franchise, slot, league, targetSlot });
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error adding Trackmania roster player', { discordId, franchise, slot, league, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async removePlayer(discordId: string): Promise<number> {
    const profile = await sprocketService.getTrackmaniaProfileByDiscordId(discordId);
    if (!profile) {
      throw new Error(`No Trackmania Sprocket profile found for Discord ID ${discordId}`);
    }

    const result = await db.query(
      'UPDATE sprocket.roster_slot SET "playerId" = NULL WHERE "playerId" = $1',
      [profile.sprocket_player_id]
    );
    logger.info('Trackmania roster player removed', { discordId, clearedSlots: result.rowCount ?? 0 });
    return result.rowCount ?? 0;
  }

  async showFranchise(franchise: string, league: League): Promise<RosterSlotRow[]> {
    const skillGroupId = await sprocketService.getSkillGroupIdForLeague(league);
    if (!skillGroupId) {
      throw new Error(`No Trackmania skill group configured for league ${league}`);
    }

    const result = await db.query<RosterSlotRow>(
      `
      SELECT
        rs.id AS slot_id,
        t.id AS team_id,
        t.name AS team_name,
        f.id AS franchise_id,
        f.name AS franchise_name,
        rr.id AS role_id,
        rr.name AS role_name,
        rs."playerId" AS player_id,
        m.id AS member_id,
        uaa."accountId" AS discord_id
      FROM sprocket.roster_slot rs
      JOIN sprocket.team t ON t.id = rs."teamId"
      JOIN sprocket.franchise f ON f.id = t."franchiseId"
      JOIN sprocket.roster_role rr ON rr.id = rs."roleId"
      LEFT JOIN sprocket.player p ON p.id = rs."playerId"
      LEFT JOIN sprocket.member m ON m.id = p."memberId"
      LEFT JOIN sprocket."user" u ON u.id = m."userId"
      LEFT JOIN sprocket.user_authentication_account uaa
        ON uaa."userId" = u.id
       AND uaa."accountType" = 'DISCORD'
      WHERE t."skillGroupId" = $1
        AND (LOWER(f.name) = LOWER($2) OR LOWER(f.code) = LOWER($2) OR f.id::TEXT = $2)
      ORDER BY rr.name, rs.id
      `,
      [skillGroupId, franchise]
    );

    return result.rows;
  }

  private async resolveTeamId(client: DbClient, franchise: string, league: League): Promise<number> {
    const skillGroupId = await sprocketService.getSkillGroupIdForLeague(league);
    if (!skillGroupId) {
      throw new Error(`No Trackmania skill group configured for league ${league}`);
    }

    const result = await client.query<IdRow>(
      `
      SELECT t.id
      FROM sprocket.team t
      JOIN sprocket.franchise f ON f.id = t."franchiseId"
      WHERE t."skillGroupId" = $1
        AND (LOWER(f.name) = LOWER($2) OR LOWER(f.code) = LOWER($2) OR f.id::TEXT = $2)
      ORDER BY t.id
      LIMIT 2
      `,
      [skillGroupId, franchise]
    );

    if (result.rows.length !== 1) {
      throw new Error(`Unable to uniquely resolve Trackmania team for ${franchise} in ${league}`);
    }

    return result.rows[0].id;
  }

  private async resolveRosterRoleId(client: DbClient, slot: string, league: League): Promise<number> {
    const skillGroupId = await sprocketService.getSkillGroupIdForLeague(league);
    if (!skillGroupId) {
      throw new Error(`No Trackmania skill group configured for league ${league}`);
    }

    const result = await client.query<IdRow>(
      `
      SELECT id
      FROM sprocket.roster_role
      WHERE "skillGroupId" = $1
        AND (LOWER(name) = LOWER($2) OR LOWER(code) = LOWER($2) OR id::TEXT = $2)
      ORDER BY id
      LIMIT 2
      `,
      [skillGroupId, slot]
    );

    if (result.rows.length !== 1) {
      throw new Error(`Unable to uniquely resolve roster role ${slot} for ${league}`);
    }

    return result.rows[0].id;
  }

  private async resolveRosterSlotId(client: DbClient, teamId: number, roleId: number): Promise<number> {
    const result = await client.query<IdRow>(
      `
      SELECT id
      FROM sprocket.roster_slot
      WHERE "teamId" = $1 AND "roleId" = $2
      ORDER BY id
      LIMIT 2
      `,
      [teamId, roleId]
    );

    if (result.rows.length !== 1) {
      throw new Error(`Unable to uniquely resolve roster slot for team ${teamId} and role ${roleId}`);
    }

    return result.rows[0].id;
  }
}

export const rosterService = new RosterService();
