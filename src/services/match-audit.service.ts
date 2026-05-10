import { db, tableName } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface MatchAuditPlayer {
  local_player_id: number;
  discord_id: string;
  discord_username: string;
  sprocket_player_id: number | null;
  member_id: number | null;
  platform_account_ids: string[];
  checked_in: boolean;
  team_id: number | null;
}

export interface MatchAuditStatsRow {
  map_id: number | null;
  map_uid: string | null;
  map_name: string | null;
  player_id: number;
  stat_rows: number;
}

export interface MatchAuditEligibilityRow {
  player_id: number;
  points: number;
}

export interface MatchAuditEloRow {
  player_id: number;
  old_rating: number;
  new_rating: number;
  change_amount: number;
  created_at: Date;
}

export interface MatchAuditCurrentEloRow {
  player_id: number;
  rating: number;
  wins: number;
  losses: number;
  updated_at: Date;
}

export interface MatchAuditFixture {
  fixture_id: number | null;
  home_franchise_id: number | null;
  home_franchise_name: string | null;
  away_franchise_id: number | null;
  away_franchise_name: string | null;
  league: string | null;
  game_mode: string | null;
  schedule_group_id: number | null;
  schedule_group_name: string | null;
}

export interface MatchAuditReport {
  scrim: {
    id: number;
    scrim_uid: string;
    league: string;
    status: string;
    match_type: string;
    winner_team: number | null;
    elo_processed: boolean;
    sprocket_match_parent_id: number | null;
    sprocket_match_id: number | null;
  };
  fixture: MatchAuditFixture | null;
  players: MatchAuditPlayer[];
  stats: MatchAuditStatsRow[];
  eligibility: MatchAuditEligibilityRow[];
  elo_history: MatchAuditEloRow[];
  current_elo: MatchAuditCurrentEloRow[];
  checks: {
    fixture_linked: boolean;
    stats_present: boolean;
    eligibility_present: boolean;
    elo_ready: boolean;
    elo_processed_once: boolean;
  };
}

interface ScrimAuditRow {
  id: number;
  scrim_uid: string;
  league: string;
  status: string;
  match_type: string;
  winner_team: number | null;
  elo_processed: boolean;
  sprocket_match_parent_id: number | null;
  sprocket_match_id: number | null;
  fixture_id: number | null;
  home_franchise_id: number | null;
  home_franchise_name: string | null;
  away_franchise_id: number | null;
  away_franchise_name: string | null;
  fixture_league: string | null;
  game_mode: string | null;
  schedule_group_id: number | null;
  schedule_group_name: string | null;
}

