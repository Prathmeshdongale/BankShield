/**
 * securityOtpService.js — Client API calls for the Security OTP & Step-Up Verification Module.
 */
import api from './api';

export const securityOtpService = {
  /**
   * Request a single-use 6-digit OTP for sensitive security operations.
   * @param {string} purpose e.g. 'account_closure', 'card_removal', 'password_change', 'security_verification'
   */
  requestOtp: (purpose = 'security_verification') =>
    api.post('/security/otp/request', { purpose }).then(r => r.data),

  /**
   * Verify an entered 6-digit OTP.
   * @param {object} params { otp: string, purpose: string }
   */
  verifyOtp: ({ otp, purpose = 'security_verification' }) =>
    api.post('/security/otp/verify', { otp, purpose }).then(r => r.data),

  /**
   * Fetch current 2FA status, last verified timestamp, and recent verification history.
   */
  getStatus: () =>
    api.get('/security/otp/status').then(r => r.data),
};

export default securityOtpService;
