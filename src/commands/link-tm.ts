import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { db, tableName } from '../db/index.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('link-tm')
  .setDescription('Link your Trackmania account to play scrims')
  .addStringOption((option) =>
    option
      .setName('platform')
      .setDescription('Your gaming platform')
      .setRequired(true)
      .addChoices(
        { name: 'Steam', value: 'STEAM' },
        { name: 'Epic', value: 'EPIC' },
        { name: 'Xbox', value: 'XBOX' },
        { name: 'PS4/PS5', value: 'PS4' }
      )
  )
  .addStringOption((option) =>
    option
      .setName('account-id')
      .setDescription('Your account ID (found in Trackmania settings → Account)')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const discordId = interaction.user.id;
  const platform = interaction.options.getString('platform')!;
  const accountId = interaction.options.getString('account-id')!.trim();

  try {
    // 1. Verify user is registered in trackmania.players
    const playerResult = await db.query<{ id: number; sprocket_player_id: number }>(
      `SELECT id, sprocket_player_id FROM ${tableName('players')} WHERE discord_id = $1`,
      [discordId]
    );

    if (playerResult.rows.length === 0) {
      await interaction.reply({
        content: `❌ You are not registered in the Trackmania system.\nPlease register on the Sprocket website first, then contact an admin to be added to the bot.`,
        ephemeral: true,
      });
      return;
    }

    const player = playerResult.rows[0];

    // 2. Get the memberId from sprocket.player
    const sprocketPlayerResult = await db.query<{ memberId: number }>(
      `SELECT "memberId" FROM sprocket.player WHERE id = $1`,
      [player.sprocket_player_id]
    );

    if (sprocketPlayerResult.rows.length === 0) {
      await interaction.reply({
        content: `❌ Could not find your Sprocket player record. Please contact an admin.`,
        ephemeral: true,
      });
      return;
    }

    const memberId = sprocketPlayerResult.rows[0].memberId;

    // 3. Get the platform ID
    const platformResult = await db.query<{ id: number }>(
      `SELECT id FROM sprocket.platform WHERE code = $1`,
      [platform]
    );

    if (platformResult.rows.length === 0) {
      await interaction.reply({
        content: `❌ Unknown platform: ${platform}. Please contact an admin.`,
        ephemeral: true,
      });
      return;
    }

    const platformId = platformResult.rows[0].id;

    // 4. Check if already linked
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
      await interaction.reply({
        content: `✅ Updated your ${platform} account ID from \`${accountId}\`. You can now submit replays!`,
        ephemeral: true,
      });
    } else {
      // Insert new
      await db.query(
        `INSERT INTO sprocket.member_platform_account ("platformAccountId", "memberId", "platformId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [accountId, memberId, platformId]
      );
      await interaction.reply({
        content: `✅ Linked your ${platform} account (\`${accountId}\`). You can now submit replays!`,
        ephemeral: true,
      });
    }

    logger.info(`User ${discordId} linked ${platform} account: ${accountId}`);

  } catch (error) {
    logger.error('Error in /link-tm command:', error);
    await interaction.reply({
      content: '❌ An error occurred while linking your account. Please contact an admin.',
      ephemeral: true,
    });
  }
}