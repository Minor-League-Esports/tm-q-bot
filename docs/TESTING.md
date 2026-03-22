# Testing

The test suite is split into two layers:

- `npm test` runs the default unit suite. It does not require Postgres.
- `npm run test:integration` runs the database-backed integration tests. It requires `TEST_DATABASE_URL`.

## Unit Tests

Use these commands for normal local development and CI checks that should run anywhere:

```bash
npm test
npm run test:ci
```

The unit suite loads safe default environment variables from `src/tests/env-setup.ts`, so tests that import `config` or `db` can still initialize without a real Discord token or database connection.

## Integration Tests

Use these commands when you want real Postgres coverage:

```bash
TEST_DATABASE_URL=postgresql://... npm run test:integration
TEST_DATABASE_URL=postgresql://... npm run test:integration:ci
```

Integration tests live in files named `*.integration.test.ts`.

Current integration coverage includes:

- `src/services/scrim.service.integration.test.ts`
- `src/services/elo.service.integration.test.ts`

## New UX/Admin Coverage

The recent queue-pop/admin UX changes are covered in the unit suite:

- `src/handlers/checkinInteractions.test.ts`
- `src/commands/admin.test.ts`
- `src/services/queue.service.test.ts`
- `src/services/scrim.service.admin.test.ts`
