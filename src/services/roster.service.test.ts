import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetClient: vi.fn(),
  mockGetTrackmaniaProfileByDiscordId: vi.fn(),
  mockGetSkillGroupIdForLeague: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  db: {
    query: mocks.mockQuery,
    getClient: mocks.mockGetClient,
  },
}));

vi.mock('./sprocket.service.js', () => ({
  sprocketService: {
    getTrackmaniaProfileByDiscordId: mocks.mockGetTrackmaniaProfileByDiscordId,
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

import { RosterService } from './roster.service.js';

describe('RosterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detaches a player from old roster slots before assigning the new slot', async () => {
    const client = {
      query: vi.fn(),
      release: vi.fn(),
    };
    mocks.mockGetClient.mockResolvedValue(client);
    mocks.mockGetTrackmaniaProfileByDiscordId.mockResolvedValue({ sprocket_player_id: 501 });
    mocks.mockGetSkillGroupIdForLeague.mockResolvedValue(42);

    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 200 }] })
      .mockResolvedValueOnce({ rows: [{ id: 300 }] })
      .mockResolvedValueOnce({ rows: [{ id: 400 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });
    mocks.mockQuery.mockResolvedValueOnce({
      rows: [
        {
          slot_id: 400,
          team_id: 200,
          team_name: 'Flames ML',
          franchise_id: 20,
          franchise_name: 'Flames',
          role_id: 300,
          role_name: 'Starter',
          player_id: 501,
          member_id: 301,
          discord_id: '1001',
          discord_username: 'Alpha',
        },
      ],
    });

    const row = await new RosterService().addPlayer('1001', 'Flames', 'Starter', 'Master');

    expect(row.slot_id).toBe(400);
    expect(client.query).toHaveBeenNthCalledWith(5, 'UPDATE sprocket.roster_slot SET "playerId" = NULL WHERE "playerId" = $1', [501]);
    expect(client.query).toHaveBeenNthCalledWith(6, 'UPDATE sprocket.roster_slot SET "playerId" = $1 WHERE id = $2', [501, 400]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
