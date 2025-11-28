# Sprocket Integration Plan

## Objective
Integrate `tm-q-bot` with the existing `sprocket` database schema to ensure that players registering in the bot already exist in the Sprocket system with a valid "Trackmania" player profile.

## Schema Analysis
Based on the review of the `sprocket` repository (TypeORM models), the relevant entities and relationships are:

1.  **UserAuthenticationAccount** (`sprocket.user_authentication_account`)
    *   Links a Discord ID to a Sprocket User.
    *   Key fields: `accountId` (Discord ID), `accountType` ('DISCORD'), `userId`.
2.  **User** (`sprocket.user`)
    *   The core identity.
    *   Key fields: `id`.
3.  **Member** (`sprocket.member`)
    *   Links a User to an Organization.
    *   Key fields: `userId`, `id`.
4.  **Player** (`sprocket.player`)
    *   Represents a player profile for a specific game.
    *   Key fields: `memberId`, `skillGroupId`.
5.  **GameSkillGroup** (`sprocket.game_skill_group`)
    *   Links a player to a game's skill group system.
    *   Key fields: `id`, `gameId`.
6.  **Game** (`sprocket.game`)
    *   Defines the game title.
    *   Key fields: `id`, `title`.

## Integration Logic

To validate a user, we need to perform a cross-schema SQL query from the `tm-q-bot` application.

### Proposed SQL Query
```sql
SELECT p.id
FROM sprocket.user_authentication_account uaa
JOIN sprocket.user u ON u.id = uaa."userId"
JOIN sprocket.member m ON m."userId" = u.id
JOIN sprocket.player p ON p."memberId" = m.id
JOIN sprocket.game_skill_group gsg ON gsg.id = p."skillGroupId"
JOIN sprocket.game g ON g.id = gsg."gameId"
WHERE uaa."accountType" = 'DISCORD'
  AND uaa."accountId" = $1  -- The Discord ID
  AND g.title = 'Trackmania';
```

*Note: Column names (e.g., "userId", "memberId") are inferred from TypeORM conventions and need to be verified against the actual database.*

## Implementation Steps

1.  **Verify Database Access**:
    *   Ensure the database user used by `tm-q-bot` has `SELECT` permissions on the `sprocket` schema tables.
    *   We will create a script `src/scripts/verify_sprocket_access.ts` to test this connection and the query.

2.  **Update Player Service**:
    *   Modify `src/services/player.service.ts`.
    *   Add a method `validateSprocketIdentity(discordId: string): Promise<boolean>`.
    *   This method will execute the SQL query above.

3.  **Enforce Validation in Registration**:
    *   Modify `src/commands/profile.ts` (or wherever the registration logic resides).
    *   Before creating a new player in the `public.players` table, call `validateSprocketIdentity`.
    *   If validation fails, return a user-friendly error message instructing them to register on the Sprocket website/system first.

4.  **Error Handling**:
    *   Provide clear feedback if the user exists in Sprocket but not for Trackmania (e.g., "You have a Sprocket account, but no Trackmania profile found.").

## Todo List
- [ ] Switch to Code mode.
- [ ] Create `src/scripts/verify_sprocket_access.ts` to confirm schema access and column names.
- [ ] Implement `validateSprocketIdentity` in `src/services/player.service.ts`.
- [ ] Integrate the check into the player registration command.
- [ ] Test with a valid and invalid Discord ID.