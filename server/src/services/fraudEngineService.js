/**
 * fraudEngineService.js — Post-commit fraud evaluation pipeline.
 *
 * Called from transactionService.scoreTransaction() AFTER the ledger
 * transaction has committed. Running post-commit means:
 *   • ML service failures never roll back the user's money movement.
 *   • The transaction row always exists when we query velocity features.
 *   • We can still update the transaction row (status, risk_score) after commit.
 *
 * Pipeline:
 *   1. Build ML feature vector (velocity, amount stats, device/country).
 *   2. Call ML service /predict with 800 ms timeout + fallback heuristic.
 *   3. Store result in fraud_predictions table.
 *   4. Update transaction row: risk_score, is_fraud, status (flagged/blocked).
 *   5. For HIGH / CRITICAL risk: create fraud_alert row.
 *   6. For HIGH / CRITICAL risk: send email + in-app notification async.
 *   7. Return scoring result to caller.
 *
 * Decision thresholds (aligned with ML service trained_models/threshold.json):
 *   BLOCK  → risk_score ≥ 80  (0.80) — is_fraud=true, hold transaction
 *   FLAG   → risk_score ≥ 30  (0.30) — create alert, keep transaction pending review
 *   PASS   → risk_score <  30         — completed, no alert
 *
 * The caller (transactionService._executeTransaction) already set the
 * transaction status to 'completed'. This engine may OVERRIDE that status
 * to 'flagged' or 'blocked' based on the ML score.
 */

import { logger }    from '../utils/logger.js';
import { query }     from '../db/connection.js';
import { buildFeatureVector }          from './featureService.js';
import { predictFraud }                from './mlClient.js';
import { sendFraudAlertNotification }  from './notificationService.js';
import {
  insertFraudPrediction,
  insertFraudAlert,
  riskScoreToSeverity,
} from '../db/queries/fraudQueries.js';
import { updateTransactionStatus }     from '../db/queries/transactionQueries.js';

// ── Risk thresholds ───────────────────────────────────────────────────────────
const BLOCK_THRESHOLD  = parseFloat(process.env.FRAUD_BLOCK_THRESHOLD  ?? '80');   // 0–100 scale
const FLAG_THRESHOLD   = parseFloat(process.env.FRAUD_FLAG_THRESHOLD   ?? '30');   // 0–100 scale
const ALERT_THRESHOLD  = parseFloat(process.env.FRAUD_ALERT_THRESHOLD  ?? '30');   // create alert above this

// ── Channels that should put the transaction on hold (pending review) ─────────
// rather than outright blocking. Useful for high-value NEFT/RTGS transfers.
const HOLD_CHANNELS = new Set(['neft', 'rtgs', 'imps', 'branch']);

/**
 * Main entry point — called from transactionService.scoreTransaction().
 *
 * @param {object} txn      Committed transaction DB row
 * @param {object} context  { account, card, channel, amount, currency, meta }
 * @returns {{ riskScore, isFraud, flag, reasons, decision, alertId }}
 */
