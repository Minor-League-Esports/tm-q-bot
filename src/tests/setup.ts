import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
    console.warn('TEST_DATABASE_URL is not defined. Database tests will fail.');
}

const isLocal = testDbUrl?.includes('localhost') || testDbUrl?.includes('127.0.0.1');
const testSchema = process.env.DATABASE_SCHEMA || 'trackmania';

export const testPool = new Pool({
    connectionString: testDbUrl,
    options: `-c search_path=${testSchema},public`,
    ssl: isLocal ? false : {
        rejectUnauthorized: false,
    },
});

async function createMinimalSprocketSchema(client: { query: (text: string, params?: unknown[]) => Promise<unknown> }) {
    await client.query(`
        CREATE SCHEMA IF NOT EXISTS sprocket;

        CREATE TABLE sprocket."user" (
            id INTEGER PRIMARY KEY
        );

        CREATE TABLE sprocket.member (
            id INTEGER PRIMARY KEY,
            "userId" INTEGER REFERENCES sprocket."user"(id)
        );

        CREATE TABLE sprocket.user_authentication_account (
            id SERIAL PRIMARY KEY,
            "userId" INTEGER REFERENCES sprocket."user"(id),
            "accountType" VARCHAR(50) NOT NULL,
            "accountId" VARCHAR(255) NOT NULL
        );

        CREATE TABLE sprocket.game (
            id INTEGER PRIMARY KEY,
            title VARCHAR(255) NOT NULL
        );

        CREATE TABLE sprocket.game_skill_group (
            id INTEGER PRIMARY KEY,
            "gameId" INTEGER REFERENCES sprocket.game(id)
        );

        CREATE TABLE sprocket.game_skill_group_profile (
            id SERIAL PRIMARY KEY,
            "skillGroupId" INTEGER REFERENCES sprocket.game_skill_group(id),
            code VARCHAR(20),
            description VARCHAR(255)
        );

        CREATE TABLE sprocket.player (
            id INTEGER PRIMARY KEY,
            "memberId" INTEGER REFERENCES sprocket.member(id),
            "skillGroupId" INTEGER REFERENCES sprocket.game_skill_group(id)
        );

        CREATE TABLE sprocket.member_platform_account (
            id SERIAL PRIMARY KEY,
            "memberId" INTEGER REFERENCES sprocket.member(id),
            "platformAccountId" VARCHAR(255) NOT NULL
        );

        CREATE TABLE sprocket.scrim_meta (
            id SERIAL PRIMARY KEY,
            "isCompetitive" BOOLEAN NOT NULL DEFAULT TRUE
        );

        CREATE TABLE sprocket.schedule_group (
            id INTEGER PRIMARY KEY,
            description VARCHAR(255)
        );

        CREATE TABLE sprocket.franchise (
            id INTEGER PRIMARY KEY
        );

        CREATE TABLE sprocket.franchise_profile (
            id INTEGER PRIMARY KEY,
            "franchiseId" INTEGER REFERENCES sprocket.franchise(id),
            title VARCHAR(255) NOT NULL,
            code VARCHAR(50)
        );

        CREATE TABLE sprocket.schedule_fixture (
            id SERIAL PRIMARY KEY,
            "scheduleGroupId" INTEGER REFERENCES sprocket.schedule_group(id),
            "skillGroupId" INTEGER REFERENCES sprocket.game_skill_group(id),
            "homeFranchiseId" INTEGER REFERENCES sprocket.franchise_profile(id),
            "awayFranchiseId" INTEGER REFERENCES sprocket.franchise_profile(id),
            week INTEGER,
            "scheduledDate" TIMESTAMP,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "updatedAt" TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE sprocket.match_parent (
            id SERIAL PRIMARY KEY,
            "scrimMetaId" INTEGER REFERENCES sprocket.scrim_meta(id),
            "fixtureId" INTEGER REFERENCES sprocket.schedule_fixture(id)
        );

        CREATE TABLE sprocket.match (
            id SERIAL PRIMARY KEY,
            "skillGroupId" INTEGER REFERENCES sprocket.game_skill_group(id),
            "matchParentId" INTEGER REFERENCES sprocket.match_parent(id),
            "submissionId" VARCHAR(255) NOT NULL,
            "gameModeId" INTEGER
        );

        CREATE TABLE sprocket.eligibility_data (
            id SERIAL PRIMARY KEY,
            points INTEGER NOT NULL,
            "matchParentId" INTEGER REFERENCES sprocket.match_parent(id),
            "playerId" INTEGER REFERENCES sprocket.player(id),
            UNIQUE ("matchParentId", "playerId")
        );

        INSERT INTO sprocket.game (id, title)
        VALUES (8, 'Trackmania');

        INSERT INTO sprocket.game_skill_group (id, "gameId")
        VALUES (801, 8), (802, 8), (803, 8);

        INSERT INTO sprocket.game_skill_group_profile ("skillGroupId", code, description)
        VALUES
            (801, 'AL', 'Academy'),
            (802, 'CL', 'Champion'),
            (803, 'ML', 'Master');
    `);
}

