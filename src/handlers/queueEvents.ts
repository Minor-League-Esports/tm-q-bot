import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { QueuePopEvent, queueService } from '../services/queue.service.js';
import { UrlGenerator } from '../utils/urlGenerator.js';
import { logger } from '../utils/logger.js';

export class QueueEventHandler {
  constructor(private client: Client) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for queue pop events
    queueService.on('queuePop', async (event: QueuePopEvent) => {
      await this.handleQueuePop(event);
    });

    // Listen for check-in timeout events
    queueService.on('checkInTimeout', async (event: any) => {
      await this.handleCheckInTimeout(event);
    });

    // Listen for scrim completion events
    queueService.on('scrimCompleted', async (event: any) => {
      await this.handleScrimCompleted(event);
    });

    // Listen for scrim activation events (all players checked in)
    queueService.on('scrimActivated', async (event: any) => {
      await this.handleScrimActivated(event);
    });

    logger.info('Queue event handlers initialized');
  }

  /**
   * Handle queue pop - notify all 4 players
   */
  private async handleQueuePop(event: QueuePopEvent): Promise<void> {
    const { scrim, players, maps } = event;

    logger.info('Handling queue pop', {
      scrimId: scrim.id,
      scrimUid: scrim.scrim_uid,
      playerCount: players.length,
      league: scrim.league,
    });

    // Generate the Google AppScript Web App URL
    const urlData = UrlGenerator.createUrlData(
      scrim.scrim_uid,
      players.map((p) => p.discord_username),
      maps.map((m) => m.name),
    );
    const formUrl = UrlGenerator.generateWebAppUrl(urlData);

    // Create embed with scrim details
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('🎮 Scrim Match Found!')
      .setDescription(`**${scrim.league} League** - Scrim ID: \`${scrim.scrim_uid}\``)
      .addFields(
        {
          name: '👥 Players',
          value: players.map((p) => `• ${p.discord_username}`).join('\n'),
          inline: true,
        },
        {
          name: '🗺️ Maps',
          value: maps.map((m, i) => `${i + 1}. ${m.name}`).join('\n'),
          inline: true,
        },
        {
          name: '⏰ Check-in Deadline',
          value: scrim.checkin_deadline
            ? `<t:${Math.floor(new Date(scrim.checkin_deadline).getTime() / 1000)}:R>`
            : '5 minutes',
          inline: false,
        },
        {
          name: '📝 Submit Results',
          value: `[Click here to submit match results](${formUrl})`,
          inline: false,
        },
      )
      .setFooter({ text: 'Use /checkin to confirm your participation' })
      .setTimestamp();

    // Send DM to each player
    for (const player of players) {
      try {
        const user = await this.client.users.fetch(player.discord_id);

        await user.send({
          content:
            '⚠️ **SCRIM MATCH FOUND** ⚠️\n\nYou have **5 minutes** to check in using `/checkin`',
          embeds: [embed],
        });

        logger.info('Sent queue pop DM', {
          playerId: player.id,
          discordId: player.discord_id,
        });
      } catch (error) {
        logger.error('Failed to send queue pop DM', {
          playerId: player.id,
          discordId: player.discord_id,
          error,
        });
      }
    }

    // Optionally: Post to a dedicated scrim channel (if configured)
    await this.postToScrimChannel(scrim.league, embed);
  }

  /**
   * Handle check-in timeout - notify about no-shows and cancelled scrim
   */
  private async handleCheckInTimeout(event: {
    scrimId: number;
    noShowPlayerIds: number[];
    checkedInPlayers: number[];
  }): Promise<void> {
    const { scrimId, noShowPlayerIds, checkedInPlayers } = event;

    logger.info('Handling check-in timeout', {
      scrimId,
      noShowCount: noShowPlayerIds.length,
      checkedInCount: checkedInPlayers.length,
    });

    // Notify no-show players about their penalty
    for (const playerId of noShowPlayerIds) {
      try {
        const { playerService } = await import('../services/player.service.js');
        const { banService } = await import('../services/ban.service.js');

        const player = await playerService.getById(playerId);
        if (!player) continue;

        const user = await this.client.users.fetch(player.discord_id);
        const ban = await banService.getActiveBan(playerId);

        const banDuration = ban
          ? Math.ceil((new Date(ban.ban_end).getTime() - new Date(ban.ban_start).getTime()) / 60000)
          : 0;

        const embed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('❌ Queue Dodge Penalty')
          .setDescription('You failed to check in for your scrim match.')
          .addFields(
            {
              name: '⛔ Penalty',
              value: `Banned from queueing for **${banDuration} minutes**`,
              inline: true,
            },
            {
              name: '🔢 Recent Dodges',
              value: ban ? `${ban.dodge_count} in last 24h` : '1',
              inline: true,
            },
          )
          .setFooter({ text: 'Please check in promptly when a match is found!' })
          .setTimestamp();

        await user.send({ embeds: [embed] });

        logger.info('Sent dodge penalty notification', {
          playerId,
          banDuration,
        });
      } catch (error) {
        logger.error('Failed to send dodge penalty DM', {
          playerId,
          error,
        });
      }
    }

    // Notify checked-in players that the match was cancelled and they're back in queue
    for (const playerId of checkedInPlayers) {
      try {
        const { playerService } = await import('../services/player.service.js');
        const player = await playerService.getById(playerId);
        if (!player) continue;

        const user = await this.client.users.fetch(player.discord_id);

        const embed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('⚠️ Match Cancelled')
          .setDescription('Your scrim was cancelled because not all players checked in.')
          .addFields({
            name: "✅ You've been returned to the queue",
            value: 'You have priority and will be matched with the next available players.',
            inline: false,
          })
          .setTimestamp();

        await user.send({ embeds: [embed] });

        logger.info('Sent match cancelled notification', {
          playerId,
        });
      } catch (error) {
        logger.error('Failed to send match cancelled DM', {
          playerId,
          error,
        });
      }
    }
  }

  /**
   * Handle scrim activation - send replay submission instructions to players
   */
  public async handleScrimActivated(event: {
    scrimId: number;
    scrimUid: string;
    playerIds: number[];
    league: string;
  }): Promise<void> {
    const { scrimId, scrimUid, playerIds, league } = event;

    logger.info('Handling scrim activation', {
      scrimId,
      scrimUid,
      playerCount: playerIds.length,
      league
    });

    const replaySubmissionUrl = process.env.REPLAY_SUBMISSION_URL;

    // Create embed for replay submission instructions
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🎮 Match is Starting!')
      .setDescription(`**${league} League** - Scrim ID: \`${scrimUid}\``)
      .addFields(
        {
          name: '📝 After Your Match',
          value: `After your match is completed, please follow this link and submit your replay file:\n[Submit Replay File](${replaySubmissionUrl})`,
          inline: false
        }
      )
      .setFooter({ text: 'Good luck and have fun!' })
      .setTimestamp();

    // Send DM to each player
    for (const playerId of playerIds) {
      try {
        const { playerService } = await import('../services/player.service.js');
        const player = await playerService.getById(playerId);
        if (!player) continue;

        const user = await this.client.users.fetch(player.discord_id);

        await user.send({
          content: '✅ **ALL PLAYERS CHECKED IN** ✅\n\nYour match is ready to start!',
          embeds: [embed]
        });

        logger.info('Sent match start DM with replay instructions', {
          playerId,
          discordId: player.discord_id,
          scrimUid
        });
      } catch (error) {
        logger.error('Failed to send match start DM', {
          playerId,
          scrimUid,
          error
        });
      }
    }
  }

  /**
   * Handle scrim completion - send replay submission link to players
   */
  public async handleScrimCompleted(event: {
    scrimId: number;
    scrimUid: string;
    playerIds: number[];
    league: string;
  }): Promise<void> {
    const { scrimId, scrimUid, playerIds, league } = event;

    logger.info('Handling scrim completion', {
      scrimId,
      scrimUid,
      playerCount: playerIds.length,
      league
    });

    // Generate replay submission URL with scrim ID
    const replaySubmissionUrl = `${process.env.REPLAY_SUBMISSION_URL}?scrim=${scrimUid}`;

    // Create embed for replay submission
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('🏁 Scrim Completed!')
      .setDescription(`**${league} League** - Scrim ID: \`${scrimUid}\``)
      .addFields(
        {
          name: '📁 Submit Your Replay',
          value: `Please submit your replay file using the link below:\n[Submit Replay File](${replaySubmissionUrl})`,
          inline: false
        },
        {
          name: '⏰ Deadline',
          value: 'Please submit within 24 hours of match completion',
          inline: false
        }
      )
      .setFooter({ text: 'Thank you for playing!' })
      .setTimestamp();

    // Send DM to each player
    for (const playerId of playerIds) {
      try {
        const { playerService } = await import('../services/player.service.js');
        const player = await playerService.getById(playerId);
        if (!player) continue;

        const user = await this.client.users.fetch(player.discord_id);

        await user.send({
          content: '🎉 **SCRIM COMPLETED** 🎉\n\nPlease submit your replay file!',
          embeds: [embed]
        });

        logger.info('Sent replay submission DM', {
          playerId,
          discordId: player.discord_id,
          scrimUid
        });
      } catch (error) {
        logger.error('Failed to send replay submission DM', {
          playerId,
          scrimUid,
          error
        });
      }
    }
  }

  /**
   * Post scrim notification to a dedicated channel (optional)
   */
  private async postToScrimChannel(league: string, embed: EmbedBuilder): Promise<void> {
    try {
      // You can configure channel IDs per league in your .env
      const channelId = process.env[`SCRIM_CHANNEL_${league.toUpperCase()}`];

      if (!channelId) {
        logger.debug(`No scrim channel configured for ${league} league`);
        return;
      }

      const channel = await this.client.channels.fetch(channelId);

      if (channel?.isTextBased()) {
        await (channel as TextChannel).send({
          content: `🎮 **${league} Scrim Match Found!**`,
          embeds: [embed],
        });

        logger.info('Posted to scrim channel', { league, channelId });
      }
    } catch (error) {
      logger.error('Failed to post to scrim channel', { league, error });
    }
  }
}
