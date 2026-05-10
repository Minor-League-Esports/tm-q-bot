import { League } from '../types.js';
import { logger } from '../utils/logger.js';
import { sprocketService } from './sprocket.service.js';

export interface FixtureCreateOptions {
  league: League;
  homeFranchise: string;
  awayFranchise: string;
  scheduleGroupId?: number;
  week?: number;
}

export interface FixtureInfo {
  fixtureId: number;
  scheduleGroupId: number;
  homeFranchiseId: number;
  awayFranchiseId: number;
  skillGroupId: number;
  gameModeId: number | null;
}

interface IdNameRow {
  id: number;
  name: string;
}

interface IdRow {
  id: number;
}

export class FixtureService {
  async getOrCreateTestFixture(
    client: { query: <T = IdRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> },
    options: FixtureCreateOptions
  ): Promise<FixtureInfo> {
    const skillGroupId = await sprocketService.getSkillGroupIdForLeague(options.league);
    if (!skillGroupId) {
      throw new Error(`No Trackmania skill group configured for league ${options.league}`);
    }

    const scheduleGroupId =
      options.scheduleGroupId ??
      (await this.getOrCreateTrackmaniaTestScheduleGroup(client, skillGroupId, options.week));
    const homeFranchiseId = await this.resolveFranchiseId(client, options.homeFranchise);
    const awayFranchiseId = await this.resolveFranchiseId(client, options.awayFranchise);
    const gameModeId = await this.getTrackmaniaGameModeId(client);

    const existingResult = await client.query<IdRow>(
      `
      SELECT id
      FROM sprocket.schedule_fixture
      WHERE "scheduleGroupId" = $1
        AND "homeFranchiseId" = $2
        AND "awayFranchiseId" = $3
        AND "skillGroupId" = $4
      ORDER BY id DESC
      LIMIT 1
      `,
      [scheduleGroupId, homeFranchiseId, awayFranchiseId, skillGroupId]
    );

    const fixtureId =
      existingResult.rows[0]?.id ??
      (
        await client.query<IdRow>(
          `
          INSERT INTO sprocket.schedule_fixture (
            "scheduleGroupId",
            "homeFranchiseId",
            "awayFranchiseId",
            "skillGroupId",
            "gameModeId"
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
          `,
          [scheduleGroupId, homeFranchiseId, awayFranchiseId, skillGroupId, gameModeId]
        )
      ).rows[0].id;

    logger.info('Resolved Trackmania fixture', {
      fixtureId,
      scheduleGroupId,
      homeFranchiseId,
      awayFranchiseId,
      skillGroupId,
      gameModeId,
    });

    return {
      fixtureId,
      scheduleGroupId,
      homeFranchiseId,
      awayFranchiseId,
      skillGroupId,
      gameModeId,
    };
  }

  async resolveFixture(
    client: { query: <T = IdRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> },
    fixtureId: number,
    league: League
  ): Promise<FixtureInfo> {
    const skillGroupId = await sprocketService.getSkillGroupIdForLeague(league);
    if (!skillGroupId) {
      throw new Error(`No Trackmania skill group configured for league ${league}`);
    }

    const result = await client.query<FixtureInfo>(
      `
      SELECT
        id AS "fixtureId",
        "scheduleGroupId" AS "scheduleGroupId",
        "homeFranchiseId" AS "homeFranchiseId",
        "awayFranchiseId" AS "awayFranchiseId",
        "skillGroupId" AS "skillGroupId",
        "gameModeId" AS "gameModeId"
      FROM sprocket.schedule_fixture
      WHERE id = $1
        AND "skillGroupId" = $2
      `,
      [fixtureId, skillGroupId]
    );

    const fixture = result.rows[0];
    if (!fixture) {
      throw new Error(`Fixture ${fixtureId} was not found for ${league}`);
    }

    return fixture;
  }

  private async getOrCreateTrackmaniaTestScheduleGroup(
    client: { query: <T = IdRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> },
    skillGroupId: number,
    week?: number
  ): Promise<number> {
    const existingResult = await client.query<IdRow>(
      `
      SELECT sg.id
      FROM sprocket.schedule_group sg
      WHERE sg.name = 'Trackmania Test'
      ORDER BY sg.id DESC
      LIMIT 1
      `
    );

    if (existingResult.rows[0]?.id) {
      return existingResult.rows[0].id;
    }

    const result = await client.query<IdRow>(
      `
      INSERT INTO sprocket.schedule_group (name, week, "skillGroupId")
      VALUES ('Trackmania Test', $1, $2)
      RETURNING id
      `,
      [week ?? 0, skillGroupId]
    );

    return result.rows[0].id;
  }

  private async resolveFranchiseId(
    client: { query: <T = IdNameRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> },
    franchise: string
  ): Promise<number> {
    const numericId = Number(franchise);
    const result = await client.query<IdNameRow>(
      Number.isInteger(numericId)
        ? 'SELECT id, name FROM sprocket.franchise WHERE id = $1'
        : 'SELECT id, name FROM sprocket.franchise WHERE LOWER(name) = LOWER($1) OR LOWER(code) = LOWER($1) ORDER BY id LIMIT 2',
      [Number.isInteger(numericId) ? numericId : franchise]
    );

    if (result.rows.length !== 1) {
      throw new Error(`Unable to uniquely resolve franchise ${franchise}`);
    }

    return result.rows[0].id;
  }

  private async getTrackmaniaGameModeId(
    client: { query: <T = IdRow>(text: string, params?: unknown[]) => Promise<{ rows: T[] }> }
  ): Promise<number | null> {
    const result = await client.query<IdRow>(
      `
      SELECT gm.id
      FROM sprocket.game_mode gm
      JOIN sprocket.game g ON g.id = gm."gameId"
      WHERE g.title = 'Trackmania'
      ORDER BY gm.id
      LIMIT 1
      `
    );

    return result.rows[0]?.id ?? null;
  }
}

export const fixtureService = new FixtureService();
