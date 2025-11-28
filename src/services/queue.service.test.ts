import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueService } from './queue.service.js';
import { playerService } from './player.service.js';
import { banService } from './ban.service.js';
import { mapService } from './map.service.js';
import { scrimService } from './scrim.service.js';
import { Player, Scrim, Map as GameMap } from '../types.js';

// Mock dependencies
vi.mock('./player.service.js');
vi.mock('./ban.service.js');
vi.mock('./map.service.js');
vi.mock('./scrim.service.js');
vi.mock('../utils/logger.js');

describe('QueueService', () => {
    let queueService: QueueService;

    const mockPlayer: Player = {
        id: 1,
        discord_id: '123456789',
        discord_username: 'testuser',
        league: 'Master',
        created_at: new Date(),
        updated_at: new Date(),
    };

    const mockMap: GameMap = {
        id: 1,
        name: 'Test Map',
        uid: 'uid1',
        author: 'Author',
        is_active: true,
        created_at: new Date(),
    };

    const mockScrim: Scrim = {
        id: 1,
        scrim_uid: 'SCRIM-123',
        league: 'Master',
        status: 'checking_in',
        match_type: 'QUEUE',
        winner_team: null,
        elo_processed: false,
        checkin_deadline: new Date(),
        completed_at: null,
        created_at: new Date(),
    };

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create a new instance for each test to ensure clean state
        queueService = new QueueService();

        // Setup default mock implementations
        vi.mocked(playerService.getByDiscordId).mockResolvedValue(mockPlayer);
        vi.mocked(banService.isPlayerBanned).mockResolvedValue(false);
        vi.mocked(playerService.getByIds).mockResolvedValue([mockPlayer, mockPlayer, mockPlayer, mockPlayer]);
        vi.mocked(mapService.selectMapsForScrim).mockResolvedValue([mockMap, mockMap, mockMap]);
        vi.mocked(scrimService.createScrim).mockResolvedValue(mockScrim);
    });

    afterEach(() => {
        queueService.removeAllListeners();
    });

    describe('joinQueue', () => {
        it('should allow a player to join the correct league queue', async () => {
            const result = await queueService.joinQueue(mockPlayer.discord_id, mockPlayer.discord_username);

            expect(result.success).toBe(true);
            expect(result.message).toContain('joined the Master queue');
            expect(queueService.getLeagueQueue('Master')).toHaveLength(1);
            expect(queueService.getLeagueQueue('Master')[0].discordId).toBe(mockPlayer.discord_id);
        });

        it('should reject duplicate join attempts', async () => {
            // Join first time
            await queueService.joinQueue(mockPlayer.discord_id, mockPlayer.discord_username);

            // Join second time
            const result = await queueService.joinQueue(mockPlayer.discord_id, mockPlayer.discord_username);

            expect(result.success).toBe(false);
            expect(result.message).toContain('already in the Master queue');
            expect(queueService.getLeagueQueue('Master')).toHaveLength(1);
        });

        it('should reject unregistered players', async () => {
            vi.mocked(playerService.getByDiscordId).mockResolvedValue(null);

            const result = await queueService.joinQueue('unknown', 'unknown');

            expect(result.success).toBe(false);
            expect(result.message).toContain('must be registered');
            expect(queueService.getLeagueQueue('Master')).toHaveLength(0);
        });

        it('should reject banned players', async () => {
            vi.mocked(banService.isPlayerBanned).mockResolvedValue(true);
            vi.mocked(banService.getBanTimeRemaining).mockResolvedValue(300); // 5 minutes

            const result = await queueService.joinQueue(mockPlayer.discord_id, mockPlayer.discord_username);

            expect(result.success).toBe(false);
            expect(result.message).toContain('banned from queueing');
            expect(queueService.getLeagueQueue('Master')).toHaveLength(0);
        });
    });

    describe('leaveQueue', () => {
        it('should remove a player from the queue', async () => {
            // Join first
            await queueService.joinQueue(mockPlayer.discord_id, mockPlayer.discord_username);
            expect(queueService.getLeagueQueue('Master')).toHaveLength(1);

            // Leave
            const result = await queueService.leaveQueue(mockPlayer.discord_id);

            expect(result.success).toBe(true);
            expect(result.message).toContain('left the Master queue');
            expect(queueService.getLeagueQueue('Master')).toHaveLength(0);
        });

        it('should return error if player is not in any queue', async () => {
            const result = await queueService.leaveQueue(mockPlayer.discord_id);

            expect(result.success).toBe(false);
            expect(result.message).toContain('not in any queue');
        });
    });

    describe('popQueue', () => {
        it('should emit queuePop event when 4 players join', async () => {
            const queuePopSpy = vi.fn();
            queueService.on('queuePop', queuePopSpy);

            // Add 3 players
            for (let i = 1; i <= 3; i++) {
                const player = { ...mockPlayer, id: i, discord_id: `id${i}` };
                vi.mocked(playerService.getByDiscordId).mockResolvedValueOnce(player);
                await queueService.joinQueue(player.discord_id, player.discord_username);
            }

            expect(queueService.getLeagueQueue('Master')).toHaveLength(3);
            expect(queuePopSpy).not.toHaveBeenCalled();

            // Add 4th player
            const player4 = { ...mockPlayer, id: 4, discord_id: 'id4' };
            vi.mocked(playerService.getByDiscordId).mockResolvedValueOnce(player4);
            await queueService.joinQueue(player4.discord_id, player4.discord_username);

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(queuePopSpy).toHaveBeenCalledTimes(1);
            expect(queueService.getLeagueQueue('Master')).toHaveLength(0); // Queue should be empty after pop

            // Verify dependencies were called correctly
            expect(mapService.selectMapsForScrim).toHaveBeenCalled();
            expect(scrimService.createScrim).toHaveBeenCalledWith(
                'Master',
                expect.arrayContaining([1, 2, 3, 4]),
                expect.any(Array)
            );
        });
    });
});