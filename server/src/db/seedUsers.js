import bcrypt from 'bcrypt';
import { query, getClient } from './connection.js';

const SALT_ROUNDS = 12;

export const SEED_USERS = [
  {
    email: 'superadmin@bankshield.internal',
    password: process.env.SUPER_ADMIN_PASSWORD || 'BankShield@Super2025!',
    first_name: 'Super',
    last_name: 'Admin',
    role_name: 'super_admin',
  },
  {
    email: 'analyst@bankshield.in',
    password: process.env.FRAUD_ANALYST_PASSWORD || 'Analyst@12345!',
    first_name: 'Fraud',
    last_name: 'Analyst',
    role_name: 'fraud_analyst',
  },
  {
    email: 'fraud@bankshield.internal',
    password: process.env.FRAUD_ANALYST_PASSWORD || 'Analyst@12345!',
    first_name: 'Fraud',
    last_name: 'Investigator',
    role_name: 'fraud_analyst',
  },
  {
    email: 'manager@bankshield.internal',
    password: process.env.BRANCH_MANAGER_PASSWORD || 'BranchManager@2025!',
    first_name: 'Branch',
    last_name: 'Manager',
    role_name: 'branch_manager',
  },
  {
    email: 'samdae@email.com',
    password: process.env.CUSTOMER_PASSWORD || 'BankShield@Sam2025!',
    first_name: 'Sam',
    last_name: 'Dae',
    role_name: 'customer',
  },
];

export async function seedAllRoleUsers() {
  const { rows: roleRows } = await query('SELECT id, name FROM roles');
  const roleMap = new Map(roleRows.map(r => [r.name, r.id]));

  for (const u of SEED_USERS) {
    const roleId = roleMap.get(u.role_name);
    if (!roleId) {
      console.warn(`Role ${u.role_name} not found, skipping ${u.email}`);
      continue;
    }

    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);

    const { rows: userRows } = await query(
      `INSERT INTO users
         (email, password_hash, first_name, last_name, role_id,
          is_active, is_verified, failed_login_attempts, locked_until, password_changed_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, 0, NULL, NOW())
       ON CONFLICT (email) DO UPDATE
         SET password_hash       = EXCLUDED.password_hash,
             first_name          = EXCLUDED.first_name,
             last_name           = EXCLUDED.last_name,
             role_id             = EXCLUDED.role_id,
             is_active           = TRUE,
             is_verified         = TRUE,
             failed_login_attempts = 0,
             locked_until        = NULL,
             password_changed_at = NOW(),
             updated_at          = NOW()
       RETURNING id, email, role_id`,
      [u.email, hash, u.first_name, u.last_name, roleId]
    );

    const user = userRows[0];
    console.log(`[SEED] Upserted user: ${user.email} (role: ${u.role_name}, id: ${user.id})`);

    // If customer role, ensure customer profile and default bank account exist
    if (u.role_name === 'customer') {
      const custNum = 'CUST-SAMDAE-001';
      const { rows: custRows } = await query(
        `INSERT INTO customers (user_id, customer_number, risk_rating, segment)
         VALUES ($1, $2, 'low', 'retail')
         ON CONFLICT (user_id) DO UPDATE
           SET updated_at = NOW()
         RETURNING id`,
        [user.id, custNum]
      );
      const customer = custRows[0];
      console.log(`[SEED] Upserted customer profile for ${u.email} (id: ${customer.id})`);

      // Ensure account exists
      const { rows: accRows } = await query(
        `SELECT id FROM accounts WHERE customer_id = $1`,
        [customer.id]
      );
      if (accRows.length === 0) {
        await query(
          `INSERT INTO accounts
             (customer_id, account_number, account_type, currency, balance, status, opened_at)
           VALUES ($1, 'ACC-SAMDAE-001', 'savings', 'INR', 75000.00, 'active', NOW())`,
          [customer.id]
        );
        console.log(`[SEED] Created default account for ${u.email}`);
      }
    }
  }
}

// If executed directly
if (process.argv[1]?.endsWith('seedUsers.js')) {
  seedAllRoleUsers()
    .then(() => {
      console.log('Role users seeding completed successfully!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
