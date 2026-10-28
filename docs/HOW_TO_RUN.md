# BankShield — How to Run, Test & Use Every Service

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser  :5173   React + Vite (Tailwind, Recharts)      │
│              ↕  /api/* proxied by Vite dev server         │
│  Express  :5000   Node.js REST API  (JWT auth, RBAC)      │
│              ↕  HTTP POST /predict                        │
│  FastAPI  :8000   Python XGBoost + SHAP fraud engine     │
│              ↕  pg Pool                                   │
│  PostgreSQL        Neon cloud (or local Postgres 15+)    │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 22+ | https://nodejs.org |
| Python | 3.11+ | https://python.org |
| PostgreSQL | 15+ (or Neon free tier) | https://neon.tech |

---

## 2. One-Time Environment Setup

### 2a. Database — `server/.env`

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
SUPER_ADMIN_EMAIL=superadmin@bankshield.internal
SUPER_ADMIN_PASSWORD=BankShield@Super2025!
JWT_SECRET=your-very-long-secret-here
JWT_REFRESH_SECRET=another-very-long-secret-here
ML_SERVICE_URL=http://localhost:8000
```

### 2b. ML service — `ml-service/.env` (optional overrides)

```env
MODEL_DIR=saved_models/
PORT=8000
HOST=0.0.0.0
LOG_LEVEL=INFO
```

### 2c. Client — `client/.env` (optional)

```env
# No secrets needed — Vite proxies /api to :5000
```

---

## 3. Install Dependencies

Run these **once** in three separate terminals:

```powershell
# Terminal A — Express server
cd "d:\B Tech\bankshield\server"
npm install

# Terminal B — React client
cd "d:\B Tech\bankshield\client"
npm install

# Terminal C — ML service (Python venv)
cd "d:\B Tech\bankshield\ml-service"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

---

## 4. Database Setup (run once)

```powershell
cd "d:\B Tech\bankshield\server"
npm run db:setup
```

This runs `migrate` (applies `schema.sql`) then `seed` (inserts 7 roles,
34 permissions, and the super-admin user). It is **idempotent** — safe to
re-run at any time.

---

## 5. Train the ML Model (run once)

```powershell
cd "d:\B Tech\bankshield\ml-service"
venv\Scripts\activate
python notebooks/train.py
```

Saves `trained_models/xgboost_fraud_model.joblib` and `threshold.json`.
The service falls back to a rule-based heuristic if the model file is absent.

---

## 6. Start All Services

Open **3 terminals**, start them in this order:

### Terminal 1 — Express API
```powershell
cd "d:\B Tech\bankshield\server"
node src/server.js
```
→ `Server listening on http://localhost:5000`

### Terminal 2 — FastAPI ML Service
```powershell
cd "d:\B Tech\bankshield\ml-service"
venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
→ `Uvicorn running on http://0.0.0.0:8000`

### Terminal 3 — React Dev Server
```powershell
cd "d:\B Tech\bankshield\client"
npm run dev
```
→ `Local: http://localhost:5173`

**Open your browser at http://localhost:5173**

---

## 7. Login Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@bankshield.internal` | `BankShield@Super2025!` |

To create other role users, log in as super admin then use the
**Register** endpoint or the User Management page.

---

## 8. All Services & One Example Per Service

### 8.1 Auth Service — `POST /api/auth/login`

**What it does:** Authenticates a user, returns a JWT access token + refresh token.

**Example — curl:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@bankshield.internal","password":"BankShield@Super2025!"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": { "id": "...", "email": "...", "role": "super_admin" }
  }
}
```

**UI path:** `http://localhost:5173/login`

---

### 8.2 Transaction Service — `POST /api/transactions/transfer`

**What it does:** Moves funds between two accounts. Triggers ML fraud scoring
immediately after commit. Returns the transaction + fraud assessment + SHAP values.

**Example — curl (replace UUIDs with real account IDs from your DB):**
```bash
TOKEN="<paste accessToken here>"
curl -X POST http://localhost:5000/api/transactions/transfer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAccountId": "<UUID of source account>",
    "destinationAccountId": "<UUID of destination account>",
    "amount": 5000,
    "currency": "INR",
    "channel": "web",
    "description": "Test transfer"
  }'
```

**Response includes:**
```json
{
  "data": {
    "transaction": { "id":"...", "transaction_ref":"TXN-20261003-...", "status":"completed" },
    "fraud": {
      "riskScore": 0.12,
      "riskLevel": "LOW",
      "decision": "APPROVE",
      "shapValues": [
        { "feature":"balance_ratio", "value":0.05, "shap":-0.0821 },
        { "feature":"amount_log",    "value":8.51, "shap": 0.0234 }
      ]
    }
  }
}
```

**UI path:** `http://localhost:5173/transfer`

---

### 8.3 Account Service — `GET /api/accounts`

**What it does:** Returns paginated list of accounts (server-scoped to
requester's role — customers see only their own accounts).

**Example:**
```bash
curl http://localhost:5000/api/accounts?limit=5 \
  -H "Authorization: Bearer $TOKEN"
```

**UI path:** `http://localhost:5173/accounts`

---

### 8.4 Customer Service — `POST /api/customers`

**What it does:** Creates a customer profile linked to an existing user account.

**Example:**
```bash
curl -X POST http://localhost:5000/api/customers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<UUID of a user with role=customer>",
    "segment": "retail",
    "riskRating": "low"
  }'
```

**UI path:** `http://localhost:5173/customers` → New Customer button

---

### 8.5 Card Service — `PATCH /api/cards/:id/block`

**What it does:** Immediately blocks a card. All subsequent transactions are declined.

**Example:**
```bash
curl -X PATCH http://localhost:5000/api/cards/<CARD_UUID>/block \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Suspicious activity reported by customer"}'
```

**UI path:** `http://localhost:5173/cards/<id>` → Block Card button

---

### 8.6 Fraud Alert Service — `GET /api/fraud/alerts`

**What it does:** Returns the triage queue of fraud alerts. Supports
`status`, `severity`, `limit`, `offset` filters.

**Example — get all critical open alerts:**
```bash
curl "http://localhost:5000/api/fraud/alerts?status=open&severity=critical&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**UI path:** `http://localhost:5173/fraud/alerts`

---

### 8.7 Fraud Alert — Status Transition `PATCH /api/fraud/alerts/:id/status`

**What it does:** Moves an alert through its state machine:
`open → investigating → escalated → confirmed_fraud / false_positive → resolved → closed`

**Example:**
```bash
curl -X PATCH http://localhost:5000/api/fraud/alerts/<ALERT_UUID>/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"investigating"}'
```

**UI path:** Click any alert in the Fraud Alerts page → Start Review button

---

### 8.8 Investigation Service — `POST /api/fraud/alerts/:alertId/investigation`

**What it does:** Opens a formal investigation case linked to an alert.
Assigns a case number (`CASE-YYYYMMDD-XXXX`).

**Example:**
```bash
curl -X POST http://localhost:5000/api/fraud/alerts/<ALERT_UUID>/investigation \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"priority":"high"}'
```

**UI path:** `http://localhost:5173/fraud/investigations` → Open Case

---

### 8.9 Dashboard Service — `GET /api/dashboard`

**What it does:** Single round-trip returning all dashboard sections:
summary KPIs, 30-day trend, risk distribution, channel breakdown,
active alerts, top-risk customers, recent transactions.
Server-side cached for 60 seconds. Role-scoped.

**Example:**
```bash
curl http://localhost:5000/api/dashboard \
  -H "Authorization: Bearer $TOKEN"
```

**UI path:** `http://localhost:5173/` (home page for all roles)

---

### 8.10 Report Service — `POST /api/reports`

**What it does:** Queues an async report for generation.
Types: `transaction_summary`, `fraud_report`, `audit_report`,
`compliance_report`, `customer_statement`, `risk_report`.

**Example — request a 30-day fraud report:**
```bash
curl -X POST http://localhost:5000/api/reports \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportType": "fraud_report",
    "format": "pdf",
    "parameters": {
      "dateFrom": "2026-09-01",
      "dateTo": "2026-10-01"
    }
  }'
```

**Poll status then download:**
```bash
# Check status
curl http://localhost:5000/api/reports/<REPORT_UUID> -H "Authorization: Bearer $TOKEN"

# Download when status=ready
curl http://localhost:5000/api/reports/<REPORT_UUID>/download \
  -H "Authorization: Bearer $TOKEN" --output fraud_report.pdf
```

**UI path:** `http://localhost:5173/reports`

---

### 8.11 ML Prediction Service — `POST http://localhost:8000/predict`

**What it does:** Scores a transaction payload with XGBoost and returns
fraud probability, risk level, decision, SHAP top-5 feature contributions.

**Example:**
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 75000,
    "channel": "web",
    "hour_of_day": 2,
    "velocity_1h": 4,
    "velocity_24h": 10,
    "account_balance": 80000,
    "account_mean_txn": 5000,
    "account_std_txn": 3000,
    "is_new_device": true,
    "country_mismatch": true,
    "card_type": "debit"
  }'
```

**Response:**
```json
{
  "risk_score": 74.1,
  "risk_level": "HIGH",
  "decision": "REVIEW",
  "shap_values": [
    { "feature": "is_new_device",  "value": 1.0, "shap":  0.1823, "label": "New Device"    },
    { "feature": "balance_ratio",  "value": 0.94,"shap":  0.1544, "label": "Balance Ratio" },
    { "feature": "velocity_1h",    "value": 4.0, "shap":  0.1021, "label": "Velocity (1 h)"}
  ]
}
```

**Interactive docs:** `http://localhost:8000/docs`

---

### 8.12 ML Explain Service — `POST http://localhost:8000/explain`

**What it does:** Same as `/predict` but returns enriched SHAP values with
human-readable labels, model baseline, and `is_model_loaded` flag.

```bash
curl -X POST http://localhost:8000/explain \
  -H "Content-Type: application/json" \
  -d '{"amount":75000,"channel":"web","is_new_device":true}'
```

**UI path:** Open any fraud alert → click "Why Flagged" tab → horizontal bar chart

---

## 9. Complete End-to-End Example: Flag a Suspicious Transfer

This walks through the full lifecycle: **create data → make transaction → score ML → review alert → resolve**.

```powershell
# 0. Set token variable
$TOKEN = "eyJhbGci..."   # from login response

# 1. Register a new customer user
$reg = Invoke-RestMethod -Method POST http://localhost:5000/api/auth/register `
  -Headers @{Authorization="Bearer $TOKEN"} `
  -ContentType "application/json" `
  -Body '{"email":"test.customer@bank.in","password":"Test@1234!","firstName":"Test","lastName":"Customer","roleName":"customer"}'

$CUST_TOKEN = (Invoke-RestMethod -Method POST http://localhost:5000/api/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"test.customer@bank.in","password":"Test@1234!"}').data.accessToken

# 2. Create customer profile
$custId = (Invoke-RestMethod -Method POST http://localhost:5000/api/customers `
  -Headers @{Authorization="Bearer $TOKEN"} `
  -ContentType "application/json" `
  -Body "{`"userId`":`"$($reg.data.user.id)`",`"segment`":`"retail`"}").data.customer.id

# 3. Open two accounts
$acc1 = (Invoke-RestMethod -Method POST http://localhost:5000/api/accounts `
  -Headers @{Authorization="Bearer $TOKEN"} `
  -ContentType "application/json" `
  -Body "{`"customerId`":`"$custId`",`"accountType`":`"savings`"}").data.account.id

$acc2 = (Invoke-RestMethod -Method POST http://localhost:5000/api/accounts `
  -Headers @{Authorization="Bearer $TOKEN"} `
  -ContentType "application/json" `
  -Body "{`"customerId`":`"$custId`",`"accountType`":`"current`"}").data.account.id

# 4. Fund the source account (admin deposits)
Invoke-RestMethod -Method POST http://localhost:5000/api/transactions/deposit `
  -Headers @{Authorization="Bearer $TOKEN"} `
  -ContentType "application/json" `
  -Body "{`"accountId`":`"$acc1`",`"amount`":100000,`"channel`":`"branch`"}"

# 5. Make a suspicious transfer (large amount at 2am, new context)
$txnResult = Invoke-RestMethod -Method POST http://localhost:5000/api/transactions/transfer `
  -Headers @{Authorization="Bearer $CUST_TOKEN"} `
  -ContentType "application/json" `
  -Body "{`"sourceAccountId`":`"$acc1`",`"destinationAccountId`":`"$acc2`",`"amount`":90000,`"channel`":`"web`"}"

Write-Host "Risk Score:" $txnResult.data.fraud.riskScore
Write-Host "Decision:"   $txnResult.data.fraud.decision
Write-Host "Alert ID:"   $txnResult.data.fraud.alertId

# 6. Review the alert in the UI
# → Open http://localhost:5173/fraud/alerts
# → Click the alert → "Why Flagged" tab shows SHAP chart
# → "Start Review" → "Confirm Fraud" / "False Positive"
```

---

## 10. Running the Test Suites

All smoke tests require both the Express server (`:5000`) and ML service (`:8000`) running.

```powershell
cd "d:\B Tech\bankshield\server"

# Auth, registration, login, JWT
node smoke_test.mjs

# Accounts and cards
node smoke_accounts_cards.mjs

# Customers and branches
node smoke_branches_customers.mjs

# Transactions
node smoke_transactions.mjs

# Dashboard (all roles)
node smoke_dashboard.mjs

# Reports and notifications
node smoke_reports_notifications.mjs

# Fraud investigations
node smoke_investigation.mjs

# Full fraud pipeline E2E (ML must be running)
node e2e_fraud_integration.mjs
```

Expected output for each: `Results: N passed, 0 failed`

---

## 11. API Documentation

| Service | URL | Notes |
|---|---|---|
| Express REST API | http://localhost:5000/api | All endpoints require `Authorization: Bearer <token>` except `/auth/login` and `/auth/forgot-password` |
| FastAPI ML Service | http://localhost:8000/docs | Interactive Swagger UI — test `/predict` and `/explain` directly |
| FastAPI ReDoc | http://localhost:8000/redoc | Alternative ML docs |

---

## 12. Production Build

```powershell
cd "d:\B Tech\bankshield\client"
npm run build
# Output in client/dist/ — serve with any static file server
```

---

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| `DATABASE_URL` connection error | Check Neon dashboard — free tier pauses after inactivity. Wake it by running `npm run migrate:status` |
| ML service `model file not found` | Run `python notebooks/train.py` inside the venv |
| 422 on transaction form | Account number (ACC-…) is accepted — the form auto-resolves it to UUID |
| `react-is` module not found | Run `npm install react-is@19.1.0` in `client/` |
| Login says "Account locked" | Wait 15 minutes or reset via `PATCH /api/users/:id` as super_admin |
| SHAP values empty | ML service must be running with the trained XGBoost model (not heuristic fallback) |
