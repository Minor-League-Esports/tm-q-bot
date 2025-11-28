# Implementation Plan: Elo System & Parser Integration

This plan outlines the steps to integrate the Google Apps Script (GAS) parser with the Discord bot's database and implement an Elo rating system.

## 1. Database Schema Updates

We need to extend the existing PostgreSQL schema to support Elo ratings, history, and detailed match statistics from the parser.

### New Tables
- **`elo_ratings`**: Stores current rating, wins, and losses for each player per league.
- **`elo_history`**: Tracks rating changes over time for each match.
- **`match_player_stats`**: Stores detailed performance data from the parser (checkpoints, respawns, etc.).

### Changes to Existing Tables
- **`scrims`**: Add `winner_team` column.

### Migration Strategy
- Create a SQL migration file `db/migrations/001_elo_and_stats.sql`.
- **Action**: You will need to run this SQL against your production database manually or via a one-off script, as we are avoiding complex local Docker setups for now.

## 2. Bot Implementation (Elo Service)

The bot needs a service to handle Elo calculations and updates.

### Components
- **`src/services/elo.service.ts`**:
    - `calculateNewRating(currentRating, opponentRating, result)`: A stubbed function where you can later plug in your custom formula.
    - `processMatch(scrimId)`: The main workflow:
        1. Fetch match results and player stats from DB.
        2. Calculate new ratings for all players.
        3. Update `elo_ratings` and insert records into `elo_history`.
- **`src/commands/admin/calc-elo.ts`**: An admin command to manually trigger the calculation for a specific match ID (useful for testing and backfilling).

## 3. GAS Parser Integration

The Google Apps Script needs to write directly to the PostgreSQL database.

### Components
- **`Database.gs`**: A helper class to manage JDBC connections to your PostgreSQL database.
- **`Repository.gs`**: Encapsulates SQL queries (e.g., `getActiveScrims`, `saveMatchStats`).
- **`Code.gs` Updates**:
    - `doGet`: Fetch active scrims from the DB to populate a dropdown in the UI.
    - `verifyReplay`: Instead of writing to Google Sheets, use `Repository.gs` to write to `scrim_results`, `match_player_stats`, and update `scrims` status.
- **`Verify.html` Updates**: Add a dropdown menu for the verifier to select which active Scrim ID the uploaded replay belongs to.

## 4. Workflow Summary

1.  **Match Creation**: Bot creates a scrim and saves it to DB (status: `active`).
2.  **Replay Upload**: User uploads replay to GAS Web App.
3.  **Verification**:
    - Verifier opens the GAS Web App.
    - Selects the corresponding Scrim ID from a dropdown (populated from DB).
    - Clicks "Verify".
4.  **Data Persistence**:
    - GAS writes detailed stats to `match_player_stats`.
    - GAS updates `scrims` table (sets winner, status to `completed`).
5.  **Elo Calculation**:
    - *Option A (Manual)*: Admin runs `/admin calc-elo <scrim_id>`.
    - *Option B (Auto)*: Bot polls for completed matches or exposes an API endpoint (future scope). For now, we'll stick to the manual command or a simple polling mechanism if desired.

## 5. Next Steps for You

1.  **Review Schema**: Check `db/migrations/001_elo_and_stats.sql` and ensure it fits your needs.
2.  **Database Credentials**: Ensure you have the correct JDBC connection string for the GAS script.
3.  **Implementation**: I will proceed with writing the code for the Bot and GAS components as described above.