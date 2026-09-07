import { Pool, types } from 'pg';

// All BIGINT values in this app are millisecond timestamps or small counts.
types.setTypeParser(20, value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds the safe range');
  return number;
});
const globalDb = globalThis as typeof globalThis & { miniDuelPool?: Pool };
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  if (!globalDb.miniDuelPool) {
    globalDb.miniDuelPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    // Never log database error objects: they may contain connection details.
    globalDb.miniDuelPool.on('error', () => console.error('Postgres idle connection failed'));
  }
  return globalDb.miniDuelPool;
}
