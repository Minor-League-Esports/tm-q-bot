import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

interface Config {
  discord: {
    token: string;
    guildId: string;
    clientId: string;
  };
  database: {
    url: string;
  };
  queue: {
    checkInTimeout: number;
    mapHistoryDays: number;
    minMapPoolSize: number;
  };
  bans: {
    dodgeBan1: number;
    dodgeBan2: number;
    dodgeBan3: number;
    dodgeWindow: number;
  };
  appScript: {
    baseUrl: string;
  };
  app: {
    nodeEnv: string;
    port: number;
    logLevel: string;
  };
  replay: {
    submissionUrl: string;
  };
  leagues: string[];
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

export const config: Config = {
  discord: {
    token: getEnvVar('DISCORD_BOT_TOKEN'),
    guildId: getEnvVar('DISCORD_GUILD_ID'),
    clientId: getEnvVar('DISCORD_CLIENT_ID'),
  },
  database: {
    url: getEnvVar('DATABASE_URL'),
  },
  queue: {
    checkInTimeout: getEnvNumber('QUEUE_CHECK_IN_TIMEOUT', 300),
    mapHistoryDays: getEnvNumber('MAP_HISTORY_DAYS', 14),
    minMapPoolSize: getEnvNumber('MIN_MAP_POOL_SIZE', 10),
  },
  bans: {
    dodgeBan1: getEnvNumber('DODGE_BAN_1', 300),
    dodgeBan2: getEnvNumber('DODGE_BAN_2', 1800),
    dodgeBan3: getEnvNumber('DODGE_BAN_3', 7200),
    dodgeWindow: getEnvNumber('DODGE_WINDOW', 86400),
  },
  appScript: {
    baseUrl: getEnvVar('APPSCRIPT_BASE_URL'),
  },
  app: {
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
    port: getEnvNumber('PORT', 3000),
    logLevel: getEnvVar('LOG_LEVEL', 'info'),
  },
  replay: {
    submissionUrl: getEnvVar('REPLAY_SUBMISSION_URL'),
  },
  leagues: getEnvVar('LEAGUES', 'Academy,Champion,Master').split(','),
};
