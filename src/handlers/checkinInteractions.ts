import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
} from 'discord.js';
import { playerService } from '../services/player.service.js';
import { scrimService } from '../services/scrim.service.js';
import { logger } from '../utils/logger.js';

export const CHECKIN_BUTTON_CUSTOM_ID = 'queue-pop-checkin';

export interface CheckInOutcome {
  success: boolean;
  message: string;
  scrimUid?: string;
  allCheckedIn?: boolean;
}

export function buildCheckInActionRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CHECKIN_BUTTON_CUSTOM_ID)
      .setLabel(disabled ? 'Checked in' : 'Check in now')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

export function buildQueuePopPrompt(): string {
  return [
    '⚠️ **SCRIM MATCH FOUND** ⚠️',
    '',
    'Use the **Check in now** button below to confirm your spot right here.',
    'You do not need to return to the server to respond.',
  ].join('\n');
}

export async function performCheckIn(discordId: string): Promise<CheckInOutcome> {
  const player = await playerService.getByDiscordId(discordId);
  if (!player) {
    return {
      success: false,
      message: 'You must be registered to check in. Please contact an admin.',
    };
  }

  const recentScrims = await scrimService.getPlayerRecentScrims(player.id, 1);
  const activeScrims = recentScrims.filter((scrim) => scrim.status === 'checking_in');

  if (activeScrims.length === 0) {
    return {
      success: false,
      message: 'You are not in an active scrim waiting for check-in.',
    };
  }

  const scrim = activeScrims[0];

  const isExpired = await scrimService.isCheckInExpired(scrim.id);
  if (isExpired) {
    return {
      success: false,
      message: 'The check-in period for your scrim has expired.',
    };
  }

  const success = await scrimService.checkInPlayer(scrim.id, player.id);
  if (!success) {
    return {
      success: false,
      message: 'You have already checked in for this scrim.',
    };
  }

  const allCheckedIn = await scrimService.areAllPlayersCheckedIn(scrim.id);
  const message = allCheckedIn
    ? `✅ You have checked in! All players are ready. Scrim **${scrim.scrim_uid}** is now active!`
    : `✅ You have checked in for scrim **${scrim.scrim_uid}**. Waiting for other players...`;

  logger.info('Player checked in', {
    playerId: player.id,
    scrimId: scrim.id,
    allCheckedIn,
  });

  return {
    success: true,
    message,
    scrimUid: scrim.scrim_uid,
    allCheckedIn,
  };
}

export async function handleCheckInButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  if (interaction.customId !== CHECKIN_BUTTON_CUSTOM_ID) return;

  try {
    const result = await performCheckIn(interaction.user.id);

    if (!result.success) {
      await interaction.reply({
        content: result.message,
        ephemeral: interaction.inGuild(),
      });
      return;
    }

    if (interaction.inGuild()) {
      await interaction.reply({
        content: result.message,
        ephemeral: true,
      });
      return;
    }

    await interaction.update({
      content: result.message,
      components: [buildCheckInActionRow(true)],
    });
  } catch (error) {
    logger.error('Error handling check-in button interaction:', error);

    const errorMessage = {
      content: 'An error occurred while checking in.',
      ephemeral: interaction.inGuild(),
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
}
