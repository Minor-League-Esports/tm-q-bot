import {
  SlashCommandBuilder,
  ChatInputCommandInteraction
} from 'discord.js';
import { logger } from '../utils/logger.js';
import { performCheckIn } from '../handlers/checkinInteractions.js';

export const data = new SlashCommandBuilder()
  .setName('checkin')
  .setDescription('Check in for your scrim match');

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const result = await performCheckIn(interaction.user.id);

    await interaction.reply({
      content: result.message,
      ephemeral: !result.success,
    });
  } catch (error) {
    logger.error('Error executing checkin command:', error);
    await interaction.reply({
      content: 'An error occurred while checking in.',
      ephemeral: true,
    });
  }
}
