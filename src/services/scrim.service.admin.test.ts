import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Scrim, Map as GameMap } from '../types.js';

const mocks = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGenerateUrlData: vi.fn((scrimId: string, players: string[], maps: string[], timestamp?: Date) => ({
    scrimId,
    players,
    maps,
    timestamp,
  })),
  mockGenerateWebAppUrl: vi.fn(() => 'https://example.test/submit'),
}));

vi.mock('../config.js', () => ({
  config: {
    database: { schema: 'trackmania' },
    queue: { checkInTimeout: 300 },
  },
}));

vi.mock('../db/index.js', () => ({
  db: {
    query: mocks.mockQuery,
    getClient: vi.fn(),
  },
  tableName: (table: string) => `trackmania.${table}`,
}));

vi.mock('./sprocket.service.js', () => ({
  sprocketService: {
    createMatchParentAndMatch: vi.fn(),
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/urlGenerator.js', () => ({
  UrlGenerator: {
    createUrlData: mocks.mockGenerateUrlData,
    generateWebAppUrl: mocks.mockGenerateWebAppUrl,
  },
}));

import { scrimService } from './scrim.service.js';

describe('ScrimService admin state queries', () => {
  const liveScrim: Scrim = {
    id: 42,
    scrim_uid: 'SCRIM-AAA111',
    league: 'Master',
    status: 'checking_in',
    match_type: 'QUEUE',
    sprocket_match_parent_id: 9001,
    sprocket_match_id: 9002,
    winner_team: null,
    elo_processed: false,
    created_at: new Date('2026-03-22T18:00:00.000Z'),
    checkin_deadline: new Date('2026-03-22T18:05:00.000Z'),
    completed_at: null,
  };

  const players = [
    {
      id: 1,
      discord_id: '1001',
      discord_username: 'Alpha',
      league: 'Master',
      created_at: new Date('2026-03-01T00:00:00.000Z'),
      updated_at: new Date('2026-03-21T00:00:00.000Z'),
      checked_in: true,
      checkin_at: new Date('2026-03-22T18:01:00.000Z'),
    },
    {
      id: 2,
      discord_id: '1002',
      discord_username: 'Bravo',
      league: 'Master',
      created_at: new Date('2026-03-01T00:00:00.000Z'),
      updated_at: new Date('2026-03-21T00:00:00.000Z'),
      checked_in: true,
      checkin_at: new Date('2026-03-22T18:01:00.000Z'),
    },
    {
      id: 3,
      discord_id: '1003',
      discord_username: 'Charlie',
      league: 'Master',
      created_at: new Date('2026-03-01T00:00:00.000Z'),
      updated_at: new Date('2026-03-21T00:00:00.000Z'),
      checked_in: true,
      checkin_at: new Date('2026-03-22T18:01:00.000Z'),
    },
    {
      id: 4,
      discord_id: '1004',
      discord_username: 'Delta',
      league: 'Master',
      created_at: new Date('2026-03-01T00:00:00.000Z'),
      updated_at: new Date('2026-03-21T00:00:00.000Z'),
      checked_in: false,
      checkin_at: null,
    },
  ];

  const maps: GameMap[] = [
    {
      id: 11,
      name: 'Sunset Sprint',
      uid: 'map-1',
      author: 'Mapper One',
      is_active: true,
      created_at: new Date('2026-03-01T00:00:00.000Z'),
    },
    {
      id: 12,
      name: 'Midnight Drift',
      uid: 'map-2',
      author: 'Mapper Two',
      is_active: true,
      created_at: new Date('2026-03-01T00:00:00.000Z'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates a single scrim detail with players, maps, and submission link', async () => {
    mocks.mockQuery
      .mockResolvedValueOnce({ rows: [liveScrim] })
      .mockResolvedValueOnce({ rows: players })
      .mockResolvedValueOnce({ rows: maps });

    const detail = await scrimService.getAdminScrimDetail(liveScrim.id);

    expect(detail).not.toBeNull();
    expect(detail?.checkedInCount).toBe(3);
    expect(detail?.players).toHaveLength(4);
    expect(detail?.maps.map((map) => map.name)).toEqual(['Sunset Sprint', 'Midnight Drift']);
    expect(detail?.submissionUrl).toBe('https://example.test/submit');
    expect(mocks.mockGenerateUrlData).toHaveBeenCalledWith(
      'SCRIM-AAA111',
      ['Alpha', 'Bravo', 'Charlie', 'Delta'],
      ['Sunset Sprint', 'Midnight Drift'],
      liveScrim.created_at
    );
  });

  it('lists live scrims with the expected filters', async () => {
    mocks.mockQuery
      .mockResolvedValueOnce({ rows: [liveScrim] })
      .mockResolvedValueOnce({ rows: [liveScrim] })
      .mockResolvedValueOnce({ rows: players })
      .mockResolvedValueOnce({ rows: maps });

    const details = await scrimService.getLiveAdminScrims('Master', 1);

    expect(details).toHaveLength(1);
    expect(details[0].scrim.scrim_uid).toBe('SCRIM-AAA111');
    expect(mocks.mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('match_type = $2'),
      ['Master', 'QUEUE', ['checking_in', 'active'], 1]
    );
  });
});
