/**
 * featureService.js — Compute ML feature vector from live DB data.
 *
 * Called post-commit (after the transaction row exists) to build the 18-field
 * payload sent to the ML service's /predict endpoint.
 *
 * Features computed:
 *   velocity_1h          — transaction count in last 60 min for the account
 *   velocity_24h         — transaction count in last 24 h
 *   amount_sum_1h        — total spend in last 60 min
 *   distinct_merchants_24h — unique merchant categories in last 24 h
 *   account_mean_txn     — 90-day historical mean transaction amount
 *   account_std_txn      — 90-day historical std deviation
 *   account_balance      — current account balance
 *   is_new_device        — true if device fingerprint not seen in last 30 days
 *   country_mismatch     — true if txn country ≠ most recent known country
 *   (all other fields)   — passed through from the transaction row
 */

import { logger } from '../utils/logger.js';
import {
  countRecentTransactions,
  sumRecentSpend,
  countDistinctMerchants24h,
  getAccountTxnStats,
  getKnownDevices,
  getLastSeenDeviceAndCountry,
} from '../db/queries/fraudQueries.js';
import { getAccountBalance } from '../db/queries/accountQueries.js';

// Merchant category → risk tier mapping (mirrors ML training data)
const HIGH_RISK_MERCHANTS = new Set([
  'crypto','cryptocurrency','wire_transfer','money_transfer',
  'foreign_exchange','fx','gambling','gaming','luxury',
  'jewellery','electronics','airline','travel',
]);
const MEDIUM_RISK_MERCHANTS = new Set([
  'retail','clothing','food','restaurant','entertainment',
  'subscription','streaming',
]);

function merchantRisk(category) {
  if (!category) return 0;
  const c = category.toLowerCase().replace(/[\s\-]/g, '_');
  if ([...HIGH_RISK_MERCHANTS].some(h => c.includes(h))) return 2;
  if ([...MEDIUM_RISK_MERCHANTS].some(m => c.includes(m))) return 1;
  return 0;
}

/**
 * Build the ML feature payload for a completed transaction.
 *
 * @param {object} txn  — transaction row from DB (RETURNING *)
 * @param {object} meta — { deviceFingerprint, location: { city, country } }
 * @returns {object}    — 18-field payload matching TransactionFeatures schema
 */
export const buildFeatureVector = async (txn, meta = {}) => {
  const accountId    = txn.source_account_id ?? txn.destination_account_id;
  const amount       = parseFloat(txn.amount);
  const hour         = new Date(txn.created_at ?? Date.now()).getUTCHours();
  const dow          = new Date(txn.created_at ?? Date.now()).getUTCDay();
  const channel      = txn.channel ?? 'api';
  const merchantCat  = txn.merchant_category ?? txn.merchant_name ?? '';
  const deviceFp     = meta.deviceFingerprint ?? txn.device_fingerprint ?? null;
  const txnCountry   = meta.location?.country ?? txn.location_country ?? null;

  // Fetch all DB-derived signals in parallel
  const [
    vel1h,
    vel24h,
    amtSum1h,
    distinctMerch24h,
    stats,
    balanceRow,
    knownDevices,
    lastSeen,
  ] = await Promise.all([
    countRecentTransactions(accountId, 60),
    countRecentTransactions(accountId, 1440),
    sumRecentSpend(accountId, 60),
    countDistinctMerchants24h(accountId),
    getAccountTxnStats(accountId),
    getAccountBalance(accountId),
    deviceFp ? getKnownDevices(accountId) : Promise.resolve(new Set()),
    getLastSeenDeviceAndCountry(accountId),
  ]).catch((err) => {
    // Never crash the flow on feature computation errors
    logger.warn(`[featureService] partial failure: ${err.message}`);
    return [1, 3, amount, 1, { meanAmount: amount, stdAmount: amount * 0.5, txnCount: 0 },
            null, new Set(), null];
  });

  const accountBalance = parseFloat(balanceRow?.balance ?? 0);
  const isNewDevice    = deviceFp ? !knownDevices.has(deviceFp) : false;

  // Country mismatch: compare current txn country to last known country
  const lastCountry    = lastSeen?.location_country ?? null;
  const countryMismatch = !!(txnCountry && lastCountry && txnCountry !== lastCountry);

  const features = {
    // Required
    amount,

    // Temporal
    hour_of_day              : hour,
    day_of_week              : dow,

    // Account context
    account_balance          : accountBalance,
    account_mean_txn         : stats.meanAmount  || amount,
    account_std_txn          : stats.stdAmount   || (amount * 0.5),

    // Velocity
    velocity_1h              : vel1h,
    velocity_24h             : vel24h,
    amount_sum_1h            : amtSum1h,
    distinct_merchants_24h   : distinctMerch24h,

    // Merchant / context
    merchant_category        : merchantCat,
    country_mismatch         : countryMismatch,
    is_new_device            : isNewDevice,
    is_new_beneficiary       : false,   // populated by caller if known

    // Card / channel
    card_type                : txn.card_type   ?? 'debit',
    channel                  : channel,

    // Pass-through for logging
    source_account_id        : txn.source_account_id ?? null,
    destination_account_id   : txn.destination_account_id ?? null,
    ip_address               : txn.ip_address ?? null,
  };

  logger.debug(
    `[featureService] txn=${txn.id} vel1h=${vel1h} vel24h=${vel24h} ` +
    `newDevice=${isNewDevice} countryMismatch=${countryMismatch} ` +
    `balanceRatio=${(amount / (accountBalance + 1)).toFixed(2)}`
  );

  return features;
};
