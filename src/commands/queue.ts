import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder
} from 'discord.js';
import { queueService } from '../services/queue.service.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Manage your queue status')
  .addSubcommand(subcommand =>
    subcommand
      .setName('join')
      .setDescription('Join the queue for your league')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('leave')
      .setDescription('Leave the current queue')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check current queue status for all leagues')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List all players in queues')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  try {
    switch (subcommand) {
      case 'join':
        await handleJoin(interaction);
        break;
      case 'leave':
        await handleLeave(interaction);
        break;
      case 'status':
        await handleStatus(interaction);
        break;
      case 'list':
        await handleList(interaction);
        break;
      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true,
        });
    }
  } catch (error) {
    logger.error('Error executing queue command:', error);
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

async function handleJoin(interaction: ChatInputCommandInteraction) {
  const discordId = interaction.user.id;
  const username = interaction.user.username;

  const result = await queueService.joinQueue(discordId, username);

  await interaction.reply({
    content: result.message,
    ephemeral: !result.success,
  });
}

async function handleLeave(interaction: ChatInputCommandInteraction) {
  const discordId = interaction.user.id;

  const result = await queueService.leaveQueue(discordId);

  await interaction.reply({
    content: result.message,
    ephemeral: true,
  });
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const status = queueService.getQueueStatus();

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Queue Status')
    .setDescription('Current players in each league queue')
    .addFields(
      { name: 'Academy', value: `${status.Academy}/4 players`, inline: true },
      { name: 'Champion', value: `${status.Champion}/4 players`, inline: true },
      { name: 'Master', value: `${status.Master}/4 players`, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleList(interaction: ChatInputCommandInteraction) {
  const status = queueService.getQueueStatus();
  const academyQueue = queueService.getLeagueQueue('Academy');
  const championQueue = queueService.getLeagueQueue('Champion');
  const masterQueue = queueService.getLeagueQueue('Master');

  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('Queue Lists')
    .setDescription('All players currently in queues');

  if (academyQueue.length > 0) {
    const players = academyQueue.map((p, i) => `${i + 1}. ${p.username}`).join('\n');
    embed.addFields({ name: `Academy (${status.Academy}/4)`, value: players });
  }

  if (championQueue.length > 0) {
    const players = championQueue.map((p, i) => `${i + 1}. ${p.username}`).join('\n');
    embed.addFields({ name: `Champion (${status.Champion}/4)`, value: players });
  }

  if (masterQueue.length > 0) {
    const players = masterQueue.map((p, i) => `${i + 1}. ${p.username}`).join('\n');
    embed.addFields({ name: `Master (${status.Master}/4)`, value: players });
  }

  if (academyQueue.length === 0 && championQueue.length === 0 && masterQueue.length === 0) {
    embed.setDescription('No players currently in any queue.');
  }

  embed.setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
