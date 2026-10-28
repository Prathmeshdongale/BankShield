/**
 * BankShield — Database Seeds
 * -----------------------------------------------------------------------
 * Idempotent seed script.  Safe to re-run at any time:
 *   • Roles     — 7 platform roles (upsert by name)
 *   • Permissions — core permission codes per module (upsert by code)
 *   • Role ↔ Permission mappings
 *   • Super-admin user with bcrypt-hashed password (upsert by email)
 *
 * Usage:
 *   node src/db/seeds.js
 *   NODE_ENV=production node src/db/seeds.js  ← uses same .env override
 *
 * ESM module  (server uses "type":"module")
 * -----------------------------------------------------------------------
 */

import pg      from 'pg';
import bcrypt  from 'bcrypt';
import path    from 'path';
import { fileURLToPath } from 'url';
import dotenv  from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { Pool } = pg;

// ── colour helpers ────────────────────────────────────────────────────────
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

// ── bcrypt cost factor ───────────────────────────────────────────────────
const SALT_ROUNDS = 12;

// ============================================================================
// SEED DATA
// ============================================================================

/**
 * 4 platform roles for the restructured BankShield modules:
 * - customer: Self-service banking for registered users
 * - branch_manager: Branch operations and frontline oversight
 * - fraud_analyst: Fraud investigation and ML predictions
 * - super_admin: Platform and user management (limited banking access)
 */
const ROLES = [
  {
    name        : 'super_admin',
    display_name: 'Super Administrator',
    description : 'Platform administration: user management, system config, audit logs. No routine banking access.',
  },
  {
    name        : 'branch_manager',
    display_name: 'Branch Manager',
    description : 'Branch operations: customer onboarding, account management, fraud review.',
  },
  {
    name        : 'fraud_analyst',
    display_name: 'Fraud Analyst',
    description : 'Fraud investigation: alert triage, case management, ML prediction review.',
  },
  {
    name        : 'customer',
    display_name: 'Customer',
    description : 'Registered bank customer with access to personal accounts, transactions, and cards.',
  },
];

/**
 * Core permission codes.
 * Pattern: <module>:<action>
 * Modules: users, customers, accounts, transactions, cards,
 *          fraud, reports, audit, system
 */
const PERMISSIONS = [
  // ── users ──────────────────────────────────────────────────────────────
  { code: 'users:read',           module: 'users',        description: 'View user profiles'                    },
  { code: 'users:create',         module: 'users',        description: 'Create new user accounts'              },
  { code: 'users:update',         module: 'users',        description: 'Update user details'                   },
  { code: 'users:delete',         module: 'users',        description: 'Soft-delete users'                     },
  { code: 'users:manage_roles',   module: 'users',        description: 'Assign / revoke roles'                 },

  // ── customers ──────────────────────────────────────────────────────────
  { code: 'customers:read',       module: 'customers',    description: 'View customer records'                 },
  { code: 'customers:create',     module: 'customers',    description: 'Onboard new customers'                 },
  { code: 'customers:update',     module: 'customers',    description: 'Update customer information'           },
  { code: 'customers:kyc_verify', module: 'customers',    description: 'Approve / reject KYC documents'        },

  // ── accounts ───────────────────────────────────────────────────────────
  { code: 'accounts:read',        module: 'accounts',     description: 'View account details and balances'     },
  { code: 'accounts:create',      module: 'accounts',     description: 'Open new bank accounts'                },
  { code: 'accounts:update',      module: 'accounts',     description: 'Modify account settings'               },
  { code: 'accounts:freeze',      module: 'accounts',     description: 'Freeze / unfreeze accounts'            },
  { code: 'accounts:close',       module: 'accounts',     description: 'Close accounts'                        },

  // ── transactions ───────────────────────────────────────────────────────
  { code: 'transactions:read',    module: 'transactions', description: 'View transaction history'              },
  { code: 'transactions:create',  module: 'transactions', description: 'Initiate transfers and payments'       },
  { code: 'transactions:reverse', module: 'transactions', description: 'Reverse / refund transactions'         },
  { code: 'transactions:export',  module: 'transactions', description: 'Export transaction data'               },

  // ── cards ──────────────────────────────────────────────────────────────
  { code: 'cards:read',           module: 'cards',        description: 'View card information'                 },
  { code: 'cards:block',          module: 'cards',        description: 'Block / unblock cards'                 },
  { code: 'cards:manage_limits',  module: 'cards',        description: 'Set card spending limits'              },

  // ── fraud ──────────────────────────────────────────────────────────────
  { code: 'fraud:read_alerts',    module: 'fraud',        description: 'View fraud alerts'                     },
  { code: 'fraud:manage_alerts',  module: 'fraud',        description: 'Triage and update fraud alert status'  },
  { code: 'fraud:investigate',    module: 'fraud',        description: 'Open and manage fraud investigations'  },
  { code: 'fraud:add_notes',      module: 'fraud',        description: 'Add analyst notes to cases'            },
  { code: 'fraud:view_ml',        module: 'fraud',        description: 'View ML prediction scores and features'},
  { code: 'fraud:report',         module: 'fraud',        description: 'Report suspicious transactions'        },
  { code: 'fraud:dispute',        module: 'fraud',        description: 'Dispute flagged transactions'          },

  // ── reports ────────────────────────────────────────────────────────────
  { code: 'reports:read',         module: 'reports',      description: 'View generated reports'                },
  { code: 'reports:create',       module: 'reports',      description: 'Request new reports'                   },
  { code: 'reports:export',       module: 'reports',      description: 'Download / export reports'             },

  // ── audit ──────────────────────────────────────────────────────────────
  { code: 'audit:read',           module: 'audit',        description: 'View audit logs'                       },
  { code: 'audit:export',         module: 'audit',        description: 'Export audit log data'                 },

  // ── system ─────────────────────────────────────────────────────────────
  { code: 'system:config',        module: 'system',       description: 'Manage system-wide configuration'      },
  { code: 'system:seed',          module: 'system',       description: 'Run database seed operations'          },
  { code: 'system:migrate',       module: 'system',       description: 'Run database migrations'               },
];

