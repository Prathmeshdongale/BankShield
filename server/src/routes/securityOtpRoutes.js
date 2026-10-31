/**
 * securityOtpRoutes.js — Routes for Security OTP Verification & Step-Up Authentication.
 */

import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  requestOtp,
  verifyOtp,
  getStatus,
} from '../controllers/securityOtpController.js';

const router = Router();

// All security OTP endpoints require authentication
router.use(authenticate);

// Request a new security OTP
router.post('/request', requestOtp);

// Verify an entered 6-digit security OTP
router.post('/verify', verifyOtp);

// Retrieve security verification health & history
router.get('/status', getStatus);

export default router;
