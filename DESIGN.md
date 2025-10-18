# Trackmania Scrim Queue Bot - Design Document

## Overview
A Discord bot for managing competitive Trackmania scrims on the MLE server. Handles matchmaking, map selection based on player history, and match result submission.

## System Architecture

### Deployment
- **Platform**: DigitalOcean
- **Containerization**: Docker container
- **Process Management**: systemd unit
- **Language**: TypeScript
- **Runtime**: Node.js

### Components
1. **Discord Bot** (discord.js)
2. **Database** (PostgreSQL recommended)
3. **Queue Management System**
4. **Map Selection Algorithm**
5. **Match Result Handler**

## Functional Requirements

### 1. Queue System

#### Queue Management
- **League-based queues**: Separate queue for each league tier
- **Match format**: 1v1v1v1 (4-player FFA)
- **Queue method**: Discord slash commands (no reaction-based UI)

#### Player Queue Flow
```
/queue join → Join queue for your league (Academy, Champion, or Master)
/queue leave → Leave current queue
/queue status → Check current queue state
/queue list → See all active queues
```

#### Leagues
- **Academy** - Entry level
- **Champion** - Mid level
- **Master** - Top level

#### Match Population
- When 4 players in same league queue → Pop queue
- Generate unique scrim ID/link
- Notify all 4 players
- Start check-in process

### 2. Check-in System

#### Check-in Flow
- Players have **5 minutes** to check in after queue pop
- Check-in command: `/checkin`
- If any player fails to check in:
  - Apply queue dodge penalty
  - Return other players to queue with priority
  - Log dodge to database

#### Dodge Penalties
- **1st dodge**: 5-minute ban
- **2nd dodge (24h window)**: 30-minute ban
- **3rd dodge (24h window)**: 2-hour ban
- **Persistent tracking** in database

### 3. Map Selection

#### Algorithm
For each scrim:
1. Query last **N days** of map play history for all 4 players
2. Calculate play count per map across all 4 players
3. Select **3 random maps** from the least-played maps
4. Ensure variety (no repeats within same scrim)

#### Configuration
- `MAP_HISTORY_DAYS`: Configurable lookback period (default: 14 days)
- Minimum map pool size to prevent staleness

#### Map Selection Flow
```
1. Get all maps in current map pool
2. For each map, sum play counts of 4 players in last N days
3. Sort by total play count (ascending)
4. Take bottom 20% of maps
5. Randomly select 3 unique maps
```

### 4. Match Result Submission

#### Google Form Integration
- Pre-existing Google Form with replay file upload
- Bot generates pre-filled form link with URL parameters:
  - Scrim ID (pre-filled via URL parameter)
  - Player names (pre-filled via URL parameter)
  - Date/time (pre-filled via URL parameter)
- No Google Forms API needed - uses standard URL prefill syntax
- Form link sent to players when scrim starts

#### Data Processing
- Manual or automated processing by other developer
- Form responses collected in Google Sheets
- Bot tracks scrim creation and player participation
- Future: Parse replay files and update stats automatically

### 5. Admin Commands

```
/admin queue reset [league] → Reset specific queue
/admin ban <user> <duration> <reason> → Manual ban
/admin unban <user> → Remove ban
/admin stats <user> → View player queue stats
/admin dodges <user> → View dodge history
```

## Database Schema

### Tables

