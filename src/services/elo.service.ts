import { db, tableName } from '../db/index.js';
import { Scrim, EloRating, League } from '../types.js';
import { logger } from '../utils/logger.js';

export class EloService {
    private readonly scrimsTable = tableName('scrims');
    private readonly scrimPlayersTable = tableName('scrim_players');
    private readonly matchPlayerStatsTable = tableName('match_player_stats');
    private readonly eloRatingsTable = tableName('elo_ratings');
    private readonly eloHistoryTable = tableName('elo_history');

    /**
     * Calculate new rating (Stub)
     * Replace this with your actual Elo formula
     */
    calculateNewRating(currentRating: number, opponentRating: number, result: number): number {
        // Basic Elo implementation for now
        const K = 32;
        const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - currentRating) / 400));
        return Math.round(currentRating + K * (result - expectedScore));
    }

    /**
     * Process Elo for a completed match
     */
    async processMatch(scrimId: number): Promise<void> {
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // 1. Fetch match details
            const scrimResult = await client.query<Scrim>(
                `SELECT * FROM ${this.scrimsTable} WHERE id = $1`,
                [scrimId]
            );
            const scrim = scrimResult.rows[0];

            if (!scrim) throw new Error(`Scrim ${scrimId} not found`);
            if (scrim.status !== 'completed') throw new Error(`Scrim ${scrimId} is not completed`);
            if (scrim.elo_processed) {
                logger.info(`Elo already processed for scrim ${scrimId}`);
                await client.query('ROLLBACK');
                return;
            }

            // 2. Fetch player stats/results
            // We need to know who won. The 'winner_team' column in scrims should be set by the parser.
            if (!scrim.winner_team) {
                throw new Error(`Scrim ${scrimId} has no winner_team set`);
            }

            // Get all players in the scrim and their team assignment
            // We need to join with match_player_stats to get the team_id
            const playersResult = await client.query<{ player_id: number; team_id: number }>(
                `SELECT sp.player_id, mps.team_id 
         FROM ${this.scrimPlayersTable} sp
         LEFT JOIN ${this.matchPlayerStatsTable} mps ON sp.player_id = mps.player_id AND mps.scrim_id = sp.scrim_id
         WHERE sp.scrim_id = $1
         GROUP BY sp.player_id, mps.team_id`, // Group to avoid duplicates if multiple maps
                [scrimId]
            );

            const players = playersResult.rows;

            // 3. Fetch current ratings
            const ratings = new Map<number, EloRating>();
            for (const p of players) {
                const ratingResult = await client.query<EloRating>(
                    `SELECT * FROM ${this.eloRatingsTable} WHERE player_id = $1 AND league = $2`,
                    [p.player_id, scrim.league]
                );

                if (ratingResult.rows.length > 0) {
                    ratings.set(p.player_id, ratingResult.rows[0]);
                } else {
                    // Initialize default rating if not exists
                    ratings.set(p.player_id, {
                        id: 0, // Placeholder
                        player_id: p.player_id,
                        league: scrim.league,
                        rating: 1000,
                        wins: 0,
                        losses: 0,
                        updated_at: new Date()
                    });
                }
            }

            // 4. Calculate new ratings
            // For 4-player FFA or Team vs Team, the logic differs.
            // Assuming Team vs Team (2v2) based on 'winner_team' (1 or 2)

            const team1 = players.filter(p => p.team_id === 1);
            const team2 = players.filter(p => p.team_id === 2);

            if (team1.length === 0 || team2.length === 0) {
                // Fallback if team_id is missing (e.g. manual result entry without parser)
                // This part might need adjustment based on how you handle manual results
                logger.warn(`Missing team assignments for scrim ${scrimId}, skipping Elo calculation`);
                await client.query('ROLLBACK');
                return;
            }

            const team1AvgRating = team1.reduce((sum, p) => sum + ratings.get(p.player_id)!.rating, 0) / team1.length;
            const team2AvgRating = team2.reduce((sum, p) => sum + ratings.get(p.player_id)!.rating, 0) / team2.length;

            const team1Result = scrim.winner_team === 1 ? 1 : 0;
            const team2Result = scrim.winner_team === 2 ? 1 : 0;

            // Update Team 1 Players
            for (const p of team1) {
                const currentRating = ratings.get(p.player_id)!;
                const newRating = this.calculateNewRating(currentRating.rating, team2AvgRating, team1Result);

                await this.updatePlayerRating(client, p.player_id, scrim.id, scrim.league, currentRating, newRating, team1Result === 1);
            }

            // Update Team 2 Players
            for (const p of team2) {
                const currentRating = ratings.get(p.player_id)!;
                const newRating = this.calculateNewRating(currentRating.rating, team1AvgRating, team2Result);

                await this.updatePlayerRating(client, p.player_id, scrim.id, scrim.league, currentRating, newRating, team2Result === 1);
            }

            // 5. Mark scrim as processed
            await client.query(
                `UPDATE ${this.scrimsTable} SET elo_processed = TRUE WHERE id = $1`,
                [scrimId]
            );

            await client.query('COMMIT');
            logger.info(`Elo processed for scrim ${scrimId}`);

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Error processing Elo for scrim ${scrimId}:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    private async updatePlayerRating(
        client: any,
        playerId: number,
        scrimId: number,
        league: League,
        currentRating: EloRating,
        newRating: number,
        isWin: boolean
    ) {
        // Upsert Elo Rating
        await client.query(
            `INSERT INTO ${this.eloRatingsTable} (player_id, league, rating, wins, losses, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (player_id, league) 
       DO UPDATE SET 
         rating = $3,
         wins = ${this.eloRatingsTable}.wins + $6,
         losses = ${this.eloRatingsTable}.losses + $7,
         updated_at = NOW()`,
            [
                playerId,
                league,
                newRating,
                isWin ? 1 : 0,
                isWin ? 0 : 1,
                isWin ? 1 : 0,
                isWin ? 0 : 1
            ]
        );

        // Insert History
        await client.query(
            `INSERT INTO ${this.eloHistoryTable} (player_id, scrim_id, old_rating, new_rating)
       VALUES ($1, $2, $3, $4)`,
            [playerId, scrimId, currentRating.rating, newRating]
        );
    }
}

export const eloService = new EloService();
