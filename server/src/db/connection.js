import pg from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 10,
  // Neon free-tier drops idle connections after ~5 min.
  // Keep idle timeout well under that so the pool recycles
  // connections before Neon closes them from its side.
  idleTimeoutMillis: 60_000,        // release idle client after 60 s
  connectionTimeoutMillis: 30_000,  // wait up to 30 s for a new connection
});

pool.on('error', (err, client) => {
  logger.error(`Unexpected error on idle PostgreSQL client: ${err.message}`);
  // Removing the errored client so the pool can create a fresh one
  try { client?.release(err); } catch (_) { /* already released */ }
});

/**
 * Transient error codes that justify a single automatic retry.
 * Neon free-tier produces ETIMEDOUT / ECONNRESET when a pooled
 * connection is reaped by the cloud proxy before we use it.
 */
const TRANSIENT = new Set(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EPIPE','57P01','08006','08001']);

const isTransient = (err) =>
  TRANSIENT.has(err.code) ||
  (err.message && /timeout|connection terminated|connection reset|broken pipe/i.test(err.message));

/**
 * Execute a single SQL query with one automatic retry on transient errors.
 * @param {string} text   SQL query string
 * @param {Array}  params Query parameters
 */
export const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (!isTransient(err)) throw err;
    logger.warn(`DB transient error (${err.code || err.message?.slice(0,40)}), retrying once…`);
    await new Promise(r => setTimeout(r, 800));
    return pool.query(text, params);   // second attempt — let this throw naturally
  }
};

/**
 * Acquire a dedicated client from the pool for transactions
 * @returns {Promise<pg.PoolClient>}
 */
export const getClient = async () => {
  const client = await pool.connect();
  const originalRelease = client.release.bind(client);

  // Set timeout warning for long-lived checkouts
  const timeout = setTimeout(() => {
    logger.warn('A database client checkout has exceeded 15 seconds. Ensure release() is called in finally block.');
  }, 15_000);

  client.release = () => {
    clearTimeout(timeout);
    return originalRelease();
  };

  return client;
};

export default pool;