export class MatchAuditService {
  async auditByScrimUid(scrimUid: string): Promise<MatchAuditReport | null> {
    const scrimsTable = tableName('scrims');
    const scrimPlayersTable = tableName('scrim_players');
    const playersTable = tableName('players');
    const matchPlayerStatsTable = tableName('match_player_stats');
    const mapsTable = tableName('maps');
    const eloHistoryTable = tableName('elo_history');
    const eloRatingsTable = tableName('elo_ratings');

    const scrimResult = await db.query<ScrimAuditRow>(
      `
      SELECT
        s.id,
        s.scrim_uid,
        s.league,
        s.status,
        s.match_type,
        s.winner_team,
        s.elo_processed,
        s.sprocket_match_parent_id,
        s.sprocket_match_id,
        mp."fixtureId" AS fixture_id,
        sf."homeFranchiseId" AS home_franchise_id,
        hf.name AS home_franchise_name,
        sf."awayFranchiseId" AS away_franchise_id,
        af.name AS away_franchise_name,
        COALESCE(gsgp.description, gsgp.code) AS fixture_league,
        gm.name AS game_mode,
        sg.id AS schedule_group_id,
        sg.name AS schedule_group_name
      FROM ${scrimsTable} s
      LEFT JOIN sprocket.match_parent mp ON mp.id = s.sprocket_match_parent_id
      LEFT JOIN sprocket.schedule_fixture sf ON sf.id = mp."fixtureId"
      LEFT JOIN sprocket.franchise hf ON hf.id = sf."homeFranchiseId"
      LEFT JOIN sprocket.franchise af ON af.id = sf."awayFranchiseId"
      LEFT JOIN sprocket.schedule_group sg ON sg.id = sf."scheduleGroupId"
      LEFT JOIN sprocket.game_skill_group gsg ON gsg.id = sf."skillGroupId"
      LEFT JOIN sprocket.game_skill_group_profile gsgp ON gsgp."skillGroupId" = gsg.id
      LEFT JOIN sprocket.game_mode gm ON gm.id = sf."gameModeId"
      WHERE s.scrim_uid = $1
      `,
      [scrimUid]
    );

    const scrim = scrimResult.rows[0];
    if (!scrim) {
      return null;
    }

    const playersResult = await db.query<MatchAuditPlayer>(
      `
      SELECT
        p.id AS local_player_id,
        p.discord_id,
        p.discord_username,
        p.sprocket_player_id,
        p.member_id,
        COALESCE(p.platform_account_ids, ARRAY[]::VARCHAR[]) AS platform_account_ids,
        sp.checked_in,
        MIN(mps.team_id) AS team_id
      FROM ${scrimPlayersTable} sp
      JOIN ${playersTable} p ON p.id = sp.player_id
      LEFT JOIN ${matchPlayerStatsTable} mps
        ON mps.scrim_id = sp.scrim_id
       AND mps.player_id = sp.player_id
      WHERE sp.scrim_id = $1
      GROUP BY p.id, p.discord_id, p.discord_username, p.sprocket_player_id, p.member_id, p.platform_account_ids, sp.checked_in
      ORDER BY sp.id
      `,
      [scrim.id]
    );

    const statsResult = await db.query<MatchAuditStatsRow>(
      `
      SELECT
        mps.map_id,
        m.uid AS map_uid,
        m.name AS map_name,
        mps.player_id,
        COUNT(*)::INTEGER AS stat_rows
      FROM ${matchPlayerStatsTable} mps
      LEFT JOIN ${mapsTable} m ON m.id = mps.map_id
      WHERE mps.scrim_id = $1
      GROUP BY mps.map_id, m.uid, m.name, mps.player_id
      ORDER BY mps.map_id NULLS LAST, mps.player_id
      `,
      [scrim.id]
    );

    const eligibilityResult = await db.query<MatchAuditEligibilityRow>(
      `
      SELECT "playerId" AS player_id, points
      FROM sprocket.eligibility_data
      WHERE "matchParentId" = $1
      ORDER BY "playerId"
      `,
      [scrim.sprocket_match_parent_id]
    );

    const eloHistoryResult = await db.query<MatchAuditEloRow>(
      `
      SELECT player_id, old_rating, new_rating, change_amount, created_at
      FROM ${eloHistoryTable}
      WHERE scrim_id = $1
      ORDER BY player_id
      `,
      [scrim.id]
    );

    const currentEloResult = await db.query<MatchAuditCurrentEloRow>(
      `
      SELECT er.player_id, er.rating, er.wins, er.losses, er.updated_at
      FROM ${eloRatingsTable} er
      JOIN ${scrimPlayersTable} sp ON sp.player_id = er.player_id
      WHERE sp.scrim_id = $1
        AND er.league = $2
      ORDER BY er.player_id
      `,
      [scrim.id, scrim.league]
    );

    const report: MatchAuditReport = {
      scrim: {
        id: scrim.id,
        scrim_uid: scrim.scrim_uid,
        league: scrim.league,
        status: scrim.status,
        match_type: scrim.match_type,
        winner_team: scrim.winner_team,
        elo_processed: scrim.elo_processed,
        sprocket_match_parent_id: scrim.sprocket_match_parent_id,
        sprocket_match_id: scrim.sprocket_match_id,
      },
      fixture: scrim.fixture_id
        ? {
            fixture_id: scrim.fixture_id,
            home_franchise_id: scrim.home_franchise_id,
            home_franchise_name: scrim.home_franchise_name,
            away_franchise_id: scrim.away_franchise_id,
            away_franchise_name: scrim.away_franchise_name,
            league: scrim.fixture_league,
            game_mode: scrim.game_mode,
            schedule_group_id: scrim.schedule_group_id,
            schedule_group_name: scrim.schedule_group_name,
          }
        : null,
      players: playersResult.rows,
      stats: statsResult.rows,
      eligibility: eligibilityResult.rows,
      elo_history: eloHistoryResult.rows,
      current_elo: currentEloResult.rows,
      checks: {
        fixture_linked: scrim.fixture_id !== null,
        stats_present: statsResult.rows.length > 0,
        eligibility_present: eligibilityResult.rows.length >= playersResult.rows.length,
        elo_ready: scrim.status === 'completed' && scrim.winner_team !== null,
        elo_processed_once:
          scrim.elo_processed === (eloHistoryResult.rows.length === playersResult.rows.length),
      },
    };

    logger.info('Trackmania match audit report', { report });
    return report;
  }
}

export const matchAuditService = new MatchAuditService();
