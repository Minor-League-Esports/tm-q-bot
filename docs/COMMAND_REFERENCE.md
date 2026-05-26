# Command Reference

This page is the compact reference for the bot's slash commands, statuses, and operational defaults.

## Permissions

- Player commands work for regular Discord members.
- Admin commands require the Discord `Manage Server` permission because the command group is registered with guild management access.

## Player Commands

| Command | What it does | Notes |
| --- | --- | --- |
| `/queue join` | Join the queue for your league | The bot syncs your player from Sprocket and places you in the correct league automatically. |
| `/queue leave` | Leave your current queue | Works on whichever league queue you are in. |
| `/queue status` | Show queue counts for all leagues | Useful for checking whether a pop is close. |
| `/queue list` | Show the players currently queued | Displays usernames by league. |
| `/checkin` | Confirm that you are ready for your scrim | Only works while you are in a scrim waiting for check-in. |
| `/profile [user]` | Show player profile and stats | Leave `user` empty to view your own profile. |
| `/link-tm account-id:<id>` | Link your Trackmania account | Requires an existing Sprocket player record for your Discord account. |

## Admin Commands

| Command | What it does | Notes |
| --- | --- | --- |
| `/admin queue-reset league:<league>` | Clear one queue or all queues | League choices are Academy, Champion, Master, or All. |
| `/admin ban user:<user> duration:<minutes> reason:<text>` | Apply a manual queue ban | Duration is entered in minutes and can be up to 1 week. |
| `/admin unban user:<user>` | Remove active bans for a player | Clears current active queue bans only. |
| `/admin stats user:<user>` | Show moderation and queue stats | Includes ban status, dodge count, and ban history. |
| `/admin dodges user:<user>` | Show dodge history | Useful when you only need the recent dodge trail. |
| `/admin create-match league:<league> p1:<user> p2:<user> p3:<user> p4:<user>` | Create a scheduled match | All four players must already be registered. |
| `/admin calc-elo scrim_id:<scrim UID>` | Force Elo processing for a completed scrim | Only works once the scrim is completed and has a winner set. |

## Status Meanings

### Scrim Status

| Status | Meaning |
| --- | --- |
| `checking_in` | The scrim has been created and players must confirm attendance. |
| `active` | All required players are checked in or the match was scheduled directly. |
| `completed` | The result has been verified and the match is ready for Elo processing. |
| `cancelled` | The scrim was abandoned, usually because the check-in window expired. |

### Match Type

| Type | Meaning |
| --- | --- |
| `QUEUE` | Created from the live queue. |
| `SCHEDULED` | Created directly by an admin. |

## Default Operational Values

| Setting | Default | Effect |
| --- | --- | --- |
| `QUEUE_CHECK_IN_TIMEOUT` | `300` seconds | Time players have to check in after a queue pop. |
| `MAP_HISTORY_DAYS` | `14` days | How far back the map selector looks for play history. |
| `MIN_MAP_POOL_SIZE` | `10` | Minimum size of the least-played map pool before random selection. |
| `DODGE_BAN_1` | `300` seconds | First dodge penalty. |
| `DODGE_BAN_2` | `1800` seconds | Second dodge penalty. |
| `DODGE_BAN_3` | `7200` seconds | Third and later dodge penalty. |
| `LEAGUES` | `Academy,Champion,Master` | League names recognized by the bot. |

## What Players Receive During A Queue Pop

When the queue pops, each player gets a DM containing:

- The scrim ID
- The league
- The player list
- Three maps
- The check-in deadline
- A result-submission link generated from the Apps Script web app

## What Admins Should Remember

- `/admin create-match` skips the check-in phase.
- `/admin calc-elo` is for completed scrims that already have a winner recorded.
- If a player cannot queue, the usual causes are a missing Sprocket profile, a league mapping problem, or an active ban.
