# BankShield — AI Fraud Detection & Transaction Intelligence Platform

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.0-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![XGBoost](https://img.shields.io/badge/XGBoost-1.7%2B-EB5424)](https://xgboost.readthedocs.io/)
[![SHAP](https://img.shields.io/badge/SHAP-Explainable_AI-blue)](https://shap.readthedocs.io/)

---

## 1. Executive Summary & Problem Statement

Financial fraud cost the global economy over $485 billion in recent years, with synthetic identity theft, unauthorized card-not-present transactions, account takeovers, and lightning-fast digital payment exploits proliferating. Traditional rule-based fraud detection systems face critical limitations:
1. **High False Positive Rates**: Rigid heuristics freeze legitimate accounts, driving customer churn and straining support centers.
2. **Detection Latency**: Offline batch analysis flags fraudulent activity hours or days after funds have already been settled and laundered.
3. **Ledger Inconsistencies**: Naive transaction handling frequently creates race conditions, double-spending, or balance discrepancies when blocked transactions partially mutate balances.
4. **Lack of Explainability**: Black-box ML models leave fraud analysts without actionable evidence, making regulatory compliance (such as RBI and GDPR mandates) difficult.

**BankShield** resolves these challenges by uniting an **ACID-safe, concurrency-controlled core banking ledger** with an **asynchronous real-time ML inference pipeline**. BankShield scores every transaction across 18 behavioral and velocity signals using **XGBoost** with **SHAP TreeExplainer** explanations, enforcing pre-settlement blocks for high-risk fraud while maintaining sub-millisecond response times for clean transactions.

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                                     │
│  React 19 + Vite (Tailwind CSS, Lucide Icons, Recharts, React Hook Form)     │
│  Role-Based Portals: Customer, Teller, Branch Manager, Fraud Analyst, Admin │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ HTTP / REST (/api/*)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                     │
│  Node.js (v22+) & Express 5 (ESM)                                            │
│  • JWT Auth (15m Access Token, 7d Rolling Refresh Token)                      │
│  • Fine-Grained RBAC (7 Roles, 34 Permissions)                              │
│  • Configurable Adaptive Rate Limiting                                      │
└───────┬──────────────────────────────┬───────────────────────────────┬───────┘
        │                              │                               │
        │ SQL Pool (node-postgres)     │ HTTP (POST /predict)          │ Events
        ▼                              ▼                               ▼
┌─────────────────────────┐  ┌─────────────────────────┐  ┌───────────────────┐
│   POSTGRESQL LEDGER     │  │   FASTAPI ML ENGINE     │  │  NOTIFICATIONS    │
│  • Advisory Locking     │  │  • XGBoost Classifier   │  │  • In-App Inbox   │
│  • Deterministic UUID   │  │  • SHAP TreeExplainer   │  │  • Email Alerts   │
│    Lock Ordering        │  │  • 18 Velocity Features │  │  • Audit Trail    │
│  • Idempotency Engine   │  │  • Fallback Heuristics  │  └───────────────────┘
│  • Compensating Ledger  │  │  • Circuit Breaker      │
│    Reversals            │  └─────────────────────────┘
└─────────────────────────┘
```

---

## 3. Key Capabilities & Technical Innovations

### A. ACID Ledger & Financial Safety
- **Advisory Locks & Row-Level Locking**: Concurrent operations on account balances use PostgreSQL transaction advisory locks combined with `SELECT ... FOR UPDATE`.
- **Deadlock-Free Transfers**: Peer-to-peer transfers deterministically sort account UUIDs lexicographically prior to acquiring row locks, eliminating lock-inversion deadlocks.
- **Pre-Settlement Fraud Interception**: When ML scores indicate a critical risk (`decision === 'BLOCK'`), the transaction is permanently recorded with status `blocked` and `is_fraud = true`, but balances are never touched.
- **Compensating Ledger Reversals**: Completed transactions can be audited and reversed via `POST /api/transactions/:id/reverse`. Reversals insert an explicit compensating ledger entry (`txn_type = 'reversal'`) and stamp the original record, maintaining complete immutable auditability.

### B. Machine Learning & Explainable AI
- **18-Signal Feature Engineering**: Features include 1-hour and 24-hour transaction velocities, 1-hour cumulative spend, unique merchant diversity, 90-day amount z-scores, device fingerprint novelty, and geolocation country mismatches.
- **Resilient Fallback Scoring**: A built-in circuit breaker catches network timeouts (>800ms) or microservice downtime, instantly evaluating transactions against calibrated rules without interrupting banking services.
- **SHAP Feature Contributions**: Every prediction provides the top 5 features driving the risk score, enabling fraud investigators to understand *why* an alert was generated.

### C. Multi-Channel Banking
- Supports `deposit`, `withdrawal`, `transfer`, `card-payment` (POS), `upi`, `atm`, and `online` channels.
- Enforces multi-tier card limits: single transaction, daily ATM, daily POS, daily online, and monthly spending caps.

### D. Administrative & Security Modules
- **Unified Customer Onboarding**: Support both linking existing users or creating new user profiles and customer records in a single step.
- **User Management**: Super Admin interface for managing staff users, changing roles, and toggling active status.
- **Live System Telemetry**: Real-time health monitoring of Express API, PostgreSQL connection pool, and FastAPI ML model status.

---

## 4. Role-Based Access Control (RBAC) Matrix

BankShield defines 7 hierarchical roles with strict permission boundaries:

| Role | Core Responsibilities | Key Permissions |
|---|---|---|
| `super_admin` | Platform oversight & system configuration | `*` (All permissions) |
| `admin` | User management & security policies | `users:*`, `reports:*`, `transactions:reverse` |
| `branch_manager` | Branch accounts, customers, & operations | `customers:*`, `accounts:*`, `reports:read` |
| `fraud_analyst` | Alert investigations & account freeze | `fraud:investigate`, `fraud:freeze_account`, `fraud:notes` |
| `compliance_officer` | Audit trail inspection & regulatory exports | `reports:*`, `customers:kyc_verify` |
| `teller` | In-branch deposits, withdrawals, & customer lookup | `transactions:create`, `accounts:read` |
| `customer` | Self-service banking, cards, & transfers | `accounts:read_own`, `transactions:create_own` |

---

## 5. Directory Structure

```
BankShield/
├── client/                     # React 19 Frontend (Vite, Tailwind CSS)
│   ├── src/
│   │   ├── components/         # Shared UI, Layout, Modal, Forms
│   │   ├── context/            # AuthContext, ThemeContext
│   │   ├── pages/              # Portal, Dashboard, Admin, Fraud, Accounts, Cards
│   │   └── services/           # Axios API Client Modules
│   └── package.json
├── server/                     # Node.js Express 5 REST API
│   ├── src/
│   │   ├── controllers/        # HTTP Request Handlers
│   │   ├── db/                 # Connection Pool, Migrations, Seed Scripts
│   │   │   ├── queries/        # Raw SQL Query Modules
│   │   │   └── schema.sql      # Database Schema DDL
│   │   ├── middleware/         # Auth, RBAC, Rate Limiting, Error Handling
│   │   ├── routes/             # Express Routers
│   │   ├── services/           # Business Logic & Orchestration
│   │   └── validators/         # Express-Validator Chains
│   └── package.json
├── ml-service/                 # FastAPI ML Microservice
│   ├── app/
│   │   ├── api/routes/         # /predict, /health, /explain
│   │   ├── core/               # Configuration & Logging
│   │   ├── models/             # FraudDetector & Preprocessor
│   │   └── schemas/            # Pydantic Request/Response Models
│   ├── notebooks/              # Training & Evaluation Scripts
│   ├── saved_models/           # Serialized XGBoost Models (.joblib)
│   └── requirements.txt
├── docs/                       # Project Documentation & Architecture Guides
├── PROJECT_AUDIT_REPORT.md     # Engineering Audit & Resolution Report
└── README.md                   # Platform Documentation
```

---

## 6. Getting Started

### Prerequisites
- **Node.js**: v22+
- **Python**: v3.11+
- **PostgreSQL**: v15+ (Local or Neon Cloud)

### 1. Database Setup
1. Configure `server/.env` based on `server/.env.example`:
   ```bash
   cp server/.env.example server/.env
   ```
2. Run database migration and seed:
   ```bash
   cd server
   npm install
   npm run db:setup
   ```
   *This applies `schema.sql` and seeds default roles, permissions, and the default super-admin user.*

### 2. Machine Learning Microservice Setup
1. Create and activate a Python virtual environment:
   ```bash
   cd ml-service
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Linux/macOS:
   source venv/bin/activate
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the FastAPI microservice:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### 3. Backend Server Setup
1. Start the Express server:
   ```bash
   cd server
   npm run dev
   ```
   *The backend will be running at `http://localhost:5000`.*

### 4. Frontend Client Setup
1. Configure `client/.env` (optional, defaults to relative `/api` proxy):
   ```bash
   cp client/.env.example client/.env
   ```
2. Install dependencies and start the Vite development server:
   ```bash
   cd client
   npm install
   npm run dev
   ```
   *The frontend will be running at `http://localhost:5173`.*

---

## 7. Default Credentials (Seeded)

| Account | Email | Password | Role |
|---|---|---|---|
| Super Admin | `superadmin@bankshield.internal` | `BankShield@Super2025!` | `super_admin` |

---

## 8. Verification & Integration Smoke Tests

The repository includes automated end-to-end integration smoke test suites located in `server/`:

```powershell
cd server

# Verify authentication, RBAC, and core endpoints
node smoke_test.mjs

# Verify multi-channel transactions, limits, and concurrency
node smoke_transactions.mjs

# Verify accounts, debit cards, and spending limits
node smoke_accounts_cards.mjs

# Verify customer onboarding, KYC document review, and branches
node smoke_branches_customers.mjs

# Verify fraud alerts, investigations, analyst notes, and freeze workflows
node smoke_investigation.mjs

# Verify dashboard KPI analytics and aggregations
node smoke_dashboard.mjs

# Verify PDF and Excel report exports
node smoke_reports_notifications.mjs
```

---

## 9. License

This project is licensed under the MIT License.
