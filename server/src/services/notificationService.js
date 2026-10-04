/**
 * notificationService.js — Email + in-app notifications for fraud alerts.
 *
 * Uses Nodemailer for outbound email. Configure SMTP in .env:
 *
 *   SMTP_HOST     smtp.gmail.com (or any provider)
 *   SMTP_PORT     587
 *   SMTP_SECURE   false  (true for port 465)
 *   SMTP_USER     your@email.com
 *   SMTP_PASS     app-password-or-smtp-key
 *   SMTP_FROM     "BankShield Alerts" <alerts@bankshield.in>
 *
 * If SMTP_HOST is not set the mailer is disabled and notifications are
 * logged only — the transaction flow is never interrupted.
 *
 * In-app notifications are always written to the `notifications` DB table
 * regardless of SMTP configuration.
 */

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import {
  insertNotification,
  markNotificationSent,
  getUserByAccountId,
} from '../db/queries/fraudQueries.js';

// ── Nodemailer transport (lazy-initialised once) ──────────────────────────────
let _transport = null;

function getTransport() {
  if (_transport) return _transport;

  if (!process.env.SMTP_HOST) {
    logger.info('[notif] SMTP_HOST not set — email notifications disabled');
    return null;
  }

  _transport = nodemailer.createTransport({
    host   : process.env.SMTP_HOST,
    port   : parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure : process.env.SMTP_SECURE === 'true',
    auth   : {
      user : process.env.SMTP_USER,
      pass : process.env.SMTP_PASS,
    },
    pool           : true,
    maxConnections : 3,
    rateDelta      : 1000,
    rateLimit      : 5,
  });

  logger.info(`[notif] Nodemailer transport ready (${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587})`);
  return _transport;
}

// ── Email templates ───────────────────────────────────────────────────────────

function fraudAlertEmailHtml({ user, txn, alertSeverity, riskScore100, rules, decision }) {
  const severityColor = {
    critical: '#dc2626',
    high    : '#f97316',
    medium  : '#eab308',
    low     : '#22c55e',
  }[alertSeverity] ?? '#6b7280';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>BankShield Fraud Alert</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background:${severityColor};padding:20px 24px;">
      <h2 style="color:#fff;margin:0;">
        ⚠️ ${alertSeverity.toUpperCase()} Fraud Alert — BankShield
      </h2>
    </div>
    <!-- Body -->
    <div style="padding:24px;">
      <p>Dear ${user.first_name ?? 'Customer'},</p>
      <p>A suspicious transaction has been detected on your account.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr style="background:#f9fafb;">
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Transaction Ref</td>
          <td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${txn.transaction_ref}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Amount</td>
          <td style="padding:8px;border:1px solid #e5e7eb;">${txn.currency} ${parseFloat(txn.amount).toFixed(2)}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Channel</td>
          <td style="padding:8px;border:1px solid #e5e7eb;">${(txn.channel ?? '').toUpperCase()}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Risk Score</td>
          <td style="padding:8px;border:1px solid #e5e7eb;">
            <span style="color:${severityColor};font-weight:bold;">${riskScore100}/100 (${alertSeverity.toUpperCase()})</span>
          </td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Decision</td>
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">${decision}</td>
        </tr>
        ${rules.length ? `
        <tr>
          <td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold;">Triggers</td>
          <td style="padding:8px;border:1px solid #e5e7eb;">${rules.join(' · ')}</td>
        </tr>` : ''}
      </table>
      <p>
        If you <strong>did not authorise</strong> this transaction, please contact
        BankShield support immediately or log in to freeze your account.
      </p>
      <p style="color:#6b7280;font-size:12px;">
        This is an automated security alert from BankShield. Do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ── Core notification functions ───────────────────────────────────────────────

/**
 * Send a fraud alert notification to the account holder.
 *
 * 1. Writes an in-app notification row (always).
 * 2. Sends an email via Nodemailer (if SMTP configured).
 *
 * Never throws — errors are logged and the transaction flow continues.
 *
 * @param {object} opts
 * @param {string}   opts.accountId         — source account UUID
 * @param {object}   opts.txn               — transaction row
 * @param {string}   opts.alertSeverity     — low|medium|high|critical
 * @param {number}   opts.riskScore         — 0.0–1.0
 * @param {string}   opts.decision          — APPROVE|REVIEW|BLOCK
 * @param {string[]} opts.rules             — trigger strings
 * @param {string}   opts.alertId           — fraud_alerts.id UUID
 */
export const sendFraudAlertNotification = async ({
  accountId, txn, alertSeverity, riskScore, decision, rules = [], alertId,
}) => {
  const riskScore100 = Math.round(riskScore * 100 * 10) / 10;

  // Fetch account holder
  const user = await getUserByAccountId(accountId).catch(() => null);
  if (!user) {
    logger.warn(`[notif] Could not find user for account ${accountId} — skipping notification`);
    return;
  }

  const title = `${alertSeverity.toUpperCase()} Fraud Alert: ${txn.transaction_ref}`;
  const body  =
    `Suspicious ${txn.txn_type} of ${txn.currency} ${parseFloat(txn.amount).toFixed(2)} ` +
    `detected (risk: ${riskScore100}/100). Decision: ${decision}.`;

  // ── 1. In-app notification ────────────────────────────────────────────────
  let notifRow;
  try {
    notifRow = await insertNotification({
      userId        : user.id,
      title,
      body,
      channel       : 'in_app',
      relatedEntity : 'fraud_alert',
      relatedId     : alertId ?? txn.id,
      metadata      : { alertSeverity, riskScore100, decision, rules },
    });
  } catch (err) {
    logger.warn(`[notif] In-app notification insert failed: ${err.message}`);
  }

  // ── 2. Email notification ─────────────────────────────────────────────────
  const transport = getTransport();
  if (!transport) {
    logger.info(`[notif] Email skipped (SMTP not configured) — in-app only for ${user.email}`);
    return;
  }

  const fromAddr = process.env.SMTP_FROM ?? '"BankShield Alerts" <alerts@bankshield.in>';
  const html     = fraudAlertEmailHtml({ user, txn, alertSeverity, riskScore100, rules, decision });

  try {
    const info = await transport.sendMail({
      from    : fromAddr,
      to      : user.email,
      subject : `[BankShield] ${alertSeverity.toUpperCase()} Fraud Alert — ${txn.transaction_ref}`,
      html,
      text    : `${title}\n\n${body}\n\nTriggers: ${rules.join(', ') || 'none'}`,
    });

    if (notifRow?.id) {
      await markNotificationSent(notifRow.id).catch(() => {});
    }

    logger.info(
      `[notif] Email sent to ${user.email}  messageId=${info.messageId}  ` +
      `txn=${txn.transaction_ref}  severity=${alertSeverity}`
    );
  } catch (err) {
    logger.error(`[notif] Email send failed for ${user.email}: ${err.message}`);
  }
};

/**
 * Verify the SMTP transport can connect (used by /health endpoint).
 */
export const verifyMailer = async () => {
  const t = getTransport();
  if (!t) return { ok: false, reason: 'SMTP not configured' };
  try {
    await t.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
};

export default { sendFraudAlertNotification, verifyMailer };