/**
 * Role → permissions mapping for 4-role structure.
 * super_admin gets platform administration only (no routine banking).
 * branch_manager gets branch operations + fraud review.
 * fraud_analyst gets investigation tools + read-only banking.
 * customer gets own accounts + reporting functions.
 */
const ROLE_PERMISSIONS = {
  super_admin: [
    'users:read','users:create','users:update','users:delete','users:manage_roles',
    'audit:read','audit:export',
    'system:config','system:seed','system:migrate',
  ],

  branch_manager: [
    'customers:read','customers:create','customers:update','customers:kyc_verify',
    'accounts:read','accounts:create','accounts:update','accounts:freeze',
    'transactions:read','transactions:create',
    'cards:read','cards:block',
    'fraud:read_alerts','fraud:manage_alerts','fraud:report',
    'reports:read','reports:create',
    'audit:read',
  ],

  fraud_analyst: [
    'users:read',
    'customers:read',
    'accounts:read',
    'transactions:read',
    'cards:read',
    'fraud:read_alerts','fraud:manage_alerts','fraud:investigate','fraud:add_notes','fraud:view_ml','fraud:report','fraud:dispute',
    'reports:read','reports:create',
    'audit:read',
  ],

  customer: [
    'accounts:read',
    'transactions:read','transactions:create',
    'cards:read',
    'reports:read',
    'fraud:report','fraud:dispute',
  ],
};

/**
 * Super-admin user — only system user seeded.
 * ALL other users (customers, managers, analysts) are created through
 * the application UI or API — never hardcoded here.
 */
const SUPER_ADMIN = {
  email      : process.env.SUPER_ADMIN_EMAIL    || 'superadmin@bankshield.internal',
  password   : process.env.SUPER_ADMIN_PASSWORD || 'BankShield@Super2025!',
  first_name : 'Super',
  last_name  : 'Admin',
  role_name  : 'super_admin',
};

// ============================================================================
// SEEDING FUNCTIONS
// ============================================================================

