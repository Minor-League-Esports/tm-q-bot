import { db } from '../db/index.js';
import { Map, MapWithPlayCount } from '../types.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export class MapService {
  /**
   * Get all active maps
   */
  async getActiveMaps(): Promise<Map[]> {
    try {
      const result = await db.query<Map>(
        'SELECT * FROM maps WHERE is_active = TRUE ORDER BY name'
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting active maps:', error);
      throw error;
    }
  }

  /**
   * Get a map by ID
   */
  async getById(mapId: number): Promise<Map | null> {
    try {
      const result = await db.query<Map>(
        'SELECT * FROM maps WHERE id = $1',
        [mapId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting map by ID:', { mapId, error });
      throw error;
    }
  }

  /**
   * Get maps by their IDs
   */
  async getByIds(mapIds: number[]): Promise<Map[]> {
    if (mapIds.length === 0) return [];

    try {
      const result = await db.query<Map>(
        'SELECT * FROM maps WHERE id = ANY($1)',
        [mapIds]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting maps by IDs:', { mapIds, error });
      throw error;
    }
  }

  /**
   * Get map play counts for specific players in the last N days
   */
  async getMapPlayCounts(
    playerIds: number[],
    days: number = config.queue.mapHistoryDays
  ): Promise<MapWithPlayCount[]> {
    if (playerIds.length === 0) {
      logger.warn('No players provided for map play counts');
      return [];
    }

    try {
      const result = await db.query<{ map_id: number; play_count: string }>(
        `SELECT
           m.id as map_id,
           COALESCE(COUNT(mph.id), 0) as play_count
         FROM maps m
         LEFT JOIN map_play_history mph ON m.id = mph.map_id
           AND mph.player_id = ANY($1)
           AND mph.played_at > NOW() - INTERVAL '1 day' * $2
         WHERE m.is_active = TRUE
         GROUP BY m.id
         ORDER BY play_count ASC, m.name ASC`,
        [playerIds, days]
      );

      // Join with full map data
      const mapIds = result.rows.map(r => r.map_id);
      const maps = await this.getByIds(mapIds);
      const mapById = new Map(maps.map(m => [m.id, m]));

      return result.rows.map(row => ({
        map: mapById.get(row.map_id)!,
        playCount: parseInt(row.play_count, 10),
      }));
    } catch (error) {
      logger.error('Error getting map play counts:', { playerIds, days, error });
      throw error;
    }
  }

  /**
   * Select N random maps from the least-played maps for given players
   * Algorithm:
   * 1. Get play counts for all active maps for the given players
   * 2. Take the bottom 20% of maps by play count
   * 3. Randomly select N maps from that pool
   */
  async selectMapsForScrim(
    playerIds: number[],
    count: number = 3
  ): Promise<Map[]> {
    try {
      const mapPlayCounts = await this.getMapPlayCounts(playerIds);

      if (mapPlayCounts.length === 0) {
        throw new Error('No active maps available');
      }

      if (mapPlayCounts.length < count) {
        logger.warn('Not enough maps available, returning all maps', {
          available: mapPlayCounts.length,
          requested: count
        });
        return mapPlayCounts.map(mpc => mpc.map);
      }

      // Calculate how many maps to consider (bottom 20%, minimum of MIN_MAP_POOL_SIZE)
      const poolSize = Math.max(
        config.queue.minMapPoolSize,
        Math.ceil(mapPlayCounts.length * 0.2)
      );

      // Take the least-played maps
      const leastPlayedMaps = mapPlayCounts.slice(0, poolSize);

      // Shuffle and take N maps
      const shuffled = this.shuffleArray([...leastPlayedMaps]);
      const selectedMaps = shuffled.slice(0, count).map(mpc => mpc.map);

      logger.debug('Maps selected for scrim', {
        playerIds,
        totalMaps: mapPlayCounts.length,
        poolSize,
        selectedMaps: selectedMaps.map(m => ({ id: m.id, name: m.name }))
      });

      return selectedMaps;
    } catch (error) {
      logger.error('Error selecting maps for scrim:', { playerIds, count, error });
      throw error;
    }
  }

  /**
   * Record that a player played a map
   */
  async recordMapPlay(playerId: number, mapId: number): Promise<void> {
    try {
      await db.query(
        `INSERT INTO map_play_history (player_id, map_id, played_at)
         VALUES ($1, $2, NOW())`,
        [playerId, mapId]
      );
      logger.debug('Map play recorded', { playerId, mapId });
    } catch (error) {
      logger.error('Error recording map play:', { playerId, mapId, error });
      throw error;
    }
  }

  /**
   * Record map plays for multiple players
   */
  async recordMapPlays(playerIds: number[], mapIds: number[]): Promise<void> {
    if (playerIds.length === 0 || mapIds.length === 0) return;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      for (const playerId of playerIds) {
        for (const mapId of mapIds) {
          await client.query(
            `INSERT INTO map_play_history (player_id, map_id, played_at)
             VALUES ($1, $2, NOW())`,
            [playerId, mapId]
          );
        }
      }

      await client.query('COMMIT');
      logger.info('Map plays recorded', {
        playerCount: playerIds.length,
        mapCount: mapIds.length
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error recording map plays:', { playerIds, mapIds, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fisher-Yates shuffle algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export const mapService = new MapService();
