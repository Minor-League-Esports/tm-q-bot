# Trackmania Scrim Queue Bot

Discord bot for running Trackmania league queues on the MLE server. It handles player registration through Sprocket, league-based queueing, scrim creation, check-ins, dodge penalties, and admin match operations.

## Start Here

- [Quick Start](docs/QUICKSTART.md) for setup and first run.
- [How the Bot Works](docs/USING_THE_BOT.md) for the player and admin journeys.
- [Command Reference](docs/COMMAND_REFERENCE.md) for the exact slash commands and status meanings.
- [Testing](docs/TESTING.md) for unit vs integration test workflows.
- [Discord Bot Invite Setup](docs/BOT_INVITE_SETUP.md) for OAuth and permission details.

## What The Bot Does

- Puts players into their correct league queue based on their Sprocket Trackmania profile.
- Pops a scrim when 4 players are available in the same league.
- DMs players the scrim details, map list, check-in deadline, and result-submission link.
- Applies dodge penalties when players miss check-in.
- Supports scheduled league matches for admins.
- Tracks bans, stats, and Elo processing for completed matches.

## Operational Model

The queue flow is intentionally simple:

`/queue join` -> match found -> 5-minute check-in window -> active match -> completed or cancelled.

If you are administering the bot, the most useful pages are:

- [How the Bot Works](docs/USING_THE_BOT.md)
- [Command Reference](docs/COMMAND_REFERENCE.md)

## Requirements

```
tm-scrim-bot/
├── src/
│   ├── commands/         # Discord slash commands
│   ├── services/         # Business logic
│   ├── db/              # Database utilities
│   ├── utils/           # Helper functions
│   ├── types.ts         # TypeScript types
│   ├── config.ts        # Configuration
│   ├── bot.ts           # Discord bot setup
│   └── index.ts         # Entry point
├── db/
│   ├── schema.sql       # Database schema
│   └── seed.sql         # Sample data
├── systemd/             # Systemd service files
└── tests/               # Test files
```

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests once (CI mode)
npm run test:ci
```

### Linting and Formatting

```bash
# Lint code
npm run lint

# Format code
npm run format
```

## Discord Commands

### Player Commands

- `/queue join` - Join the queue for your league
- `/queue leave` - Leave the current queue
- `/queue status` - Check queue status
- `/checkin` - Check in after queue pop (5 minutes)
- `/profile [user]` - View player profile

### Admin Commands

- `/admin queue reset <league>` - Reset a queue
- `/admin ban <user> <duration> <reason>` - Ban a player
- `/admin unban <user>` - Remove a ban
- `/admin stats <user>` - View player stats

## Configuration

All configuration is done via environment variables. See `.env.example` for all available options.

### Key Settings

- `QUEUE_CHECK_IN_TIMEOUT` - Check-in time in seconds (default: 300)
- `MAP_HISTORY_DAYS` - Days to look back for map history (default: 14)
- `DODGE_BAN_1/2/3` - Escalating dodge penalties in seconds
- `LEAGUES` - Comma-separated list of league names

## Apps Script Setup

The bot generates Google Apps Script web app links for match results.

The Apps Script source now lives in `parser/` in this repo.

Use the deployed Apps Script web app URL as:

```env
APPSCRIPT_BASE_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

## Files Worth Knowing

- `db/schema.sql` sets up the core tables.
- `db/migrations/001_elo_and_stats.sql` adds Elo and match-stat tables.
- `src/scripts/deploy-commands.ts` publishes the slash commands to Discord.

## License

MIT
