import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../db/index.js';
import { setupTestDb, teardownTestDb } from '../tests/setup.js';
import { Map as GameMap } from '../types.js';
import { replaySubmissionService, RawReplay, parseReplayMaps } from './replay-submission.service.js';
import { scrimService } from './scrim.service.js';

const replayPlayerNames = ['AntHill12', 'Kunics', 'Abrubos', 'Robbalobb'];
const replayMaps = [
  {
    name: 'Spring 2024 - 05',
    uid: 'gLjlftQPuk5kBY2dpiabyAxXt2l',
  },
  {
    name: 'Altercations',
    uid: 'BuXmg2fehB1tTFz9y5Ib0mDtUu1',
  },
  {
    name: 'Summer 2023 - 13',
    uid: 'MJMr4dIIroi2lU_n9peI8Tbzub',
  },
];

function loadReplayFixture(filename: string): RawReplay {
  const fixturePath = path.join(process.cwd(), 'src', 'tests', 'fixtures', 'replays', filename);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as RawReplay;
}

async function seedReplayPlayers() {
  const playerIds: number[] = [];

  for (let i = 0; i < replayPlayerNames.length; i++) {
    const name = replayPlayerNames[i];
    const userId = 4001 + i;
    const memberId = 3001 + i;
    const sprocketPlayerId = 2001 + i;
    const discordId = `replay_discord_${i + 1}`;
    const platformAccountId = `trackmania_${name}`;

    await db.query('INSERT INTO sprocket."user" (id) VALUES ($1)', [userId]);
    await db.query('INSERT INTO sprocket.member (id, "userId") VALUES ($1, $2)', [memberId, userId]);
    await db.query(
      'INSERT INTO sprocket.user_authentication_account ("userId", "accountType", "accountId") VALUES ($1, $2, $3)',
      [userId, 'DISCORD', discordId]
    );
    await db.query('INSERT INTO sprocket.player (id, "memberId", "skillGroupId") VALUES ($1, $2, 803)', [
      sprocketPlayerId,
      memberId,
    ]);
    await db.query(
      'INSERT INTO sprocket.member_platform_account ("memberId", "platformAccountId") VALUES ($1, $2)',
      [memberId, platformAccountId]
    );

    const playerResult = await db.query<{ id: number }>(
      `
      INSERT INTO players
        (discord_id, discord_username, league, sprocket_player_id, member_id, platform_account_ids)
      VALUES ($1, $2, 'Master', $3, $4, $5)
      RETURNING id
      `,
      [discordId, name, sprocketPlayerId, memberId, [platformAccountId]]
    );
    playerIds.push(playerResult.rows[0].id);
  }

  return playerIds;
}

async function seedReplayMaps(): Promise<GameMap[]> {
  for (const map of replayMaps) {
    await db.query(
      `
      INSERT INTO maps (name, uid, author, is_active)
      VALUES ($1, $2, 'MLE Replay Fixture', true)
      ON CONFLICT (uid) DO UPDATE SET name = EXCLUDED.name, is_active = true
      `,
      [map.name, map.uid]
    );
  }

  const result = await db.query<GameMap>(
    'SELECT * FROM maps WHERE uid = ANY($1) ORDER BY array_position($1, uid)',
    [replayMaps.map((map) => map.uid)]
  );
  return result.rows;
}

describe('ReplaySubmissionService Integration', () => {
  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await setupTestDb();
  });

  it('parses multi-map replay files and keeps only maps with player data', () => {
    const replay = loadReplayFixture('bot-test.json');
    const parsedMaps = parseReplayMaps(replay);

    expect(parsedMaps).toHaveLength(5);
    expect(parsedMaps.map((map) => map.mapName)).toEqual([
      'Spring 2024 - 05',
      'Altercations',
      'Summer 2023 - 13',
      'Spring 2024 - 05',
      'Altercations',
    ]);
    expect(parsedMaps[0].driverPlacements.map((driver) => driver.name).sort()).toEqual(
      replayPlayerNames.toSorted()
    );
  });

  it('saves a verified synthetic replay to the scrim, stats, and eligibility tables idempotently', async () => {
    const playerIds = await seedReplayPlayers();
    const maps = await seedReplayMaps();
    const scrim = await scrimService.createScrim('Master', playerIds, maps);
    const replay = loadReplayFixture('scrim-test.json');

    const firstSave = await replaySubmissionService.saveVerifiedReplay(scrim.id, replay);

    expect(firstSave).toMatchObject({
      alreadyProcessed: false,
      mapsSaved: 3,
      insertedStats: 12,
      winnerTeam: 2,
    });

    const completedScrim = await scrimService.getById(scrim.id);
    expect(completedScrim?.status).toBe('completed');
    expect(completedScrim?.winner_team).toBe(2);
    expect(completedScrim?.completed_at).toBeTruthy();

    const statsResult = await db.query<{
      row_count: string;
      distinct_maps: string;
      points_total: string;
    }>(
      `
      SELECT
        COUNT(*)::text AS row_count,
        COUNT(DISTINCT map_id)::text AS distinct_maps,
        SUM(points)::text AS points_total
      FROM match_player_stats
      WHERE scrim_id = $1
      `,
      [scrim.id]
    );
    expect(statsResult.rows[0]).toEqual({
      row_count: '12',
      distinct_maps: '3',
      points_total: '169',
    });

    const springResult = await db.query<{ player: string; team_id: number; points: number }>(
      `
      SELECT p.discord_username AS player, mps.team_id, mps.points
      FROM match_player_stats mps
      JOIN players p ON p.id = mps.player_id
      JOIN maps m ON m.id = mps.map_id
      WHERE mps.scrim_id = $1
        AND m.uid = 'gLjlftQPuk5kBY2dpiabyAxXt2l'
      ORDER BY mps.points DESC
      `,
      [scrim.id]
    );
    expect(springResult.rows).toEqual([
      { player: 'Kunics', team_id: 2, points: 19 },
      { player: 'Robbalobb', team_id: 1, points: 17 },
      { player: 'Abrubos', team_id: 2, points: 14 },
      { player: 'AntHill12', team_id: 1, points: 10 },
    ]);

    const eligibilityResult = await db.query<{ row_count: string; points_total: string }>(
      `
      SELECT COUNT(*)::text AS row_count, SUM(points)::text AS points_total
      FROM sprocket.eligibility_data
      WHERE "matchParentId" = $1
      `,
      [scrim.sprocket_match_parent_id]
    );
    expect(eligibilityResult.rows[0]).toEqual({
      row_count: '4',
      points_total: '12',
    });

    const secondSave = await replaySubmissionService.saveVerifiedReplay(scrim.id, replay);
    expect(secondSave).toMatchObject({
      alreadyProcessed: false,
      mapsSaved: 3,
      insertedStats: 0,
      winnerTeam: 2,
    });

    const statsAfterSecondSave = await db.query<{ row_count: string }>(
      'SELECT COUNT(*)::text AS row_count FROM match_player_stats WHERE scrim_id = $1',
      [scrim.id]
    );
    expect(statsAfterSecondSave.rows[0].row_count).toBe('12');
  });
});
