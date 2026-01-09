import { QueueEntry, QueueState, League, Player, Scrim, Map } from '../types.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { playerService } from './player.service.js';
import { banService } from './ban.service.js';
import { mapService } from './map.service.js';
import { scrimService } from './scrim.service.js';
import { EventEmitter } from 'events';

export interface QueuePopEvent {
  scrim: Scrim;
  players: Player[];
  maps: Map[];
}

/**
 * In-memory queue management service
 * Uses EventEmitter to notify when queues pop
 */
export class QueueService extends EventEmitter {
  private queues: QueueState = {};

  constructor() {
    super();
    this.initializeQueues();
  }

  /**
   * Initialize queues for all leagues
   */
  private initializeQueues(): void {
    const leagues: League[] = ['Academy', 'Champion', 'Master'];
    for (const league of leagues) {
      this.queues[league] = [];
    }
    logger.info('Queue service initialized', { leagues });
  }

  /**
   * Add a player to a queue
   */
  async joinQueue(
    discordId: string,
    _username: string,
  ): Promise<{
    success: boolean;
    message: string;
    position?: number;
  }> {
    try {
      // Check if player exists in database
      const player = await playerService.getByDiscordId(discordId);
      if (!player) {
        return {
          success: false,
          message: 'You must be registered to join the queue. Please contact an admin.',
        };
      }

      // Check if player is banned
      const isBanned = await banService.isPlayerBanned(player.id);
      if (isBanned) {
        const timeRemaining = await banService.getBanTimeRemaining(player.id);
        const minutes = Math.ceil(timeRemaining / 60);
        return {
          success: false,
          message: `You are banned from queueing for ${minutes} more minute(s).`,
        };
      }

      // Check for valid Sprocket identity
      const isSprocketValid = await playerService.validateSprocketIdentity(player.discord_id);
      if (!isSprocketValid) {
        return {
          success: false,
          message:
            'You must have a valid Player account in Sprocket for Trackmania to join the queue.',
        };
      }

      // Check if player is already in any queue
      for (const [league, entries] of Object.entries(this.queues)) {
        if (entries.some((e) => e.discordId === discordId)) {
          return {
            success: false,
            message: `You are already in the ${league} queue.`,
          };
        }
      }

      // Add player to their league's queue
      const queue = this.queues[player.league];
      const entry: QueueEntry = {
        playerId: player.id,
        discordId: player.discord_id,
        username: player.discord_username,
        joinedAt: new Date(),
      };

      queue.push(entry);
      logger.info('Player joined queue', {
        playerId: player.id,
        league: player.league,
        queueSize: queue.length,
      });

      // Check if queue is ready to pop (4 players)
      if (queue.length >= 4) {
        await this.popQueue(player.league);
      }

      return {
        success: true,
        message: `You joined the ${player.league} queue! (${queue.length}/4)`,
        position: queue.length,
      };
    } catch (error) {
      logger.error('Error joining queue:', { discordId, error });
      return {
        success: false,
        message: 'An error occurred while joining the queue.',
      };
    }
  }

