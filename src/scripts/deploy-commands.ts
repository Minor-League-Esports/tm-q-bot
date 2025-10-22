import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import { loadCommands } from '../utils/commandLoader.js';
import { logger } from '../utils/logger.js';

async function deployCommands() {
  try {
    logger.info('Starting command deployment...');

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
    process.exit(1);
  }
}

deployCommands();
