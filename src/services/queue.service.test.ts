import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueService } from './queue.service.js';
import { playerService } from './player.service.js';
import { banService } from './ban.service.js';
import { mapService } from './map.service.js';
import { scrimService } from './scrim.service.js';
import { Player, Scrim, ScrimPlayer, Map as GameMap } from '../types.js';

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

    const makePlayer = (id: number): Player => ({
        ...mockPlayer,
        id,
        discord_id: `id${id}`,
        discord_username: `user${id}`,
    });

    const makeScrimPlayer = (playerId: number, checkedIn: boolean): ScrimPlayer => ({
        id: playerId,
        scrim_id: mockScrim.id,
        player_id: playerId,
        checked_in: checkedIn,
        checkin_at: checkedIn ? new Date() : null,
    });

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create a new instance for each test to ensure clean state
        queueService = new QueueService();

        // Setup default mock implementations
        vi.mocked(playerService.syncPlayerFromSprocket).mockResolvedValue(mockPlayer);
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
            vi.mocked(playerService.syncPlayerFromSprocket).mockResolvedValue(null);

            const result = await queueService.joinQueue('unknown', 'unknown');

            expect(result.success).toBe(false);
            expect(result.message).toContain('valid Sprocket Trackmania profile');
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

    describe('cancelQueueScrim', () => {
        it('should cancel a checking-in scrim and return only checked-in players to the queue', async () => {
            const scrimPlayers: ScrimPlayer[] = [
                makeScrimPlayer(1, true),
                makeScrimPlayer(2, false),
                makeScrimPlayer(3, true),
                makeScrimPlayer(4, false),
            ];
            const restoredPlayers = [makePlayer(1), makePlayer(3)];

            vi.mocked(scrimService.getById).mockResolvedValue({ ...mockScrim, status: 'checking_in' });
            vi.mocked(scrimService.getScrimPlayers).mockResolvedValue(scrimPlayers);
            vi.mocked(scrimService.cancelScrim).mockResolvedValue();
            vi.mocked(playerService.getByIds).mockResolvedValue(restoredPlayers);

            const result = await queueService.cancelQueueScrim(mockScrim.id);

            expect(result.success).toBe(true);
            expect(result.message).toContain('Returned 2 player(s) to the queue');
            expect(result.restoredPlayerIds).toEqual([1, 3]);
            expect(scrimService.cancelScrim).toHaveBeenCalledWith(mockScrim.id);
            expect(banService.applyDodgePenalty).not.toHaveBeenCalled();
            expect(queueService.getLeagueQueue('Master')).toHaveLength(2);
            expect(queueService.getLeagueQueue('Master').map((entry) => entry.playerId)).toEqual([3, 1]);
        });

        it('should cancel an active scrim and return all players to the queue', async () => {
            const scrimPlayers: ScrimPlayer[] = [
                makeScrimPlayer(1, true),
                makeScrimPlayer(2, true),
                makeScrimPlayer(3, true),
                makeScrimPlayer(4, true),
            ];
            const restoredPlayers = [makePlayer(1), makePlayer(2), makePlayer(3), makePlayer(4)];

            vi.mocked(scrimService.getById).mockResolvedValue({ ...mockScrim, status: 'active' });
            vi.mocked(scrimService.getScrimPlayers).mockResolvedValue(scrimPlayers);
            vi.mocked(scrimService.cancelScrim).mockResolvedValue();
            vi.mocked(playerService.getByIds).mockResolvedValue(restoredPlayers);

            const result = await queueService.cancelQueueScrim(mockScrim.id);

            expect(result.success).toBe(true);
            expect(result.message).toContain('Returned 4 player(s) to the queue');
            expect(result.restoredPlayerIds).toEqual([1, 2, 3, 4]);
            expect(scrimService.cancelScrim).toHaveBeenCalledWith(mockScrim.id);
            expect(banService.applyDodgePenalty).not.toHaveBeenCalled();
            expect(queueService.getLeagueQueue('Master')).toHaveLength(4);
            expect(queueService.getLeagueQueue('Master').map((entry) => entry.playerId)).toEqual([4, 3, 2, 1]);
        });

        it('should refuse to cancel a scrim that is already completed', async () => {
            vi.mocked(scrimService.getById).mockResolvedValue({ ...mockScrim, status: 'completed' });

            const result = await queueService.cancelQueueScrim(mockScrim.id);

            expect(result.success).toBe(false);
            expect(result.message).toContain('already completed');
            expect(scrimService.cancelScrim).not.toHaveBeenCalled();
            expect(queueService.getLeagueQueue('Master')).toHaveLength(0);
            expect(banService.applyDodgePenalty).not.toHaveBeenCalled();
        });
    });

    describe('popQueue', () => {
        it('should emit queuePop event when 4 players join', async () => {
            const queuePopSpy = vi.fn();
            queueService.on('queuePop', queuePopSpy);

            // Add 3 players
            for (let i = 1; i <= 3; i++) {
                const player = { ...mockPlayer, id: i, discord_id: `id${i}` };
                vi.mocked(playerService.syncPlayerFromSprocket).mockResolvedValueOnce(player);
                await queueService.joinQueue(player.discord_id, player.discord_username);
            }

            expect(queueService.getLeagueQueue('Master')).toHaveLength(3);
            expect(queuePopSpy).not.toHaveBeenCalled();

            // Add 4th player
            const player4 = { ...mockPlayer, id: 4, discord_id: 'id4' };
            vi.mocked(playerService.syncPlayerFromSprocket).mockResolvedValueOnce(player4);
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
