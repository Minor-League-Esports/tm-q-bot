import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import { loadCommands } from '../utils/commandLoader.js';
import { logger } from '../utils/logger.js';

function getDiscordErrorDetails(error: unknown): {
  code?: number;
  status?: number;
  message?: string;
  method?: string;
  url?: string;
} {
  if (!error || typeof error !== 'object') return {};

  const maybeError = error as {
    code?: number;
    status?: number;
    message?: string;
    method?: string;
    url?: string;
    rawError?: { code?: number; message?: string };
  };

  return {
    code: maybeError.rawError?.code ?? maybeError.code,
    status: maybeError.status,
    message: maybeError.rawError?.message ?? maybeError.message,
    method: maybeError.method,
    url: maybeError.url,
  };
}

async function deployCommands() {
  try {
    logger.info('Starting command deployment...');
    logger.info(`Target application: ${config.discord.clientId}`);
    logger.info(`Target guild: ${config.discord.guildId}`);

    // Load all commands
    const commands = await loadCommands();
    const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());

    logger.info(`Loaded ${commandData.length} commands to deploy`);

    // Construct and prepare an instance of the REST module
    const rest = new REST().setToken(config.discord.token);

    // Deploy commands
    logger.info('Deploying commands to Discord...');

    const data = await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commandData },
    ) as any[];

    logger.info(`Successfully deployed ${data.length} commands to guild ${config.discord.guildId}`);

    // List deployed commands
    data.forEach(cmd => {
      logger.info(`  - /${cmd.name}`);
    });

    logger.info('Command deployment complete!');
    process.exit(0);
  } catch (error) {
    logger.error('Error deploying commands:', error);

    const details = getDiscordErrorDetails(error);
    if (details.code === 50001 || details.status === 403) {
      logger.error(
        'Discord returned Missing Access. Verify DISCORD_CLIENT_ID belongs to the invited bot application, ' +
        `that the bot is in guild ${config.discord.guildId}, and that it was invited with the applications.commands scope.`
      );
    }

    process.exit(1);
  }
}

deployCommands();
