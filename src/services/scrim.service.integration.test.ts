import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { scrimService } from './scrim.service.js';
import { db } from '../db/index.js';
import { setupTestDb, teardownTestDb } from '../tests/setup.js';
import { Map as GameMap } from '../types.js';

describe('ScrimService Integration', () => {
    beforeAll(async () => {
        await setupTestDb();
    });

    afterAll(async () => {
        await teardownTestDb();
    });

    // Helper to get test players from seed
    const getTestPlayers = async () => {
        const result = await db.query('SELECT id FROM players LIMIT 4');
        return result.rows.map(r => r.id);
    };

    // Helper to get test maps from seed
    const getTestMaps = async () => {
        const result = await db.query<GameMap>('SELECT * FROM maps LIMIT 3');
        return result.rows;
    };

    describe('createScrim', () => {
        it('should create a scrim with players and maps', async () => {
            const playerIds = await getTestPlayers();
            const maps = await getTestMaps();

            const scrim = await scrimService.createScrim('Master', playerIds, maps);

            expect(scrim).toBeDefined();
            expect(scrim.id).toBeDefined();
            expect(scrim.league).toBe('Master');
            expect(scrim.status).toBe('checking_in');
            expect(scrim.match_type).toBe('QUEUE');

            // Verify players were added
            const players = await scrimService.getScrimPlayers(scrim.id);
            expect(players).toHaveLength(4);
            expect(players.map(p => p.player_id).sort()).toEqual(playerIds.sort());
            expect(players.every(p => !p.checked_in)).toBe(true);

            // Verify maps were added
            const scrimMaps = await scrimService.getScrimMaps(scrim.id);
            expect(scrimMaps).toHaveLength(3);
            expect(scrimMaps.map(m => m.map_id).sort()).toEqual(maps.map(m => m.id).sort());
        });

        it('should fail if not exactly 4 players', async () => {
            const playerIds = (await getTestPlayers()).slice(0, 3);
            const maps = await getTestMaps();

            await expect(scrimService.createScrim('Master', playerIds, maps))
                .rejects.toThrow('Scrim must have exactly 4 players');
        });
    });

    describe('checkInPlayer', () => {
        it('should update checked_in status', async () => {
            const playerIds = await getTestPlayers();
            const maps = await getTestMaps();
            const scrim = await scrimService.createScrim('Master', playerIds, maps);

            const playerId = playerIds[0];
            const success = await scrimService.checkInPlayer(scrim.id, playerId);

            expect(success).toBe(true);

            const players = await scrimService.getScrimPlayers(scrim.id);
            const player = players.find(p => p.player_id === playerId);
            expect(player?.checked_in).toBe(true);
            expect(player?.checkin_at).toBeDefined();
        });

        it('should activate scrim when all players check in', async () => {
            const playerIds = await getTestPlayers();
            const maps = await getTestMaps();
            const scrim = await scrimService.createScrim('Master', playerIds, maps);

            // Check in all players
            for (const playerId of playerIds) {
                await scrimService.checkInPlayer(scrim.id, playerId);
            }

            const updatedScrim = await scrimService.getById(scrim.id);
            expect(updatedScrim?.status).toBe('active');
        });

        it('should return false if player not in scrim', async () => {
            const playerIds = await getTestPlayers();
            const maps = await getTestMaps();
            const scrim = await scrimService.createScrim('Master', playerIds, maps);

            const success = await scrimService.checkInPlayer(scrim.id, 99999); // Non-existent player ID
            expect(success).toBe(false);
        });
    });
});