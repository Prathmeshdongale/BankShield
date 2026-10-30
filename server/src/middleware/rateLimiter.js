import rateLimit from 'express-rate-limit';

const API_RATE_LIMIT_MAX = parseInt(
  process.env.API_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'production' ? '300' : '5000'),
  10
);

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: API_RATE_LIMIT_MAX, // Configurable limit per IP window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 60 minutes
  max: process.env.NODE_ENV === 'production' ? 10 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
  },
});

export default apiLimiter;
