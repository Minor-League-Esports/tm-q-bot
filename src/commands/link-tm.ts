import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { parseLinkTmInput, executePlatformLink } from '../services/link-tm.service.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('link-tm')
  .setDescription('Link your Trackmania account to play scrims')
  .addStringOption((option) =>
    option
      .setName('account-id')
      .setDescription('Your account ID (found in Trackmania settings → Account)')
      .setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const discordId = interaction.user.id;
  const platform = 'STEAM';
  const accountId = interaction.options.getString('account-id')!.trim();

  try {
    const result = await parseLinkTmInput(discordId, platform, accountId);

    if ('error' in result && result.error) {
      await interaction.reply({
        content: `❌ ${result.message}.\nPlease register on the Sprocket website first, then contact an admin to be added to the bot.`,
        ephemeral: true,
      });
      return;
    }

    const success = result as { memberId: number; platformId: number; platformCode: string };
    const linkResult = await executePlatformLink(
      success.memberId,
      success.platformId,
      success.platformCode,
      accountId,
    );

    const message = linkResult.success
      ? `✅ Updated your ${platform} account ID to \`${accountId}\`. You can now submit replays!`
      : `Account (\`${accountId}\`) is already in our database. Not linked.`;

    await interaction.reply({ content: message, ephemeral: true });
    logger.info(`User ${discordId} linked ${platform} account: ${accountId}`);
  } catch (error) {
    logger.error('Error in /link-tm command:', error);
    await interaction.reply({
      content: '❌ An error occurred while linking your account. Please contact an admin.',
      ephemeral: true,
    });
  }
}
