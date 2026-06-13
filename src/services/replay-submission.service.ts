import { QueryResult, QueryResultRow } from 'pg';
import { db, tableName } from '../db/index.js';
import { logger } from '../utils/logger.js';

interface RawReplayPlayer {
  id?: string | null;
  name?: string;
  finished?: boolean;
  team?: number | string;
  dnf?: boolean;
  points?: number;
  nbRespawns?: number;
  roundPoints?: number;
  respawnTimeLoss?: number[];
  bestTime?: number;
  nbRespawnsByCp?: number[] | number;
  cpTimes?: number[];
  respawnTimes?: number[];
}

interface RawReplayRound {
  roundWinningTeam?: number;
  roundNumber?: number;
  players?: RawReplayPlayer[];
}

interface RawReplayMap {
  uid?: string;
  id?: string;
  name?: string;
  duration?: number;
  date?: string;
  rounds?: RawReplayRound[];
}

export interface RawReplay {
  createdTs?: number;
  teams?: Array<{ teamId: number; name: string }>;
  maps?: RawReplayMap[];
  map?: RawReplayMap;
  rounds?: RawReplayRound[];
}

export interface DriverPlacement {
  name: string;
  id: string | null;
  team: number | string;
  points: number;
  status: 'Finished' | 'DNF' | 'Did not participate';
  bestTime: number | '';
  nbRespawns: number;
  nbRespawnsByCP: number;
  respawnTimes: number[];
  respawnTimeLoss: number[];
  roundPoints: number[];
  cpTimes: number[];
}

export interface ParsedReplayMap {
  mapName: string;
  mapId: string;
  dateTime: string;
  mapDuration: number | null;
  driverPlacements: DriverPlacement[];
  driverIds: string[];
  roundCount: number;
  mapWinner: string | null;
  roundWinsSummary: string | null;
  team1Name: string;
  team2Name: string;
  mapScores: Array<{ teamName: string; totalPoints: number }>;
  mapWinnerPoints: number;
  mapLoserPoints: number;
}

export interface ReplaySaveResult {
  alreadyProcessed: boolean;
  mapsSaved: number;
  insertedStats: number;
  winnerTeam: 1 | 2;
}

interface TrackmaniaPlayerLookup {
  localPlayerId: number;
  sprocketPlayerId: number | null;
}

type Queryable = {
  query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
};

function normalizeName(name?: string): string {
  if (!name) return 'Unknown';
  return name.trim().replace(/[\W_]+$/, '');
}

function calculateMapScores(driverPlacements: DriverPlacement[]): Array<{ teamName: string; totalPoints: number }> {
  const teamScores: Record<string, number> = {};

  for (const driver of driverPlacements) {
    const team = String(driver.team);
    if ((team === '1' || team === '2') && typeof driver.points === 'number') {
      teamScores[team] = (teamScores[team] || 0) + driver.points;
    }
  }

  return [
    { teamName: '1', totalPoints: teamScores['1'] || 0 },
    { teamName: '2', totalPoints: teamScores['2'] || 0 },
  ].sort((a, b) => b.totalPoints - a.totalPoints);
}

