import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config.js';

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function searchPathOption(schema: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid SQL identifier: ${schema}`);
  }
  return `-c search_path=${schema},public`;
}

export function tableName(table: string): string {
  return `${quoteIdentifier(config.database.schema)}.${quoteIdentifier(table)}`;
}

export class Database {
  private pool: Pool;

  constructor() {
    const isLocal = config.database.url.includes('localhost') || config.database.url.includes('127.0.0.1');
    this.pool = new Pool({
      connectionString: config.database.url,
      options: searchPathOption(config.database.schema),
      ssl: isLocal ? false : {
        rejectUnauthorized: false,
      },
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }

  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      if (config.app.logLevel === 'debug') {
        console.log('Query executed:', { text, duration, rows: result.rowCount });
      }
      return result;
    } catch (error) {
      console.error('Database query error:', { text, error });
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

export const db = new Database();
