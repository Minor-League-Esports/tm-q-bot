# Quick Start

This guide gets the bot running in a test server. If you want to understand how players and admins use it once it is live, read [How the Bot Works](USING_THE_BOT.md).

## 1. Prerequisites

- Node.js 20+
- PostgreSQL 16+
- A Discord application with a bot user
- A deployed Google Apps Script web app for match-result links
- A Trackmania profile in Sprocket for each player who will queue

## 2. Create Or Reuse A Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application or open the existing TM Scrim Bot app.
3. Add a bot user and copy the bot token, application ID, and server ID.
4. Enable the privileged intents your server policy requires.

If you need a reminder for the invite URL and permissions, see [Discord Bot Invite Setup](BOT_INVITE_SETUP.md).

## 3. Configure Environment Variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

Required values:

```env
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_CLIENT_ID=...
DATABASE_URL=postgresql://...
DATABASE_SCHEMA=trackmania
APPSCRIPT_BASE_URL=https://script.google.com/macros/s/.../exec
```

The Google Apps Script source for the replay submission flow now lives in `parser/` in this repo. Deploy that folder as your Apps Script project, then set `APPSCRIPT_BASE_URL` to the deployed web app URL.

## Step 5: Install Dependencies

```env
QUEUE_CHECK_IN_TIMEOUT=300
MAP_HISTORY_DAYS=14
MIN_MAP_POOL_SIZE=10
DODGE_BAN_1=300
DODGE_BAN_2=1800
DODGE_BAN_3=7200
LEAGUES=Academy,Champion,Master
```

## 4. Set Up The Database

Create the schema, then add the Elo/stat migration if you want match completion and rating processing:

```bash
psql -U postgres -f db/schema.sql
psql -U postgres -f db/migrations/001_elo_and_stats.sql
```

If you are using Docker for local development, make sure the database container is running before you seed or start the bot.

For a local test environment, you can also load the sample seed data:

```bash
psql -U postgres -f db/seed.sql
```

That seed gives you a starter map pool and example player records. Do not use it in production.

## 5. Install Dependencies And Deploy Commands

```bash
npm install
npm run deploy-commands
```

Discord will receive five commands or command groups:

- `/queue`
- `/checkin`
- `/profile`
- `/admin`
- `/link-tm`

## 6. Start The Bot

```bash
npm run dev
```

You should see the bot log in, connect to the database, and start the queue event handlers.

### Running On A Server With Docker

Slash-command deployment is a one-shot action, not part of starting the bot container. Use the same built image for the deployment action and the running bot:

```bash
docker compose build bot
docker compose run --rm deploy-commands
docker compose up -d bot db
```

After changing slash commands, rebuild the image and run `deploy-commands` again before replacing the running bot container. This ensures a registered command such as `/link-tm` also exists in the runtime handlers.

## 7. First Smoke Test

Use these checks in Discord:

- `/queue status` to confirm the queues are visible.
- `/profile` to confirm the bot can find your player record.
- `/queue join` to verify your Sprocket profile and league mapping work.

If `/queue join` fails, the usual causes are:

- the Discord ID is not linked to a Trackmania profile in Sprocket
- the player does not have a supported league mapping
- the player is currently banned from queueing

Once the bot responds correctly, move on to [How the Bot Works](USING_THE_BOT.md) for the full operator flow.