function parseSingleMapData(mapData: RawReplayMap, createdTs?: number, teamsData?: RawReplay['teams']): ParsedReplayMap {
  const result = {
    mapName: mapData.name || 'Unknown',
    mapId: mapData.uid || mapData.id || 'Unknown',
    dateTime: createdTs
      ? new Date(createdTs * 1000).toISOString()
      : mapData.date || new Date().toISOString(),
    mapDuration: mapData.duration ?? null,
    driverPlacements: [] as DriverPlacement[],
    driverIds: [] as string[],
    roundCount: 0,
    mapWinner: null as string | null,
    roundWinsSummary: null as string | null,
    team1Name: 'Team 1',
    team2Name: 'Team 2',
  };

  if (Array.isArray(teamsData)) {
    for (const team of teamsData) {
      if (team.teamId === 1) result.team1Name = team.name;
      if (team.teamId === 2) result.team2Name = team.name;
    }
  }

  const rounds = mapData.rounds || [];
  const teamWins: Record<string, number> = {};
  const driverTotals: Record<string, {
    id: string | null;
    name: string;
    team: number | string;
    points: number;
    dnfCount: number;
    bestTime: number;
    bestTimeActual: number | '';
    nbRespawns: number;
    nbRespawnsByCP: number;
    respawnTimes: number[];
    respawnTimeLoss: number[];
    roundPoints: number[];
    cpTimes: number[];
  }> = {};

  for (const round of rounds) {
    const players = round.players || [];
    if (players.length === 0) continue;

    const roundWinner = players.reduce<RawReplayPlayer | null>((winner, player) => {
      const playerPoints = player.points ?? 0;
      const winnerPoints = winner ? winner.points ?? 0 : -1;
      return (player.finished || (player.roundPoints || 0) > 0) && playerPoints > winnerPoints
        ? player
        : winner;
    }, null);

    const winningTeam =
      round.roundWinningTeam !== undefined && round.roundWinningTeam !== -1
        ? round.roundWinningTeam
        : roundWinner
          ? roundWinner.team
          : null;

    if (winningTeam !== null && winningTeam !== undefined) {
      teamWins[String(winningTeam)] = (teamWins[String(winningTeam)] || 0) + 1;
    }

    for (const player of players) {
      const name = normalizeName(player.name);
      if (name === 'Unknown') continue;

      if (!driverTotals[name]) {
        driverTotals[name] = {
          id: player.id ?? null,
          name,
          team: player.team ?? 'Unknown',
          points: 0,
          dnfCount: 0,
          bestTime: Infinity,
          bestTimeActual: '',
          nbRespawns: 0,
          nbRespawnsByCP: 0,
          respawnTimes: [],
          respawnTimeLoss: [],
          roundPoints: [],
          cpTimes: [],
        };
        result.driverIds.push(name);
      }

      const driver = driverTotals[name];
      const roundIndex = round.roundNumber !== undefined ? round.roundNumber : rounds.indexOf(round);
      driver.roundPoints[roundIndex] = typeof player.roundPoints === 'number' ? player.roundPoints : 0;

      const totalPointsValue = typeof player.points === 'number' ? player.points : 0;
      if (totalPointsValue > driver.points) {
        driver.points = totalPointsValue;
      }

      if (player.dnf && (player.finished === false || totalPointsValue === 0)) {
        driver.dnfCount++;
      }

      if (typeof player.bestTime === 'number' && player.bestTime > 0 && player.bestTime < driver.bestTime) {
        driver.bestTime = player.bestTime;
        driver.bestTimeActual = player.bestTime;
        driver.nbRespawns = player.nbRespawns ?? 0;
        driver.nbRespawnsByCP = Array.isArray(player.nbRespawnsByCp)
          ? player.nbRespawnsByCp.reduce((sum, value) => sum + (value || 0), 0)
          : player.nbRespawnsByCp ?? 0;
        driver.respawnTimes = Array.isArray(player.respawnTimes) ? player.respawnTimes : [];
        driver.respawnTimeLoss = Array.isArray(player.respawnTimeLoss) ? player.respawnTimeLoss : [];
        driver.cpTimes = Array.isArray(player.cpTimes) ? player.cpTimes : [];
      }
    }
  }

  const playableRounds = rounds.filter((round) => (round.players || []).length > 0);
  result.roundCount = playableRounds.length;

  for (const driver of Object.values(driverTotals)) {
    const cleanedRoundPoints: number[] = [];
    for (const round of playableRounds) {
      const roundIndex = round.roundNumber !== undefined ? round.roundNumber : rounds.indexOf(round);
      cleanedRoundPoints.push(driver.roundPoints[roundIndex] ?? 0);
    }
    driver.roundPoints = cleanedRoundPoints;

    const status = driver.points > 0 || driver.roundPoints.some((points) => points > 0)
      ? 'Finished'
      : driver.dnfCount > 0
        ? 'DNF'
        : 'Did not participate';

    result.driverPlacements.push({
      name: driver.name,
      id: driver.id,
      team: driver.team,
      points: driver.points,
      status,
      bestTime: driver.bestTimeActual,
      nbRespawns: driver.nbRespawns,
      nbRespawnsByCP: driver.nbRespawnsByCP || 0,
      respawnTimes: driver.respawnTimes,
      respawnTimeLoss: driver.respawnTimeLoss,
      roundPoints: driver.roundPoints,
      cpTimes: driver.cpTimes,
    });
  }

  const sortedTeams = Object.entries(teamWins).sort((a, b) => b[1] - a[1]);
  if (sortedTeams.length === 0) {
    result.mapWinner = 'No Rounds Completed';
  } else if (sortedTeams.length > 1 && sortedTeams[0][1] === sortedTeams[1][1]) {
    result.mapWinner = 'Draw/Tie';
  } else {
    result.mapWinner = sortedTeams[0][0];
  }
  result.roundWinsSummary = JSON.stringify(teamWins);
  result.driverPlacements.sort((a, b) => b.points - a.points);

  const mapScores = calculateMapScores(result.driverPlacements);
  return {
    ...result,
    mapScores,
    mapWinnerPoints: mapScores[0].totalPoints,
    mapLoserPoints: mapScores[1].totalPoints,
  };
}