  /**
   * Remove a player from their queue
   */
  async leaveQueue(discordId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Find and remove player from any queue
      for (const [league, entries] of Object.entries(this.queues)) {
        const index = entries.findIndex((e) => e.discordId === discordId);
        if (index !== -1) {
          entries.splice(index, 1);
          logger.info('Player left queue', { discordId, league, queueSize: entries.length });
          return {
            success: true,
            message: `You left the ${league} queue.`,
          };
        }
      }

      return {
        success: false,
        message: 'You are not in any queue.',
      };
    } catch (error) {
      logger.error('Error leaving queue:', { discordId, error });
      return {
        success: false,
        message: 'An error occurred while leaving the queue.',
      };
    }
  }

  /**
   * Get queue status for all leagues
   */
  getQueueStatus(): Record<League, number> {
    return {
      Academy: this.queues.Academy?.length || 0,
      Champion: this.queues.Champion?.length || 0,
      Master: this.queues.Master?.length || 0,
    };
  }

  /**
   * Get queue status for a specific league
   */
  getLeagueQueue(league: League): QueueEntry[] {
    return this.queues[league] || [];
  }

  /**
   * Check if a player is in any queue
   */
  isPlayerInQueue(discordId: string): { inQueue: boolean; league?: League; position?: number } {
    for (const [league, entries] of Object.entries(this.queues)) {
      const index = entries.findIndex((e) => e.discordId === discordId);
      if (index !== -1) {
        return {
          inQueue: true,
          league: league as League,
          position: index + 1,
        };
      }
    }
    return { inQueue: false };
  }

  /**
   * Pop a queue and create a scrim
   */
  private async popQueue(league: League): Promise<void> {
    try {
      const queue = this.queues[league];
      if (queue.length < 4) {
        logger.warn('Attempted to pop queue with less than 4 players', {
          league,
          queueSize: queue.length,
        });
        return;
      }

      // Take first 4 players
      const queuedPlayers = queue.splice(0, 4);
      const playerIds = queuedPlayers.map((p) => p.playerId);

      // Get full player objects
      const players = await playerService.getByIds(playerIds);

      // Select maps for the scrim
      const maps = await mapService.selectMapsForScrim(playerIds, 3);

      // Create scrim
      const scrim = await scrimService.createScrim(league, playerIds, maps);

      logger.info('Queue popped', {
        league,
        scrimId: scrim.id,
        scrimUid: scrim.scrim_uid,
        playerIds,
        mapIds: maps.map((m) => m.id),
      });

      // Emit event for Discord notifications
      this.emit('queuePop', {
        scrim,
        players,
        maps,
      } as QueuePopEvent);

      // Start check-in timeout
      this.startCheckInTimeout(scrim.id);
    } catch (error) {
      logger.error('Error popping queue:', { league, error });
      // Re-add players to queue on error
      // Note: In production, you might want more sophisticated error handling
    }
  }

  /**
   * Start check-in timeout for a scrim
   */
  private startCheckInTimeout(scrimId: number): void {
    const timeoutMs = config.queue.checkInTimeout * 1000;

    setTimeout(async () => {
      try {
        const scrim = await scrimService.getById(scrimId);
        if (!scrim) return;

        // Only process if still in checking_in state
        if (scrim.status !== 'checking_in') return;

        const allCheckedIn = await scrimService.areAllPlayersCheckedIn(scrimId);

        if (!allCheckedIn) {
          // Get no-shows and apply penalties
          const noShowPlayerIds = await scrimService.getNoShowPlayers(scrimId);

          logger.info('Check-in timeout expired', {
            scrimId,
            noShowCount: noShowPlayerIds.length,
          });

          // Apply dodge penalties to no-shows
          for (const playerId of noShowPlayerIds) {
            await banService.applyDodgePenalty(playerId);
          }

          // Cancel the scrim
          await scrimService.cancelScrim(scrimId);

          // Get checked-in players and return them to queue
          const scrimPlayers = await scrimService.getScrimPlayers(scrimId);
          const checkedInPlayers = scrimPlayers
            .filter((sp) => sp.checked_in)
            .map((sp) => sp.player_id);

          if (checkedInPlayers.length > 0) {
            const players = await playerService.getByIds(checkedInPlayers);
            for (const player of players) {
              await this.returnPlayerToQueue(player);
            }
          }

          // Emit event for Discord notifications
          this.emit('checkInTimeout', {
            scrimId,
            noShowPlayerIds,
            checkedInPlayers,
          });
        }
      } catch (error) {
        logger.error('Error processing check-in timeout:', { scrimId, error });
      }
    }, timeoutMs);
  }

  /**
   * Return a player to their league queue with priority (at the front)
   */
  private async returnPlayerToQueue(player: Player): Promise<void> {
    const queue = this.queues[player.league];
    const entry: QueueEntry = {
      playerId: player.id,
      discordId: player.discord_id,
      username: player.discord_username,
      joinedAt: new Date(),
    };

    // Add to front of queue
    queue.unshift(entry);
    logger.info('Player returned to queue with priority', {
      playerId: player.id,
      league: player.league,
    });
  }

  /**
   * Clear a specific league queue (admin function)
   */
  clearLeagueQueue(league: League): number {
    const queue = this.queues[league];
    const count = queue.length;
    this.queues[league] = [];
    logger.info('League queue cleared', { league, removedPlayers: count });
    return count;
  }

  /**
   * Clear all queues (admin function)
   */
  clearAllQueues(): number {
    let totalCleared = 0;
    for (const league of Object.keys(this.queues)) {
      totalCleared += this.clearLeagueQueue(league as League);
    }
    return totalCleared;
  }
}

export const queueService = new QueueService();
