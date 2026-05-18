## Summary

Add two commands to help players link their Trackmania accounts so the parser can find them when processing replays:

- `/link-tm` - Self-service command for players to link their own TM account
- `/admin link-tm` - Admin command for staff to link accounts for others

Both support Steam, Epic, Xbox, and PS4 platforms.

## Why

The parser was failing to save match results because `findTrackmaniaPlayer()` couldn't resolve players - their platform accounts weren't linked in the `sprocket.member_platform_account` table. This caused the entire transaction to rollback, leaving scrims incomplete and no Elo saved.

## Changes

- `src/commands/link-tm.ts` - New self-service command
- `src/commands/admin.ts` - Added `link-tm` subcommand and handler

## Testing

After deploying:
1. Run `/link-tm steam <account-id>` to test self-service
2. Run `/admin link-tm @player steam <account-id>` to test admin command
3. Submit a replay and verify it saves to `match_player_stats`