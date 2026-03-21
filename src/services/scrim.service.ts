import { db, tableName } from '../db/index.js';
import { Scrim, ScrimPlayer, ScrimMap, League, Map, Player } from '../types.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { randomUUID } from 'crypto';
import { sprocketService } from './sprocket.service.js';

export class ScrimService {
  private readonly scrimsTable = tableName('scrims');
  private readonly scrimPlayersTable = tableName('scrim_players');
  private readonly scrimMapsTable = tableName('scrim_maps');

  /**
   * Create a new scrim
   */
  async createScrim(
    league: League,
    playerIds: number[],
    maps: Map[]
  ): Promise<Scrim> {
    if (playerIds.length !== 4) {
      throw new Error('Scrim must have exactly 4 players');
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Generate unique scrim ID
      const scrimUid = this.generateScrimId();
      const checkinDeadline = new Date(Date.now() + config.queue.checkInTimeout * 1000);
      const sprocketMatch = await sprocketService.createMatchParentAndMatch(client, league, scrimUid);

      // Create scrim
      const scrimResult = await client.query<Scrim>(
        `INSERT INTO ${this.scrimsTable}
         (scrim_uid, league, status, match_type, created_at, checkin_deadline, sprocket_match_parent_id, sprocket_match_id)
         VALUES ($1, $2, $3, 'QUEUE', NOW(), $4, $5, $6)
         RETURNING *`,
        [
          scrimUid,
          league,
          'checking_in',
          checkinDeadline,
          sprocketMatch.matchParentId,
          sprocketMatch.matchId,
        ]
      );

      const scrim = scrimResult.rows[0];

      // Add players to scrim
      for (const playerId of playerIds) {
        await client.query(
          `INSERT INTO ${this.scrimPlayersTable} (scrim_id, player_id, checked_in)
           VALUES ($1, $2, FALSE)`,
          [scrim.id, playerId]
        );
      }

      // Add maps to scrim
      for (let i = 0; i < maps.length; i++) {
        await client.query(
          `INSERT INTO ${this.scrimMapsTable} (scrim_id, map_id, map_order)
           VALUES ($1, $2, $3)`,
          [scrim.id, maps[i].id, i + 1]
        );
      }

      await client.query('COMMIT');

      logger.info('Scrim created', {
        scrimId: scrim.id,
        scrimUid,
        league,
        playerIds,
        mapIds: maps.map(m => m.id)
      });

      return scrim;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating scrim:', { league, playerIds, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a scheduled match
   */
  async createScheduledMatch(
    league: League,
    players: Player[]
  ): Promise<Scrim> {
    if (players.length !== 4) {
      throw new Error('Match must have exactly 4 players');
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Generate unique scrim ID
      const scrimUid = this.generateScrimId();
      const sprocketMatch = await sprocketService.createMatchParentAndMatch(client, league, scrimUid);

      // Create scrim with SCHEDULED type and ACTIVE status (no check-in needed)
      const scrimResult = await client.query<Scrim>(
        `INSERT INTO ${this.scrimsTable}
         (scrim_uid, league, status, match_type, created_at, sprocket_match_parent_id, sprocket_match_id)
         VALUES ($1, $2, 'active', 'SCHEDULED', NOW(), $3, $4)
         RETURNING *`,
        [scrimUid, league, sprocketMatch.matchParentId, sprocketMatch.matchId]
      );

      const scrim = scrimResult.rows[0];

      // Add players to scrim (auto checked-in)
      for (const player of players) {
        await client.query(
          `INSERT INTO ${this.scrimPlayersTable} (scrim_id, player_id, checked_in, checkin_at)
           VALUES ($1, $2, TRUE, NOW())`,
          [scrim.id, player.id]
        );
      }

      await client.query('COMMIT');

      logger.info('Scheduled match created', {
        scrimId: scrim.id,
        scrimUid,
        league,
        playerIds: players.map(p => p.id)
      });

      return scrim;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating scheduled match:', { league, playerIds: players.map(p => p.id), error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a scrim by ID
   */
  async getById(scrimId: number): Promise<Scrim | null> {
    try {
      const result = await db.query<Scrim>(
        `SELECT * FROM ${this.scrimsTable} WHERE id = $1`,
        [scrimId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting scrim by ID:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Get a scrim by UID
   */
  async getByUid(scrimUid: string): Promise<Scrim | null> {
    try {
      const result = await db.query<Scrim>(
        `SELECT * FROM ${this.scrimsTable} WHERE scrim_uid = $1`,
        [scrimUid]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting scrim by UID:', { scrimUid, error });
      throw error;
    }
  }

  /**
   * Get players in a scrim
   */
  async getScrimPlayers(scrimId: number): Promise<ScrimPlayer[]> {
    try {
      const result = await db.query<ScrimPlayer>(
        `SELECT * FROM ${this.scrimPlayersTable} WHERE scrim_id = $1`,
        [scrimId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting scrim players:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Get maps for a scrim
   */
  async getScrimMaps(scrimId: number): Promise<ScrimMap[]> {
    try {
      const result = await db.query<ScrimMap>(
        `SELECT * FROM ${this.scrimMapsTable} WHERE scrim_id = $1 ORDER BY map_order`,
        [scrimId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting scrim maps:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Check in a player for a scrim
   */
  async checkInPlayer(scrimId: number, playerId: number): Promise<boolean> {
    try {
      const result = await db.query(
        `UPDATE ${this.scrimPlayersTable}
         SET checked_in = TRUE, checkin_at = NOW()
         WHERE scrim_id = $1 AND player_id = $2
         RETURNING *`,
        [scrimId, playerId]
      );

      if (result.rowCount === 0) {
        logger.warn('Player not in scrim or already checked in', { scrimId, playerId });
        return false;
      }

      logger.info('Player checked in', { scrimId, playerId });

      // Check if all players have checked in
      const allCheckedIn = await this.areAllPlayersCheckedIn(scrimId);
      if (allCheckedIn) {
        await this.activateScrim(scrimId);
      }

      return true;
    } catch (error) {
      logger.error('Error checking in player:', { scrimId, playerId, error });
      throw error;
    }
  }

  /**
   * Check if all players in a scrim have checked in
   */
  async areAllPlayersCheckedIn(scrimId: number): Promise<boolean> {
    try {
      const result = await db.query<{ all_checked_in: boolean }>(
        `SELECT NOT EXISTS(
           SELECT 1 FROM ${this.scrimPlayersTable}
           WHERE scrim_id = $1 AND checked_in = FALSE
         ) as all_checked_in`,
        [scrimId]
      );
      return result.rows[0]?.all_checked_in || false;
    } catch (error) {
      logger.error('Error checking if all players checked in:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Activate a scrim (all players checked in)
   */
  async activateScrim(scrimId: number): Promise<void> {
    try {
      await db.query(
        `UPDATE ${this.scrimsTable}
         SET status = 'active'
         WHERE id = $1`,
        [scrimId]
      );
      logger.info('Scrim activated', { scrimId });
    } catch (error) {
      logger.error('Error activating scrim:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Cancel a scrim
   */
  async cancelScrim(scrimId: number): Promise<void> {
    try {
      await db.query(
        `UPDATE ${this.scrimsTable}
         SET status = 'cancelled', completed_at = NOW()
         WHERE id = $1`,
        [scrimId]
      );
      logger.info('Scrim cancelled', { scrimId });
    } catch (error) {
      logger.error('Error cancelling scrim:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Complete a scrim
   */
  async completeScrim(scrimId: number): Promise<void> {
    try {
      await db.query(
        `UPDATE ${this.scrimsTable}
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1`,
        [scrimId]
      );
      logger.info('Scrim completed', { scrimId });
    } catch (error) {
      logger.error('Error completing scrim:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Get players who didn't check in
   */
  async getNoShowPlayers(scrimId: number): Promise<number[]> {
    try {
      const result = await db.query<{ player_id: number }>(
        `SELECT player_id FROM ${this.scrimPlayersTable}
         WHERE scrim_id = $1 AND checked_in = FALSE`,
        [scrimId]
      );
      return result.rows.map(row => row.player_id);
    } catch (error) {
      logger.error('Error getting no-show players:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Check if check-in deadline has passed
   */
  async isCheckInExpired(scrimId: number): Promise<boolean> {
    try {
      const scrim = await this.getById(scrimId);
      if (!scrim || !scrim.checkin_deadline) return false;

      return new Date() > new Date(scrim.checkin_deadline);
    } catch (error) {
      logger.error('Error checking if check-in expired:', { scrimId, error });
      throw error;
    }
  }

  /**
   * Generate a unique scrim ID
   */
  private generateScrimId(): string {
    // Format: SCRIM-XXXXXX (6 random alphanumeric chars)
    const uuid = randomUUID().replace(/-/g, '').substring(0, 6).toUpperCase();
    return `SCRIM-${uuid}`;
  }

  /**
   * Get active scrims for a league
   */
  async getActiveScrimsByLeague(league: League): Promise<Scrim[]> {
    try {
      const result = await db.query<Scrim>(
        `SELECT * FROM ${this.scrimsTable}
         WHERE league = $1
         AND status IN ('checking_in', 'active')
         ORDER BY created_at DESC`,
        [league]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting active scrims by league:', { league, error });
      throw error;
    }
  }

  /**
   * Get recent scrims for a player
   */
  async getPlayerRecentScrims(playerId: number, limit = 10): Promise<Scrim[]> {
    try {
      const result = await db.query<Scrim>(
        `SELECT s.* FROM ${this.scrimsTable} s
         JOIN ${this.scrimPlayersTable} sp ON s.id = sp.scrim_id
         WHERE sp.player_id = $1
         ORDER BY s.created_at DESC
         LIMIT $2`,
        [playerId, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting player recent scrims:', { playerId, error });
      throw error;
    }
  }
}

export const scrimService = new ScrimService();
