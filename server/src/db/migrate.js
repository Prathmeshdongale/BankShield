/**
 * BankShield — Migration Runner
 * -----------------------------------------------------------------------
 * Runs schema.sql against the configured PostgreSQL database (Neon / any pg).
 * Idempotent: tracks executed migrations in a `schema_migrations` table so
 * re-running the script never double-applies a migration.
 *
 * Usage:
 *   node src/db/migrate.js           – apply all pending migrations
 *   node src/db/migrate.js --status  – list migration status without applying
 *   node src/db/migrate.js --rollback – placeholder (manual rollback required)
 *
 * ESM module (server uses "type":"module")
 * -----------------------------------------------------------------------
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ── resolve __dirname in ESM ──────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── load .env from server root (two levels up from src/db/) ──────────────
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = pg;

// ── colour helpers for console output ────────────────────────────────────
const c = {
  reset : '\x1b[0m',
  green : '\x1b[32m',
  yellow: '\x1b[33m',
  red   : '\x1b[31m',
  cyan  : '\x1b[36m',
  bold  : '\x1b[1m',
};
const log = {
  info  : (m) => console.log(`${c.cyan}ℹ${c.reset}  ${m}`),
  ok    : (m) => console.log(`${c.green}✔${c.reset}  ${m}`),
  warn  : (m) => console.log(`${c.yellow}⚠${c.reset}  ${m}`),
  error : (m) => console.error(`${c.red}✖${c.reset}  ${m}`),
  title : (m) => console.log(`\n${c.bold}${c.cyan}${m}${c.reset}\n`),
};

// ── migration manifest ────────────────────────────────────────────────────
// Add future migration files here in order.  Each entry is resolved relative
// to the directory of this script.
const MIGRATIONS = [
  {
    id      : '001_initial_schema',
    label   : 'Initial schema — 21 tables, enums, indexes, triggers',
    file    : 'schema.sql',
  },
  // future:
  // { id: '002_add_otp_table', label: '...', file: 'migrations/002_add_otp_table.sql' },
];

// ── build pool from DATABASE_URL ──────────────────────────────────────────
function createPool() {
  if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL is not set. Check server/.env');
    process.exit(1);
  }
return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl             : false,
    max             : 3,
    connectionTimeoutMillis: 60_000,
    idleTimeoutMillis      : 60_000,
    statement_timeout      : 120_000,
});
}

// ── ensure the tracking table exists ─────────────────────────────────────
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          VARCHAR(100) PRIMARY KEY,
      label       TEXT,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum    VARCHAR(64)
    );
  `);
}

// ── simple SHA-256 checksum of file contents ─────────────────────────────
async function sha256(str) {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(str).digest('hex');
}

// ── fetch already-applied migration IDs ──────────────────────────────────
async function appliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT id, applied_at, checksum FROM schema_migrations ORDER BY applied_at'
  );
  return new Map(rows.map((r) => [r.id, r]));
}

// ── apply a single migration inside a transaction ────────────────────────
async function applyMigration(client, migration) {
  const filePath = path.resolve(__dirname, migration.file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filePath}`);
  }

  const sql      = fs.readFileSync(filePath, 'utf8');
  const checksum = await sha256(sql);

  log.info(`Applying [${migration.id}] — ${migration.label}`);

  // Note: schema.sql uses CREATE TABLE IF NOT EXISTS and DO $$ blocks so
  // it is safe to run outside a single transaction — DDL in PostgreSQL
  // auto-commits.  We still wrap to catch errors early.
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (id, label, checksum)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
         SET label      = EXCLUDED.label,
             checksum   = EXCLUDED.checksum,
             applied_at = NOW();`,
      [migration.id, migration.label, checksum]
    );
    log.ok(`Applied  [${migration.id}]`);
  } catch (err) {
    throw err;
  }
}

// ── verify checksum of already-applied migration ─────────────────────────
async function verifyChecksum(migration, storedRecord) {
  const filePath = path.resolve(__dirname, migration.file);
  if (!fs.existsSync(filePath)) {
    log.warn(`File missing for already-applied migration: ${migration.id}`);
    return;
  }
  const sql      = fs.readFileSync(filePath, 'utf8');
  const checksum = await sha256(sql);
  if (storedRecord.checksum && storedRecord.checksum !== checksum) {
    log.warn(
      `Checksum mismatch for [${migration.id}] — file was modified after being applied.`
    );
  }
}

// ── status mode ──────────────────────────────────────────────────────────
async function printStatus(client) {
  const applied = await appliedMigrations(client);
  log.title('Migration Status');
  for (const m of MIGRATIONS) {
    const record = applied.get(m.id);
    if (record) {
      console.log(
        `  ${c.green}[applied]${c.reset}  ${m.id}  — ${m.label}`
      );
      console.log(`             applied_at: ${record.applied_at.toISOString()}`);
    } else {
      console.log(`  ${c.yellow}[pending]${c.reset}  ${m.id}  — ${m.label}`);
    }
  }
  console.log('');
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  const args       = process.argv.slice(2);
  const isStatus   = args.includes('--status');
  const isRollback = args.includes('--rollback');
  const isForce    = args.includes('--force');   // re-apply even if tracked

  const pool   = createPool();
  const client = await pool.connect();

  try {
    log.title('BankShield — Database Migration Runner');
    log.info(`Environment : ${process.env.NODE_ENV || 'development'}`);
    log.info(`Database    : ${maskUrl(process.env.DATABASE_URL)}`);

    await ensureMigrationsTable(client);

    if (isRollback) {
      log.warn('Rollback is not automated. Apply rollback SQL scripts manually.');
      log.warn('Refer to docs/DATABASE.md for rollback procedures.');
      process.exit(0);
    }

    if (isStatus) {
      await printStatus(client);
      return;
    }

    // ── apply pending migrations ──────────────────────────────────────
    const applied = await appliedMigrations(client);
    let pendingCount = 0;

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id) && !isForce) {
        await verifyChecksum(migration, applied.get(migration.id));
        log.info(`Skipping [${migration.id}] — already applied`);
      } else {
        if (isForce && applied.has(migration.id)) {
          log.warn(`--force: re-applying [${migration.id}]`);
          await client.query('DELETE FROM schema_migrations WHERE id = $1', [migration.id]);
        }
        await applyMigration(client, migration);
        pendingCount++;
      }
    }

    if (pendingCount === 0) {
      log.ok('Database is up to date. No migrations were applied.');
    } else {
      log.ok(`Done. ${pendingCount} migration(s) applied successfully.`);
    }
  } catch (err) {
    log.error(`Migration failed: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

/** Mask credentials in the connection URL for safe logging */
function maskUrl(url = '') {
  try {
    const u = new URL(url);
    u.password = '****';
    return u.toString();
  } catch {
    return '[invalid URL]';
  }
}

main();
