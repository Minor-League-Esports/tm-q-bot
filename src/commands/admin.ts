import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';
import { queueService } from '../services/queue.service.js';
import { banService } from '../services/ban.service.js';
import { playerService } from '../services/player.service.js';
import { logger } from '../utils/logger.js';
import { League } from '../types.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin commands for queue management')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(subcommand =>
    subcommand
      .setName('queue-reset')
      .setDescription('Reset a league queue')
      .addStringOption(option =>
        option
          .setName('league')
          .setDescription('The league queue to reset')
          .setRequired(true)
          .addChoices(
            { name: 'Academy', value: 'Academy' },
            { name: 'Champion', value: 'Champion' },
            { name: 'Master', value: 'Master' },
            { name: 'All', value: 'All' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('ban')
      .setDescription('Manually ban a player from queueing')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to ban')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('duration')
          .setDescription('Ban duration in minutes')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10080) // 1 week max
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for the ban')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('unban')
      .setDescription('Remove a player\'s queue ban')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to unban')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View detailed player statistics')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to view stats for')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('dodges')
      .setDescription('View a player\'s dodge history')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to view dodge history for')
          .setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'queue-reset':
        await handleQueueReset(interaction);
        break;
      case 'ban':
        await handleBan(interaction);
        break;
      case 'unban':
        await handleUnban(interaction);
        break;
      case 'stats':
        await handleStats(interaction);
        break;
      case 'dodges':
        await handleDodges(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true,
        });
    }
  } catch (error) {
    logger.error('Error executing admin command:', error);
    const errorMessage = {
      content: 'An error occurred while processing your request.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
}

async function handleQueueReset(interaction: ChatInputCommandInteraction) {
  const league = interaction.options.getString('league', true);

  let count: number;
  if (league === 'All') {
    count = queueService.clearAllQueues();
  } else {
    count = queueService.clearLeagueQueue(league as League);
  }

  await interaction.reply({
    content: `✅ Reset ${league} queue. Removed ${count} player(s).`,
    ephemeral: false,
  });

  logger.info('Admin queue reset', {
    adminId: interaction.user.id,
    league,
    removedCount: count
  });
}

async function handleBan(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('user', true);
  const durationMinutes = interaction.options.getInteger('duration', true);
  const reason = interaction.options.getString('reason', true);

  const player = await playerService.getByDiscordId(user.id);
  if (!player) {
    await interaction.reply({
      content: `${user.username} is not registered in the system.`,
      ephemeral: true,
    });
    return;
  }

  const durationSeconds = durationMinutes * 60;
  await banService.applyManualBan(player.id, durationSeconds, reason);

  await interaction.reply({
    content: `✅ Banned ${user.username} for ${durationMinutes} minute(s).\nReason: ${reason}`,
    ephemeral: false,
  });

  logger.info('Admin manual ban applied', {
    adminId: interaction.user.id,
    targetId: user.id,
    durationMinutes,
    reason
  });
}

async function handleUnban(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('user', true);

  const player = await playerService.getByDiscordId(user.id);
  if (!player) {
    await interaction.reply({
      content: `${user.username} is not registered in the system.`,
      ephemeral: true,
    });
    return;
  }

  await banService.unbanPlayer(player.id);

  await interaction.reply({
    content: `✅ Removed all active bans for ${user.username}.`,
    ephemeral: false,
  });

  logger.info('Admin unban', {
    adminId: interaction.user.id,
    targetId: user.id
  });
}

async function handleStats(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('user', true);

  const player = await playerService.getByDiscordId(user.id);
  if (!player) {
    await interaction.reply({
      content: `${user.username} is not registered in the system.`,
      ephemeral: true,
    });
    return;
  }

  const isBanned = await banService.isPlayerBanned(player.id);
  const recentDodges = await banService.getRecentDodgeCount(player.id);
  const banHistory = await banService.getPlayerBanHistory(player.id, 10);

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`Admin Stats: ${user.username}`)
    .addFields(
      { name: 'Player ID', value: player.id.toString(), inline: true },
      { name: 'Discord ID', value: player.discord_id, inline: true },
      { name: 'League', value: player.league, inline: true },
      { name: 'Currently Banned', value: isBanned ? 'Yes' : 'No', inline: true },
      { name: 'Recent Dodges (24h)', value: recentDodges.toString(), inline: true },
      { name: 'Total Bans', value: banHistory.length.toString(), inline: true }
    );

  if (banHistory.length > 0) {
    const banList = banHistory
      .slice(0, 5)
      .map(ban => {
        const date = new Date(ban.ban_start).toLocaleDateString();
        const type = ban.is_manual ? '👤 Manual' : '🚫 Auto';
        return `${type} - ${date} - ${ban.reason}`;
      })
      .join('\n');

    embed.addFields({
      name: 'Recent Bans',
      value: banList,
      inline: false
    });
  }

  embed.setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleDodges(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('user', true);

  const player = await playerService.getByDiscordId(user.id);
  if (!player) {
    await interaction.reply({
      content: `${user.username} is not registered in the system.`,
      ephemeral: true,
    });
    return;
  }

  const banHistory = await banService.getPlayerBanHistory(player.id, 20);
  const dodges = banHistory.filter(ban => !ban.is_manual);

  const embed = new EmbedBuilder()
    .setColor(0xFF9900)
    .setTitle(`Dodge History: ${user.username}`)
    .setDescription(`Total dodges: ${dodges.length}`);

  if (dodges.length > 0) {
    const dodgeList = dodges
      .slice(0, 10)
      .map((dodge, i) => {
        const date = new Date(dodge.ban_start).toLocaleString();
        const duration = Math.round(
          (new Date(dodge.ban_end).getTime() - new Date(dodge.ban_start).getTime()) / 60000
        );
        return `${i + 1}. ${date} - ${duration}min ban - ${dodge.reason}`;
      })
      .join('\n');

    embed.addFields({
      name: 'Recent Dodges',
      value: dodgeList,
      inline: false
    });
  } else {
    embed.setDescription('No dodge history found.');
  }

  embed.setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
