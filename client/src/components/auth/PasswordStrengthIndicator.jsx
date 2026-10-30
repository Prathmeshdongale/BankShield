/**
 * PasswordStrengthIndicator.jsx — Live interactive password strength and policy meter.
 * Validates BankShield 12+ char enterprise security requirements.
 */
import React from 'react';
import { Check, X } from 'lucide-react';

export const checkPasswordRules = (password = '', confirmPassword = null) => {
  const hasMinLen   = password.length >= 12;
  const hasUpper    = /[A-Z]/.test(password);
  const hasLower    = /[a-z]/.test(password);
  const hasNumber   = /\d/.test(password);
  const hasSpecial  = /[!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~]/.test(password);
  const noWhitespace = password === password.trim() && password.length > 0;
  const matches     = confirmPassword !== null ? (password === confirmPassword && password.length > 0) : true;

  const passedCount = [hasMinLen, hasUpper, hasLower, hasNumber, hasSpecial, noWhitespace].filter(Boolean).length;

  return {
    hasMinLen,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
    noWhitespace,
    matches,
    passedCount,
    isValid: hasMinLen && hasUpper && hasLower && hasNumber && hasSpecial && noWhitespace && matches,
  };
};

export const PasswordStrengthIndicator = ({ password = '', confirmPassword = null }) => {
  const rules = checkPasswordRules(password, confirmPassword);

  const items = [
    { label: 'At least 12 characters', valid: rules.hasMinLen },
    { label: 'One uppercase letter (A-Z)', valid: rules.hasUpper },
    { label: 'One lowercase letter (a-z)', valid: rules.hasLower },
    { label: 'One number (0-9)', valid: rules.hasNumber },
    { label: 'One special character (!@#$%^&*)', valid: rules.hasSpecial },
  ];

  if (confirmPassword !== null) {
    items.push({ label: 'Passwords match', valid: rules.matches });
  }

  // Bar color based on passed count (out of 5)
  const strengthPercent = Math.min(100, Math.round((rules.passedCount / 5) * 100));
  const barColor =
    rules.passedCount >= 5 ? 'bg-emerald-500' :
    rules.passedCount >= 3 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="mt-2.5 space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-300">
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        <span>Password Security Requirements</span>
        <span>{rules.passedCount} of 5 met</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${strengthPercent}%` }}
        />
      </div>

      {/* Rules list */}
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 pt-1">
        {items.map((item, idx) => (
          <li
            key={idx}
            className={`flex items-center gap-1.5 text-[11px] transition-colors ${
              item.valid ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {item.valid ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PasswordStrengthIndicator;
