import { db, tableName } from '../db/index.js';
import { Player, League } from '../types.js';
import { logger } from '../utils/logger.js';
import { sprocketService } from './sprocket.service.js';

export class PlayerService {
  private readonly playersTable = tableName('players');

  /**
   * Get a player by Discord ID
   */
  async getByDiscordId(discordId: string): Promise<Player | null> {
    try {
      const result = await db.query<Player>(
        `SELECT * FROM ${this.playersTable} WHERE discord_id = $1`,
        [discordId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting player by Discord ID:', { discordId, error });
      throw error;
    }
  }

  /**
   * Get a player by internal ID
   */
  async getById(id: number): Promise<Player | null> {
    try {
      const result = await db.query<Player>(
        `SELECT * FROM ${this.playersTable} WHERE id = $1`,
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting player by ID:', { id, error });
      throw error;
    }
  }

  /**
   * Get multiple players by their IDs
   */
  async getByIds(ids: number[]): Promise<Player[]> {
    if (ids.length === 0) return [];

    try {
      const result = await db.query<Player>(
        `SELECT * FROM ${this.playersTable} WHERE id = ANY($1)`,
        [ids]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting players by IDs:', { ids, error });
      throw error;
    }
  }

  /**
   * Check if a player exists in the database
   */
  async exists(discordId: string): Promise<boolean> {
    try {
      const result = await db.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM ${this.playersTable} WHERE discord_id = $1)`,
        [discordId]
      );
      return result.rows[0]?.exists || false;
    } catch (error) {
      logger.error('Error checking player existence:', { discordId, error });
      throw error;
    }
  }

  /**
   * Get all players in a specific league
   */
  async getByLeague(league: League): Promise<Player[]> {
    try {
      const result = await db.query<Player>(
        `SELECT * FROM ${this.playersTable} WHERE league = $1`,
        [league]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting players by league:', { league, error });
      throw error;
    }
  }

  /**
   * Update player's league
   */
  async updateLeague(playerId: number, league: League): Promise<void> {
    try {
      await db.query(
        `UPDATE ${this.playersTable} SET league = $1, updated_at = NOW() WHERE id = $2`,
        [league, playerId]
      );
      logger.info('Player league updated', { playerId, league });
    } catch (error) {
      logger.error('Error updating player league:', { playerId, league, error });
      throw error;
    }
  }
  /**
   * Validate if a player exists in the Sprocket database for Trackmania
   */
  async validateSprocketIdentity(discordId: string): Promise<boolean> {
    try {
      const profile = await sprocketService.getTrackmaniaProfileByDiscordId(discordId);
      return profile !== null;
    } catch (error) {
      logger.error('Error validating Sprocket identity:', { discordId, error });
      throw error;
    }
  }

  async syncPlayerFromSprocket(discordId: string, discordUsername: string): Promise<Player | null> {
    const profile = await sprocketService.getTrackmaniaProfileByDiscordId(discordId);
    if (!profile) {
      return null;
    }

    const league = sprocketService.deriveLeague({
      code: profile.skill_group_code,
      description: profile.skill_group_name,
    });

    if (!league) {
      logger.warn('Unable to derive league from Sprocket skill group', {
        discordId,
        skillGroupId: profile.skill_group_id,
        skillGroupCode: profile.skill_group_code,
        skillGroupName: profile.skill_group_name,
      });
      return null;
    }

    try {
      const existing = await this.getByDiscordId(discordId);
      if (existing) {
        const result = await db.query<Player>(
          `UPDATE ${this.playersTable}
           SET discord_username = $2,
               league = $3,
               updated_at = NOW()
           WHERE discord_id = $1
           RETURNING *`,
          [discordId, discordUsername, league],
        );
        return result.rows[0] || existing;
      }

      const result = await db.query<Player>(
        `INSERT INTO ${this.playersTable} (discord_id, discord_username, league)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [discordId, discordUsername, league],
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error syncing player from Sprocket:', {
        discordId,
        discordUsername,
        error,
      });
      throw error;
    }
  }
}

export const playerService = new PlayerService();
