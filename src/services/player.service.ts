import { db } from '../db/index.js';
import { Player, League } from '../types.js';
import { logger } from '../utils/logger.js';

export class PlayerService {
  /**
   * Get a player by Discord ID
   */
  async getByDiscordId(discordId: string): Promise<Player | null> {
    try {
      const result = await db.query<Player>(
        'SELECT * FROM players WHERE discord_id = $1',
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
        'SELECT * FROM players WHERE id = $1',
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
        'SELECT * FROM players WHERE id = ANY($1)',
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
        'SELECT EXISTS(SELECT 1 FROM players WHERE discord_id = $1)',
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
        'SELECT * FROM players WHERE league = $1',
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
        'UPDATE players SET league = $1, updated_at = NOW() WHERE id = $2',
        [league, playerId]
      );
      logger.info('Player league updated', { playerId, league });
    } catch (error) {
      logger.error('Error updating player league:', { playerId, league, error });
      throw error;
    }
  }
}

export const playerService = new PlayerService();