async function grantSchemaAccess(client: { query: (text: string, params?: unknown[]) => Promise<unknown> }) {
    await client.query(`
        GRANT ALL ON SCHEMA public TO public;
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tmscrim') THEN
                GRANT ALL ON SCHEMA public TO tmscrim;
                GRANT ALL ON SCHEMA trackmania TO tmscrim;
                GRANT ALL ON SCHEMA sprocket TO tmscrim;
            END IF;
        END $$;
    `);
}

export async function setupTestDb() {
    if (!testDbUrl) {
        throw new Error('TEST_DATABASE_URL is not defined');
    }

    const client = await testPool.connect();
    try {
        // Drop app-owned schemas and recreate them to wipe everything.
        await client.query('DROP SCHEMA IF EXISTS trackmania CASCADE');
        await client.query('DROP SCHEMA IF EXISTS sprocket CASCADE');
        await client.query('DROP SCHEMA IF EXISTS public CASCADE');
        await client.query('CREATE SCHEMA IF NOT EXISTS public');
        await createMinimalSprocketSchema(client);

        // Read and execute schema.sql
        const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // Execute schema directly instead of splitting
        // Splitting by ; breaks functions with $$ delimiters
        try {
            await client.query(schemaSql);
        } catch (e: any) {
            // Ignore "relation already exists" errors which can happen in parallel tests
            // Also ignore "duplicate key value violates unique constraint" which can happen with types
            if (e.code !== '42P07' && e.code !== '23505') {
                throw e;
            }
        }

        // Read and execute migrations
        const migrationsDir = path.join(process.cwd(), 'db', 'migrations');
        if (fs.existsSync(migrationsDir)) {
            const migrationFiles = fs.readdirSync(migrationsDir).sort();
            for (const file of migrationFiles) {
                if (file.endsWith('.sql')) {
                    const migrationPath = path.join(migrationsDir, file);
                    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
                    try {
                        await client.query(migrationSql);
                    } catch (e: any) {
                        // Ignore "relation already exists" errors which can happen in parallel tests
                        // Also ignore "duplicate key value violates unique constraint" which can happen with types/sequences
                        if (e.code !== '42P07' && e.code !== '23505') {
                            throw e;
                        }
                    }
                }
            }
        }

        await grantSchemaAccess(client);

        // Read and execute test seed
        const seedPath = path.join(process.cwd(), 'db', 'test-seed.sql');
        const seedSql = fs.readFileSync(seedPath, 'utf8');
        try {
            await client.query(seedSql);
        } catch (e: any) {
            // Ignore "duplicate key value violates unique constraint" which can happen with seed data
            if (e.code !== '23505') {
                throw e;
            }
        }

        console.log('Test database setup complete');
    } catch (error) {
        console.error('Error setting up test database:', error);
        throw error;
    } finally {
        client.release();
    }
}

export async function teardownTestDb() {
    await testPool.end();
}
export default async function () {
    await setupTestDb();
    return async () => {
        await teardownTestDb();
    };
}
