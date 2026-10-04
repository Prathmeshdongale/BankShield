/**
 * mlClient.js — HTTP client for the BankShield ML microservice (FastAPI / XGBoost).
 *
 * All calls use a configurable timeout (default 800 ms). On any network
 * error or timeout the fallback heuristic scorer is used transparently
 * so the transaction flow is never blocked by ML service downtime.
 *
 * Endpoint: POST http://localhost:8000/predict
 * Request  : TransactionFeatures schema (18 fields — see ml-service/app/schemas/transaction.py)
 * Response : PredictionResponse { fraud_probability, risk_score, risk_level,
 *                                  prediction, decision, model_version,
 *                                  latency_ms, request_id, rules_triggered }
 */

import axios    from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// ── Axios instance ────────────────────────────────────────────────────────────
const ML_TIMEOUT_MS = parseInt(process.env.ML_TIMEOUT_MS ?? '800', 10);

const mlApi = axios.create({
  baseURL        : config.mlServiceUrl,          // http://localhost:8000
  timeout        : ML_TIMEOUT_MS,
  headers        : { 'Content-Type': 'application/json' },
  validateStatus : (s) => s < 500,               // 4xx treated as responses, not errors
});

// ── Circuit-breaker state (simple in-process counter) ────────────────────────
// After FAILURE_THRESHOLD consecutive failures the client short-circuits for
// CIRCUIT_OPEN_MS milliseconds before trying again.
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS   = 30_000;   // 30 s

let _failures    = 0;
let _circuitOpen = false;
let _openedAt    = 0;

function _isCircuitOpen() {
  if (!_circuitOpen) return false;
  if (Date.now() - _openedAt > CIRCUIT_OPEN_MS) {
    _circuitOpen = false;   // half-open: allow one probe
    logger.info('[mlClient] Circuit half-open — probing ML service');
    return false;
  }
  return true;
}

function _recordSuccess() {
  _failures    = 0;
  _circuitOpen = false;
}

function _recordFailure(reason) {
  _failures++;
  if (_failures >= FAILURE_THRESHOLD && !_circuitOpen) {
    _circuitOpen = true;
    _openedAt    = Date.now();
    logger.warn(`[mlClient] Circuit OPEN after ${_failures} failures — using fallback for ${CIRCUIT_OPEN_MS / 1000}s`);
  }
  logger.warn(`[mlClient] ML service unavailable (${reason}) — using fallback heuristic`);
}

// ── Fallback heuristic (used when ML service is down or circuit is open) ──────
/**
 * Rule-based risk scorer.  Returns the same shape as the ML service response
 * so the caller code path is identical in both cases.
 */
function fallbackScore(features) {
  const amount   = parseFloat(features.amount ?? 0);
  const hour     = parseInt(features.hour_of_day  ?? 12, 10);
  const vel1h    = parseInt(features.velocity_1h   ?? 1,  10);
  const vel24h   = parseInt(features.velocity_24h  ?? 3,  10);
  const balance  = parseFloat(features.account_balance ?? 10_000);
  const merch    = String(features.merchant_category ?? '').toLowerCase();

  let score = 0.03;

  // Amount-to-balance ratio
  const ratio = amount / (balance + 1);
  if (ratio > 0.5)  score += 0.20;
  if (ratio > 2.0)  score += 0.20;

  // Temporal
  if (hour >= 23 || hour <= 4) score += 0.12;

  // Velocity
  if (vel1h  >= 3)  score += 0.12;
  if (vel1h  >= 6)  score += 0.10;
  if (vel24h >= 15) score += 0.08;

  // Context signals
  if (features.country_mismatch)   score += 0.18;
  if (features.is_new_device)      score += 0.12;
  if (features.is_new_beneficiary) score += 0.08;

  // High-risk merchant
  if (/crypto|wire|gambling|forex|gaming/.test(merch)) score += 0.15;

  // Absolute amount thresholds
  if (amount > 50_000)    score += 0.10;
  if (amount > 200_000)   score += 0.15;
  if (amount > 1_000_000) score += 0.20;

  score = Math.min(Math.max(score, 0.01), 0.99);

  const riskScore100 = Math.round(score * 100 * 10) / 10;
  const riskLevel    =
    riskScore100 >= 80 ? 'CRITICAL' :
    riskScore100 >= 60 ? 'HIGH'     :
    riskScore100 >= 30 ? 'MEDIUM'   : 'LOW';
  const decision =
    riskScore100 >= 80 ? 'BLOCK'  :
    riskScore100 >= 30 ? 'REVIEW' : 'APPROVE';

  return {
    fraud_probability : parseFloat(score.toFixed(4)),
    risk_score        : riskScore100,
    risk_level        : riskLevel,
    prediction        : score >= 0.80,
    decision,
    model_version     : 'fallback-heuristic-v2',
    latency_ms        : 0,
    request_id        : null,
    rules_triggered   : [],
    is_fallback       : true,
  };
}

// ── Public interface ──────────────────────────────────────────────────────────

/**
 * Score a transaction via the ML service.
 *
 * @param {object} features   TransactionFeatures payload (18 fields)
 * @returns {object}  Normalized prediction result:
 *   {
 *     fraud_probability : number   0.0–1.0
 *     risk_score        : number   0–100
 *     risk_level        : string   LOW|MEDIUM|HIGH|CRITICAL
 *     prediction        : boolean  true = fraud
 *     decision          : string   APPROVE|REVIEW|BLOCK
 *     model_version     : string
 *     latency_ms        : number
 *     request_id        : string|null
 *     rules_triggered   : string[]
 *     is_fallback       : boolean  true if fallback heuristic was used
 *   }
 */
export const predictFraud = async (features) => {
  // Short-circuit if ML service circuit is open
  if (_isCircuitOpen()) {
    return fallbackScore(features);
  }

  try {
    const res = await mlApi.post('/predict', features);

    if (res.status !== 200 || !res.data?.fraud_probability) {
      _recordFailure(`HTTP ${res.status}`);
      return fallbackScore(features);
    }

    _recordSuccess();

    const d = res.data;
    return {
      fraud_probability : parseFloat(d.fraud_probability),
      risk_score        : parseFloat(d.risk_score),
      risk_level        : d.risk_level,
      prediction        : Boolean(d.prediction),
      decision          : d.decision,
      model_version     : d.model_version ?? 'xgboost-v2.0',
      latency_ms        : parseFloat(d.latency_ms ?? 0),
      request_id        : d.request_id ?? null,
      rules_triggered   : Array.isArray(d.rules_triggered) ? d.rules_triggered : [],
      shap_values       : Array.isArray(d.shap_values) ? d.shap_values : [],
      is_fallback       : false,
    };
  } catch (err) {
    const reason = err.code === 'ECONNABORTED' ? 'timeout' : (err.code ?? err.message);
    _recordFailure(reason);
    return fallbackScore(features);
  }
};

/**
 * Health-check the ML service.
 * Returns { status, model_loaded, model_version, latency_ms } or { status: 'down' }.
 */
export const checkMlHealth = async () => {
  try {
    const t0  = Date.now();
    const res = await mlApi.get('/health', { timeout: 3000 });
    const ms  = Date.now() - t0;
    if (res.status === 200) {
      return { ...res.data, latency_ms: ms, circuit_open: _circuitOpen };
    }
    return { status: 'degraded', latency_ms: ms, circuit_open: _circuitOpen };
  } catch {
    return { status: 'down', circuit_open: _circuitOpen };
  }
};

export default { predictFraud, checkMlHealth };