async function seedRoles(client) {
  log.info('Seeding roles…');
  await client.query('BEGIN');
  let upserted = 0;
  try {
    for (const role of ROLES) {
      const { rowCount } = await client.query(
        `INSERT INTO roles (name, display_name, description)
         VALUES ($1::role_name, $2, $3)
         ON CONFLICT (name) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               description  = EXCLUDED.description,
               updated_at   = NOW()`,
        [role.name, role.display_name, role.description]
      );
      upserted += rowCount;
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  log.ok(`Roles: ${upserted} upserted (${ROLES.length} total)`);
}

async function seedPermissions(client) {
  log.info('Seeding permissions…');
  await client.query('BEGIN');
  let upserted = 0;
  try {
    for (const perm of PERMISSIONS) {
      const { rowCount } = await client.query(
        `INSERT INTO permissions (code, description, module)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE
           SET description = EXCLUDED.description,
               module      = EXCLUDED.module`,
        [perm.code, perm.description, perm.module]
      );
      upserted += rowCount;
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  log.ok(`Permissions: ${upserted} upserted (${PERMISSIONS.length} total)`);
}

async function seedRolePermissions(client) {
  log.info('Seeding role ↔ permission mappings…');

  const { rows: roleRows } = await client.query('SELECT id, name FROM roles');
  const { rows: permRows } = await client.query('SELECT id, code FROM permissions');

  const roleMap = new Map(roleRows.map((r) => [r.name, r.id]));
  const permMap = new Map(permRows.map((p) => [p.code, p.id]));

  let inserted = 0;
  let skipped  = 0;

  await client.query('BEGIN');
  try {
    for (const [roleName, codes] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleMap.get(roleName);
      if (!roleId) { log.warn(`Role not found: ${roleName} — skipping`); continue; }

      for (const code of codes) {
        const permId = permMap.get(code);
        if (!permId) { log.warn(`Permission not found: ${code} — skipping`); skipped++; continue; }

        const { rowCount } = await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT (role_id, permission_id) DO NOTHING`,
          [roleId, permId]
        );
        inserted += rowCount;
      }
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }

  log.ok(`Role-permissions: ${inserted} inserted, ${skipped} skipped`);
}

async function seedSuperAdmin(client) {
  log.info('Seeding super-admin user…');

  if (
    process.env.NODE_ENV === 'production' &&
    SUPER_ADMIN.password === 'BankShield@Super2025!'
  ) {
    log.error(
      'Default super-admin password detected in production. ' +
      'Set SUPER_ADMIN_PASSWORD in your environment and re-run.'
    );
    process.exit(1);
  }

  const { rows: roleRows } = await client.query(
    `SELECT id FROM roles WHERE name = 'super_admin'`
  );
  if (roleRows.length === 0) throw new Error('super_admin role not found — run role seeds first');
  const roleId = roleRows[0].id;

  log.info(`Hashing password with bcrypt (cost=${SALT_ROUNDS})…`);
  const password_hash = await bcrypt.hash(SUPER_ADMIN.password, SALT_ROUNDS);

  await client.query('BEGIN');
  let user;
  try {
    const { rows } = await client.query(
      `INSERT INTO users
         (email, password_hash, first_name, last_name, role_id,
          is_active, is_verified, password_changed_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, NOW())
       ON CONFLICT (email) DO UPDATE
         SET password_hash        = EXCLUDED.password_hash,
             first_name           = EXCLUDED.first_name,
             last_name            = EXCLUDED.last_name,
             role_id              = EXCLUDED.role_id,
             is_active            = TRUE,
             is_verified          = TRUE,
             password_changed_at  = NOW(),
             updated_at           = NOW()
       RETURNING id, email`,
      [SUPER_ADMIN.email, password_hash, SUPER_ADMIN.first_name, SUPER_ADMIN.last_name, roleId]
    );
    await client.query('COMMIT');
    user = rows[0];
  } catch (err) { await client.query('ROLLBACK'); throw err; }

  log.ok(`Super-admin ready  → id: ${user.id}  email: ${user.email}`);
  log.warn(
    process.env.SUPER_ADMIN_PASSWORD
      ? 'Password loaded from SUPER_ADMIN_PASSWORD env var.'
      : 'Password used: fallback default — set SUPER_ADMIN_PASSWORD in production!'
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/** Acquire a fresh client with retry on ECONNRESET / connection errors */
async function withClient(pool, fn, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = await pool.connect();
    try {
      const result = await fn(client);
      return result;
    } catch (err) {
      client.release(err); // release with error to discard the connection
      const transient = ['ECONNRESET','ECONNREFUSED','EPIPE','57P01'].some(
        (c) => err.code === c || err.message?.includes(c)
      );
      if (transient && attempt < retries) {
        log.warn(`Connection error (${err.code}), retrying (${attempt}/${retries})…`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw err;
    } finally {
      // release only if not already released above
      try { client.release(); } catch {}
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  if (!process.env.DATABASE_URL) {
    log.error('DATABASE_URL is not set. Check server/.env');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString       : process.env.DATABASE_URL,
    ssl                    : { rejectUnauthorized: false },
    max                    : 5,
    connectionTimeoutMillis: 60_000,
    idleTimeoutMillis      : 60_000,
  });

  log.title('BankShield — Database Seeder');
  log.info(`Environment : ${process.env.NODE_ENV || 'development'}`);

  try {
    // Each step uses its own client to avoid Neon idle-timeout ECONNRESET
    // on long-running single transactions.
    await withClient(pool, (c) => seedRoles(c));
    await withClient(pool, (c) => seedPermissions(c));
    await withClient(pool, (c) => seedRolePermissions(c));
    await withClient(pool, (c) => seedSuperAdmin(c));

    log.title('Seeding complete ✔');
    console.log('');
    console.log(`  Super-admin email    : ${SUPER_ADMIN.email}`);
    console.log(`  Password env var     : SUPER_ADMIN_PASSWORD`);
    console.log(`  Roles seeded         : ${ROLES.length}`);
    console.log(`  Permissions seeded   : ${PERMISSIONS.length}`);
    console.log('');
    console.log('  All other users (customers, branch managers, fraud analysts)');
    console.log('  must be created through the application UI or POST /api/auth/register.');
    console.log('');
  } catch (err) {
    log.error(`Seeding failed: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
