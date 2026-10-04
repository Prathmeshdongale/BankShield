/**
 * transactionService.js — API calls for the transactions module.
 * Mirrors server/src/routes/transactionRoutes.js
 */
import api from './api';

export const transactionService = {
  // ── Read ─────────────────────────────────────────────────────────────────
  list: (params = {}) =>
    api.get('/transactions', { params }).then(r => r.data),

  get: (idOrRef) =>
    api.get(`/transactions/${idOrRef}`).then(r => r.data),

  // ── Write — one method per transaction type ──────────────────────────────
  deposit: (data) =>
    api.post('/transactions/deposit', data).then(r => r.data),

  withdraw: (data) =>
    api.post('/transactions/withdraw', data).then(r => r.data),

  transfer: (data) =>
    api.post('/transactions/transfer', data).then(r => r.data),

  cardPayment: (data) =>
    api.post('/transactions/card-payment', data).then(r => r.data),

  upiPayment: (data) =>
    api.post('/transactions/upi', data).then(r => r.data),

  atmWithdrawal: (data) =>
    api.post('/transactions/atm', data).then(r => r.data),

  onlinePayment: (data) =>
    api.post('/transactions/online', data).then(r => r.data),

  // ── Legacy alias (keeps old hook working) ────────────────────────────────
  getTransactions: (params = {}) =>
    api.get('/transactions', { params }).then(r => r.data),

  createTransfer: (data) =>
    api.post('/transactions/transfer', data).then(r => r.data),
};

export default transactionService;
