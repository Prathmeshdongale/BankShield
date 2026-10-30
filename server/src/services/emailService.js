/**
 * emailService.js — Outbound email delivery service.
 * Supports SMTP via Nodemailer when configured, with terminal/logger fallback for development.
 */

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

let _transport = null;

export const getMailTransport = () => {
  if (_transport) return _transport;
  if (!process.env.SMTP_HOST) {
    return null;
  }
  _transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transport;
};

export const sendEmail = async ({ to, subject, html, text }) => {
  const transport = getMailTransport();
  if (!transport) {
    logger.info(`[Email Service - No SMTP Configured] To: ${to} | Subject: ${subject}`);
    return { sent: false, reason: 'NO_SMTP' };
  }
  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM || '"BankShield Security" <security@bankshield.internal>',
      to,
      subject,
      html,
      text,
    });
    logger.info(`[Email Service - Sent] MessageId: ${info.messageId} to ${to}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`[Email Service - Error] Failed to send email to ${to}: ${err.message}`);
    return { sent: false, error: err.message };
  }
};

/**
 * Send Super Admin Login OTP via Email.
 */
export const sendSuperAdminOtpEmail = async (email, otp) => {
  const subject = `[BankShield] Your Super Admin Login OTP is ${otp}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>BankShield Login OTP</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b1120; color: #f8fafc;">
  <div style="max-width: 520px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);">
    <div style="background: linear-gradient(135deg, #1d4ed8, #2563eb); padding: 28px 32px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">
        🛡️ Bank<span style="color: #93c5fd;">Shield</span>
      </h1>
      <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 13px;">Enterprise Fraud Detection Platform</p>
    </div>
    
    <div style="padding: 32px;">
      <h2 style="margin-top: 0; color: #f8fafc; font-size: 18px; font-weight: 600;">Super Admin Sign-in Verification</h2>
      <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
        A sign-in request was initiated for your administrator account (<strong style="color: #e2e8f0;">${email}</strong>).
      </p>
      
      <p style="color: #cbd5e1; font-size: 14px; margin-bottom: 8px;">Use the following One-Time Password (OTP) to complete sign-in:</p>
      
      <div style="background: #0f172a; border: 2px dashed #3b82f6; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-family: monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #60a5fa;">${otp}</span>
      </div>
      
      <p style="color: #f59e0b; font-size: 13px; margin: 12px 0 20px; line-height: 1.5;">
        ⚠️ This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
      </p>
      
      <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 0;">
        If you did not initiate this request, someone may be attempting to access your account. Please inspect platform audit logs immediately.
      </p>
    </div>
    
    <div style="background: #0f172a; padding: 16px 32px; text-align: center; border-top: 1px solid #334155;">
      <p style="margin: 0; color: #64748b; font-size: 11px;">
        © ${new Date().getFullYear()} BankShield · Automated Security Service · Do not reply
      </p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `BankShield Super Admin Verification Code: ${otp}\n\nUse this code to sign in to your Super Admin account. Valid for 10 minutes.\nIf you did not request this code, review security logs immediately.`;

  logger.info(`\n` +
    `============================================================\n` +
    `🔐 [SUPER ADMIN OTP] Code for ${email}: ${otp}\n` +
    `    Valid for 10 minutes (expires at ${new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString()})\n` +
    `============================================================\n`
  );

  return sendEmail({ to: email, subject, html, text });
};

export default {
  sendEmail,
  sendSuperAdminOtpEmail,
  getMailTransport,
};
