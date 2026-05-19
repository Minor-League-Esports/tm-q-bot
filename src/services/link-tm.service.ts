import { db, tableName } from '../db/index.js';

export interface LinkedPlatformContext {
  memberId: number;
  platformId: number;
  platformCode: string;
  error?: never;
}

export interface LinkTmError {
  error: true;
  message: string;
}

export type LinkTmResult = LinkedPlatformContext | LinkTmError;

/**
 * Parses link-tm input into a validated context ready for mutation.
 * Does NOT validate - returns a type that guarantees the linking mutation will work.
 * (i.e., all IDs are valid and point to existing records)
 */
export async function parseLinkTmInput(
  discordId: string,
  platform: string,
  _accountId: string
): Promise<LinkTmResult> {
  // 1. Verify user is registered in trackmania.players
  const playerResult = await db.query<{ id: number; sprocket_player_id: number }>(
    `SELECT id, sprocket_player_id FROM ${tableName('players')} WHERE discord_id = $1`,
    [discordId]
  );

  if (playerResult.rows.length === 0) {
    return { error: true, message: 'Not registered in Trackmania system' };
  }

  const player = playerResult.rows[0];

  // 2. Get the memberId from sprocket.player
  const sprocketPlayerResult = await db.query<{ memberId: number }>(
    `SELECT "memberId" FROM sprocket.player WHERE id = $1`,
    [player.sprocket_player_id]
  );

  if (sprocketPlayerResult.rows.length === 0) {
    return { error: true, message: 'Could not find Sprocket player record' };
  }

  const memberId = sprocketPlayerResult.rows[0].memberId;

  // 3. Get the platform ID
  const platformResult = await db.query<{ id: number }>(
    `SELECT id FROM sprocket.platform WHERE code = $1`,
    [platform]
  );

  if (platformResult.rows.length === 0) {
    return { error: true, message: `Unknown platform: ${platform}` };
  }

  const platformId = platformResult.rows[0].id;

  return {
    memberId,
    platformId,
    platformCode: platform,
  };
}

/**
 * Performs the actual link upsert. Call after parseLinkTmInput succeeded.
 */
export async function executePlatformLink(
  memberId: number,
  platformId: number,
  _platformCode: string,
  accountId: string
): Promise<{ isUpdate: boolean }> {
  // Check if already linked
  const existingLink = await db.query(
    `SELECT id FROM sprocket.member_platform_account 
     WHERE "memberId" = $1 AND "platformId" = $2`,
    [memberId, platformId]
  );

  if (existingLink.rows.length > 0) {
    // Update existing
    await db.query(
      `UPDATE sprocket.member_platform_account 
       SET "platformAccountId" = $1, "updatedAt" = NOW()
       WHERE "memberId" = $2 AND "platformId" = $3`,
      [accountId, memberId, platformId]
    );
    return { isUpdate: true };
  } else {
    // Insert new
    await db.query(
      `INSERT INTO sprocket.member_platform_account ("platformAccountId", "memberId", "platformId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [accountId, memberId, platformId]
    );
    return { isUpdate: false };
  }
}