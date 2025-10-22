import {
  SlashCommandBuilder,
  ChatInputCommandInteraction
} from 'discord.js';
import { scrimService } from '../services/scrim.service.js';
import { playerService } from '../services/player.service.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('checkin')
  .setDescription('Check in for your scrim match');

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const discordId = interaction.user.id;

    // Get player from database
    const player = await playerService.getByDiscordId(discordId);
    if (!player) {
      await interaction.reply({
        content: 'You must be registered to check in. Please contact an admin.',
        ephemeral: true,
      });
      return;
    }

    // Find active scrim for this player in checking_in state
    const recentScrims = await scrimService.getPlayerRecentScrims(player.id, 1);
    const activeScrims = recentScrims.filter(s => s.status === 'checking_in');

    if (activeScrims.length === 0) {
      await interaction.reply({
        content: 'You are not in an active scrim waiting for check-in.',
        ephemeral: true,
      });
      return;
    }

    const scrim = activeScrims[0];

    // Check if check-in deadline has passed
    const isExpired = await scrimService.isCheckInExpired(scrim.id);
    if (isExpired) {
      await interaction.reply({
        content: 'The check-in period for your scrim has expired.',
        ephemeral: true,
      });
      return;
    }

    // Check in the player
    const success = await scrimService.checkInPlayer(scrim.id, player.id);

    if (!success) {
      await interaction.reply({
        content: 'You have already checked in for this scrim.',
        ephemeral: true,
      });
      return;
    }

    // Check if all players have checked in
    const allCheckedIn = await scrimService.areAllPlayersCheckedIn(scrim.id);

    if (allCheckedIn) {
      await interaction.reply({
        content: `✅ You have checked in! All players are ready. Scrim **${scrim.scrim_uid}** is now active!`,
      });
    } else {
      await interaction.reply({
        content: `✅ You have checked in for scrim **${scrim.scrim_uid}**. Waiting for other players...`,
      });
    }

    logger.info('Player checked in via command', {
      playerId: player.id,
      scrimId: scrim.id,
      allCheckedIn
    });
  } catch (error) {
    logger.error('Error executing checkin command:', error);
    await interaction.reply({
      content: 'An error occurred while checking in.',
      ephemeral: true,
    });
  }
}
