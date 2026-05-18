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
import { matchAuditService, MatchAuditReport } from '../services/match-audit.service.js';
import { rosterService } from '../services/roster.service.js';
import { identityBackfillService } from '../services/identity-backfill.service.js';
import { logger } from '../utils/logger.js';
import { League } from '../types.js';
import { db, tableName } from '../db/index.js';
import { parseLinkTmInput, executePlatformLink } from '../services/link-tm.service.js';

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
      .setName('link-tm')
      .setDescription("Link a player's Trackmania account")
      .addUserOption(option =>
        option
          .setName('player')
          .setDescription('The player to link')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('platform')
          .setDescription('Gaming platform')
          .setRequired(true)
          .addChoices(
            { name: 'Steam', value: 'STEAM' },
            { name: 'Epic', value: 'EPIC' },
            { name: 'Xbox', value: 'XBOX' },
            { name: 'PS4/PS5', value: 'PS4' }
          )
      )
      .addStringOption(option =>
        option
          .setName('account-id')
          .setDescription("Player's account ID (from Trackmania settings → Account)")
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
      .addUserOption(option => option.setName('p1').setDescription('Home player 1').setRequired(true))
      .addUserOption(option => option.setName('p2').setDescription('Home player 2').setRequired(true))
      .addUserOption(option => option.setName('p3').setDescription('Away player 1').setRequired(true))
      .addUserOption(option => option.setName('p4').setDescription('Away player 2').setRequired(true))
      .addIntegerOption(option => option.setName('fixture_id').setDescription('Existing Sprocket fixture ID').setRequired(false))
      .addStringOption(option => option.setName('home_franchise').setDescription('Home franchise name/code for a test fixture').setRequired(false))
      .addStringOption(option => option.setName('away_franchise').setDescription('Away franchise name/code for a test fixture').setRequired(false))
      .addIntegerOption(option => option.setName('schedule_group_id').setDescription('Optional Sprocket schedule group ID').setRequired(false))
      .addIntegerOption(option => option.setName('week').setDescription('Optional week for Trackmania Test schedule group').setRequired(false))
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
      .setName('audit-match')
      .setDescription('Audit a Trackmania scrim result and Sprocket linkage')
      .addStringOption(option =>
        option
          .setName('scrim_id')
          .setDescription('The Scrim ID (UUID) to audit')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('elo')
      .setDescription('Inspect current Elo and recent Elo history for a player')
      .addUserOption(option =>
        option
          .setName('player')
          .setDescription('The player to inspect')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('league')
          .setDescription('Optional league filter')
          .setRequired(false)
          .addChoices(
            { name: 'Academy', value: 'Academy' },
            { name: 'Champion', value: 'Champion' },
            { name: 'Master', value: 'Master' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('backfill-identities')
      .setDescription('Backfill local Trackmania players with Sprocket identity fields')
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
      .setName('roster')
      .setDescription('Manage Trackmania Sprocket rosters')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add or move a player to a roster slot')
          .addUserOption(option => option.setName('player').setDescription('Player to add').setRequired(true))
          .addStringOption(option => option.setName('franchise').setDescription('Franchise name/code').setRequired(true))
          .addStringOption(option => option.setName('slot').setDescription('Roster slot/role').setRequired(true))
          .addStringOption(option =>
            option
              .setName('league')
              .setDescription('League')
              .setRequired(true)
              .addChoices(
                { name: 'Academy', value: 'Academy' },
                { name: 'Champion', value: 'Champion' },
                { name: 'Master', value: 'Master' }
              )
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove a player from any Trackmania roster slot')
          .addUserOption(option => option.setName('player').setDescription('Player to remove').setRequired(true))
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('show')
          .setDescription('Show a franchise roster')
          .addStringOption(option => option.setName('franchise').setDescription('Franchise name/code').setRequired(true))
          .addStringOption(option =>
            option
              .setName('league')
              .setDescription('League')
              .setRequired(true)
              .addChoices(
                { name: 'Academy', value: 'Academy' },
                { name: 'Champion', value: 'Champion' },
                { name: 'Master', value: 'Master' }
              )
          )
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
      case 'roster':
        await handleRosterCommand(interaction, subcommand);
        break;
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
          case 'link-tm':
            await handleLinkTm(interaction);
            break;
          case 'create-match':
            await handleCreateMatch(interaction);
            break;
          case 'calc-elo':
            await handleCalcElo(interaction);
            break;
          case 'audit-match':
            await handleAuditMatch(interaction);
            break;
          case 'elo':
            await handleElo(interaction);
            break;
          case 'backfill-identities':
            await handleBackfillIdentities(interaction);
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

async function handleLinkTm(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser('player', true);
  const platform = interaction.options.getString('platform', true);
  const accountId = interaction.options.getString('account-id', true).trim();

  const discordId = targetUser.id;

  try {
    const result = await parseLinkTmInput(discordId, platform, accountId);

    if (result.error) {
      await interaction.editReply({
        content: `❌ ${targetUser.username}: ${result.message}.`,
      });
      return;
    }

    const linkResult = await executePlatformLink(result.memberId, result.platformId, result.platformCode, accountId);

    const message = linkResult.isUpdate
      ? `✅ Updated ${targetUser.username}'s ${platform} account to \`${accountId}\`.`
      : `✅ Linked ${targetUser.username}'s ${platform} account (\`${accountId}\`).`;

    await interaction.editReply({ content: message });
    logger.info(`Admin linked ${targetUser.username} (${discordId}) ${platform} account: ${accountId}`);

  } catch (error) {
    logger.error('Error in /admin link-tm:', error);
    await interaction.editReply({
      content: '❌ An error occurred. Please try again or contact a developer.',
    });
  }
}

async function handleRosterCommand(
  interaction: ChatInputCommandInteraction,
  subcommand: string
) {
  await interaction.deferReply({ ephemeral: true });

  switch (subcommand) {
    case 'add': {
      const user = interaction.options.getUser('player', true);
      const franchise = interaction.options.getString('franchise', true);
      const slot = interaction.options.getString('slot', true);
      const league = interaction.options.getString('league', true) as League;
      const row = await rosterService.addPlayer(user.id, franchise, slot, league);
      await interaction.editReply({
        content: `Added <@${user.id}> to ${row.franchise_name} ${league} slot ${row.role_name}.`,
      });
      return;
    }
    case 'remove': {
      const user = interaction.options.getUser('player', true);
      const cleared = await rosterService.removePlayer(user.id);
      await interaction.editReply({ content: `Removed <@${user.id}> from ${cleared} roster slot(s).` });
      return;
    }
    case 'show': {
      const franchise = interaction.options.getString('franchise', true);
      const league = interaction.options.getString('league', true) as League;
      const rows = await rosterService.showFranchise(franchise, league);
      const embed = new EmbedBuilder()
        .setColor(0x00aa55)
        .setTitle(`Roster: ${franchise} - ${league}`)
        .setDescription(
          rows.length > 0
            ? rows.map((row) => `${row.role_name}: ${formatRosterDisplayName(row)} (slot ${row.slot_id})`).join('\n')
            : 'No roster slots found.'
        )
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    default:
      await interaction.editReply({ content: 'Unknown roster subcommand.' });
  }
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

  const fixtureId = interaction.options.getInteger('fixture_id') ?? undefined;
  const homeFranchise = interaction.options.getString('home_franchise') ?? undefined;
  const awayFranchise = interaction.options.getString('away_franchise') ?? undefined;
  const scheduleGroupId = interaction.options.getInteger('schedule_group_id') ?? undefined;
  const week = interaction.options.getInteger('week') ?? undefined;

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
    const scrim = await scrimService.createScheduledMatch(league, players, {
      fixtureId,
      homeFranchise,
      awayFranchise,
      scheduleGroupId,
      week,
    });

    await interaction.reply({
      content: `Scheduled Match Created!\nID: \`${scrim.scrim_uid}\`\nLeague: ${league}\nFixture: ${fixtureId ?? (homeFranchise && awayFranchise ? `${homeFranchise} vs ${awayFranchise}` : 'none')}\nPlayers: ${players.map(p => p.discord_username).join(', ')}`,
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

async function handleAuditMatch(interaction: ChatInputCommandInteraction) {
  const scrimUid = interaction.options.getString('scrim_id', true);
  await interaction.deferReply({ ephemeral: true });

  const report = await matchAuditService.auditByScrimUid(scrimUid);
  if (!report) {
    await interaction.editReply({ content: `Scrim \`${scrimUid}\` was not found.` });
    return;
  }

  await interaction.editReply({ embeds: [buildAuditEmbed(report)] });
}

async function handleElo(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('player', true);
  const league = interaction.options.getString('league') as League | null;
  await interaction.deferReply({ ephemeral: true });

  const player = await playerService.getByDiscordId(user.id);
  if (!player) {
    await interaction.editReply({ content: `${user.username} is not registered in the system.` });
    return;
  }

  const summary = await eloService.getPlayerEloSummary(player.id, league ?? undefined);
  const embed = new EmbedBuilder()
    .setColor(0x3366cc)
    .setTitle(`Elo: ${player.discord_username}`)
    .setDescription(`Local player ${player.id} | Sprocket ${player.sprocket_player_id ?? 'n/a'}`);

  embed.addFields({
    name: 'Current Ratings',
    value:
      summary.ratings.length > 0
        ? summary.ratings
            .map((rating) => `${rating.league}: ${rating.rating} (${rating.wins}W/${rating.losses}L)`)
            .join('\n')
        : 'No current ratings found.',
    inline: false,
  });

  embed.addFields({
    name: 'Recent History',
    value:
      summary.history.length > 0
        ? summary.history
            .slice(0, 10)
            .map((row) => `${row.scrim_uid}: ${row.old_rating} → ${row.new_rating} (${row.change_amount >= 0 ? '+' : ''}${row.change_amount})`)
            .join('\n')
        : 'No Elo history found.',
    inline: false,
  });

  await interaction.editReply({ embeds: [embed.setTimestamp()] });
}

function buildAuditEmbed(report: MatchAuditReport) {
  const passFail = (passed: boolean) => (passed ? 'PASS' : 'FAIL');
  const embed = new EmbedBuilder()
    .setColor(Object.values(report.checks).every(Boolean) ? 0x00aa55 : 0xff9900)
    .setTitle(`Match Audit: ${report.scrim.scrim_uid}`)
    .setDescription(
      [
        `Local ID: ${report.scrim.id}`,
        `Status: ${report.scrim.match_type} / ${report.scrim.status}`,
        `Sprocket: parent ${report.scrim.sprocket_match_parent_id ?? 'n/a'} | match ${report.scrim.sprocket_match_id ?? 'n/a'}`,
        `Winner Team: ${report.scrim.winner_team ?? 'n/a'} | Elo Processed: ${report.scrim.elo_processed ? 'yes' : 'no'}`,
      ].join('\n')
    );

  embed.addFields({
    name: 'Checks',
    value: Object.entries(report.checks)
      .map(([name, passed]) => `${name}: ${passFail(passed)}`)
      .join('\n'),
    inline: false,
  });

  embed.addFields({
    name: 'Fixture',
    value: report.fixture
      ? [
          `Fixture: ${report.fixture.fixture_id}`,
          `Home: ${report.fixture.home_franchise_name ?? report.fixture.home_franchise_id ?? 'n/a'}`,
          `Away: ${report.fixture.away_franchise_name ?? report.fixture.away_franchise_id ?? 'n/a'}`,
          `Group: ${report.fixture.schedule_group_name ?? report.fixture.schedule_group_id ?? 'n/a'}`,
        ].join('\n')
      : 'No fixture linked.',
    inline: false,
  });

  embed.addFields({
    name: 'Players',
    value:
      report.players.length > 0
        ? report.players
            .map((player) => `${player.discord_username}: local ${player.local_player_id}, sprocket ${player.sprocket_player_id ?? 'n/a'}, team ${player.team_id ?? 'n/a'}`)
            .join('\n')
            .slice(0, 1024)
        : 'No players found.',
    inline: false,
  });

  embed.addFields({
    name: 'Rows',
    value: `Stats: ${report.stats.reduce((sum, row) => sum + row.stat_rows, 0)} | Eligibility: ${report.eligibility.length} | Elo history: ${report.elo_history.length}`,
    inline: false,
  });

  return embed.setTimestamp();
}

async function handleBackfillIdentities(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const issues = await identityBackfillService.backfillTrackmaniaPlayerIdentities();
  const missing = issues.filter((issue) => issue.reason === 'missing_sprocket_profile');
  const duplicates = issues.filter((issue) => issue.reason === 'duplicate_sprocket_profiles');

  const embed = new EmbedBuilder()
    .setColor(issues.length === 0 ? 0x00aa55 : 0xff9900)
    .setTitle('Trackmania Identity Backfill')
    .setDescription(
      issues.length === 0
        ? 'Backfill completed successfully. No missing or duplicate Sprocket profiles were found.'
        : `Backfill completed with ${issues.length} issue(s). Missing: ${missing.length}. Duplicates: ${duplicates.length}.`
    )
    .setTimestamp();

  if (issues.length > 0) {
    embed.addFields({
      name: 'Issues',
      value: issues
        .slice(0, 10)
        .map((issue) => {
          const profileIds = issue.sprocket_player_ids.length > 0 ? issue.sprocket_player_ids.join(', ') : 'none';
          return `${issue.discord_username} (${issue.discord_id}) local ${issue.local_player_id}: ${issue.reason}; Sprocket profiles: ${profileIds}`;
        })
        .join('\n')
        .slice(0, 1024),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

function formatRosterDisplayName(row: { discord_id: string | null; discord_username?: string | null; player_id: number | null }) {
  if (!row.player_id) {
    return 'Empty';
  }

  return row.discord_username || row.discord_id || `Sprocket player ${row.player_id}`;
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