export const evaluateTransactionRisk = async (txn, context = {}, client = null) => {
  const startMs = Date.now();

  // ── 1. Build feature vector ──────────────────────────────────────────────
  let features;
  try {
    features = await buildFeatureVector(txn, context.meta ?? {});
    // Enrich with any context the caller knows about
    if (context.meta?.isNewBeneficiary !== undefined) {
      features.is_new_beneficiary = context.meta.isNewBeneficiary;
    }
  } catch (err) {
    logger.error(`[fraudEngine] Feature computation failed: ${err.message}`);
    // Use minimal features so we still get a prediction
    features = { amount: parseFloat(txn.amount), channel: txn.channel ?? 'api' };
  }

  // ── 2. Call ML service ────────────────────────────────────────────────────
  let mlResult;
  try {
    mlResult = await predictFraud(features);
  } catch (err) {
    logger.error(`[fraudEngine] predictFraud threw: ${err.message}`);
    mlResult = {
      fraud_probability: 0.03, risk_score: 3, risk_level: 'LOW',
      prediction: false, decision: 'APPROVE',
      model_version: 'fallback-error-v0', rules_triggered: [], is_fallback: true,
    };
  }

  const riskScore100    = parseFloat(mlResult.risk_score ?? 0);
  const fraudProb       = parseFloat(mlResult.fraud_probability ?? riskScore100 / 100);
  const isBlocked       = riskScore100 >= BLOCK_THRESHOLD;
  const isFlagged       = riskScore100 >= FLAG_THRESHOLD && !isBlocked;
  const shouldAlert     = riskScore100 >= ALERT_THRESHOLD;
  const severity        = riskScoreToSeverity(fraudProb);
  const rules           = mlResult.rules_triggered ?? [];
  const shapValues      = mlResult.shap_values ?? [];   // [{feature,value,shap}] top-5
  const inferenceMs     = Math.round(Date.now() - startMs);

  // ── 3. Store fraud_prediction ─────────────────────────────────────────────
  let prediction;
  try {
    prediction = await insertFraudPrediction({
      transactionId : txn.id,
      modelVersion  : mlResult.model_version ?? 'unknown',
      riskScore     : fraudProb,
      isFraud       : isBlocked,
      confidence    : fraudProb,
      featureVector : features,
      explanation   : {
        rules_triggered: rules,
        risk_level     : mlResult.risk_level,
        shap_values    : shapValues,   // ← persisted to fraud_predictions.explanation
      },
      inferenceMs,
    }, client);
  } catch (err) {
    logger.warn(`[fraudEngine] fraud_predictions insert failed: ${err.message}`);
  }

  // ── 4. Determine final transaction status and update row ──────────────────
  let finalStatus;
  if (isBlocked) {
    finalStatus = 'blocked';
  } else if (isFlagged && HOLD_CHANNELS.has(txn.channel)) {
    // High-value channel: hold for review instead of flagging
    finalStatus = 'pending';
  } else if (isFlagged) {
    finalStatus = 'flagged';
  } else {
    finalStatus = 'completed';   // already set; confirm it
  }

  try {
    await updateTransactionStatus(txn.id, {
      status      : finalStatus,
      riskScore   : fraudProb,
      isFraud     : isBlocked,
      flaggedAt   : (isBlocked || isFlagged) ? new Date().toISOString() : null,
      completedAt : finalStatus === 'completed'  ? new Date().toISOString() : null,
    }, client);
  } catch (err) {
    logger.warn(`[fraudEngine] transaction status update failed: ${err.message}`);
  }

  // ── 5. Create fraud_alert for HIGH / CRITICAL ─────────────────────────────
  let alertId = null;
  if (shouldAlert) {
    try {
      const alert = await insertFraudAlert({
        transactionId : txn.id,
        predictionId  : prediction?.id ?? null,
        riskScore     : fraudProb,
        triggerReasons: rules,
        severity,
      }, client);
      alertId = alert?.id ?? null;
      logger.warn(
        `[fraudEngine] Fraud alert created  id=${alertId}  ` +
        `txn=${txn.transaction_ref}  severity=${severity}  score=${riskScore100}`
      );
    } catch (err) {
      logger.warn(`[fraudEngine] fraud_alerts insert failed: ${err.message}`);
    }
  }

  // ── 6. Notify account holder (async — never blocks the response) ──────────
  if (shouldAlert) {
    const accountId = txn.source_account_id ?? txn.destination_account_id;
    if (accountId) {
      // Fire-and-forget: do not await
      sendFraudAlertNotification({
        accountId,
        txn,
        alertSeverity : severity,
        riskScore     : fraudProb,
        decision      : mlResult.decision ?? (isBlocked ? 'BLOCK' : 'REVIEW'),
        rules,
        alertId,
      }).catch((e) => logger.warn(`[fraudEngine] notification dispatch failed: ${e.message}`));
    }
  }

  logger.info(
    `[fraudEngine] txn=${txn.transaction_ref}  score=${riskScore100}  ` +
    `level=${mlResult.risk_level}  status=${finalStatus}  ` +
    `fallback=${mlResult.is_fallback}  inferenceMs=${inferenceMs}`
  );

  // Return the shape expected by transactionService.scoreTransaction()
  return {
    riskScore   : fraudProb,
    isFraud     : isBlocked,
    flag        : isFlagged,
    reasons     : rules,
    decision    : mlResult.decision ?? (isBlocked ? 'BLOCK' : isFlagged ? 'REVIEW' : 'APPROVE'),
    alertId,
    finalStatus,
    riskLevel   : mlResult.risk_level ?? severity.toUpperCase(),
    is_fallback : mlResult.is_fallback ?? false,
    shapValues,
  };
};

/**
 * Legacy thin wrapper — kept so old callers don't break.
 * @deprecated Use evaluateTransactionRisk() directly.
 */
export const createFraudAlert = async (transactionId, riskScore, reason) => {
  const severity = riskScoreToSeverity(parseFloat(riskScore));
  return insertFraudAlert({
    transactionId,
    riskScore     : parseFloat(riskScore),
    triggerReasons: [reason],
    severity,
  });
};

export default { evaluateTransactionRisk, createFraudAlert };
