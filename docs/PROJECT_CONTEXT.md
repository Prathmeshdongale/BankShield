# BankShield — Project Context & Database Design Reference

> **Part 1 · Section 10 — PostgreSQL Schema, ER Summary & Database Operations**

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Database Overview](#database-overview)
3. [Enums Reference](#enums-reference)
4. [Entity Relationship Summary](#entity-relationship-summary)
5. [Table Catalogue](#table-catalogue)
6. [Relationship Matrix](#relationship-matrix)
7. [Design Decisions](#design-decisions)
8. [Index Strategy](#index-strategy)
9. [Roles & Permissions Model](#roles--permissions-model)
10. [Running the Database](#running-the-database)

---

## Technology Stack

| Layer        | Technology                              |
|--------------|-----------------------------------------|
| Database     | PostgreSQL 15+ (Neon cloud / local)     |
| ORM / Query  | `pg` (node-postgres) — raw SQL + Pool   |
| Runtime      | Node.js 22 · ESM (`"type":"module"`)    |
| Auth hashing | `bcrypt` v6 (cost factor 12)            |
| ML Service   | Python / FastAPI / XGBoost (port 8000)  |
| API Server   | Express 5 (port 5000)                   |
| Client       | React + Vite (port 5173)                |

---

## Database Overview

The schema covers **21 business tables** plus 1 migration-tracking table
(`schema_migrations`), grouped into 6 functional domains:

```
┌─────────────────────────────────────────────────────────────────┐
│  IDENTITY & ACCESS        │  BANKING CORE                       │
│  roles                    │  branches                           │
│  permissions              │  customers                          │
│  role_permissions         │  customer_kyc                       │
│  users                    │  account_types                      │
│  login_history            │  accounts                           │
│                           │  cards  ·  card_limits              │
│                           │  beneficiaries                      │
├───────────────────────────┼─────────────────────────────────────┤
│  TRANSACTIONS             │  FRAUD & RISK                       │
│  transaction_categories   │  fraud_predictions                  │
│  transactions             │  fraud_alerts                       │
│                           │  fraud_investigations               │
│                           │  analyst_notes                      │
├───────────────────────────┼─────────────────────────────────────┤
│  OPERATIONS               │  SYSTEM                             │
│  notifications            │  audit_logs                         │
│  file_uploads             │  schema_migrations (runner)         │
│  reports                  │                                     │
└───────────────────────────┴─────────────────────────────────────┘
```

---

## Enums Reference

| Enum                  | Values                                                                                     |
|-----------------------|--------------------------------------------------------------------------------------------|
| `role_name`           | super_admin · admin · compliance_officer · fraud_analyst · branch_manager · teller · customer |
| `account_type_name`   | savings · current · fixed_deposit · recurring_deposit · salary · loan · business           |
| `txn_type`            | credit · debit · transfer · deposit · withdrawal · payment · reversal · fee · interest     |
| `txn_status`          | pending · processing · completed · failed · flagged · blocked · reversed                   |
| `alert_status`        | open · investigating · escalated · confirmed_fraud · false_positive · resolved · closed    |
| `alert_severity`      | low · medium · high · critical                                                             |
| `kyc_status`          | pending · submitted · verified · rejected · expired                                        |
| `card_type`           | debit · credit · prepaid · virtual                                                         |
| `card_status`         | active · inactive · blocked · expired · lost · stolen                                      |
| `investigation_status`| open · in_progress · pending_review · closed_fraud · closed_no_fraud                       |
| `notification_channel`| email · sms · push · in_app                                                                |
| `notification_status` | pending · sent · delivered · failed · read                                                 |
| `report_type`         | transaction_summary · fraud_report · audit_report · compliance_report · customer_statement · risk_report |
| `report_status`       | queued · generating · ready · failed · expired                                             |

---

## Entity Relationship Summary

### Core Chain

```
roles ──< users >── branches
            │
            └──< customers >── customer_kyc
                     │
                     ├──< accounts >── account_types
                     │        │
                     │        └──< cards >── card_limits
                     │
                     └──< beneficiaries
```

### Transaction Chain

```
accounts ──< transactions >── accounts          (source → destination)
                │
                ├──── cards
                ├──── beneficiaries
                ├──── transaction_categories
                │
                └──< fraud_predictions
                          │
                          └──< fraud_alerts >── fraud_investigations
                                    │                    │
                                    └──< analyst_notes ──┘
```

### Supporting Chain

```
users ──< notifications
users ──< audit_logs
users ──< login_history
users ──< file_uploads >── reports
users ──< analyst_notes
```

---

## Table Catalogue

### Identity & Access

#### `roles`
Primary role definitions. Uses `role_name` enum as a unique constraint.

| Column        | Type         | Notes                        |
|---------------|--------------|------------------------------|
| id            | SERIAL PK    |                              |
| name          | role_name    | UNIQUE enum value            |
| display_name  | VARCHAR(100) |                              |
| description   | TEXT         |                              |
| is_active     | BOOLEAN      | default TRUE                 |

#### `permissions`
Granular permission codes in `<module>:<action>` format.

| Column      | Type        | Notes                     |
|-------------|-------------|---------------------------|
| id          | SERIAL PK   |                           |
| code        | VARCHAR(100)| UNIQUE e.g. `fraud:investigate` |
| module      | VARCHAR(60) | e.g. `transactions`       |
| description | TEXT        |                           |

#### `role_permissions`
Many-to-many join. Composite PK `(role_id, permission_id)`.

#### `users`
Platform users (staff + customers). Links to a role and optionally a branch.

| Column                 | Type         | Notes                               |
|------------------------|--------------|-------------------------------------|
| id                     | UUID PK      |                                     |
| email                  | VARCHAR(255) | UNIQUE                              |
| phone                  | VARCHAR(20)  | UNIQUE                              |
| password_hash          | VARCHAR(255) | bcrypt hashed                       |
| role_id                | INT FK       | → roles · RESTRICT on delete        |
| branch_id              | UUID FK      | → branches · SET NULL on delete     |
| failed_login_attempts  | INT          | CHECK ≥ 0                           |
| locked_until           | TIMESTAMPTZ  | lockout expiry                      |
| deleted_at             | TIMESTAMPTZ  | soft delete                         |

#### `login_history`
Append-only login event log. BIGSERIAL PK, no soft delete.

---

### Banking Core

#### `branches`
Physical / virtual bank branches. `manager_id` → users (deferred FK).

#### `customers`
Customer profile linked 1:1 to a user account. Includes PEP flag, risk rating, and segment.

| Column       | Type          | Notes                                   |
|--------------|---------------|-----------------------------------------|
| risk_rating  | VARCHAR(10)   | low / medium / high / very_high         |
| is_pep       | BOOLEAN       | Politically Exposed Person flag         |
| segment      | VARCHAR(50)   | retail / premium / corporate / vip      |

#### `customer_kyc`
KYC document records per customer. Multiple docs per customer allowed.
Uses `kyc_status` enum. `verified_by` → users (SET NULL on delete).

#### `account_types`
Master reference: savings, current, FD, etc. Stores min balance, interest rate, daily limit.

#### `accounts`
Bank accounts. `account_number` is UNIQUE and indexed.
`status` enum: pending → active → dormant / frozen / closed.
Supports joint accounts via `joint_holder_id`.

#### `cards`
Debit / credit / prepaid / virtual cards. PAN stored as bcrypt hash in `card_number_hash`;
only `card_last4` is plaintext. Uses `card_status` enum.

#### `card_limits`
Per-card limit rules by `limit_type` (daily_atm, daily_pos, daily_online, etc.).
UNIQUE on `(card_id, limit_type)` — only one active limit per type per card.

#### `beneficiaries`
Saved payees per customer. Stores IFSC / SWIFT codes. Soft-deletable.

---

### Transactions

#### `transaction_categories`
Hierarchical categories (self-referencing `parent_id`).

#### `transactions`
**Append-only ledger — no `deleted_at`, no hard deletes.**

| Column               | Type          | Notes                                        |
|----------------------|---------------|----------------------------------------------|
| transaction_ref      | VARCHAR(40)   | UNIQUE human-readable ref (TXN-YYYYMMDD-XXX) |
| source_account_id    | UUID FK       | → accounts · RESTRICT                        |
| destination_account_id | UUID FK    | → accounts · RESTRICT                        |
| amount_in_base       | NUMERIC       | GENERATED ALWAYS AS amount × exchange_rate   |
| risk_score           | NUMERIC(6,4)  | 0.0000–1.0000, ML-assigned                   |
| is_fraud             | BOOLEAN       | set by fraud_predictions                     |
| reversal_txn_id      | UUID FK       | self-ref for reversal chain                  |
| channel              | VARCHAR(30)   | web/mobile/atm/pos/branch/upi/neft/rtgs/imps |
| metadata             | JSONB         | extensible payload                           |

---

### Fraud & Risk

#### `fraud_predictions`
Raw ML model output per transaction. Stores `feature_vector` and `explanation`
(SHAP values) as JSONB. `inference_ms` tracks model latency.

#### `fraud_alerts`
Actionable alert created when risk_score exceeds threshold.
`trigger_reasons` is a JSONB array. Uses `alert_severity` and `alert_status` enums.
`assigned_to` → analyst user. Soft-deletable.

#### `fraud_investigations`
Formal case opened for a fraud alert. `case_number` is UNIQUE.
Uses `investigation_status` enum. `evidence_urls` is JSONB array.

#### `analyst_notes`
Free-text notes attached to either an alert or an investigation (CHECK constraint
ensures at least one link). BIGSERIAL PK, soft-deletable.

---

### Operations

#### `notifications`
Per-user messages across channels (email / SMS / push / in_app).
`related_entity` + `related_id` allow polymorphic linking.

#### `file_uploads`
Metadata for uploaded files. Actual binary lives in cloud storage (`bucket`/`storage_path`).
`related_entity` + `related_id` allow polymorphic linking.

#### `reports`
Async report generation jobs. Links to a `file_uploads` row once complete.
Uses `report_type` and `report_status` enums.

---

### System

#### `audit_logs`
Append-only system audit trail. BIGSERIAL PK. No soft delete.
`old_value` / `new_value` JSONB for before/after diffs.

---

## Relationship Matrix

| From                  | To                    | Cardinality | FK behaviour    |
|-----------------------|-----------------------|-------------|-----------------|
| users                 | roles                 | N:1         | RESTRICT        |
| users                 | branches              | N:1         | SET NULL        |
| customers             | users                 | 1:1         | CASCADE         |
| customer_kyc          | customers             | N:1         | CASCADE         |
| accounts              | customers             | N:1         | RESTRICT        |
| accounts              | branches              | N:1         | SET NULL        |
| accounts              | account_types         | N:1         | RESTRICT        |
| cards                 | accounts              | N:1         | RESTRICT        |
| cards                 | customers             | N:1         | RESTRICT        |
| card_limits           | cards                 | N:1         | CASCADE         |
| beneficiaries         | customers             | N:1         | CASCADE         |
| transactions          | accounts (source)     | N:1         | RESTRICT        |
| transactions          | accounts (dest)       | N:1         | RESTRICT        |
| transactions          | cards                 | N:1         | SET NULL        |
| transactions          | beneficiaries         | N:1         | SET NULL        |
| transactions          | transaction_categories| N:1         | SET NULL        |
| transactions          | transactions (reversal)| N:1        | RESTRICT        |
| fraud_predictions     | transactions          | N:1         | RESTRICT        |
| fraud_alerts          | transactions          | N:1         | RESTRICT        |
| fraud_alerts          | fraud_predictions     | N:1         | SET NULL        |
| fraud_investigations  | fraud_alerts          | N:1         | RESTRICT        |
| analyst_notes         | fraud_investigations  | N:1         | CASCADE         |
| analyst_notes         | fraud_alerts          | N:1         | CASCADE         |
| notifications         | users                 | N:1         | CASCADE         |
| audit_logs            | users                 | N:1         | SET NULL        |
| login_history         | users                 | N:1         | CASCADE         |
| file_uploads          | users                 | N:1         | RESTRICT        |
| reports               | users                 | N:1         | RESTRICT        |
| reports               | file_uploads          | N:1         | SET NULL        |
| role_permissions      | roles                 | N:1         | CASCADE         |
| role_permissions      | permissions           | N:1         | CASCADE         |

---

## Design Decisions

### Primary Keys
- **UUID v4** — all user-facing / business entity tables (users, accounts, transactions, etc.)
  for security (non-enumerable IDs) and distributed-safe generation.
- **SERIAL / BIGSERIAL** — high-volume append-only tables (audit_logs, login_history,
  fraud_predictions, analyst_notes, notifications, card_limits) where sequential PKs
  are safe and improve insert / range-scan performance.
- **SERIAL** — small reference tables (roles, permissions, account_types, transaction_categories).

### Soft Deletes
`deleted_at TIMESTAMPTZ` is present on all **mutable business tables**:

```
users · customers · customer_kyc · branches
accounts · cards · beneficiaries
fraud_alerts · fraud_investigations · analyst_notes
file_uploads · reports
```

Partial indexes `WHERE deleted_at IS NULL` keep queries fast on active rows.

### Immutable Tables (no soft delete)
`transactions`, `audit_logs`, `login_history`, `fraud_predictions` — these are
financial / regulatory records that must never be modified or hidden.

### Computed Column
`transactions.amount_in_base` is a **GENERATED ALWAYS AS** stored column
(`amount × exchange_rate`) — no application code needed to keep it in sync.

### Trigger-maintained `updated_at`
A single `set_updated_at()` PL/pgSQL function powers `BEFORE UPDATE` triggers
on all 17 mutable tables, ensuring timestamps are always accurate regardless of
which query path updates a row.

### Card PAN Security
`cards.card_number_hash` stores a bcrypt/pgcrypto hash of the full PAN.
`cards.card_last4` is the only plaintext digit data stored, sufficient for UI display.

---

## Index Strategy

### Critical Lookup Indexes
| Column(s)                          | Table          | Reason                              |
|------------------------------------|----------------|-------------------------------------|
| `account_number`                   | accounts       | Core lookup for all banking ops     |
| `transaction_ref`                  | transactions   | Human-readable TXN reference lookup |
| `source_account_id, created_at`    | transactions   | Account statement queries           |
| `is_fraud` (partial: WHERE TRUE)   | transactions   | Fast fraud-flagged tx scan          |
| `risk_score DESC`                  | transactions   | Risk dashboard sorting              |
| `customer_id`                      | accounts       | Customer account listing            |
| `status`                           | fraud_alerts   | Alert triage queues                 |
| `severity`                         | fraud_alerts   | Severity filtering                  |
| `case_number`                      | fraud_investigations | Case lookup                   |

### Partial Indexes on Soft Deletes
All `deleted_at` columns have `WHERE deleted_at IS NULL` partial indexes, keeping
active-record queries efficient without filtering costs.

### Time-Series Indexes
`created_at DESC` indexes on transactions, fraud_alerts, notifications, audit_logs,
and reports for efficient pagination and time-range queries.

---

## Roles & Permissions Model

### Role Hierarchy

```
super_admin          ← all 34 permissions
  └── admin          ← all except system:seed/migrate
        └── compliance_officer  ← read + KYC + fraud + audit + reports
              └── fraud_analyst ← fraud + read-only on banking
                    └── branch_manager  ← branch ops + customer onboarding
                          └── teller    ← customer/account/transaction read+create
                                └── customer  ← own account + transactions
```

### Permission Modules (34 codes)

| Module         | Permissions                                              |
|----------------|----------------------------------------------------------|
| `users`        | read · create · update · delete · manage_roles           |
| `customers`    | read · create · update · kyc_verify                      |
| `accounts`     | read · create · update · freeze · close                  |
| `transactions` | read · create · reverse · export                         |
| `cards`        | read · block · manage_limits                             |
| `fraud`        | read_alerts · manage_alerts · investigate · add_notes · view_ml |
| `reports`      | read · create · export                                   |
| `audit`        | read · export                                            |
| `system`       | config · seed · migrate                                  |

---

## Running the Database

### Prerequisites
```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```
Set in `server/.env`.  Optionally set:
```
SUPER_ADMIN_EMAIL=superadmin@bankshield.internal
SUPER_ADMIN_PASSWORD=<strong-password>
```

### Commands

```bash
# From the server/ directory:

# 1. Apply all pending migrations (idempotent)
npm run migrate

# 2. Check migration status without applying
npm run migrate:status

# 3. Seed roles, permissions, and super-admin
npm run seed

# 4. One-shot: migrate + seed
npm run db:setup
```

### What each command does

| Command               | Action                                                          |
|-----------------------|-----------------------------------------------------------------|
| `npm run migrate`     | Reads `schema.sql`, applies if not already tracked             |
| `npm run migrate:status` | Lists applied/pending migrations with timestamps            |
| `npm run seed`        | Upserts 7 roles, 34 permissions, role-permission map, 1 super-admin |
| `npm run db:setup`    | Runs both in sequence — safe for fresh databases                |

### Re-running safely
All operations use `ON CONFLICT … DO UPDATE` or `DO NOTHING` — re-running
`db:setup` on an existing database will not create duplicates or reset data.

---

*Generated by Kiro — BankShield database design, Part 1 Section 10*
