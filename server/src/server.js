import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import pool from './db/connection.js';
import { logger } from './utils/logger.js';
import { initAuthTables }       from './services/authService.js';
import { initAccountTypes }     from './services/accountService.js';
import { initTransactionTables } from './services/transactionService.js';

const PORT = process.env.PORT || 5000;

// ── Runtime init — idempotent, CREATE IF NOT EXISTS / UPSERT ─────────────────

await initAuthTables().catch((err) => {
  logger.error(`Failed to initialise auth tables: ${err.message}`);
  process.exit(1);
});

await initAccountTypes().catch((err) => {
  logger.error(`Failed to seed account types: ${err.message}`);
  process.exit(1);
});

await initTransactionTables().catch((err) => {
  logger.error(`Failed to initialise transaction tables: ${err.message}`);
  process.exit(1);
});

const server = app.listen(PORT, () => {
  logger.info(`BankShield Server running on http://localhost:${PORT}`);
  logger.info(`Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown handling
const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await pool.end();
      logger.info('Database pool closed.');
      process.exit(0);
    } catch (err) {
      logger.error(`Error closing database pool: ${err.message}`);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
