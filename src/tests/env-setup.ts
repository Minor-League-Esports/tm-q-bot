import { config } from 'dotenv';

// Load environment variables
config();

// Override DATABASE_URL with TEST_DATABASE_URL for tests
if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
    console.warn('TEST_DATABASE_URL is not defined in environment variables');
}