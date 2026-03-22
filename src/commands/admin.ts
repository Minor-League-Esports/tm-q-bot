import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';
import { queueService } from '../services/queue.service.js';
import { banService } from '../services/ban.service.js';
import { playerService } from '../services/player.service.js';
import { scrimService } from '../services/scrim.service.js';
import { eloService } from '../services/elo.service.js';
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
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('create-match')
      .setDescription('Create a scheduled match')
      .addStringOption(option =>
        option
          .setName('league')
          .setDescription('The league for this match')
          .setRequired(true)
          .addChoices(
            { name: 'Academy', value: 'Academy' },
            { name: 'Champion', value: 'Champion' },
            { name: 'Master', value: 'Master' }
          )
      )
      .addUserOption(option => option.setName('p1').setDescription('Player 1').setRequired(true))
      .addUserOption(option => option.setName('p2').setDescription('Player 2').setRequired(true))
      .addUserOption(option => option.setName('p3').setDescription('Player 3').setRequired(true))
      .addUserOption(option => option.setName('p4').setDescription('Player 4').setRequired(true))
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('calc-elo')
      .setDescription('Manually trigger Elo calculation for a match')
      .addStringOption(option =>
        option
          .setName('scrim_id')
          .setDescription('The Scrim ID (UUID) to calculate Elo for')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('cancel-scrim')
      .setDescription('Cancel a queue scrim and return eligible players to the queue')
      .addStringOption(option =>
        option
          .setName('scrim_id')
          .setDescription('The Scrim ID (UUID) to cancel')
          .setRequired(true)
      )
  )
  .addSubcommandGroup(group =>
    group
      .setName('state')
      .setDescription('Inspect current scrim state')
      .addSubcommand(subcommand =>
        subcommand
          .setName('summary')
          .setDescription('Show live and scheduled scrims at a glance')
          .addStringOption(option =>
            option
              .setName('league')
              .setDescription('Limit results to a league')
              .setRequired(false)
              .addChoices(
                { name: 'All', value: 'All' },
                { name: 'Academy', value: 'Academy' },
                { name: 'Champion', value: 'Champion' },
                { name: 'Master', value: 'Master' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('live')
          .setDescription('Show checking-in and active queue scrims')
          .addStringOption(option =>
            option
              .setName('league')
              .setDescription('Limit results to a league')
              .setRequired(false)
              .addChoices(
                { name: 'All', value: 'All' },
                { name: 'Academy', value: 'Academy' },
                { name: 'Champion', value: 'Champion' },
                { name: 'Master', value: 'Master' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('scheduled')
          .setDescription('Show scheduled matches')
          .addStringOption(option =>
            option
              .setName('league')
              .setDescription('Limit results to a league')
              .setRequired(false)
              .addChoices(
                { name: 'All', value: 'All' },
                { name: 'Academy', value: 'Academy' },
                { name: 'Champion', value: 'Champion' },
                { name: 'Master', value: 'Master' }
              )
          )
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommandGroup) {
      case 'state':
        await handleStateCommand(interaction, subcommand);
        break;
      case null:
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
          case 'create-match':
            await handleCreateMatch(interaction);
            break;
          case 'calc-elo':
            await handleCalcElo(interaction);
            break;
          case 'cancel-scrim':
            await handleCancelScrim(interaction);
            break;
          default:
            await interaction.reply({
              content: 'Unknown subcommand.',
              ephemeral: true,
            });
        }
        break;
      default:
        await interaction.reply({
          content: 'Unknown subcommand group.',
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

async function handleStateCommand(
  interaction: ChatInputCommandInteraction,
  subcommand: string
) {
  const leagueOption = interaction.options.getString('league') as League | 'All' | null;
  const league = leagueOption && leagueOption !== 'All' ? (leagueOption as League) : undefined;

  await interaction.deferReply({ ephemeral: true });

  switch (subcommand) {
    case 'summary': {
      const liveScrims = await scrimService.getLiveAdminScrims(league, 3);
      const scheduledMatches = await scrimService.getScheduledAdminMatches(league, 3);
      const embed = buildStateSummaryEmbed(leagueOption ?? 'All', liveScrims, scheduledMatches);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    case 'live': {
      const liveScrims = await scrimService.getLiveAdminScrims(league, 10);
      const embed = buildStateDetailEmbed(
        'Live Scrims',
        leagueOption ?? 'All',
        liveScrims,
        'No live scrims are currently checking in or active.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    case 'scheduled': {
      const scheduledMatches = await scrimService.getScheduledAdminMatches(league, 10);
      const embed = buildStateDetailEmbed(
        'Scheduled Matches',
        leagueOption ?? 'All',
        scheduledMatches,
        'No scheduled matches are currently queued.'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    default:
      await interaction.editReply({
        content: 'Unknown state subcommand.',
      });
  }
}

function buildStateSummaryEmbed(
  league: League | 'All',
  liveScrims: Awaited<ReturnType<typeof scrimService.getLiveAdminScrims>>,
  scheduledMatches: Awaited<ReturnType<typeof scrimService.getScheduledAdminMatches>>
) {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`Admin State Summary${league === 'All' ? '' : ` - ${league}`}`)
    .setDescription(
      `Live: ${liveScrims.length} | Scheduled: ${scheduledMatches.length}`
    );

  embed.addFields(
    {
      name: 'Live Scrims',
      value: liveScrims.length > 0 ? liveScrims.map(formatAdminScrimLine).join('\n\n') : 'None',
      inline: false,
    },
    {
      name: 'Scheduled Matches',
      value:
        scheduledMatches.length > 0
          ? scheduledMatches.map(formatAdminScrimLine).join('\n\n')
          : 'None',
      inline: false,
    }
  );

  return embed.setTimestamp();
}

function buildStateDetailEmbed(
  title: string,
  league: League | 'All',
  details: Awaited<ReturnType<typeof scrimService.getLiveAdminScrims>>,
  emptyMessage: string
) {
  const embed = new EmbedBuilder()
    .setColor(0x00aa55)
    .setTitle(`Admin State: ${title}${league === 'All' ? '' : ` - ${league}`}`)
    .setDescription(details.length > 0 ? `${details.length} scrim(s) found.` : emptyMessage);

  if (details.length > 0) {
    for (const detail of details) {
      embed.addFields({
        name: detail.scrim.scrim_uid,
        value: formatAdminScrimDetail(detail),
        inline: false,
      });
    }
  }

  return embed.setTimestamp();
}

function formatAdminScrimLine(detail: Awaited<ReturnType<typeof scrimService.getLiveAdminScrims>>[number]) {
  const statusLine = `${detail.scrim.match_type} / ${detail.scrim.status}`;
  const playerNames = detail.players.map((player) => player.discord_username).join(', ');
  const mapNames = detail.maps.length > 0 ? detail.maps.map((map) => map.name).join(', ') : 'None';
  const matchIds = [
    `parent ${detail.scrim.sprocket_match_parent_id ?? 'n/a'}`,
    `match ${detail.scrim.sprocket_match_id ?? 'n/a'}`,
  ].join(' | ');

  return [
    `ID: ${detail.scrim.scrim_uid}`,
    `League: ${detail.scrim.league} | ${statusLine}`,
    `Players: ${playerNames}`,
    `Maps: ${mapNames}`,
    `Match IDs: ${matchIds}`,
    `Submit: ${detail.submissionUrl}`,
  ].join('\n');
}

function formatAdminScrimDetail(detail: Awaited<ReturnType<typeof scrimService.getLiveAdminScrims>>[number]) {
  const checkedIn = `${detail.checkedInCount}/${detail.players.length} checked in`;
  const checkInDeadline =
    detail.scrim.checkin_deadline && detail.scrim.status === 'checking_in'
      ? `<t:${Math.floor(new Date(detail.scrim.checkin_deadline).getTime() / 1000)}:R>`
      : null;
  const mapNames = detail.maps.length > 0 ? detail.maps.map((map) => map.name).join(', ') : 'None';
  const playerNames = detail.players.map((player) => player.discord_username).join(', ');
  const matchIds = [
    `parent ${detail.scrim.sprocket_match_parent_id ?? 'n/a'}`,
    `match ${detail.scrim.sprocket_match_id ?? 'n/a'}`,
  ].join(' | ');
  const lines = [
    `League: ${detail.scrim.league}`,
    `Status: ${detail.scrim.match_type} / ${detail.scrim.status}`,
    `Players: ${playerNames}`,
    `Maps: ${mapNames}`,
    `Progress: ${checkedIn}${checkInDeadline ? ` | closes ${checkInDeadline}` : ''}`,
    `Match IDs: ${matchIds}`,
    `Submit: ${detail.submissionUrl}`,
  ];

  return lines.join('\n');
}

async function handleCreateMatch(interaction: ChatInputCommandInteraction) {
  const league = interaction.options.getString('league', true) as League;
  const p1 = interaction.options.getUser('p1', true);
  const p2 = interaction.options.getUser('p2', true);
  const p3 = interaction.options.getUser('p3', true);
  const p4 = interaction.options.getUser('p4', true);

  const discordIds = [p1.id, p2.id, p3.id, p4.id];

  // Ensure all players are registered
  const players = [];
  for (const discordId of discordIds) {
    const player = await playerService.getByDiscordId(discordId);
    if (!player) {
      await interaction.reply({
        content: `❌ User <@${discordId}> is not registered in the system.`,
        ephemeral: true
      });
      return;
    }
    players.push(player);
  }

  try {
    const scrim = await scrimService.createScheduledMatch(league, players);

    await interaction.reply({
      content: `✅ Scheduled Match Created!\nID: \`${scrim.scrim_uid}\`\nLeague: ${league}\nPlayers: ${players.map(p => p.discord_username).join(', ')}`,
      ephemeral: false
    });
  } catch (error) {
    logger.error('Error creating scheduled match:', error);
    await interaction.reply({
      content: '❌ Failed to create scheduled match.',
      ephemeral: true
    });
  }
}

async function handleCalcElo(interaction: ChatInputCommandInteraction) {
  const scrimUid = interaction.options.getString('scrim_id', true);

  try {
    // We need to look up the internal ID from the UID first
    const scrim = await scrimService.getByUid(scrimUid);

    if (!scrim) {
      await interaction.reply({
        content: `❌ Scrim with ID \`${scrimUid}\` not found.`,
        ephemeral: true
      });
      return;
    }

    if (scrim.status !== 'completed') {
      await interaction.reply({
        content: `❌ Scrim \`${scrimUid}\` is not marked as completed yet.`,
        ephemeral: true
      });
      return;
    }

    if (scrim.elo_processed) {
      await interaction.reply({
        content: `⚠️ Elo for scrim \`${scrimUid}\` has already been processed.`,
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    await eloService.processMatch(scrim.id);

    await interaction.editReply({
      content: `✅ Elo calculation completed for scrim \`${scrimUid}\`.`
    });

  } catch (error) {
    logger.error('Error calculating Elo:', error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: '❌ An error occurred while calculating Elo.'
      });
    } else {
      await interaction.reply({
        content: '❌ An error occurred while calculating Elo.',
        ephemeral: true
      });
    }
  }
}

async function handleCancelScrim(interaction: ChatInputCommandInteraction) {
  const scrimUid = interaction.options.getString('scrim_id', true);

  try {
    const scrim = await scrimService.getByUid(scrimUid);

    if (!scrim) {
      await interaction.reply({
        content: `❌ Scrim with ID \`${scrimUid}\` not found.`,
        ephemeral: true,
      });
      return;
    }

    const result = await queueService.cancelQueueScrim(scrim.id);

    await interaction.reply({
      content: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
      ephemeral: !result.success,
    });
  } catch (error) {
    logger.error('Error cancelling scrim:', error);
    await interaction.reply({
      content: '❌ An error occurred while cancelling the scrim.',
      ephemeral: true,
    });
  }
}
