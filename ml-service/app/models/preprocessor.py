"""
preprocessor.py — Feature engineering for BankShield fraud detection.

Maps a raw TransactionFeatures payload (from the FastAPI /predict endpoint)
into the 18-dimensional numpy array expected by the XGBoost model trained in
notebooks/train.py.

Feature order MUST match notebooks/train.py::FEATURE_NAMES exactly.

    Index  Name                      Description
    ─────  ────────────────────────  ──────────────────────────────────────────
    0      amount_log                log1p(amount) — reduces skew for tree splits
    1      hour_of_day               0–23
    2      day_of_week               0=Mon … 6=Sun  (default: 2 = Wednesday)
    3      is_weekend                1 if Sat/Sun
    4      is_night                  1 if hour ∈ {23,0,1,2,3,4}
    5      balance_ratio             amount / (account_balance + 1)
    6      amount_zscore             (amount − account_mean_txn) / (account_std_txn + 1)
    7      velocity_1h               txn count last 1 hour from same account
    8      velocity_24h              txn count last 24 hours
    9      amount_sum_1h             log1p(total spend in last 1 hour)
    10     distinct_merchants_24h    distinct merchants in last 24 hours
    11     merchant_category_risk    0=low 1=medium 2=high
    12     country_mismatch          1 if txn country ≠ account home country
    13     is_new_device             1 if device never seen in last 30 days
    14     is_new_beneficiary        1 if destination account is new
    15     card_type_encoded         0=debit 1=credit 2=prepaid 3=virtual
    16     channel_encoded           0=web 1=mobile 2=atm 3=pos 4=upi 5=neft 6=branch
    17     amount                    raw amount (kept for large-amount tree splits)
"""

import math
import numpy as np
from datetime import datetime


# ── Encoding maps ─────────────────────────────────────────────────────────────

CARD_TYPE_ENC = {"debit": 0, "credit": 1, "prepaid": 2, "virtual": 3}

CHANNEL_ENC = {"web": 0, "mobile": 1, "atm": 2, "pos": 3,
               "upi": 4, "neft": 5, "rtgs": 5, "imps": 5, "branch": 6, "api": 0}

# Merchant categories considered high-risk
HIGH_RISK_CATEGORIES = {
    "travel", "airline", "hotel", "gambling", "gaming", "crypto",
    "cryptocurrency", "wire_transfer", "money_transfer", "foreign_exchange",
    "fx", "luxury", "jewellery", "electronics",
}
MEDIUM_RISK_CATEGORIES = {
    "retail", "clothing", "food", "restaurant", "entertainment",
    "subscription", "streaming",
}


def _merchant_risk(category: str | None) -> float:
    if not category:
        return 0.0
    cat = category.lower().replace(" ", "_").replace("-", "_")
    if any(h in cat for h in HIGH_RISK_CATEGORIES):
        return 2.0
    if any(m in cat for m in MEDIUM_RISK_CATEGORIES):
        return 1.0
    return 0.0


class FeaturePreprocessor:
    """
    Transforms a raw transaction payload dict into a (1, 18) numpy array.

    Accepted payload keys (all optional except 'amount'):
        amount                 float — transaction amount (required)
        hour_of_day            int   — 0–23 (default: current hour)
        day_of_week            int   — 0–6  (default: current weekday)
        account_balance        float — current account balance (default: 10000)
        account_mean_txn       float — historical mean transaction size (default: amount)
        account_std_txn        float — historical std of transaction size  (default: amount*0.5)
        velocity_1h            int   — txn count in last 1h (default: 1)
        velocity_24h           int   — txn count in last 24h (default: 3)
        amount_sum_1h          float — total spend last 1h (default: amount)
        distinct_merchants_24h int   — distinct merchants last 24h (default: 1)
        merchant_category      str   — category string (default: "")
        country_mismatch       bool  — (default: False)
        is_new_device          bool  — (default: False)
        is_new_beneficiary     bool  — (default: False)
        card_type              str   — debit|credit|prepaid|virtual (default: "debit")
        channel                str   — web|mobile|atm|pos|upi|neft|branch (default: "web")
    """

    feature_names = [
        "amount_log",
        "hour_of_day",
        "day_of_week",
        "is_weekend",
        "is_night",
        "balance_ratio",
        "amount_zscore",
        "velocity_1h",
        "velocity_24h",
        "amount_sum_1h",
        "distinct_merchants_24h",
        "merchant_category_risk",
        "country_mismatch",
        "is_new_device",
        "is_new_beneficiary",
        "card_type_encoded",
        "channel_encoded",
        "amount",
    ]

    def transform(self, payload: dict) -> np.ndarray:
        now     = datetime.utcnow()
        amount  = float(payload.get("amount", 0.0) or 0.0)

        def _get_float(key, default):
            v = payload.get(key)
            return float(v) if v is not None else float(default)

        def _get_int(key, default):
            v = payload.get(key)
            return int(v) if v is not None else int(default)

        # ── Temporal ─────────────────────────────────────────────────────────
        hour  = _get_int("hour_of_day", now.hour)
        dow   = _get_int("day_of_week",  now.weekday())
        is_weekend  = float(dow >= 5)
        is_night    = float(hour >= 23 or hour <= 4)

        # ── Amount features ───────────────────────────────────────────────────
        amount_log   = math.log1p(max(amount, 0.0))
        acct_balance = _get_float("account_balance", 10_000.0)
        acct_mean    = _get_float("account_mean_txn", amount)
        acct_std     = _get_float("account_std_txn",  max(amount * 0.5, 1.0))

        balance_ratio = min(amount / (acct_balance + 1), 10.0)
        amount_zscore = min((amount - acct_mean) / (acct_std + 1), 10.0)
        amount_zscore = max(amount_zscore, -5.0)

        # ── Velocity ──────────────────────────────────────────────────────────
        velocity_1h             = _get_float("velocity_1h",  1)
        velocity_24h            = _get_float("velocity_24h", 3)
        amount_sum_1h_raw       = _get_float("amount_sum_1h", amount)
        amount_sum_1h_log       = math.log1p(max(amount_sum_1h_raw, 0.0))
        distinct_merchants_24h  = _get_float("distinct_merchants_24h", 1)

        # ── Categorical / context ─────────────────────────────────────────────
        merch_cat  = _merchant_risk(payload.get("merchant_category", ""))
        ctry_mm    = float(bool(payload.get("country_mismatch", False)))
        new_dev    = float(bool(payload.get("is_new_device",    False)))
        new_ben    = float(bool(payload.get("is_new_beneficiary", False)))

        card_raw   = str(payload.get("card_type",  "debit")).lower()
        chan_raw    = str(payload.get("channel",    "web")).lower()
        card_enc   = float(CARD_TYPE_ENC.get(card_raw, 0))
        chan_enc    = float(CHANNEL_ENC.get(chan_raw,   0))

        features = [
            amount_log,            # 0
            float(hour),           # 1
            float(dow),            # 2
            is_weekend,            # 3
            is_night,              # 4
            balance_ratio,         # 5
            amount_zscore,         # 6
            velocity_1h,           # 7
            velocity_24h,          # 8
            amount_sum_1h_log,     # 9
            distinct_merchants_24h,# 10
            merch_cat,             # 11
            ctry_mm,               # 12
            new_dev,               # 13
            new_ben,               # 14
            card_enc,              # 15
            chan_enc,              # 16
            float(amount),         # 17
        ]
        return np.array(features, dtype=np.float32).reshape(1, -1)
