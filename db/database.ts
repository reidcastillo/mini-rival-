import type { PoolClient } from 'pg';
import { getPool } from './pool';

type Value = string | number | null;
class Statement {
  private values: Value[] = [];
  private sql: string;
  constructor(private client: PoolClient, sql: string) {
    let position = 0;
    this.sql = sql.replace(/\?/g, () => `$${++position}`);
  }
  bind(...values: Value[]) { this.values = values; return this; }
  async first<T>(): Promise<T | null> { return (await this.client.query(this.sql, this.values)).rows[0] ?? null; }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> { return { results: (await this.client.query(this.sql, this.values)).rows }; }
  async run() { return this.client.query(this.sql, this.values); }
}
export class Database {
  constructor(private client: PoolClient) {}
  prepare(sql: string) { return new Statement(this.client, sql); }
  async batch(statements: Statement[]) {
    for (const statement of statements) await statement.run();
  }
}

export async function withDatabase(work: (db: Database) => Promise<Response>): Promise<Response> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const response = await work(new Database(client));
    await client.query(response.status >= 400 ? 'ROLLBACK' : 'COMMIT');
    return response;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

// #checked 9/9/2025
