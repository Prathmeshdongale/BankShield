/**
 * ShapChart.jsx — Horizontal bar chart of SHAP feature contributions.
 *
 * Shared between AlertDetail (fraud alert drawer) and any future
 * inspection surface. Extracted so Recharts is bundled once.
 *
 * Props
 * ─────
 *   shapValues  Array<{ feature: string, value: number, shap: number }>
 *               Top-N SHAP entries, pre-sorted by |shap| descending.
 *               Comes from fraud_predictions.explanation.shap_values.
 *
 * Rendering
 * ─────────
 *   • Positive SHAP (red)  → feature pushes score toward fraud
 *   • Negative SHAP (green)→ feature pushes score toward legitimate
 *   • ReferenceLine at x=0 anchors the zero baseline
 *   • Custom tooltip: feature label + raw input value + SHAP + direction
 *   • Empty state shown when shapValues is null/empty (heuristic fallback)
 */
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { BarChart2 } from 'lucide-react';

// ── Feature name → human-readable label ──────────────────────────────────────
export const FEATURE_LABELS = {
  amount_log              : 'Amount (log)',
  amount                  : 'Amount',
  hour_of_day             : 'Hour of Day',
  day_of_week             : 'Day of Week',
  is_weekend              : 'Weekend',
  is_night                : 'Night-time',
  balance_ratio           : 'Balance Ratio',
  amount_zscore           : 'Amount Z-score',
  velocity_1h             : 'Velocity (1 h)',
  velocity_24h            : 'Velocity (24 h)',
  amount_sum_1h           : 'Spend Sum (1 h)',
  distinct_merchants_24h  : 'Distinct Merchants',
  merchant_category_risk  : 'Merchant Risk',
  country_mismatch        : 'Country Mismatch',
  is_new_device           : 'New Device',
  is_new_beneficiary      : 'New Beneficiary',
  card_type_encoded       : 'Card Type',
  channel_encoded         : 'Channel',
};

export const prettyFeature = (name) =>
  FEATURE_LABELS[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ── Custom tooltip ────────────────────────────────────────────────────────────
const ShapTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-900 text-xs max-w-[220px]">
      <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
        {prettyFeature(d.feature)}
      </p>
      <p className="text-gray-500">
        Input value:{' '}
        <span className="font-mono font-medium text-gray-700 dark:text-gray-300">
          {typeof d.value === 'number' ? d.value.toFixed(4) : d.value}
        </span>
      </p>
      <p className={d.shap >= 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
        SHAP:{' '}
        <span className="font-mono font-bold">
          {d.shap >= 0 ? '+' : ''}{d.shap.toFixed(4)}
        </span>
      </p>
      <p className="mt-0.5 text-[10px] text-gray-400">
        {d.shap >= 0 ? '↑ Increases fraud risk' : '↓ Decreases fraud risk'}
      </p>
    </div>
  );
};

// ── ShapChart ─────────────────────────────────────────────────────────────────
const ShapChart = ({ shapValues }) => {
  if (!shapValues?.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 py-8 text-gray-400 dark:border-gray-700">
        <BarChart2 className="h-7 w-7" />
        <p className="text-xs text-center">
          SHAP explanations not available.
          <br />
          <span className="text-[11px] text-gray-300 dark:text-gray-600">
            Requires XGBoost model (not heuristic fallback).
          </span>
        </p>
      </div>
    );
  }

  // Sort most-positive first, then most-negative (for visual clarity)
  const data = [...shapValues]
    .sort((a, b) => b.shap - a.shap)
    .map(d => ({ ...d, label: prettyFeature(d.feature) }));

  const maxAbs = Math.max(...data.map(d => Math.abs(d.shap)), 0.0001);
  const domain = [-maxAbs * 1.15, maxAbs * 1.15];

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        <span className="font-medium text-red-500">Red bars</span> push the score toward fraud;{' '}
        <span className="font-medium text-green-500">green bars</span> push it toward legitimate.
      </p>

      <ResponsiveContainer width="100%" height={data.length * 42 + 20}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
        >
          <XAxis
            type="number"
            domain={domain}
            tickFormatter={v => v.toFixed(3)}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={138}
            tick={{ fontSize: 11, fill: 'currentColor' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ShapTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
          <ReferenceLine x={0} stroke="#9ca3af" strokeDasharray="3 3" strokeWidth={1.5} />
          <Bar dataKey="shap" radius={[0, 3, 3, 0]} maxBarSize={20}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.shap >= 0 ? '#ef4444' : '#22c55e'}
                fillOpacity={0.82}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ShapChart;
