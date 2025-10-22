# Database Schema Flexibility

The bot is designed to be flexible with different database schemas. Here's how to adapt it to your existing database.

## Current Schema Assumptions

The bot currently expects these tables and columns:

### Players Table

```sql
players (
  id INTEGER PRIMARY KEY,
  discord_id VARCHAR,
  discord_username VARCHAR,
  league VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

### Required Tables

- `players` - User accounts
- `queue_bans` - Ban tracking
- `scrims` - Match records
- `scrim_players` - Match participants
- `scrim_maps` - Maps per match
- `maps` - Map pool
- `map_play_history` - Play tracking

## Adapting to Your Schema

### Option 1: Database Views (Recommended)

Create views that map your existing schema to the expected structure:

```sql
-- If your players table has different column names
CREATE VIEW players AS
SELECT
  user_id as id,
  discord_user_id as discord_id,
  username as discord_username,
  rank as league,
  created_date as created_at,
  modified_date as updated_at
FROM your_existing_users_table;
```

**Advantages:**
- No code changes needed
- Your existing schema stays intact
- Easy to update mapping

### Option 2: Service Layer Abstraction

Create custom service implementations that query your schema:

```typescript
// src/services/adapters/yourDbPlayerService.ts
export class YourDbPlayerService {
  async getByDiscordId(discordId: string): Promise<Player> {
    // Query your existing schema
    const result = await db.query(
      'SELECT user_id, discord_user_id, username, rank FROM your_users WHERE discord_user_id = $1',
      [discordId]
    );

    // Map to expected Player interface
    return {
      id: result.rows[0].user_id,
      discord_id: result.rows[0].discord_user_id,
      discord_username: result.rows[0].username,
      league: result.rows[0].rank,
      created_at: new Date(),
      updated_at: new Date()
    };
  }
}
```

Then replace the service imports:

```typescript
// import { playerService } from '../services/player.service.js';
import { playerService } from '../services/adapters/yourDbPlayerService.js';
```

**Advantages:**
- Full control over queries
- Can handle complex mappings
- Keeps existing schema

**Disadvantages:**
- Requires code changes
- Need to implement all methods

### Option 3: TypeORM/Prisma (Advanced)

Use an ORM to abstract the database layer completely:

```typescript
// entities/Player.ts
@Entity('your_users_table')
export class Player {
  @PrimaryGeneratedColumn()
  @Column('user_id')
  id: number;

  @Column('discord_user_id')
  discord_id: string;

  @Column('username')
  discord_username: string;

  @Column('rank')
  league: string;
}
```

**Advantages:**
- Database agnostic
- Type-safe queries
- Automatic migrations

**Disadvantages:**
- Significant refactoring
- Additional dependencies

## Minimal Required Fields

For the bot to work, you **must** provide:

### Players
- `id` (any unique identifier)
- `discord_id` (Discord user ID as string)
- `league` (one of: Academy, Champion, Master)

### Optional Fields
- `discord_username` (used for display, can fallback to Discord API)
- Timestamps (can be auto-generated)

## Column Name Mapping

Common mappings you might need:

| Bot expects | Your column | SQL View |
|-------------|-------------|----------|
| `discord_id` | `discord_user_id` | `discord_user_id as discord_id` |
| `discord_username` | `username` | `username as discord_username` |
| `league` | `rank` | `rank as league` |
| `created_at` | `created_date` | `created_date as created_at` |
| `updated_at` | `modified_date` | `modified_date as updated_at` |

## League Mapping

If your leagues use different names:

```sql
CREATE VIEW players AS
SELECT
  id,
  discord_id,
  username as discord_username,
  CASE
    WHEN rank = 'Bronze' THEN 'Academy'
    WHEN rank = 'Silver' THEN 'Champion'
    WHEN rank = 'Gold' THEN 'Master'
    ELSE rank
  END as league,
  created_at,
  updated_at
FROM your_users;
```

Or update the config:

```env
LEAGUES=Bronze,Silver,Gold
```

And update the TypeScript types in `src/types.ts`:

```typescript
export type League = 'Bronze' | 'Silver' | 'Gold';
```

## Testing Your Adapter

After creating views/adapters, test with:

```sql
-- Verify player query works
SELECT * FROM players WHERE discord_id = 'YOUR_DISCORD_ID';

-- Verify league values are correct
SELECT DISTINCT league FROM players;

-- Verify all required columns exist
SELECT id, discord_id, discord_username, league FROM players LIMIT 1;
```

## Need Help?

If you need assistance adapting the bot to your schema:

1. Export your current schema:
   ```bash
   pg_dump -s -t your_users_table your_database > schema.sql
   ```

2. Share the relevant table structures

3. We can create the appropriate views or adapters

## Example: Adapting to Existing Schema

Let's say your existing database has:

```sql
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  discord_user_id BIGINT UNIQUE,
  display_name VARCHAR(255),
  player_tier VARCHAR(50),
  registration_date TIMESTAMP
);
```

You would create:

```sql
CREATE VIEW players AS
SELECT
  user_id as id,
  discord_user_id::TEXT as discord_id,
  display_name as discord_username,
  player_tier as league,
  registration_date as created_at,
  registration_date as updated_at
FROM users;
```

Then the bot will work without any code changes!

## Pro Tips

1. **Start with views** - Easiest approach, no code changes
2. **Keep your schema** - Don't modify your existing database
3. **Test incrementally** - Verify each table/view works before moving on
4. **Use transactions** - When creating views, wrap in BEGIN/COMMIT
5. **Document mappings** - Keep a record of what maps to what

## Migration Strategy

If you want to eventually use the bot's native schema:

1. **Phase 1**: Use views (now)
2. **Phase 2**: Run both schemas side-by-side
3. **Phase 3**: Migrate data gradually
4. **Phase 4**: Switch to native schema

This allows zero downtime during migration.
