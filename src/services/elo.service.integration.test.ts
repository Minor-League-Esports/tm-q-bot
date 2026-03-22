import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eloService } from './elo.service.js';
import { db } from '../db/index.js';
import { setupTestDb, teardownTestDb } from '../tests/setup.js';
import { Scrim, EloRating } from '../types.js';

describe('EloService', () => {
    describe('calculateNewRating (Unit)', () => {
        it('should calculate correct rating change for equal ratings', () => {
            // K=32, Expected=0.5, Result=1 (Win) -> 1000 + 32 * (1 - 0.5) = 1016
            const newRating = eloService.calculateNewRating(1000, 1000, 1);
            expect(newRating).toBe(1016);
        });

        it('should calculate correct rating change for underdog win', () => {
            // K=32, Expected ~0.24, Result=1 (Win) -> 1000 + 32 * (1 - 0.24) = 1000 + 24.32 = 1024
            const newRating = eloService.calculateNewRating(1000, 1200, 1);
            expect(newRating).toBeGreaterThan(1016); // Should gain more than equal match
            expect(newRating).toBe(1024);
        });

        it('should calculate correct rating change for favorite loss', () => {
            // K=32, Expected ~0.76, Result=0 (Loss) -> 1200 + 32 * (0 - 0.76) = 1200 - 24.32 = 1176
            const newRating = eloService.calculateNewRating(1200, 1000, 0);
            expect(newRating).toBeLessThan(1200);
            expect(newRating).toBe(1176);
        });
    });

    describe('processMatch (Integration)', () => {
        beforeAll(async () => {
            await setupTestDb();
        });

        afterAll(async () => {
            await teardownTestDb();
        });

        it('should update elo ratings correctly after a match', async () => {
            const client = await db.getClient();
            try {
                // 1. Setup: Create a completed scrim
                const scrimResult = await client.query<Scrim>(
                    `INSERT INTO scrims (scrim_uid, league, status, match_type, winner_team, created_at, completed_at)
           VALUES ('ELO-TEST', 'Master', 'completed', 'QUEUE', 1, NOW(), NOW())
           RETURNING *`
                );
                const scrim = scrimResult.rows[0];

                // 2. Setup: Add players to scrim
                // Team 1: Players 1 & 2 (Winners)
                // Team 2: Players 3 & 4 (Losers)
                // Use players that exist in the seed data (ids 1-4)
                const players = [1, 2, 3, 4];

                // Ensure players exist (in case seed data is different or cleared)
                for (const pid of players) {
                    await client.query(
                        `INSERT INTO players (id, discord_id, discord_username, league)
                         VALUES ($1, $2, $3, 'Master')
                         ON CONFLICT (id) DO NOTHING`,
                        [pid, `test_discord_id_${pid}`, `TestPlayer${pid}`]
                    ).catch(async (e) => {
                        // If conflict on discord_id, update the existing player to have the ID we want
                        // or just use the existing player ID if we can't change it
                        if (e.code === '23505' && e.constraint === 'players_discord_id_key') {
                            // We can't easily change the ID if it's referenced elsewhere,
                            // but for this test we need specific IDs 1,2,3,4.
                            // If we can't insert, it means the discord_id exists.
                            // Let's try to delete the conflicting player and re-insert
                            // This is risky if there are foreign keys, but in a test env it might be okay
                            // OR better: just update the discord_id of the conflicting row to something else
                            // so we can insert our row.
                            await client.query(
                                `UPDATE players SET discord_id = $1 WHERE discord_id = $2`,
                                [`temp_${Date.now()}_${pid}`, `test_discord_id_${pid}`]
                            );
                            // Now try insert again
                            await client.query(
                                `INSERT INTO players (id, discord_id, discord_username, league)
                                 VALUES ($1, $2, $3, 'Master')
                                 ON CONFLICT (id) DO NOTHING`,
                                [pid, `test_discord_id_${pid}`, `TestPlayer${pid}`]
                            );
                        } else {
                            throw e;
                        }
                    });
                }

                for (const pid of players) {
                    await client.query(
                        `INSERT INTO scrim_players (scrim_id, player_id, checked_in) VALUES ($1, $2, TRUE)`,
                        [scrim.id, pid]
                    );
                }

                // 3. Setup: Add match stats to assign teams
                // Team 1
                await client.query(`INSERT INTO match_player_stats (scrim_id, player_id, team_id, points, is_finished, is_dnf, nb_respawns, created_at) VALUES ($1, 1, 1, 10, true, false, 0, NOW())`, [scrim.id]);
                await client.query(`INSERT INTO match_player_stats (scrim_id, player_id, team_id, points, is_finished, is_dnf, nb_respawns, created_at) VALUES ($1, 2, 1, 10, true, false, 0, NOW())`, [scrim.id]);
                // Team 2
                await client.query(`INSERT INTO match_player_stats (scrim_id, player_id, team_id, points, is_finished, is_dnf, nb_respawns, created_at) VALUES ($1, 3, 2, 5, true, false, 0, NOW())`, [scrim.id]);
                await client.query(`INSERT INTO match_player_stats (scrim_id, player_id, team_id, points, is_finished, is_dnf, nb_respawns, created_at) VALUES ($1, 4, 2, 5, true, false, 0, NOW())`, [scrim.id]);

                // 4. Setup: Set initial ratings (optional, defaults to 1000)
                // Let's set everyone to 1000 to make verification easy
                for (const pid of players) {
                    await client.query(
                        `INSERT INTO elo_ratings (player_id, league, rating, wins, losses, updated_at)
             VALUES ($1, 'Master', 1000, 0, 0, NOW())`,
                        [pid]
                    );
                }

                // 5. Execute: Process Match
                await eloService.processMatch(scrim.id);

                // 6. Verify: Check new ratings
                // Team 1 (Winners) should have gained rating
                const team1Ratings = await client.query<EloRating>(
                    `SELECT * FROM elo_ratings WHERE player_id IN (1, 2) AND league = 'Master'`
                );
                for (const row of team1Ratings.rows) {
                    expect(row.rating).toBeGreaterThan(1000);
                    expect(row.wins).toBe(1);
                    expect(row.losses).toBe(0);
                }

                // Team 2 (Losers) should have lost rating
                const team2Ratings = await client.query<EloRating>(
                    `SELECT * FROM elo_ratings WHERE player_id IN (3, 4) AND league = 'Master'`
                );
                for (const row of team2Ratings.rows) {
                    expect(row.rating).toBeLessThan(1000);
                    expect(row.wins).toBe(0);
                    expect(row.losses).toBe(1);
                }

                // Verify scrim marked as processed
                const updatedScrim = await client.query<Scrim>(
                    `SELECT * FROM scrims WHERE id = $1`,
                    [scrim.id]
                );
                expect(updatedScrim.rows[0].elo_processed).toBe(true);

            } finally {
                client.release();
            }
        });
    });
});