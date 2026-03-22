import { config } from 'dotenv';

// Load environment variables
config();

const envDefaults: Record<string, string> = {
    DISCORD_BOT_TOKEN: 'test-bot-token',
    DISCORD_GUILD_ID: 'test-guild-id',
    DISCORD_CLIENT_ID: 'test-client-id',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/tm_q_bot_test',
    APPSCRIPT_BASE_URL: 'https://example.com/exec',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    LEAGUES: 'Academy,Champion,Master',
};

for (const [key, value] of Object.entries(envDefaults)) {
    if (!process.env[key]) {
        process.env[key] = value;
    }
}

if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (!process.env.DATABASE_SCHEMA) {
    process.env.DATABASE_SCHEMA = 'public';
}
