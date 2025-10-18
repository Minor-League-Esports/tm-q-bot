import { db } from '../db/index.js';
import { QueueBan } from '../types.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export class BanService {
  /**
   * Check if a player is currently banned
   */
  async isPlayerBanned(playerId: number): Promise<boolean> {
    try {
      const result = await db.query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM queue_bans
          WHERE player_id = $1
          AND ban_end > NOW()
        )`,
        [playerId]
      );
      return result.rows[0]?.exists || false;
    } catch (error) {
      logger.error('Error checking if player is banned:', { playerId, error });
      throw error;
    }
  }

  /**
   * Get active ban for a player
   */
  async getActiveBan(playerId: number): Promise<QueueBan | null> {
    try {
      const result = await db.query<QueueBan>(
        `SELECT * FROM queue_bans
         WHERE player_id = $1
         AND ban_end > NOW()
         ORDER BY ban_end DESC
         LIMIT 1`,
        [playerId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting active ban:', { playerId, error });
      throw error;
    }
  }

  /**
   * Get dodge count in the last 24 hours
   */
  async getRecentDodgeCount(playerId: number): Promise<number> {
    try {
      const result = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM queue_bans
         WHERE player_id = $1
         AND is_manual = FALSE
         AND ban_start > NOW() - INTERVAL '1 day'`,
        [playerId]
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      logger.error('Error getting recent dodge count:', { playerId, error });
      throw error;
    }
  }

  /**
   * Calculate ban duration based on dodge count
   */
  private calculateBanDuration(dodgeCount: number): number {
    switch (dodgeCount) {
      case 0:
        return config.bans.dodgeBan1; // First dodge: 5 minutes
      case 1:
        return config.bans.dodgeBan2; // Second dodge: 30 minutes
      case 2:
      default:
        return config.bans.dodgeBan3; // Third+ dodge: 2 hours
    }
  }

  /**
   * Apply a dodge penalty to a player
   */
  async applyDodgePenalty(playerId: number): Promise<QueueBan> {
    try {
      const dodgeCount = await this.getRecentDodgeCount(playerId);
      const banDuration = this.calculateBanDuration(dodgeCount);

      const banStart = new Date();
      const banEnd = new Date(banStart.getTime() + banDuration * 1000);

      const result = await db.query<QueueBan>(
        `INSERT INTO queue_bans (player_id, ban_start, ban_end, reason, dodge_count, is_manual)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          playerId,
          banStart,
          banEnd,
          `Queue dodge penalty (${dodgeCount + 1} in 24h)`,
          dodgeCount + 1,
          false,
        ]
      );

      const ban = result.rows[0];
      logger.info('Dodge penalty applied', {
        playerId,
        dodgeCount: dodgeCount + 1,
        banDuration,
        banEnd: banEnd.toISOString()
      });

      return ban;
    } catch (error) {
      logger.error('Error applying dodge penalty:', { playerId, error });
      throw error;
    }
  }

  /**
   * Apply a manual ban to a player
   */
  async applyManualBan(
    playerId: number,
    durationSeconds: number,
    reason: string
  ): Promise<QueueBan> {
    try {
      const banStart = new Date();
      const banEnd = new Date(banStart.getTime() + durationSeconds * 1000);

      const result = await db.query<QueueBan>(
        `INSERT INTO queue_bans (player_id, ban_start, ban_end, reason, dodge_count, is_manual)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [playerId, banStart, banEnd, reason, 0, true]
      );

      const ban = result.rows[0];
      logger.info('Manual ban applied', {
        playerId,
        reason,
        durationSeconds,
        banEnd: banEnd.toISOString()
      });

      return ban;
    } catch (error) {
      logger.error('Error applying manual ban:', { playerId, reason, error });
      throw error;
    }
  }

  /**
   * Remove all active bans for a player
   */
  async unbanPlayer(playerId: number): Promise<void> {
    try {
      await db.query(
        `UPDATE queue_bans
         SET ban_end = NOW()
         WHERE player_id = $1
         AND ban_end > NOW()`,
        [playerId]
      );
      logger.info('Player unbanned', { playerId });
    } catch (error) {
      logger.error('Error unbanning player:', { playerId, error });
      throw error;
    }
  }

  /**
   * Get all bans for a player (for admin viewing)
   */
  async getPlayerBanHistory(playerId: number, limit = 10): Promise<QueueBan[]> {
    try {
      const result = await db.query<QueueBan>(
        `SELECT * FROM queue_bans
         WHERE player_id = $1
         ORDER BY ban_start DESC
         LIMIT $2`,
        [playerId, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting player ban history:', { playerId, error });
      throw error;
    }
  }

  /**
   * Get time remaining on active ban (in seconds)
   */
  async getBanTimeRemaining(playerId: number): Promise<number> {
    const ban = await this.getActiveBan(playerId);
    if (!ban) return 0;

    const now = new Date().getTime();
    const banEnd = new Date(ban.ban_end).getTime();
    const remaining = Math.max(0, Math.floor((banEnd - now) / 1000));

    return remaining;
  }
}

export const banService = new BanService();