#### players
```sql
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  discord_id VARCHAR(20) UNIQUE NOT NULL,
  discord_username VARCHAR(255) NOT NULL,
  league VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### queue_bans
```sql
CREATE TABLE queue_bans (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  ban_start TIMESTAMP NOT NULL,
  ban_end TIMESTAMP NOT NULL,
  reason VARCHAR(255) NOT NULL,
  dodge_count INTEGER DEFAULT 1,
  is_manual BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### map_play_history
```sql
CREATE TABLE map_play_history (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id),
  map_id INTEGER REFERENCES maps(id),
  played_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### maps
```sql
CREATE TABLE maps (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  uid VARCHAR(27) UNIQUE NOT NULL,
  author VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### scrims
```sql
CREATE TABLE scrims (
  id SERIAL PRIMARY KEY,
  scrim_uid VARCHAR(36) UNIQUE NOT NULL,
  league VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'checking_in', 'active', 'completed', 'cancelled'
  created_at TIMESTAMP NOT NULL,
  checkin_deadline TIMESTAMP,
  completed_at TIMESTAMP
);
```

#### scrim_players
```sql
CREATE TABLE scrim_players (
  id SERIAL PRIMARY KEY,
  scrim_id INTEGER REFERENCES scrims(id),
  player_id INTEGER REFERENCES players(id),
  checked_in BOOLEAN DEFAULT FALSE,
  checkin_at TIMESTAMP,
  UNIQUE(scrim_id, player_id)
);
```

#### scrim_maps
```sql
CREATE TABLE scrim_maps (
  id SERIAL PRIMARY KEY,
  scrim_id INTEGER REFERENCES scrims(id),
  map_id INTEGER REFERENCES maps(id),
  map_order INTEGER NOT NULL
);
```

#### scrim_results
```sql
CREATE TABLE scrim_results (
  id SERIAL PRIMARY KEY,
  scrim_id INTEGER REFERENCES scrims(id),
  player_id INTEGER REFERENCES players(id),
  final_position INTEGER NOT NULL,
  total_time INTEGER, -- milliseconds
  replay_file_url VARCHAR(512),
  submitted_at TIMESTAMP DEFAULT NOW()
);
```

## Discord Commands Specification

### Player Commands

#### /queue
- **Subcommands**:
  - `join` - Join queue for your league
  - `leave` - Leave current queue
  - `status` - View current queue status
  - `list` - List all active queues

#### /checkin
- No parameters
- Used after queue pop to confirm readiness
- Must be used within 5 minutes

#### /profile
- **Optional**: `<user>` - View another player's profile
- Shows: league, recent scrims, dodge count, ban status

### Admin Commands

#### /admin
- **Subcommands**:
  - `queue reset <league>` - Reset specific queue
  - `ban <user> <duration> <reason>` - Manual ban
  - `unban <user>` - Remove ban
  - `stats <user>` - View detailed stats
  - `dodges <user>` - View dodge history
  - `config set <key> <value>` - Update config
  - `config get <key>` - View config value

## Configuration

### Environment Variables
```env
# Discord
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=

# Database
DATABASE_URL=postgresql://user:pass@host:5432/tmscrim

# Queue Settings
QUEUE_CHECK_IN_TIMEOUT=300    # 5 minutes
MAP_HISTORY_DAYS=14
MIN_MAP_POOL_SIZE=10

# Ban Settings
DODGE_BAN_1=300       # 5 minutes
DODGE_BAN_2=1800      # 30 minutes
DODGE_BAN_3=7200      # 2 hours
DODGE_WINDOW=86400    # 24 hours

# Google Forms
GOOGLE_FORM_BASE_URL=https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform

# Deployment
PORT=3000
NODE_ENV=production
```

## Technical Implementation Notes

### Queue State Management
- In-memory queue state with database persistence
- Handle bot restarts gracefully
- Restore active queues from database on startup

### Map Selection Performance
- Cache map play counts with TTL
- Batch database queries
- Pre-compute least-played maps periodically

### Form Generation
- Use Google Forms URL prefill parameters (no API needed)
- Format: `BASE_URL?entry.123456=value&entry.789012=value2`
- Pre-fill scrim ID, player names, and timestamp
- Generate unique form link per scrim
- Example: `https://docs.google.com/forms/.../viewform?entry.123=SCRIM-ABC-123&entry.456=Player1,Player2,Player3,Player4`

### Match Data Processing (Future Enhancement)
- Initially: Manual processing via Google Sheets
- Future: Parse replay files from form submissions
- Future: Automated stats updates

## Error Handling

### Queue Scenarios
- Player already in queue → Inform user
- Player not in queue (leave attempt) → Inform user
- Queue pop with offline player → Auto-dodge penalty
- Database unavailable → Queue to in-memory, sync when available

### Match Scenarios
- Partial check-ins → Cancel match, penalize no-shows
- No replay submission after 24h → Manual review flag
- Invalid replay data → Request resubmission

## Future Enhancements (Out of Scope v1)
- ELO/ranking system
- Automated tournaments
- Team-based scrims (2v2)
- Map veto system
- Live match tracking
- Statistics dashboard
- Discord embed for match results
- Automated reminders for replay submission

## Implementation Strategy

**Keep it simple** - Build as a single, focused application with:
- Core queue functionality
- Check-in system with dodge penalties
- Map selection algorithm
- Form link generation
- Admin commands
- Basic tests for critical paths

**Testing approach**:
- Unit tests for map selection algorithm
- Unit tests for ban/penalty logic
- Integration tests for queue flow
- Mock Discord interactions for testing

## Success Metrics
- Queue pop time < 2 minutes average
- <5% dodge rate
- Form submission rate > 90%
- Bot uptime > 99.5%
- Response time < 1 second for commands
