# Quick Start Guide

Get your Discord bot running in minutes!

## Prerequisites

1. **Node.js 20+** installed
2. **Discord Bot Token** - Follow steps below to create one

## Step 1: Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" and give it a name (e.g., "TM Scrim Bot")
3. Go to the "Bot" tab
4. Click "Add Bot"
5. Under "Token", click "Reset Token" and copy it (save this for later)
6. Enable these Privileged Gateway Intents:
   - ✅ Server Members Intent
   - ✅ Message Content Intent

## Step 2: Invite Bot to Your Server

1. Go to the "OAuth2" → "URL Generator" tab
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select bot permissions:
   - ✅ Send Messages
   - ✅ Use Slash Commands
   - ✅ Embed Links
4. Copy the generated URL at the bottom
5. Open it in your browser and add the bot to your test server

## Step 3: Get Your Guild ID and Client ID

1. In Discord, enable Developer Mode:
   - Settings → Advanced → Developer Mode (toggle on)
2. Right-click your server name → "Copy Server ID" (this is your GUILD_ID)
3. Back in Discord Developer Portal, go to "General Information"
4. Copy your "Application ID" (this is your CLIENT_ID)

## Step 4: Configure the Bot

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your credentials:
```env
DISCORD_BOT_TOKEN=your_token_here
DISCORD_GUILD_ID=your_guild_id_here
DISCORD_CLIENT_ID=your_client_id_here

# For now, use a dummy database URL (database features won't work without real DB)
DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy

# Leave other settings as default
```

## Step 5: Install Dependencies

```bash
npm install
```

## Step 6: Deploy Commands to Discord

This registers your slash commands with Discord:

```bash
npm run deploy-commands
```

You should see output like:
```
Successfully deployed 4 commands to guild YOUR_GUILD_ID
  - /queue
  - /checkin
  - /profile
  - /admin
```

## Step 7: Run the Bot

### Without Database (Limited Functionality)

The bot will start but commands that require the database will return errors. Queue commands will work in-memory only.

```bash
npm run dev
```

You should see:
```
Bot ready! Logged in as YourBot#1234
```

### With Database (Full Functionality)

1. Set up PostgreSQL (Docker recommended):
```bash
docker-compose up -d db
```

2. Run the schema:
```bash
docker exec -i tm-scrim-db psql -U tmscrim -d tmscrim < db/schema.sql
docker exec -i tm-scrim-db psql -U tmscrim -d tmscrim < db/seed.sql
```

3. Update `.env` with the correct database URL:
```env
DATABASE_URL=postgresql://tmscrim:changeme@localhost:5432/tmscrim
```

4. Start the bot:
```bash
npm run dev
```

## Step 8: Test the Commands

In your Discord server, try these commands:

### Queue Commands
- `/queue status` - Check queue status (should work without DB)
- `/queue join` - Join queue (requires DB for player registration)
- `/queue list` - List players in queue
- `/queue leave` - Leave queue

### Check-in Command
- `/checkin` - Check in for a scrim (requires DB)

### Profile Command
- `/profile` - View your profile (requires DB)
- `/profile @user` - View another user's profile (requires DB)

### Admin Commands (requires Manage Server permission)
- `/admin queue-reset league:Academy` - Reset a queue
- `/admin ban user:@someone duration:5 reason:Testing` - Ban a user
- `/admin unban user:@someone` - Unban a user
- `/admin stats user:@someone` - View stats
- `/admin dodges user:@someone` - View dodge history

## Expected Behavior Without Database

✅ **Will work:**
- `/queue status` - Shows empty queues
- `/queue list` - Shows no players
- `/admin queue-reset` - Clears in-memory queues

❌ **Will error (gracefully):**
- `/queue join` - "You must be registered..."
- `/checkin` - "You must be registered..."
- `/profile` - "Not registered in the system"
- `/admin ban/unban/stats/dodges` - Database errors

## Troubleshooting

### Bot doesn't respond to commands
- Make sure you ran `npm run deploy-commands`
- Wait a few minutes for Discord to sync commands
- Try kicking and re-inviting the bot

### Commands don't appear
- Check that bot has proper permissions
- Verify GUILD_ID and CLIENT_ID are correct
- Try deploying commands again

### Database connection errors
- Check PostgreSQL is running: `docker ps`
- Verify DATABASE_URL is correct
- Check database logs: `docker logs tm-scrim-db`

## Next Steps

1. Set up the database for full functionality
2. Register test players in the database
3. Test the full queue → pop → checkin flow
4. Configure Google Forms integration for match results

## Development Commands

```bash
# Watch mode (auto-reload on changes)
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Run tests
npm test

# Deploy commands to Discord
npm run deploy-commands
```