export function parseReplayMaps(data: RawReplay): ParsedReplayMap[] {
  let mapsToProcess: RawReplayMap[] = [];
  if (Array.isArray(data.maps)) {
    mapsToProcess = data.maps;
  } else if (data.map) {
    mapsToProcess = [data.map];
  } else if (data.rounds) {
    mapsToProcess = [data as RawReplayMap];
  }

  if (mapsToProcess.length === 0) {
    throw new Error('No playable map data found in the submitted file.');
  }

  const parsedMaps = mapsToProcess
    .filter((map) => (map.rounds || []).some((round) => (round.players || []).length > 0))
    .map((map) => parseSingleMapData(map, data.createdTs, data.teams));

  if (parsedMaps.length === 0) {
    throw new Error('Found map list, but no map contained rounds with player data.');
  }

  return parsedMaps;
}

function scoredMaps(parsedMaps: ParsedReplayMap[]): ParsedReplayMap[] {
  return parsedMaps.filter((map) => map.mapWinnerPoints > 0 || map.mapLoserPoints > 0);
}

function calculateWinnerTeam(parsedMaps: ParsedReplayMap[]): 1 | 2 {
  const cumulativeScores: Record<1 | 2, number> = { 1: 0, 2: 0 };

  for (const map of parsedMaps) {
    for (const score of map.mapScores) {
      const teamNumber = Number(score.teamName);
      if (teamNumber === 1 || teamNumber === 2) {
        cumulativeScores[teamNumber] += score.totalPoints;
      }
    }
  }

  if (cumulativeScores[1] === cumulativeScores[2]) {
    throw new Error('Cannot verify a tied cumulative match score.');
  }

  return cumulativeScores[1] > cumulativeScores[2] ? 1 : 2;
}

async function findTrackmaniaPlayer(
  client: Queryable,
  platformAccountId: string | null,
  fallbackDiscordUsername: string
): Promise<TrackmaniaPlayerLookup | null> {
  const appPlayersTable = tableName('players');

  if (platformAccountId && platformAccountId.trim() !== '') {
    const result = await client.query<{ id: number; sprocket_player_id: number | null }>(
      `
      SELECT lp.id, lp.sprocket_player_id
      FROM ${appPlayersTable} lp
      JOIN sprocket.member_platform_account mpa
        ON mpa."platformAccountId" = $1
      JOIN sprocket.player sp
        ON sp.id = lp.sprocket_player_id
       AND sp."memberId" = mpa."memberId"
      JOIN sprocket.game_skill_group gsg ON gsg.id = sp."skillGroupId"
      JOIN sprocket.game g ON g.id = gsg."gameId"
      WHERE g.title = 'Trackmania'
      LIMIT 2
      `,
      [platformAccountId]
    );

    if (result.rows.length === 1) {
      return {
        localPlayerId: result.rows[0].id,
        sprocketPlayerId: result.rows[0].sprocket_player_id,
      };
    }
    if (result.rows.length > 1) {
      throw new Error(`Multiple Trackmania players resolved for platform account ${platformAccountId}`);
    }
  }

  if (fallbackDiscordUsername.trim() !== '') {
    const result = await client.query<{ id: number; sprocket_player_id: number | null }>(
      `SELECT id, sprocket_player_id FROM ${appPlayersTable} WHERE discord_username = $1 LIMIT 2`,
      [fallbackDiscordUsername]
    );

    if (result.rows.length === 1) {
      return {
        localPlayerId: result.rows[0].id,
        sprocketPlayerId: result.rows[0].sprocket_player_id,
      };
    }
    if (result.rows.length > 1) {
      throw new Error(`Multiple Trackmania players resolved for replay name ${fallbackDiscordUsername}`);
    }
  }

  return null;
}

export class ReplaySubmissionService {
  private readonly scrimsTable = tableName('scrims');
  private readonly matchPlayerStatsTable = tableName('match_player_stats');

