# Trackmania Scrim Queue Bot

A Discord bot for managing competitive Trackmania scrims on the MLE server. Handles matchmaking, map selection based on player history, and match result submission.

## Features

- **League-based queuing** - Separate queues for Academy, Champion, and Master leagues
- **Smart map selection** - Selects 3 maps based on least-played history across all players
- **Check-in system** - 5-minute check-in window with automatic dodge penalties
- **Ban management** - Escalating penalties for queue dodging
- **Google Forms integration** - Pre-filled form links for match result submission

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Discord Bot Token

## Quick Start

### 1. Clone and Install

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required configuration:
- `DISCORD_BOT_TOKEN` - Your Discord bot token
- `DISCORD_GUILD_ID` - Your Discord server ID
- `DISCORD_CLIENT_ID` - Your Discord application client ID
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_FORM_BASE_URL` - Your Google Form URL

### 3. Set Up Database

```bash
# Using Docker Compose (recommended for development)
docker-compose up -d db

# Or manually with PostgreSQL
psql -U postgres -f db/schema.sql
psql -U postgres -f db/seed.sql
```

### 4. Run the Bot

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

## Docker Deployment

### Using Docker Compose

```bash
# Start all services (bot + database)
docker-compose up -d

# View logs
docker-compose logs -f bot

# Stop services
docker-compose down
```

### Building Docker Image

```bash
docker build -t tm-scrim-bot .
docker run -d --env-file .env tm-scrim-bot
```

## Systemd Deployment

1. Build the application:
```bash
npm run build
```

2. Copy files to deployment location:
```bash
sudo mkdir -p /opt/tm-scrim-bot
sudo cp -r dist db node_modules package.json .env /opt/tm-scrim-bot/
```

3. Create user and set permissions:
```bash
sudo useradd -r -s /bin/false tmscrim
sudo chown -R tmscrim:tmscrim /opt/tm-scrim-bot
```

4. Install and start service:
```bash
sudo cp systemd/tm-scrim-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tm-scrim-bot
sudo systemctl start tm-scrim-bot
```

5. Check status:
```bash
sudo systemctl status tm-scrim-bot
sudo journalctl -u tm-scrim-bot -f
```

## Development

### Project Structure

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

## Google Forms Setup

The bot generates pre-filled Google Form links for match results:

1. Create a Google Form with fields for:
   - Scrim ID
   - Player names
   - Maps played
   - Timestamp
   - Replay file upload

2. Find the entry IDs by inspecting the form HTML

3. Add the entry IDs to your `.env` file:
   - `GOOGLE_FORM_SCRIM_ID_ENTRY`
   - `GOOGLE_FORM_PLAYERS_ENTRY`
   - `GOOGLE_FORM_TIMESTAMP_ENTRY`
   - `GOOGLE_FORM_MAPS_ENTRY`

## License

MIT
