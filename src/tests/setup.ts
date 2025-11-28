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

export const testPool = new Pool({
    connectionString: testDbUrl,
    ssl: isLocal ? false : {
        rejectUnauthorized: false,
    },
});

export async function setupTestDb() {
    if (!testDbUrl) {
        throw new Error('TEST_DATABASE_URL is not defined');
    }

    const client = await testPool.connect();
    try {
        // Drop public schema and recreate it to wipe everything
        await client.query('DROP SCHEMA IF EXISTS public CASCADE');
        await client.query('CREATE SCHEMA IF NOT EXISTS public');
        await client.query('GRANT ALL ON SCHEMA public TO public');
        await client.query('GRANT ALL ON SCHEMA public TO tmscrim');

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