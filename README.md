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

- Node.js 20+
- PostgreSQL 16+
- Discord bot token, client ID, and guild ID
- A deployed Google Apps Script web app for result submission
- A Trackmania profile in Sprocket for queue participation

## Files Worth Knowing

- `db/schema.sql` sets up the core tables.
- `db/migrations/001_elo_and_stats.sql` adds Elo and match-stat tables.
- `parser/` contains the bundled Google Apps Script replay parser and verifier.
- `src/scripts/deploy-commands.ts` publishes the slash commands to Discord.

## License

MIT
