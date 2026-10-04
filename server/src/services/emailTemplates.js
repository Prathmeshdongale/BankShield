/**
 * emailTemplates.js — Reusable HTML email templates for BankShield.
 *
 * Every template function returns { subject, html, text } so the caller
 * only needs to pass it to nodemailer's transport.sendMail().
 *
 * Templates:
 *   reportReady()        — report generation complete, download link
 *   reportFailed()       — report generation failed
 *   fraudAlertEmail()    — (moved here from notificationService for reuse)
 *   assignmentEmail()    — analyst assigned to a fraud alert
 *   accountFrozenEmail() — customer account frozen notification
 *   welcomeEmail()       — new user welcome
 */

// ── Shared layout wrapper ─────────────────────────────────────────────────────
const layout = (title, content, accentColor = '#1d4ed8') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;
                    box-shadow:0 2px 8px rgba(0,0,0,.08);max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="background:${accentColor};padding:24px 32px;">
            <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;
                        letter-spacing:.3px;">🏦 BankShield</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px;">${content}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;
                      border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
            © ${new Date().getFullYear()} BankShield · This is an automated email.
            Please do not reply.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const row = (label, value, bg = '#f9fafb') =>
  `<tr style="background:${bg};">
    <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;
               width:40%;color:#374151;">${label}</td>
    <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;">${value}</td>
  </tr>`;

const btn = (label, href, color = '#1d4ed8') =>
  `<a href="${href}"
     style="display:inline-block;background:${color};color:#fff;padding:12px 24px;
            border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;
            margin-top:16px;">${label}</a>`;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Report ready
// ─────────────────────────────────────────────────────────────────────────────

