import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { loadCommands, Command } from './utils/commandLoader.js';
import { QueueEventHandler } from './handlers/queueEvents.js';

export class DiscordBot {
  public client: Client;
  public commands: Collection<string, Command>;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.commands = new Collection();
    this.setupEventHandlers();
  }

  async loadCommands(): Promise<void> {
    this.commands = await loadCommands();
    logger.info(`Commands loaded in bot: ${Array.from(this.commands.keys()).join(', ')}`);
  }

  initializeQueueEvents(): void {
    // Initialize queue event handler (stored in closure, not as instance variable)
    new QueueEventHandler(this.client);
    logger.info('Queue event handlers initialized');
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, (client) => {
      logger.info(`Bot ready! Logged in as ${client.user.tag}`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      logger.debug(`Received command: ${interaction.commandName}`);
      logger.debug(`Available commands: ${Array.from(this.commands.keys()).join(', ')}`);

      const command = this.commands.get(interaction.commandName);

      if (!command) {
        logger.warn(`No command matching ${interaction.commandName} was found.`);
        logger.warn(`Commands collection size: ${this.commands.size}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error('Error executing command:', error);

        const errorMessage = {
          content: 'There was an error while executing this command!',
          ephemeral: true,
        };

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      }
    });

    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error:', error);
    });
  }

  async start(): Promise<void> {
    try {
      await this.client.login(config.discord.token);
      logger.info('Discord bot started successfully');
    } catch (error) {
      logger.error('Failed to start Discord bot:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.client.destroy();
    logger.info('Discord bot stopped');
  }
}
