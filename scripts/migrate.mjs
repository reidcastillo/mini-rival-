import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

// Keep this standalone script runnable without a TypeScript loader.
if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL in .env.local before running migrations.');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10000,
});
pool.on('error', () => console.error('Database connection failed.'));
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(170421, 1)');
  await client.query('CREATE TABLE IF NOT EXISTS mini_duel_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const directory = new URL('../db/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('SELECT checksum FROM mini_duel_migrations WHERE name=$1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      console.log(`Already applied: ${name}`); continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO mini_duel_migrations(name,checksum) VALUES($1,$2)', [name,checksum]);
    console.log(`Applied: ${name}`);
  }
  await client.query('COMMIT');
  console.log('Database ready.');
} catch {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error('Migration failed. Check DATABASE_URL, database access, and migration history. No credentials were logged.');
  process.exitCode = 1;
} finally { client?.release(); await pool.end(); }
