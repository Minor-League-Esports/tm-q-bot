import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder
} from 'discord.js';
import { playerService } from '../services/player.service.js';
import { banService } from '../services/ban.service.js';
import { scrimService } from '../services/scrim.service.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View player profile and stats')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('The user to view (leave empty for yourself)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const discordId = targetUser.id;

    // Get player from database
    const player = await playerService.getByDiscordId(discordId);
    if (!player) {
      // If the user is checking their own profile, give them more info
      if (discordId === interaction.user.id) {
        // Check if they exist in Sprocket
        const hasSprocketIdentity = await playerService.validateSprocketIdentity(discordId);

        if (!hasSprocketIdentity) {
          await interaction.reply({
            content: `❌ You are not registered in the Sprocket system for Trackmania.\nPlease register on the website first, then contact an admin to be added to the bot.`,
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: `✅ You have a valid Sprocket account, but are not yet registered in this bot.\nPlease contact an admin to complete your registration.`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: `${targetUser.username} is not registered in the system.`,
        ephemeral: true,
      });
      return;
    }

    // Get ban information
    const isBanned = await banService.isPlayerBanned(player.id);
    const banTimeRemaining = isBanned ? await banService.getBanTimeRemaining(player.id) : 0;
    const recentDodges = await banService.getRecentDodgeCount(player.id);

    // Get recent scrims
    const recentScrims = await scrimService.getPlayerRecentScrims(player.id, 5);
    const completedScrims = recentScrims.filter(s => s.status === 'completed');

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(isBanned ? 0xFF0000 : 0x00FF00)
      .setTitle(`${targetUser.username}'s Profile`)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'League', value: player.league, inline: true },
        { name: 'Registered', value: new Date(player.created_at).toLocaleDateString(), inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      );

    // Ban status
    if (isBanned) {
      const minutes = Math.ceil(banTimeRemaining / 60);
      embed.addFields({
        name: '⛔ Ban Status',
        value: `Banned for ${minutes} more minute(s)`,
        inline: false
      });
    } else {
      embed.addFields({
        name: '✅ Ban Status',
        value: 'Not banned',
        inline: false
      });
    }

    // Dodge count
    embed.addFields({
      name: 'Recent Dodges (24h)',
      value: recentDodges.toString(),
      inline: true
    });

    // Scrim stats
    embed.addFields({
      name: 'Completed Scrims',
      value: completedScrims.length.toString(),
      inline: true
    });

    // Recent scrims list
    if (recentScrims.length > 0) {
      const scrimList = recentScrims
        .slice(0, 5)
        .map(s => {
          const status = s.status === 'completed' ? '✅' :
            s.status === 'cancelled' ? '❌' :
              s.status === 'active' ? '🎮' : '⏳';
          const date = new Date(s.created_at).toLocaleDateString();
          return `${status} ${s.scrim_uid} - ${date}`;
        })
        .join('\n');

      embed.addFields({
        name: 'Recent Scrims',
        value: scrimList,
        inline: false
      });
    }

    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });

    logger.info('Profile viewed', {
      viewerId: interaction.user.id,
      targetId: discordId
    });
  } catch (error) {
    logger.error('Error executing profile command:', error);
    await interaction.reply({
      content: 'An error occurred while fetching the profile.',
      ephemeral: true,
    });
  }
}
