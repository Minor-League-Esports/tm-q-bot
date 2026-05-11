import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetSkillGroupIdForLeague: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  db: {
    query: mocks.mockQuery,
  },
  tableName: (table: string) => `trackmania.${table}`,
}));

vi.mock('./sprocket.service.js', () => ({
  sprocketService: {
    getSkillGroupIdForLeague: mocks.mockGetSkillGroupIdForLeague,
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

import { FixtureService } from './fixture.service.js';
import { IdentityBackfillService } from './identity-backfill.service.js';
import { MatchAuditService } from './match-audit.service.js';

describe('FixtureService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an existing fixture when the skill group does not match the league', async () => {
    mocks.mockGetSkillGroupIdForLeague.mockResolvedValue(42);
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await expect(new FixtureService().resolveFixture(client, 9001, 'Master')).rejects.toThrow(
      'Fixture 9001 was not found for Master'
    );
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('"skillGroupId" = $2'), [9001, 42]);
  });
});

describe('MatchAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a full audit report with tightened Elo consistency checks', async () => {
    mocks.mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            scrim_uid: 'SCRIM-123',
            league: 'Master',
            status: 'completed',
            match_type: 'SCHEDULED',
            winner_team: 1,
            elo_processed: true,
            sprocket_match_parent_id: 70,
            sprocket_match_id: 71,
            fixture_id: 100,
            home_franchise_id: 1,
            home_franchise_name: 'Flames',
            away_franchise_id: 2,
            away_franchise_name: 'Jets',
            fixture_league: 'Master',
            game_mode: 'Teams',
            schedule_group_id: 10,
            schedule_group_name: 'Trackmania Test',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            local_player_id: 1,
            discord_id: '1001',
            discord_username: 'Alpha',
            sprocket_player_id: 501,
            member_id: 301,
            platform_account_ids: ['alpha'],
            checked_in: true,
            team_id: 1,
          },
          {
            local_player_id: 2,
            discord_id: '1002',
            discord_username: 'Bravo',
            sprocket_player_id: 502,
            member_id: 302,
            platform_account_ids: ['bravo'],
            checked_in: true,
            team_id: 2,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ map_id: 11, map_uid: 'map-1', map_name: 'Map One', player_id: 1, stat_rows: 1 }] })
      .mockResolvedValueOnce({ rows: [{ player_id: 501, points: 10 }, { player_id: 502, points: 8 }] })
      .mockResolvedValueOnce({ rows: [{ player_id: 1, old_rating: 1000, new_rating: 1016, change_amount: 16, created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [{ player_id: 1, rating: 1016, wins: 1, losses: 0, updated_at: new Date() }] });

    const report = await new MatchAuditService().auditByScrimUid('SCRIM-123');

    expect(report?.scrim.scrim_uid).toBe('SCRIM-123');
    expect(report?.fixture?.fixture_id).toBe(100);
    expect(report?.players).toHaveLength(2);
    expect(report?.checks.fixture_linked).toBe(true);
    expect(report?.checks.stats_present).toBe(true);
    expect(report?.checks.eligibility_present).toBe(true);
    expect(report?.checks.elo_ready).toBe(true);
    expect(report?.checks.elo_processed_once).toBe(false);
  });
});

describe('IdentityBackfillService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies missing and duplicate Sprocket profiles', async () => {
    mocks.mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          discord_id: '1001',
          discord_username: 'Missing',
          sprocket_player_id: null,
          member_id: null,
          sprocket_player_ids: [],
        },
        {
          id: 2,
          discord_id: '1002',
          discord_username: 'Duplicate',
          sprocket_player_id: 502,
          member_id: 302,
          sprocket_player_ids: [502, 503],
        },
      ],
    });

    const issues = await new IdentityBackfillService().backfillTrackmaniaPlayerIdentities();

    expect(issues).toEqual([
      {
        local_player_id: 1,
        discord_id: '1001',
        discord_username: 'Missing',
        reason: 'missing_sprocket_profile',
        sprocket_player_ids: [],
      },
      {
        local_player_id: 2,
        discord_id: '1002',
        discord_username: 'Duplicate',
        reason: 'duplicate_sprocket_profiles',
        sprocket_player_ids: [502, 503],
      },
    ]);
  });
});
