/**
 * clean.js — Wipe all business data from the database.
 *
 * Keeps:
 *   ✔ schema (all tables, enums, indexes, triggers)
 *   ✔ roles and permissions
 *   ✔ schema_migrations tracking table
 *
 * Deletes (in safe FK order):
 *   ✖ analyst_notes
 *   ✖ fraud_investigations
 *   ✖ fraud_alerts
 *   ✖ fraud_predictions
 *   ✖ notifications
 *   ✖ audit_logs
 *   ✖ login_history
 *   ✖ reports
 *   ✖ file_uploads
 *   ✖ card_limits
 *   ✖ cards
 *   ✖ beneficiaries
 *   ✖ transactions
 *   ✖ accounts
 *   ✖ customer_kyc
 *   ✖ customers
 *   ✖ branches
 *   ✖ users (except super_admin)
 *
 * Usage:
 *   node src/db/clean.js           — prompts for confirmation
 *   node src/db/clean.js --force   — skips prompt (CI / scripted use)
 *
 * After cleaning, run `npm run seed` to restore the super-admin user.
 */

import pg      from 'pg';
import path    from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import dotenv  from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = pg;

const c = {
  red   : '\x1b[31m', yellow: '\x1b[33m',
  green : '\x1b[32m', cyan  : '\x1b[36m',
  bold  : '\x1b[1m',  reset : '\x1b[0m',
};

const log = {
  info  : (m) => console.log(`${c.cyan}ℹ${c.reset}  ${m}`),
  ok    : (m) => console.log(`${c.green}✔${c.reset}  ${m}`),
  warn  : (m) => console.log(`${c.yellow}⚠${c.reset}  ${m}`),
  error : (m) => console.error(`${c.red}✖${c.reset}  ${m}`),
  title : (m) => console.log(`\n${c.bold}${c.red}${m}${c.reset}\n`),
};

const confirm = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => { rl.close(); resolve(ans.trim().toLowerCase()); });
  });

// Tables wiped in FK-safe order (children before parents)
const TRUNCATE_TABLES = [
  'analyst_notes',
  'fraud_investigations',
  'fraud_alerts',
  'fraud_predictions',
  'notifications',
  'audit_logs',
  'login_history',
  'reports',
  'file_uploads',
  'card_limits',
  'cards',
  'beneficiaries',
  'transactions',
  'accounts',
  'customer_kyc',
  'customers',
  'branches',
];

async function cleanDatabase(pool) {
  const client = await pool.connect();
  try {
    log.info('Starting clean inside a transaction…');
    await client.query('BEGIN');

    // 1. Wipe all business tables
    for (const table of TRUNCATE_TABLES) {
      await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      log.ok(`Cleared: ${table}`);
    }

    // 2. Delete all users EXCEPT the super_admin
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@bankshield.internal';
    const { rowCount } = await client.query(
      `DELETE FROM users WHERE email != $1`,
      [superAdminEmail]
    );
    log.ok(`Deleted ${rowCount} non-super-admin user(s)`);

    await client.query('COMMIT');
    log.ok('Transaction committed — database is clean.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL not set. Check server/.env');
    process.exit(1);
  }

  log.title('⚠  BankShield — Database Clean  ⚠');
  console.log('  This will DELETE all customers, accounts, transactions,');
  console.log('  cards, fraud alerts, investigations, audit logs, and users');
  console.log('  (the super-admin account is preserved).\n');
  console.log('  Schema, roles, and permissions are NOT touched.\n');

  const force = process.argv.includes('--force');
  if (!force) {
    const answer = await confirm('  Type "yes" to confirm: ');
    if (answer !== 'yes') {
      log.warn('Aborted — no changes made.');
      process.exit(0);
    }
  }

  const pool = new Pool({
    connectionString       : process.env.DATABASE_URL,
    ssl                    : false,
    max                    : 3,
    connectionTimeoutMillis: 30_000,
  });

  try {
    await cleanDatabase(pool);
    log.title('Clean complete ✔');
    console.log('  Run `npm run seed` to restore the super-admin account.');
    console.log('  Then create users through the UI or API.\n');
  } catch (err) {
    log.error(`Clean failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
