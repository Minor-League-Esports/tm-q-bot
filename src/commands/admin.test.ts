import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queueService: {
    clearAllQueues: vi.fn(),
    clearLeagueQueue: vi.fn(),
    cancelQueueScrim: vi.fn(),
  },
  banService: {
    applyManualBan: vi.fn(),
    unbanPlayer: vi.fn(),
    isPlayerBanned: vi.fn(),
    getRecentDodgeCount: vi.fn(),
    getPlayerBanHistory: vi.fn(),
    getActiveBan: vi.fn(),
    getBanTimeRemaining: vi.fn(),
  },
  playerService: {
    getByDiscordId: vi.fn(),
    getById: vi.fn(),
    getByIds: vi.fn(),
    validateSprocketIdentity: vi.fn(),
    syncPlayerFromSprocket: vi.fn(),
  },
  scrimService: {
    createScheduledMatch: vi.fn(),
    getByUid: vi.fn(),
    getLiveAdminScrims: vi.fn(),
    getScheduledAdminMatches: vi.fn(),
  },
  eloService: {
    processMatch: vi.fn(),
  },
}));

vi.mock('../services/queue.service.js', () => ({
  queueService: mocks.queueService,
}));

vi.mock('../services/ban.service.js', () => ({
  banService: mocks.banService,
}));

vi.mock('../services/player.service.js', () => ({
  playerService: mocks.playerService,
}));

vi.mock('../services/scrim.service.js', () => ({
  scrimService: mocks.scrimService,
}));

vi.mock('../services/elo.service.js', () => ({
  eloService: mocks.eloService,
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { execute } from './admin.js';

describe('admin command state queries', () => {
  const liveDetail = {
    scrim: {
      id: 1,
      scrim_uid: 'SCRIM-LIVE',
      league: 'Master',
      status: 'checking_in',
      match_type: 'QUEUE',
      sprocket_match_parent_id: 100,
      sprocket_match_id: 101,
      winner_team: null,
      elo_processed: false,
      created_at: new Date('2026-03-22T18:00:00.000Z'),
      checkin_deadline: new Date('2026-03-22T18:05:00.000Z'),
      completed_at: null,
    },
    players: [
      {
        id: 1,
        discord_id: '1',
        discord_username: 'Alpha',
        league: 'Master',
        created_at: new Date('2026-03-01T00:00:00.000Z'),
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
        checked_in: true,
        checkin_at: new Date('2026-03-22T18:01:00.000Z'),
      },
      {
        id: 2,
        discord_id: '2',
        discord_username: 'Bravo',
        league: 'Master',
        created_at: new Date('2026-03-01T00:00:00.000Z'),
        updated_at: new Date('2026-03-01T00:00:00.000Z'),
        checked_in: true,
        checkin_at: new Date('2026-03-22T18:01:00.000Z'),
      },
    ],
    maps: [
      {
        id: 11,
        name: 'Sunset Sprint',
        uid: 'map-1',
        author: 'Mapper One',
        is_active: true,
        created_at: new Date('2026-03-01T00:00:00.000Z'),
      },
    ],
    checkedInCount: 2,
    submissionUrl: 'https://example.test/submit',
  };

  const scheduledDetail = {
    ...liveDetail,
    scrim: {
      ...liveDetail.scrim,
      scrim_uid: 'SCRIM-SCHED',
      status: 'active',
      match_type: 'SCHEDULED',
      checkin_deadline: null,
    },
    submissionUrl: 'https://example.test/scheduled-submit',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createInteraction(subcommand: string, league: string | null = null) {
    return {
      options: {
        getSubcommandGroup: vi.fn(() => 'state'),
        getSubcommand: vi.fn(() => subcommand),
        getString: vi.fn((name: string) => (name === 'league' ? league : null)),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      user: { id: 'admin-1' },
      replied: false,
      deferred: false,
    } as any;
  }

  it('renders a summary of live and scheduled scrims', async () => {
    mocks.scrimService.getLiveAdminScrims.mockResolvedValue([liveDetail]);
    mocks.scrimService.getScheduledAdminMatches.mockResolvedValue([scheduledDetail]);

    const interaction = createInteraction('summary');

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(mocks.scrimService.getLiveAdminScrims).toHaveBeenCalledWith(undefined, 3);
    expect(mocks.scrimService.getScheduledAdminMatches).toHaveBeenCalledWith(undefined, 3);

    const replyPayload = interaction.editReply.mock.calls[0][0];
    const embedJson = replyPayload.embeds[0].toJSON();

    expect(embedJson.title).toBe('Admin State Summary');
    expect(embedJson.description).toBe('Live: 1 | Scheduled: 1');
    expect(embedJson.fields[0].name).toBe('Live Scrims');
    expect(embedJson.fields[0].value).toContain('SCRIM-LIVE');
    expect(embedJson.fields[1].name).toBe('Scheduled Matches');
    expect(embedJson.fields[1].value).toContain('SCRIM-SCHED');
  });

  it('renders scheduled matches with the requested league filter', async () => {
    mocks.scrimService.getScheduledAdminMatches.mockResolvedValue([scheduledDetail]);

    const interaction = createInteraction('scheduled', 'Master');

    await execute(interaction);

    expect(mocks.scrimService.getScheduledAdminMatches).toHaveBeenCalledWith('Master', 10);

    const replyPayload = interaction.editReply.mock.calls[0][0];
    const embedJson = replyPayload.embeds[0].toJSON();

    expect(embedJson.title).toBe('Admin State: Scheduled Matches - Master');
    expect(embedJson.description).toBe('1 scrim(s) found.');
    expect(embedJson.fields[0].name).toBe('SCRIM-SCHED');
    expect(embedJson.fields[0].value).toContain('Status: SCHEDULED / active');
    expect(embedJson.fields[0].value).toContain('Submit: https://example.test/scheduled-submit');
  });

  it('cancels a queue scrim by uid', async () => {
    const interaction = {
      options: {
        getSubcommandGroup: vi.fn(() => null),
        getSubcommand: vi.fn(() => 'cancel-scrim'),
        getString: vi.fn((name: string) => (name === 'scrim_id' ? 'SCRIM-LIVE' : null)),
      },
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      user: { id: 'admin-1' },
      replied: false,
      deferred: false,
    } as any;

    mocks.scrimService.getByUid.mockResolvedValue(liveDetail.scrim);
    mocks.queueService.cancelQueueScrim.mockResolvedValue({
      success: true,
      message: 'Cancelled scrim SCRIM-LIVE. Returned 2 player(s) to the queue.',
      scrimId: 1,
      scrimUid: 'SCRIM-LIVE',
      restoredPlayerIds: [1, 2],
    });

    await execute(interaction);

    expect(mocks.scrimService.getByUid).toHaveBeenCalledWith('SCRIM-LIVE');
    expect(mocks.queueService.cancelQueueScrim).toHaveBeenCalledWith(1);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: '✅ Cancelled scrim SCRIM-LIVE. Returned 2 player(s) to the queue.',
      ephemeral: false,
    });
  });
});
