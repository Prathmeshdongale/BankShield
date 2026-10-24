I am building BankShield, an AI fraud detection banking platform.
Stack: React+Vite+JS+Tailwind+shadcn (client), Node+Express+pg (server),
PostgreSQL, FastAPI+XGBoost (ml-service). No ORM, use raw SQL via pg.

Using the folder structures from Part 1 (sections 8 and 9), create every
folder and placeholder file under client/, server/src/, and ml-service/.
Also write:
1. server/src/app.js (express, helmet, cors, json parser, rate limiter, health route)
2. server/src/server.js (loads dotenv, starts app)
3. server/src/db/connection.js (pg Pool, export query() and getClient() for transactions)
4. ml-service/app/main.py (FastAPI with GET /health)
5. Tailwind + shadcn configured in client with a basic App.jsx and router

Output: file tree, then each file in a code block with its path.
End with run commands and verification checks.




Using section 10 of Part 1, write server/src/db/schema.sql for PostgreSQL:
users, roles, permissions, branches, customers, customer_kyc, accounts,
account_types, cards, card_limits, beneficiaries, transactions,
transaction_categories, fraud_predictions, fraud_alerts, fraud_investigations,
analyst_notes, notifications, audit_logs, login_history, file_uploads, reports.

Rules: UUID or BIGSERIAL PKs, FKs with proper ON DELETE, CHECK constraints,
soft deletes (deleted_at) on business tables, NO deletes on transactions,
indexes on account_number, transaction_id, customer_id, fraud status,
created_at. Include enums for roles, account type, txn type, alert status.
Also write: a migration runner script (server/src/db/migrate.js) and
seeds for 7 roles + a super admin user (bcrypt hashed).
Provide an ER summary and verify commands.


Prompt 3:
Build the auth module for the Express server (raw SQL via pg):
register (admin-only), login, logout, refresh token, forgot/reset password,
change password, profile update. JWT access (15m) + refresh (7d), bcrypt,
login_history logging, rate limit on login.
Add middleware: authenticate, authorize(...roles) implementing the RBAC
matrix from section 4 of Part 1. Add express-validator validators.
Structure: routes -> controllers -> services -> db/queries.
Give curl commands to test each endpoint and a test for role denial.


STEP 4: Customers, KYC, Branches
Prompt 4:
Build modules: branches, customers (create/update/view/deactivate/search,
pagination, filters), KYC (status + document upload with Multer, file type
and size validation). Apply RBAC per section 4. Write audit_logs entries
for every write. Include curl tests and verification steps.


STEP 5: Accounts + Cards
Prompt 5:
Build accounts (open/close/freeze/activate/balance/history; types Savings,
Current, Salary, Business) and cards (issue debit/credit, block/unblock,
replace, set limits, view). Generate account numbers safely, mask card
numbers in responses (never return full PAN). Enforce RBAC and audit logs.
Include tests.


STEP 6: Transaction Engine (ACID)
Prompt 6:
Build the transaction module: deposit, withdrawal, fund transfer, card
payment, UPI/online/ATM simulations. Use BEGIN/COMMIT/ROLLBACK with
SELECT ... FOR UPDATE on balances. Enforce idempotency keys (no duplicate
transactions), card limits, frozen-account checks. Transactions are
immutable. Leave a clearly marked hook function scoreTransaction(txn)
where fraud scoring will plug in. Include concurrency test steps
(two simultaneous withdrawals).


STEP 7: ML Model Training
Prompt 7:
In ml-service, write notebooks/train.py to train an XGBoost fraud model.
Dataset: use the Kaggle Credit Card Fraud dataset or generate a realistic
synthetic banking dataset (amount, hour, merchant category, country
mismatch, velocity in the last 1h/24h, device change, balance ratio, etc.).
Handle class imbalance (scale_pos_weight), stratified split, report
precision/recall/F1/ROC-AUC/PR-AUC, pick a threshold, save with joblib to
trained_models/. Output metrics table and how to run.


STEP 8: FastAPI Inference Service
Prompt 8:
Build the FastAPI service: POST /predict with a Pydantic schema, loads the
joblib model once at startup, returns fraud_probability, prediction,
risk_score (0-100), risk_level (LOW/MEDIUM/HIGH/CRITICAL). Add /health,
input validation, logging, latency < 1s. Include curl test examples and
a pytest. 



STEP 9: Fraud Integration + Alerts
Prompt 9:
Integrate the ML service into the Express transaction flow: compute
features (velocity, amount vs average, new device/country), call
/predict with timeout + fallback rules if the ML service is down, store in
fraud_predictions, auto-create fraud_alerts for HIGH/CRITICAL, optionally
hold the transaction pending review. Trigger notifications (Nodemailer).
Give end-to-end test steps.

STEP 10: Investigation Workflow
Prompt 10:
Build the fraud investigation module: list flagged transactions, assign
analyst, notes, approve/reject alert, freeze account, status transitions
(OPEN → IN_REVIEW → CONFIRMED_FRAUD / FALSE_POSITIVE), audit trail,
notifications on assignment. RBAC: Fraud Analyst only for writes.


STEP 11: Reports + Notifications
Prompt 11:
Build reports: Daily Transaction, Fraud Summary, Analyst Performance,
Customer Activity, Monthly Risk. Export PDF (PDFKit), Excel (ExcelJS), CSV.
Add the notifications module (list, mark read) and email templates.


STEP 12: Dashboard API
Prompt 12:
Build dashboard endpoints: total transactions, fraud rate, active alerts,
risk distribution, recent activity, 30-day trend. Optimize with indexed SQL
aggregates. Target < 3s. Role-scoped data (branch manager sees branch only).


STEP 13: Frontend Foundation
Prompt 13:
Build the React foundation: Axios instance with JWT interceptor and
refresh-token retry, AuthContext, protected routes with role guards,
layout (sidebar + topbar) driven by role, login/forgot/reset pages with
React Hook Form, toast + loading + error components, dark/light theme. 


STEP 14: Frontend Modules
Run these as separate prompts, in this order:

14a	Customers + KYC pages (table, search, filters, pagination, forms, upload)
14b	Accounts + Cards pages
14c	Transactions page + "make a transaction" form
14d	Fraud alerts + investigation UI (risk badge, notes, approve/reject)
14e	Dashboard (Recharts: fraud rate, risk distribution, trend)
14f	Reports + exports, Audit logs, Profile/Settings
14g	Customer portal (own accounts, cards, transactions, alerts)

Template for each:

Build the [module] pages in client/src/pages/[folder]/ using shadcn/ui,
Tailwind, React Hook Form, and the existing Axios service layer. Include
loading/empty/error states and role-based UI hiding. List files and
verification steps.