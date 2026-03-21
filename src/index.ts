import { DiscordBot } from './bot.js';
import { db } from './db/index.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';
import { eloService } from './services/elo.service.js';
import { tableName } from './db/index.js';

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

  // Load commands
  await bot.loadCommands();
  logger.info('Commands loaded successfully');

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

  // Initialize queue event handlers (after bot is logged in)
  bot.initializeQueueEvents();

  logger.info(`Bot is running in ${config.app.nodeEnv} mode`);

  // Start Elo Polling
  startEloPolling();
}

function startEloPolling() {
  const POLL_INTERVAL = 60 * 1000; // 1 minute
  const scrimsTable = tableName('scrims');

  setInterval(async () => {
    try {
      const client = await db.getClient();
      try {
        // Find completed scrims that haven't been processed for Elo
        const result = await client.query<{ id: number }>(
          `SELECT id FROM ${scrimsTable}
           WHERE status = 'completed'
           AND elo_processed = FALSE
           AND winner_team IS NOT NULL`
        );

        for (const row of result.rows) {
          logger.info(`Found unprocessed completed scrim: ${row.id}. Processing Elo...`);
          await eloService.processMatch(row.id);
        }
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error in Elo polling loop:', error);
    }
  }, POLL_INTERVAL);
}

main().catch((error) => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
