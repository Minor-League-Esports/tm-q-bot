import { db } from '../db/index.js';

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
  _accountId: string,
): Promise<LinkTmResult> {
  // 2. Get the memberId from sprocket.player
  const sprocketPlayerResult = await db.query<{ memberId: number }>(
    `select m.id
     from sprocket.member m
      inner join sprocket.user_authentication_account uaa on uaa."userId" = m."userId"
      where uaa."accountId" = $1;`,
    [discordId],
  );

  if (sprocketPlayerResult.rows.length === 0) {
    return { error: true, message: 'Could not find Sprocket player record' };
  }

  const memberId = sprocketPlayerResult.rows[0].memberId;

  // 3. Get the platform ID
  const platformResult = await db.query<{ id: number }>(
    `SELECT id FROM sprocket.platform WHERE code = $1`,
    [platform],
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
  accountId: string,
): Promise<{ success: boolean }> {
  // Check if already linked
  const existingLink = await db.query(
    `SELECT id FROM sprocket.member_platform_account 
     WHERE "platformAccountId" = $1`,
    [accountId],
  );

  if (existingLink.rows.length > 0) {
    // Account already belongs to someone else
    return { success: false };
  } else {
    // Insert new
    await db.query(
      `INSERT INTO sprocket.member_platform_account ("platformAccountId", "memberId", "platformId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [accountId, memberId, platformId],
    );
    return { success: true };
  }
}
