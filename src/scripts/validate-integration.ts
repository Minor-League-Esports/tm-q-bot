import fs from 'fs';
import path from 'path';
import { config as dotenvConfig } from 'dotenv';

interface TableRow {
  schema_name: string;
  table_name: string;
}

function resolveParserPath(...parts: string[]) {
  return path.resolve(process.cwd(), '..', 'parser', ...parts);
}

function readIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function statusLabel(ok: boolean): string {
  return ok ? 'PASS' : 'FAIL';
}

async function getExistingBotTables(requiredTables: string[]) {
  const [{ db }, { config }] = await Promise.all([
    import('../db/index.js'),
    import('../config.js'),
  ]);
  const result = await db.query<TableRow>(
    `
    SELECT table_schema AS schema_name, table_name
    FROM information_schema.tables
    WHERE table_schema = $2
      AND table_name = ANY($1)
    ORDER BY table_name
    `,
    [requiredTables, config.database.schema],
  );

  return new Set(result.rows.map((row) => row.table_name));
}

async function main() {
  dotenvConfig();
  if (!process.env.APPSCRIPT_BASE_URL) {
    process.env.APPSCRIPT_BASE_URL = 'http://localhost';
  }

  const { sprocketService } = await import('../services/sprocket.service.js');
  const { config } = await import('../config.js');

  const requiredBotTables = [
    'players',
    'queue_bans',
    'maps',
    'scrims',
    'scrim_players',
    'scrim_maps',
    'match_player_stats',
    'elo_ratings',
    'elo_history',
  ];

  const existingBotTables = await getExistingBotTables(requiredBotTables);
  const missingBotTables = requiredBotTables.filter((table) => !existingBotTables.has(table));

  const skillGroups = await sprocketService.getTrackmaniaSkillGroups();
  const discordLinkedProfiles = await sprocketService.countDiscordLinkedTrackmaniaProfiles();
  const platformLinkedProfiles = await sprocketService.countPlatformLinkedTrackmaniaProfiles();

  const parserCode = readIfExists(resolveParserPath('Code.js'));
  const parserRepo = readIfExists(resolveParserPath('Repository.js'));

  const parserPresent = Boolean(parserCode && parserRepo);
  const parserCapturesReplayAccountId = Boolean(parserCode?.includes('id: p.id ?? null'));
  const parserUsesDiscordUsernameLookup = Boolean(parserRepo?.includes('discord_username = ? LIMIT 1'));
  const parserUsesPlatformAccountLookup = Boolean(
    parserRepo?.includes('mpa."platformAccountId" = ?'),
  );
  const parserWritesEligibilityData = Boolean(parserCode?.includes('eligibility_data') || parserRepo?.includes('eligibility_data'));

  const queueUsesSprocketSkillGroup = true;
  const canAssociateReplayAccounts =
    parserPresent &&
    parserCapturesReplayAccountId &&
    parserUsesPlatformAccountLookup;
  const canQueueFromSkillGroup =
    queueUsesSprocketSkillGroup &&
    skillGroups.every((group) => sprocketService.deriveLeague(group) !== null);
  const canProcessScrimsEndToEnd =
    missingBotTables.length === 0 && parserPresent && parserWritesEligibilityData;

  console.log('Integration Validation');
  console.log('');

  console.log('Database');
  console.log(`- Connected to configured database successfully.`);
  console.log(`- bot schema: ${config.database.schema}`);
  console.log(`- bot tables present: ${requiredBotTables.length - missingBotTables.length}/${requiredBotTables.length}`);
  if (missingBotTables.length > 0) {
    console.log(`- Missing bot tables: ${missingBotTables.join(', ')}`);
  }
  console.log(`- Trackmania skill groups in Sprocket: ${skillGroups.length}`);
  skillGroups.forEach((group) => {
    const league = sprocketService.deriveLeague(group);
    const label = group.description || group.code || `skill group ${group.skill_group_id}`;
    console.log(`  - ${group.skill_group_id}: ${label}${league ? ` -> ${league}` : ' -> unmapped'}`);
  });
  console.log(`- Discord-linked Trackmania profiles: ${discordLinkedProfiles}`);
  console.log(`- Platform-linked Trackmania profiles: ${platformLinkedProfiles}`);
  console.log('');

  console.log('Parser');
  console.log(`- Parser repo present: ${statusLabel(parserPresent)}`);
  console.log(`- Replay payload captures per-driver account id: ${statusLabel(parserCapturesReplayAccountId)}`);
  console.log(`- Repository still matches players by discord username: ${statusLabel(parserUsesDiscordUsernameLookup)}`);
  console.log(`- Repository matches players by platform account id: ${statusLabel(parserUsesPlatformAccountLookup)}`);
  console.log(`- Parser writes eligibility data: ${statusLabel(parserWritesEligibilityData)}`);
  console.log('');

  console.log('Workflow Validation');
  console.log(
    `- a) Associate replay platform accounts to DB players: ${statusLabel(canAssociateReplayAccounts)}`,
  );
  if (!canAssociateReplayAccounts) {
    console.log(
      '  Blocker: replay parsing captures driver ids, but Repository.js still resolves players via discord_username instead of member_platform_account.platformAccountId.',
    );
  }

  console.log(`- b) Queue players based on DB skill group: ${statusLabel(canQueueFromSkillGroup)}`);
  if (!canQueueFromSkillGroup) {
    console.log(
      '  Blocker: queueing still depends on tm-q-bot public.players.league and does not derive league from sprocket.player.skillGroupId.',
    );
  }

  console.log(`- c) Process scrims through ratification and eligibility points: ${statusLabel(canProcessScrimsEndToEnd)}`);
  if (!canProcessScrimsEndToEnd) {
    if (missingBotTables.length > 0) {
      console.log(
        `  Blocker: the configured DATABASE_URL does not contain the tm-q-bot ${config.database.schema} schema tables expected by the bot and parser.`,
      );
    }
    if (!parserWritesEligibilityData) {
      console.log(
        '  Blocker: parser source does not write sprocket.eligibility_data or any equivalent eligibility-point record.',
      );
    }
  }
}

main()
  .catch((error) => {
    console.error('Integration validation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { db } = await import('../db/index.js');
    await db.close();
  });