export const reportReadyEmail = ({ user, report, downloadUrl }) => {
  const subject = `[BankShield] Report Ready — ${report.title}`;
  const html = layout('Report Ready', `
    <p style="color:#374151;margin-top:0;">Hello ${user.first_name},</p>
    <p>Your requested report is ready to download.</p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;margin:16px 0;">
      ${row('Report',  report.title)}
      ${row('Type',    report.report_type.replace(/_/g, ' ').toUpperCase(), '#fff')}
      ${row('Status',  '✅ Ready')}
      ${row('Expires', new Date(report.expires_at).toLocaleDateString(), '#fff')}
    </table>
    ${downloadUrl ? btn('⬇ Download Report', downloadUrl) : ''}
    <p style="margin-top:24px;font-size:13px;color:#6b7280;">
      The download link expires in 7 days.
    </p>
  `);
  const text = `Hello ${user.first_name},\n\nYour report "${report.title}" is ready.\nDownload: ${downloadUrl ?? 'Login to download'}\nExpires: ${new Date(report.expires_at).toLocaleDateString()}\n`;
  return { subject, html, text };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Report failed
// ─────────────────────────────────────────────────────────────────────────────

export const reportFailedEmail = ({ user, report }) => {
  const subject = `[BankShield] Report Generation Failed — ${report.title}`;
  const html = layout('Report Failed', `
    <p style="color:#374151;margin-top:0;">Hello ${user.first_name},</p>
    <p>Unfortunately your report could not be generated.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
      ${row('Report',  report.title)}
      ${row('Type',    report.report_type.replace(/_/g, ' ').toUpperCase(), '#fff')}
      ${row('Reason',  report.error_message ?? 'Unknown error')}
    </table>
    <p>Please try again or contact your system administrator.</p>
  `, '#dc2626');
  const text = `Hello ${user.first_name},\n\nReport "${report.title}" failed.\nReason: ${report.error_message ?? 'Unknown error'}\n`;
  return { subject, html, text };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Fraud alert (reusable across modules)
// ─────────────────────────────────────────────────────────────────────────────

export const fraudAlertEmail = ({ user, txn, alertSeverity, riskScore100, rules, decision }) => {
  const colors = { critical: '#dc2626', high: '#f97316', medium: '#eab308', low: '#22c55e' };
  const c      = colors[alertSeverity] ?? '#6b7280';
  const subject = `[BankShield] ${alertSeverity.toUpperCase()} Fraud Alert — ${txn.transaction_ref}`;
  const html = layout(`${alertSeverity.toUpperCase()} Fraud Alert`, `
    <p style="color:#374151;margin-top:0;">Dear ${user.first_name ?? 'Customer'},</p>
    <p>A suspicious transaction has been detected on your account.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
      ${row('Transaction Ref', `<code>${txn.transaction_ref}</code>`)}
      ${row('Amount', `${txn.currency} ${parseFloat(txn.amount).toFixed(2)}`, '#fff')}
      ${row('Channel', (txn.channel ?? '').toUpperCase())}
      ${row('Risk Score', `<span style="color:${c};font-weight:700;">${riskScore100}/100 (${alertSeverity.toUpperCase()})</span>`, '#fff')}
      ${row('Decision', `<strong>${decision}</strong>`)}
      ${rules?.length ? row('Triggers', rules.join(' · '), '#fff') : ''}
    </table>
    <p><strong>If you did not authorise this transaction, contact BankShield support immediately.</strong></p>
  `, c);
  const text = `${alertSeverity.toUpperCase()} Fraud Alert\n\nTransaction: ${txn.transaction_ref}\nAmount: ${txn.currency} ${parseFloat(txn.amount).toFixed(2)}\nRisk: ${riskScore100}/100\nDecision: ${decision}\nTriggers: ${(rules ?? []).join(', ')}\n\nIf you did not authorise this, contact support immediately.\n`;
  return { subject, html, text };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Alert assigned to analyst
// ─────────────────────────────────────────────────────────────────────────────

export const assignmentEmail = ({ analyst, alert, alertUrl }) => {
  const subject = `[BankShield] Fraud Alert Assigned to You — ${alert.severity?.toUpperCase()}`;
  const html = layout('Alert Assigned', `
    <p style="color:#374151;margin-top:0;">Hello ${analyst.first_name},</p>
    <p>A fraud alert has been assigned to you for investigation.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
      ${row('Alert ID',     alert.id)}
      ${row('Severity',     alert.severity?.toUpperCase(), '#fff')}
      ${row('Risk Score',   `${Math.round(parseFloat(alert.risk_score) * 100)}/100`)}
      ${row('Transaction',  alert.transaction_ref ?? 'N/A', '#fff')}
    </table>
    ${alertUrl ? btn('🔍 View Alert', alertUrl) : ''}
  `);
  const text = `Hello ${analyst.first_name},\n\nFraud alert assigned: ${alert.id}\nSeverity: ${alert.severity}\nScore: ${Math.round(parseFloat(alert.risk_score)*100)}/100\n${alertUrl ? `\nView: ${alertUrl}` : ''}\n`;
  return { subject, html, text };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Account frozen
// ─────────────────────────────────────────────────────────────────────────────

export const accountFrozenEmail = ({ user, accountNumber, reason }) => {
  const subject = '[BankShield] Your Account Has Been Frozen';
  const html = layout('Account Frozen', `
    <p style="color:#374151;margin-top:0;">Dear ${user.first_name ?? 'Customer'},</p>
    <p>Your BankShield account has been frozen as a precautionary measure.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
      ${row('Account',  accountNumber ?? 'Your account')}
      ${row('Reason',   reason ?? 'Suspicious activity detected', '#fff')}
      ${row('Action',   'Contact support to unfreeze your account')}
    </table>
    <p>If you believe this is an error, please contact our support team immediately.</p>
  `, '#dc2626');
  const text = `Dear ${user.first_name ?? 'Customer'},\n\nYour account (${accountNumber ?? ''}) has been frozen.\nReason: ${reason ?? 'Suspicious activity'}\n\nContact support to resolve this.\n`;
  return { subject, html, text };
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Welcome email
// ─────────────────────────────────────────────────────────────────────────────

export const welcomeEmail = ({ user }) => {
  const subject = '[BankShield] Welcome to BankShield';
  const html = layout('Welcome!', `
    <p style="color:#374151;margin-top:0;">Hello ${user.first_name},</p>
    <p>Welcome to BankShield — your secure digital banking platform.</p>
    <p>Your account has been created successfully:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">
      ${row('Email',   user.email)}
      ${row('Role',    user.role?.replace(/_/g, ' ').toUpperCase() ?? 'Customer', '#fff')}
    </table>
    <p>Log in to get started.</p>
  `);
  const text = `Hello ${user.first_name},\n\nWelcome to BankShield!\nEmail: ${user.email}\nRole: ${user.role ?? 'Customer'}\n`;
  return { subject, html, text };
};

export default {
  reportReadyEmail,
  reportFailedEmail,
  fraudAlertEmail,
  assignmentEmail,
  accountFrozenEmail,
  welcomeEmail,
};
