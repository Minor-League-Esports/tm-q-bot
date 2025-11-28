# Discord Bot Invite Setup

## Step 1: Generate the Invite URL

1. Go to https://discord.com/developers/applications
2. Select your application (TM Scrim Bot)
3. Go to **OAuth2** → **URL Generator**

## Step 2: Select Scopes

Check these scopes:
- ✅ `bot`
- ✅ `applications.commands`

## Step 3: Select Bot Permissions

Check these permissions:

### General Permissions
- ✅ **View Channels** (required to see where to send messages)

### Text Permissions
- ✅ **Send Messages** (required to respond to commands)
- ✅ **Send Messages in Threads** (optional, but recommended)
- ✅ **Embed Links** (required for profile/stats embeds)
- ✅ **Read Message History** (optional, but recommended)
- ✅ **Use External Emojis** (optional)
- ✅ **Add Reactions** (optional)

### Use Application Commands
- ✅ **Use Slash Commands** (REQUIRED - this is critical!)

## Step 4: Copy and Use the URL

At the bottom of the URL Generator page, you'll see a generated URL like:
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025508416&scope=bot%20applications.commands
```

Copy this URL and open it in your browser.

## Step 5: Add to Your Server

1. Select your test server from the dropdown
2. Click "Authorize"
3. Complete the CAPTCHA if prompted

## Step 6: Verify Bot Permissions

After the bot joins:
1. Right-click the bot in the member list
2. Click "Roles" or "Edit"
3. Make sure it has at least:
   - Send Messages
   - Embed Links
   - Use Application Commands

## Step 7: Deploy Commands (IMPORTANT!)

After inviting the bot, you MUST deploy the slash commands:

```bash
npm run deploy-commands
```

You should see:
```
[INFO] Successfully deployed 4 commands to guild YOUR_GUILD_ID
  - /queue
  - /checkin
  - /profile
  - /admin
```

**Wait 5-10 minutes** for Discord to sync the commands globally.

## Step 8: Test Commands

In any channel the bot can see, type `/` and you should see:

- `/queue` - Queue management
- `/checkin` - Check in for scrims
- `/profile` - View player profiles
- `/admin` - Admin commands (requires Manage Server permission)

## Troubleshooting

### Commands don't appear when I type `/`

1. **Did you deploy commands?** Run `npm run deploy-commands`
2. **Wait 5-10 minutes** - Discord can take time to sync
3. **Check bot permissions** - Ensure "Use Application Commands" is enabled
4. **Kick and re-invite** the bot with the correct URL
5. **Check your GUILD_ID** in `.env` matches your server ID

### Commands appear but bot doesn't respond

1. **Check bot is online** - Green dot next to bot name
2. **Check console logs** - Look for errors in `npm run dev` output
3. **Check channel permissions** - Bot needs "Send Messages" in the channel
4. **Try in DM** - Commands should work in DMs if permissions issue

### Bot responds with "Unknown interaction"

This usually means:
- The bot restarted while you had Discord open
- Try refreshing Discord (Ctrl/Cmd + R)
- Or fully restart Discord

### Admin commands don't work

- Admin commands require **Manage Server** permission
- You need this permission on your Discord account, not the bot
- The bot just needs normal message permissions

## Quick Invite URL (Pre-configured)

Use this URL template, replacing `YOUR_CLIENT_ID` with your actual client ID from `.env`:

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025508416&scope=bot%20applications.commands
```

The permissions number `277025508416` includes:
- View Channels
- Send Messages
- Embed Links
- Read Message History
- Use Application Commands

## Minimal Permissions (If you want less)

For just the essentials:
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147485696&scope=bot%20applications.commands
```

This includes only:
- Send Messages
- Embed Links
- Use Application Commands