  async saveVerifiedReplay(scrimId: number, replay: RawReplay): Promise<ReplaySaveResult> {
    const allParsedMaps = parseReplayMaps(replay);
    const mapsToSave = scoredMaps(allParsedMaps);
    if (mapsToSave.length === 0) {
      throw new Error('Replay did not contain any scored maps.');
    }

    const winnerTeam = calculateWinnerTeam(mapsToSave);
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const scrimResult = await client.query<{
        id: number;
        status: string;
        elo_processed: boolean;
        sprocket_match_parent_id: number | null;
      }>(
        `SELECT id, status, elo_processed, sprocket_match_parent_id FROM ${this.scrimsTable} WHERE id = $1 FOR UPDATE`,
        [scrimId]
      );
      const scrim = scrimResult.rows[0];
      if (!scrim) {
        throw new Error('Scrim not found for verification.');
      }

      if (scrim.status === 'completed' && scrim.elo_processed) {
        await client.query('ROLLBACK');
        return {
          alreadyProcessed: true,
          mapsSaved: 0,
          insertedStats: 0,
          winnerTeam,
        };
      }

      await client.query(
        `UPDATE ${this.scrimsTable}
         SET status = 'completed',
             completed_at = COALESCE(completed_at, NOW()),
             winner_team = $1
         WHERE id = $2`,
        [winnerTeam, scrimId]
      );

      const unresolvedDrivers: string[] = [];
      let insertedStats = 0;

      for (const parsedMap of mapsToSave) {
        for (const driver of parsedMap.driverPlacements) {
          const player = await findTrackmaniaPlayer(client, driver.id, driver.name);
          if (!player || !player.localPlayerId || !player.sprocketPlayerId) {
            unresolvedDrivers.push(`${driver.name}${driver.id ? ` [${driver.id}]` : ''}`);
            continue;
          }

          const bestTime = typeof driver.bestTime === 'number' ? driver.bestTime : 0;
          const insertResult = await client.query(
            `
            INSERT INTO ${this.matchPlayerStatsTable}
              (scrim_id, map_id, player_id, team_id, points, is_finished, is_dnf, round_points,
               nb_respawns, respawn_times, best_time, cp_times, respawn_time_loss, nb_respawns_by_cp)
            VALUES (
              $1,
              (SELECT id FROM ${tableName('maps')} WHERE uid = $2 LIMIT 1),
              $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
            )
            ON CONFLICT (scrim_id, COALESCE(map_id, 0), player_id) DO NOTHING
            `,
            [
              scrimId,
              parsedMap.mapId,
              player.localPlayerId,
              Number(driver.team),
              driver.points,
              driver.status === 'Finished',
              driver.status === 'DNF',
              driver.roundPoints,
              driver.nbRespawns || 0,
              driver.respawnTimes || [],
              bestTime,
              driver.cpTimes || [],
              driver.respawnTimeLoss || [],
              [driver.nbRespawnsByCP || 0],
            ]
          );
          insertedStats += insertResult.rowCount || 0;
        }
      }

      if (unresolvedDrivers.length > 0) {
        throw new Error(`Unable to resolve replay players in Trackmania DB: ${unresolvedDrivers.join(', ')}`);
      }

      await this.awardEligibilityPoints(client, scrimId, scrim.sprocket_match_parent_id, 3);

      await client.query('COMMIT');
      return {
        alreadyProcessed: false,
        mapsSaved: mapsToSave.length,
        insertedStats,
        winnerTeam,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error saving verified replay:', { scrimId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  private async awardEligibilityPoints(
    client: Queryable,
    scrimId: number,
    matchParentId: number | null,
    points: number
  ): Promise<void> {
    if (!matchParentId) {
      throw new Error('Scrim is missing sprocket_match_parent_id.');
    }

    const playerResult = await client.query<{ sprocket_player_id: number }>(
      `
      SELECT DISTINCT p.sprocket_player_id
      FROM ${tableName('scrim_players')} sp
      JOIN ${tableName('players')} p ON p.id = sp.player_id
      WHERE sp.scrim_id = $1
        AND p.sprocket_player_id IS NOT NULL
      `,
      [scrimId]
    );

    if (playerResult.rows.length === 0) {
      throw new Error('No Sprocket player IDs found for scrim eligibility award.');
    }

    for (const row of playerResult.rows) {
      await client.query(
        `
        INSERT INTO sprocket.eligibility_data ("points", "matchParentId", "playerId")
        VALUES ($1, $2, $3)
        ON CONFLICT ("matchParentId", "playerId") DO NOTHING
        `,
        [points, matchParentId, row.sprocket_player_id]
      );
    }
  }
}

export const replaySubmissionService = new ReplaySubmissionService();
