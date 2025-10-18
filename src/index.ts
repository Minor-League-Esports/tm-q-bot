import { DiscordBot } from './bot.js';
import { db } from './db/index.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';

async function main() {
  logger.info('Starting Trackmania Scrim Bot...');

  // Check database connection
  const dbHealthy = await db.healthCheck();
  if (!dbHealthy) {
    logger.error('Database health check failed. Exiting...');
    process.exit(1);
  }
  logger.info('Database connection established');

  // Initialize bot
  const bot = new DiscordBot();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    await bot.stop();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start bot
  await bot.start();

  logger.info(`Bot is running in ${config.app.nodeEnv} mode`);
}

main().catch((error) => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
