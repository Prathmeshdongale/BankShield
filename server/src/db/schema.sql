-- ============================================================================
-- BankShield PostgreSQL Schema  — Part 1, Section 10
-- 21 tables | UUIDs + BIGSERIAL PKs | soft deletes | audit indexes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 0b. Drop legacy v0 tables (old minimal schema — safe in dev/test)
--     These are replaced by the full schema below.
--     CASCADE handles any FKs from the old schema.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS fraud_alerts  CASCADE;
DROP TABLE IF EXISTS audit_logs    CASCADE;
DROP TABLE IF EXISTS transactions  CASCADE;
DROP TABLE IF EXISTS accounts      CASCADE;
DROP TABLE IF EXISTS users         CASCADE;

-- ---------------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE role_name AS ENUM (
    'super_admin',
    'admin',
    'compliance_officer',
    'fraud_analyst',
    'branch_manager',
    'teller',
    'customer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_type_name AS ENUM (
    'savings',
    'current',
    'fixed_deposit',
    'recurring_deposit',
    'salary',
    'loan',
    'business'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE txn_type AS ENUM (
    'credit',
    'debit',
    'transfer',
    'deposit',
    'withdrawal',
    'payment',
    'reversal',
    'fee',
    'interest'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE txn_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'flagged',
    'blocked',
    'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM (
    'open',
    'investigating',
    'escalated',
    'confirmed_fraud',
    'false_positive',
    'resolved',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE card_type AS ENUM ('debit', 'credit', 'prepaid', 'virtual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE card_status AS ENUM ('active', 'inactive', 'blocked', 'expired', 'lost', 'stolen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE investigation_status AS ENUM (
    'open', 'in_progress', 'pending_review', 'closed_fraud', 'closed_no_fraud'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'read');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_type AS ENUM (
    'transaction_summary', 'fraud_report', 'audit_report',
    'compliance_report', 'customer_statement', 'risk_report'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('queued', 'generating', 'ready', 'failed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        role_name         NOT NULL UNIQUE,
  display_name VARCHAR(100)     NOT NULL,
  description TEXT,
  is_active   BOOLEAN           NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(100)  NOT NULL UNIQUE,  -- e.g. 'transactions:read'
  description TEXT,
  module      VARCHAR(60),                    -- e.g. 'transactions', 'fraud'
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- role_permissions (many-to-many)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT  NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
  permission_id INT  NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- 4. branches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(150) NOT NULL,
  address     TEXT,
  city        VARCHAR(100),
  state       VARCHAR(100),
  country     VARCHAR(80)  NOT NULL DEFAULT 'India',
  phone       VARCHAR(20),
  email       VARCHAR(255),
  manager_id  UUID,                           -- FK added after users table
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 5. users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  phone           VARCHAR(20)  UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  role_id         INT          NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  branch_id       UUID         REFERENCES branches(id) ON DELETE SET NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  is_verified     BOOLEAN      NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  failed_login_attempts INT    NOT NULL DEFAULT 0
                               CHECK (failed_login_attempts >= 0),
  locked_until    TIMESTAMPTZ,
  avatar_url      TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Now add the FK from branches.manager_id → users.id
ALTER TABLE branches
  ADD CONSTRAINT fk_branches_manager
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  customer_number VARCHAR(20) NOT NULL UNIQUE,
  date_of_birth   DATE,
  gender          VARCHAR(10) CHECK (gender IN ('male','female','other','prefer_not_to_say')),
  nationality     VARCHAR(80),
  occupation      VARCHAR(150),
  annual_income   NUMERIC(15,2) CHECK (annual_income >= 0),
  risk_rating     VARCHAR(10) DEFAULT 'low'
                              CHECK (risk_rating IN ('low','medium','high','very_high')),
  is_pep          BOOLEAN     NOT NULL DEFAULT FALSE,  -- Politically Exposed Person
  segment         VARCHAR(50) DEFAULT 'retail'
                              CHECK (segment IN ('retail','premium','corporate','vip')),
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 7. customer_kyc
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_kyc (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  doc_type        VARCHAR(60) NOT NULL
                              CHECK (doc_type IN (
                                'passport','national_id','driving_licence',
                                'voter_id','aadhaar','pan','utility_bill','other'
                              )),
  doc_number      VARCHAR(100),
  doc_url         TEXT,
  expiry_date     DATE,
  status          kyc_status  NOT NULL DEFAULT 'pending',
  verified_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 8. account_types
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_types (
  id              SERIAL      PRIMARY KEY,
  type_name       account_type_name NOT NULL UNIQUE,
  description     TEXT,
  min_balance     NUMERIC(15,2) NOT NULL DEFAULT 0.00
                                CHECK (min_balance >= 0),
  interest_rate   NUMERIC(6,4)  NOT NULL DEFAULT 0.0000
                                CHECK (interest_rate >= 0),
  max_daily_limit NUMERIC(15,2) CHECK (max_daily_limit > 0),
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 9. accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_number  VARCHAR(34) NOT NULL UNIQUE,
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id       UUID        REFERENCES branches(id)  ON DELETE SET NULL,
  account_type_id INT         NOT NULL REFERENCES account_types(id) ON DELETE RESTRICT,
  currency        VARCHAR(3)  NOT NULL DEFAULT 'INR',
  balance         NUMERIC(17,2) NOT NULL DEFAULT 0.00
                                CHECK (balance >= -9999999999999.99), -- allow overdraft config
  available_balance NUMERIC(17,2) NOT NULL DEFAULT 0.00,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                              CHECK (status IN ('pending','active','dormant','frozen','closed')),
  opened_at       DATE        NOT NULL DEFAULT CURRENT_DATE,
  closed_at       DATE,
  nominee_name    VARCHAR(150),
  joint_holder_id UUID        REFERENCES customers(id) ON DELETE SET NULL,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 10. cards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  card_number_hash VARCHAR(255) NOT NULL UNIQUE,   -- hashed PAN
  card_last4      VARCHAR(4)  NOT NULL,
  card_type       card_type   NOT NULL DEFAULT 'debit',
  network         VARCHAR(20) CHECK (network IN ('visa','mastercard','rupay','amex','other')),
  expiry_month    SMALLINT    NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year     SMALLINT    NOT NULL CHECK (expiry_year >= 2024),
  status          card_status NOT NULL DEFAULT 'active',
  issued_at       DATE        NOT NULL DEFAULT CURRENT_DATE,
  activated_at    TIMESTAMPTZ,
  blocked_at      TIMESTAMPTZ,
  blocked_reason  TEXT,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 11. card_limits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_limits (
  id              BIGSERIAL   PRIMARY KEY,
  card_id         UUID        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  limit_type      VARCHAR(30) NOT NULL
                              CHECK (limit_type IN (
                                'daily_atm','daily_pos','daily_online',
                                'single_txn','monthly','contactless'
                              )),
  amount_limit    NUMERIC(15,2) NOT NULL CHECK (amount_limit > 0),
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  effective_from  DATE        NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (card_id, limit_type)
);

-- ---------------------------------------------------------------------------
-- 12. beneficiaries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beneficiaries (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  nickname        VARCHAR(100),
  beneficiary_name VARCHAR(150) NOT NULL,
  account_number  VARCHAR(34) NOT NULL,
  bank_name       VARCHAR(150),
  ifsc_code       VARCHAR(20),
  swift_code      VARCHAR(20),
  bank_country    VARCHAR(80) NOT NULL DEFAULT 'India',
  is_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  max_txn_limit   NUMERIC(15,2) CHECK (max_txn_limit > 0),
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 13. transaction_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_categories (
  id          SERIAL      PRIMARY KEY,
  code        VARCHAR(50) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  parent_id   INT         REFERENCES transaction_categories(id) ON DELETE SET NULL,
  icon        VARCHAR(50),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 14. transactions  (NO hard deletes — append-only ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_ref       VARCHAR(40) NOT NULL UNIQUE,  -- human-readable TXN-YYYYMMDD-XXXXXXXX
  source_account_id     UUID        REFERENCES accounts(id) ON DELETE RESTRICT,
  destination_account_id UUID       REFERENCES accounts(id) ON DELETE RESTRICT,
  card_id               UUID        REFERENCES cards(id)    ON DELETE SET NULL,
  beneficiary_id        UUID        REFERENCES beneficiaries(id) ON DELETE SET NULL,
  category_id           INT         REFERENCES transaction_categories(id) ON DELETE SET NULL,
  amount                NUMERIC(17,2) NOT NULL CHECK (amount > 0),
  currency              VARCHAR(3)  NOT NULL DEFAULT 'INR',
  exchange_rate         NUMERIC(12,6) NOT NULL DEFAULT 1.000000,
  amount_in_base        NUMERIC(17,2) GENERATED ALWAYS AS (amount * exchange_rate) STORED,
  txn_type              txn_type    NOT NULL,
  status                txn_status  NOT NULL DEFAULT 'pending',
  description           TEXT,
  merchant_name         VARCHAR(150),
  merchant_category     VARCHAR(80),
  ip_address            INET,
  device_fingerprint    VARCHAR(255),
  location_city         VARCHAR(100),
  location_country      VARCHAR(80),
  latitude              NUMERIC(10,7),
  longitude             NUMERIC(10,7),
  channel               VARCHAR(30)
                        CHECK (channel IN (
                          'web','mobile','atm','pos','branch','upi',
                          'neft','rtgs','imps','api'
                        )),
  risk_score            NUMERIC(6,4) NOT NULL DEFAULT 0.0000
                                     CHECK (risk_score BETWEEN 0 AND 1),
  is_fraud              BOOLEAN      NOT NULL DEFAULT FALSE,
  flagged_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  reversed_at           TIMESTAMPTZ,
  reversal_txn_id       UUID        REFERENCES transactions(id) ON DELETE RESTRICT,
  metadata              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO deleted_at — transactions are immutable ledger records
);

-- ---------------------------------------------------------------------------
-- 15. fraud_predictions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fraud_predictions (
  id              BIGSERIAL   PRIMARY KEY,
  transaction_id  UUID        NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  model_version   VARCHAR(50) NOT NULL,
  risk_score      NUMERIC(6,4) NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
  is_fraud        BOOLEAN      NOT NULL,
  confidence      NUMERIC(6,4) CHECK (confidence BETWEEN 0 AND 1),
  feature_vector  JSONB,       -- raw ML features snapshot
  explanation     JSONB,       -- SHAP values / top features
  inference_ms    INT,         -- latency in milliseconds
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 16. fraud_alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fraud_alerts (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID        NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  prediction_id   BIGINT      REFERENCES fraud_predictions(id) ON DELETE SET NULL,
  risk_score      NUMERIC(6,4) NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
  severity        alert_severity NOT NULL DEFAULT 'medium',
  status          alert_status   NOT NULL DEFAULT 'open',
  trigger_reasons JSONB,       -- array of rule/model trigger strings
  assigned_to     UUID        REFERENCES users(id) ON DELETE SET NULL,
  assigned_at     TIMESTAMPTZ,
  first_reviewed_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  auto_resolved   BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 17. fraud_investigations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fraud_investigations (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id        UUID        NOT NULL REFERENCES fraud_alerts(id) ON DELETE RESTRICT,
  case_number     VARCHAR(40) NOT NULL UNIQUE,
  status          investigation_status NOT NULL DEFAULT 'open',
  priority        VARCHAR(10) NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('low','medium','high','critical')),
  opened_by       UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to     UUID        REFERENCES users(id) ON DELETE SET NULL,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  outcome         TEXT,
  evidence_urls   JSONB,       -- array of file/URL refs
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 18. analyst_notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analyst_notes (
  id              BIGSERIAL   PRIMARY KEY,
  investigation_id UUID       REFERENCES fraud_investigations(id) ON DELETE CASCADE,
  alert_id        UUID        REFERENCES fraud_alerts(id)         ON DELETE CASCADE,
  author_id       UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note_text       TEXT        NOT NULL,
  is_internal     BOOLEAN     NOT NULL DEFAULT TRUE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_note_context CHECK (
    investigation_id IS NOT NULL OR alert_id IS NOT NULL
  )
);

-- ---------------------------------------------------------------------------
-- 19. notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  body            TEXT         NOT NULL,
  channel         notification_channel   NOT NULL DEFAULT 'in_app',
  status          notification_status    NOT NULL DEFAULT 'pending',
  related_entity  VARCHAR(50),   -- e.g. 'transaction', 'fraud_alert'
  related_id      UUID,
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 20. audit_logs  (append-only — no soft delete)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  session_id      VARCHAR(100),
  action          VARCHAR(100) NOT NULL,    -- e.g. 'USER_LOGIN', 'TXN_FLAGGED'
  entity_type     VARCHAR(60),              -- e.g. 'transaction', 'user'
  entity_id       TEXT,                     -- UUID or other PK as text
  old_value       JSONB,
  new_value       JSONB,
  ip_address      INET,
  user_agent      TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'success'
                               CHECK (status IN ('success','failure','blocked')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 21. login_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_history (
  id              BIGSERIAL   PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address      INET,
  user_agent      TEXT,
  device_type     VARCHAR(30)
                  CHECK (device_type IN ('desktop','mobile','tablet','api','unknown')),
  location_city   VARCHAR(100),
  location_country VARCHAR(80),
  status          VARCHAR(20) NOT NULL DEFAULT 'success'
                              CHECK (status IN ('success','failed','blocked','mfa_required')),
  failure_reason  VARCHAR(150),
  logged_in_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_out_at   TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 22. file_uploads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS file_uploads (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploader_id     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_name   VARCHAR(255) NOT NULL,
  stored_name     VARCHAR(255) NOT NULL UNIQUE,
  mime_type       VARCHAR(100),
  file_size       BIGINT      CHECK (file_size > 0),
  storage_path    TEXT        NOT NULL,
  bucket          VARCHAR(100),
  related_entity  VARCHAR(50),
  related_id      TEXT,
  is_public       BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 23. reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type     report_type NOT NULL,
  title           VARCHAR(255) NOT NULL,
  requested_by    UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parameters      JSONB,       -- date ranges, filters, etc.
  status          report_status NOT NULL DEFAULT 'queued',
  file_upload_id  UUID        REFERENCES file_uploads(id) ON DELETE SET NULL,
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- users
CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id        ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_branch_id      ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at     ON users(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at     ON users(created_at DESC);

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_user_id        ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_customers_risk_rating     ON customers(risk_rating);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at      ON customers(deleted_at) WHERE deleted_at IS NULL;

-- customer_kyc
CREATE INDEX IF NOT EXISTS idx_kyc_customer_id  ON customer_kyc(customer_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status       ON customer_kyc(status);

-- accounts
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_customer_id    ON accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status         ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_deleted_at     ON accounts(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_created_at     ON accounts(created_at DESC);

-- cards
CREATE INDEX IF NOT EXISTS idx_cards_account_id   ON cards(account_id);
CREATE INDEX IF NOT EXISTS idx_cards_customer_id  ON cards(customer_id);
CREATE INDEX IF NOT EXISTS idx_cards_status       ON cards(status);

-- beneficiaries
CREATE INDEX IF NOT EXISTS idx_beneficiaries_customer_id ON beneficiaries(customer_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_deleted_at  ON beneficiaries(deleted_at) WHERE deleted_at IS NULL;

-- transactions  ← most critical indexes
CREATE INDEX IF NOT EXISTS idx_txn_transaction_ref        ON transactions(transaction_ref);
CREATE INDEX IF NOT EXISTS idx_txn_source_account_id      ON transactions(source_account_id);
CREATE INDEX IF NOT EXISTS idx_txn_dest_account_id        ON transactions(destination_account_id);
CREATE INDEX IF NOT EXISTS idx_txn_customer_source        ON transactions(source_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_status                 ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_txn_is_fraud               ON transactions(is_fraud) WHERE is_fraud = TRUE;
CREATE INDEX IF NOT EXISTS idx_txn_risk_score             ON transactions(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_txn_created_at             ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_card_id                ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_txn_channel                ON transactions(channel);

-- fraud_predictions
CREATE INDEX IF NOT EXISTS idx_fp_transaction_id  ON fraud_predictions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fp_is_fraud        ON fraud_predictions(is_fraud);
CREATE INDEX IF NOT EXISTS idx_fp_created_at      ON fraud_predictions(created_at DESC);

-- fraud_alerts
CREATE INDEX IF NOT EXISTS idx_fa_transaction_id  ON fraud_alerts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_fa_status          ON fraud_alerts(status);
CREATE INDEX IF NOT EXISTS idx_fa_severity        ON fraud_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_fa_assigned_to     ON fraud_alerts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_fa_created_at      ON fraud_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fa_deleted_at      ON fraud_alerts(deleted_at) WHERE deleted_at IS NULL;

-- fraud_investigations
CREATE INDEX IF NOT EXISTS idx_fi_alert_id        ON fraud_investigations(alert_id);
CREATE INDEX IF NOT EXISTS idx_fi_case_number     ON fraud_investigations(case_number);
CREATE INDEX IF NOT EXISTS idx_fi_status          ON fraud_investigations(status);
CREATE INDEX IF NOT EXISTS idx_fi_assigned_to     ON fraud_investigations(assigned_to);

-- analyst_notes
CREATE INDEX IF NOT EXISTS idx_an_investigation_id ON analyst_notes(investigation_id);
CREATE INDEX IF NOT EXISTS idx_an_alert_id         ON analyst_notes(alert_id);
CREATE INDEX IF NOT EXISTS idx_an_author_id        ON analyst_notes(author_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notif_user_id   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_status    ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notif_created_at ON notifications(created_at DESC);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_user_id     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action      ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_logs(created_at DESC);

-- login_history
CREATE INDEX IF NOT EXISTS idx_lh_user_id      ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_lh_logged_in_at ON login_history(logged_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_lh_status       ON login_history(status);

-- file_uploads
CREATE INDEX IF NOT EXISTS idx_fu_uploader_id  ON file_uploads(uploader_id);
CREATE INDEX IF NOT EXISTS idx_fu_related      ON file_uploads(related_entity, related_id);
CREATE INDEX IF NOT EXISTS idx_fu_deleted_at   ON file_uploads(deleted_at) WHERE deleted_at IS NULL;

-- reports
CREATE INDEX IF NOT EXISTS idx_reports_requested_by ON reports(requested_by);
CREATE INDEX IF NOT EXISTS idx_reports_status       ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at   ON reports(created_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION  (auto-stamp updated_at on every UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'roles','branches','users','customers','customer_kyc',
    'account_types','accounts','cards','card_limits',
    'beneficiaries','transactions','fraud_alerts',
    'fraud_investigations','analyst_notes','notifications',
    'file_uploads','reports'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      tbl, tbl
    );
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
