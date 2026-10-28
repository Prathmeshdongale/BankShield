/**
 * CustomerDashboard.jsx — Customer self-service dashboard.
 * Shows onboarding panel when no accounts exist; live data otherwise.
 * No hardcoded data.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  CreditCard, TrendingUp, AlertTriangle, ShieldCheck,
  ArrowLeftRight, RefreshCw, Building2, Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge }   from '@/components/ui/StatusBadge';
import { RiskBadge }     from '@/components/fraud/RiskBadge';
import { InlineLoader }  from '@/components/ui/LoadingOverlay';
import { ErrorMessage }  from '@/components/ui/ErrorMessage';
import { Button }        from '@/components/ui/button';
import { accountService }     from '@/services/accountService';
import { transactionService } from '@/services/transactionService';
import { fraudService }       from '@/services/fraudService';
import { dashboardService }   from '@/services/dashboardService';

const fmtAmt = (n) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(n ?? 0);

const fmtDate = (s) => s
  ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
  : '—';
