import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mapService } from './map.service.js';
import { db } from '../db/index.js';
import { Map as ScrimMap } from '../types.js';

// Mock the database
vi.mock('../db/index.js', () => ({
  db: {
    query: vi.fn(),
    getClient: vi.fn(),
  }
}));
// Mock config to avoid environment variable checks
vi.mock('../config.js', () => ({
  config: {
    queue: {
      mapHistoryDays: 14,
      minMapPoolSize: 10,
    },
    app: {
      logLevel: 'error'
    }
  }
}));

// Mock the logger to suppress output during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('MapService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockMap = (id: number, name: string = `Map ${id}`): ScrimMap => ({
    id,
    name,
    uid: `uid-${id}`,
    author: 'Author',
    is_active: true,
    created_at: new Date(),
  });

  describe('selectMapsForScrim', () => {
    it('should select the requested number of maps', async () => {
      const mockMaps = Array.from({ length: 10 }, (_, i) => ({
        map: createMockMap(i + 1),
        playCount: i,
      }));

      // Spy on getMapPlayCounts to return our mock data
      vi.spyOn(mapService, 'getMapPlayCounts').mockResolvedValue(mockMaps);

      const result = await mapService.selectMapsForScrim([1, 2, 3, 4], 3);

      expect(result).toHaveLength(3);
      expect(mapService.getMapPlayCounts).toHaveBeenCalledWith([1, 2, 3, 4]);
    });

    it('should return unique maps', async () => {
      const mockMaps = Array.from({ length: 10 }, (_, i) => ({
        map: createMockMap(i + 1),
        playCount: i,
      }));

      vi.spyOn(mapService, 'getMapPlayCounts').mockResolvedValue(mockMaps);

      const result = await mapService.selectMapsForScrim([1, 2, 3, 4], 3);
      const uniqueIds = new Set(result.map(m => m.id));
      expect(uniqueIds.size).toBe(3);
    });

    it('should prioritize least-played maps', async () => {
      // Create 20 maps.
      // First 10 have 0 plays.
      // Next 10 have 100 plays.
      // Default minMapPoolSize is 10.
      // Pool size calculation: max(10, ceil(20 * 0.2)) = max(10, 4) = 10.
      // So it should select from the top 10 least played maps (which are the first 10).

      const lowPlayMaps = Array.from({ length: 10 }, (_, i) => ({
        map: createMockMap(i + 1, `Low ${i}`),
        playCount: 0,
      }));
      const highPlayMaps = Array.from({ length: 10 }, (_, i) => ({
        map: createMockMap(i + 11, `High ${i}`),
        playCount: 100,
      }));

      const allMaps = [...lowPlayMaps, ...highPlayMaps];

      vi.spyOn(mapService, 'getMapPlayCounts').mockResolvedValue(allMaps);

      const result = await mapService.selectMapsForScrim([1, 2, 3, 4], 3);

      expect(result).toHaveLength(3);
      // Verify all selected maps are from the low play group (ids 1-10)
      result.forEach(map => {
        expect(map.id).toBeLessThanOrEqual(10);
      });
    });

    it('should return all maps if fewer than requested are available', async () => {
      const mockMaps = [
        { map: createMockMap(1), playCount: 0 },
        { map: createMockMap(2), playCount: 0 },
      ];

      vi.spyOn(mapService, 'getMapPlayCounts').mockResolvedValue(mockMaps);

      const result = await mapService.selectMapsForScrim([1, 2, 3, 4], 3);

      expect(result).toHaveLength(2);
      expect(result.map(m => m.id)).toEqual([1, 2]);
    });

    it('should throw error if no maps available', async () => {
      vi.spyOn(mapService, 'getMapPlayCounts').mockResolvedValue([]);

      await expect(mapService.selectMapsForScrim([1, 2, 3, 4], 3))
        .rejects.toThrow('No active maps available');
    });
  });

  describe('getMapPlayCounts', () => {
    it('should query database and return maps with play counts', async () => {
      const mockRows = [
        { map_id: 1, play_count: '5' },
        { map_id: 2, play_count: '2' }
      ];

      const mockMaps = [createMockMap(1), createMockMap(2)];

      // Mock the first db query (play counts)
      (db.query as any).mockResolvedValueOnce({ rows: mockRows });

      // Spy on getByIds to avoid mocking the second db query
      vi.spyOn(mapService, 'getByIds').mockResolvedValue(mockMaps);

      const result = await mapService.getMapPlayCounts([1, 2]);

      expect(db.query).toHaveBeenCalled();
      expect(mapService.getByIds).toHaveBeenCalledWith([1, 2]);
      expect(result).toHaveLength(2);

      // Verify mapping
      const map1 = result.find(r => r.map.id === 1);
      expect(map1).toBeDefined();
      expect(map1?.playCount).toBe(5);

      const map2 = result.find(r => r.map.id === 2);
      expect(map2).toBeDefined();
      expect(map2?.playCount).toBe(2);
    });
  });
});
