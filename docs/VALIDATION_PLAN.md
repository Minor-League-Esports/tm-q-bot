# Validation Plan: Trackmania Scrim Bot

This document outlines the strategy for validating the Trackmania Scrim Bot, ensuring reliability across all core functions: queue management, scrim creation, match execution, result submission, and Elo calculation.

## 1. Testing Strategy Overview

We will employ a three-tiered testing approach:

1.  **Unit Tests (Local/Mocked)**: Fast, isolated tests for individual services and logic (e.g., Elo calculation, map selection).
2.  **Integration Tests (Local/DB)**: Tests involving the database and service interactions to verify data persistence and complex flows.
3.  **Manual End-to-End (E2E) Tests**: Real-world validation using Discord and the Google Apps Script (GAS) integration.

## 2. Test Environment Setup

Before running integration or E2E tests, a proper test environment is required.

*   **Database**: A separate PostgreSQL database (or schema) should be used to avoid corrupting production data.
*   **Configuration**: A `.env.test` file should be created with the test database URL and mock Discord tokens.
*   **Seeding**: Scripts to seed the database with test players, maps, and initial configurations.

## 3. Unit & Integration Test Plan

These tests will be automated using `vitest`.

### 3.1. Queue Service (`src/services/queue.service.ts`)
*   **Unit**:
    *   `joinQueue`: Verify player is added to the correct league queue.
    *   `joinQueue`: Verify duplicate join attempts are rejected.
    *   `leaveQueue`: Verify player is removed.
    *   `popQueue`: Verify `queuePop` event is emitted when 4 players join.
*   **Integration**:
    *   Verify queue state persists or recovers correctly (if applicable, though currently in-memory).
    *   Verify `popQueue` triggers `scrimService.createScrim`.

### 3.2. Scrim Service (`src/services/scrim.service.ts`)
*   **Integration**:
    *   `createScrim`: Verify `scrims`, `scrim_players`, and `scrim_maps` records are created in DB.
    *   `checkInPlayer`: Verify `checked_in` status updates.
    *   `checkInPlayer`: Verify scrim status changes to `active` when all 4 check in.
    *   `checkInTimeout`: Verify scrim is cancelled and no-shows are penalized (via `queueService` interaction).

### 3.3. Elo Service (`src/services/elo.service.ts`)
*   **Unit**:
    *   `calculateNewRating`: Verify math for standard Elo formula (K=32).
*   **Integration**:
    *   `processMatch`: Verify `elo_ratings` are updated correctly for winners/losers.
    *   `processMatch`: Verify `elo_history` records are inserted.
    *   `processMatch`: Verify idempotency (running twice doesn't double-count).

### 3.4. Map Service (`src/services/map.service.ts`)
*   **Unit**:
    *   `selectMapsForScrim`: Verify 3 unique maps are selected.
    *   `selectMapsForScrim`: Verify least-played logic (mocking history).

## 4. Manual End-to-End (E2E) Test Procedure

This procedure validates the full user journey.

**Prerequisites**:
*   Bot running locally or on staging.
*   4 Discord accounts (or 1 admin account masquerading/using helpers).
*   Access to the Google Form/GAS Web App.

### Phase 1: Queue & Match Creation
1.  **Join Queue**:
    *   User A: `/queue join` (Academy) -> Expect: "Joined (1/4)"
    *   User B: `/queue join` (Academy) -> Expect: "Joined (2/4)"
    *   User C: `/queue join` (Academy) -> Expect: "Joined (3/4)"
    *   User D: `/queue join` (Academy) -> Expect: "Joined (4/4)"
2.  **Queue Pop**:
    *   Expect: DM to all 4 users with Scrim ID, Map List, and Check-in prompt.
3.  **Check-in**:
    *   Users A, B, C, D: `/checkin`
    *   Expect: "Scrim Active" message after 4th check-in.

### Phase 2: Match & Result Submission
1.  **Play Match**: (Simulated)
2.  **Submit Result**:
    *   Click the Google Form link from the DM.
    *   Verify form is pre-filled with Scrim ID and Player Names.
    *   Upload a dummy replay file.
    *   Submit form.

### Phase 3: Verification & Processing
1.  **Verify Replay (GAS)**:
    *   Open GAS Web App (Verifier View).
    *   Select the active Scrim ID from the dropdown.
    *   Click "Verify".
    *   Expect: Success message.
2.  **Database Check**:
    *   Check `scrims` table: Status should be `completed`, `winner_team` set.
    *   Check `match_player_stats`: Rows should exist for the match.

### Phase 4: Elo Calculation
1.  **Trigger Elo**:
    *   Admin: `/admin calc-elo <scrim_id>`
    *   Expect: "Elo calculation completed".
2.  **Verify Ratings**:
    *   Admin: `/admin stats <User A>`
    *   Expect: Rating updated, win/loss count incremented.

## 5. Sub-Agent Task Descriptions

Use these prompts to delegate implementation tasks.

### Task A: Setup Test Environment & Database
> "Create a test environment setup for the Trackmania bot.
> 1. Create a `db/test-seed.sql` file that inserts 4 test players (Academy league) and 10 test maps.
> 2. Create a `src/tests/setup.ts` file that connects to a test database (read from `TEST_DATABASE_URL`), runs migrations, and seeds the data before all tests.
> 3. Update `package.json` to add a `test` script running `vitest`."

### Task B: Implement Unit/Integration Tests
> "Implement automated tests using Vitest for the following services:
> 1. **QueueService**: Test joining, leaving, and queue popping logic. Mock `playerService` where needed.
> 2. **ScrimService**: Test `createScrim` and `checkInPlayer` using the real test database. Verify DB records are created.
> 3. **EloService**: Test `calculateNewRating` (unit) and `processMatch` (integration). For `processMatch`, insert a completed scrim and mock stats into the test DB, then verify `elo_ratings` updates."

### Task C: Implement Map Selection Tests
> "Create unit tests for `MapService`.
> 1. Mock the database queries for map history.
> 2. Verify `selectMapsForScrim` returns 3 unique maps.
> 3. Verify that maps with lower play counts are prioritized (or at least included) according to the logic."