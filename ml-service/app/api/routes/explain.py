"""
explain.py — POST /explain

Returns SHAP-based feature attribution for a single transaction payload.
Reuses the fraud_detector singleton's _compute_shap() so the explainer
is only built once at startup and the feature engineering is identical
to /predict (same FeaturePreprocessor path).

Response shape
──────────────
{
  "success"         : true,
  "risk_score"      : 0.7412,          // 0–1 probability
  "risk_score_100"  : 74.1,            // 0–100 display score
  "risk_level"      : "HIGH",
  "decision"        : "REVIEW",
  "shap_values"     : [                // top-5 by |shap|
    { "feature": "velocity_1h",   "value": 5.0, "shap":  0.1823, "label": "Velocity (1 h)" },
    { "feature": "is_night",      "value": 1.0, "shap":  0.1104, "label": "Night-time"     },
    ...
  ],
  "baseline"        : 0.0412,          // SHAP expected_value (model base rate)
  "model_version"   : "xgboost-v2.0",
  "is_model_loaded" : true,
  "message"         : null             // set when falling back to heuristic
}
"""

import logging
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.transaction  import TransactionFeatures
from app.schemas.prediction   import score_to_risk_level
from app.models.fraud_detector import fraud_detector

logger = logging.getLogger("bankshield-ml")
router = APIRouter()

# ── Human-readable feature labels (mirrors AlertDetail.jsx FEATURE_LABELS) ────
_FEATURE_LABELS: dict[str, str] = {
    "amount_log"            : "Amount (log)",
    "amount"                : "Amount",
    "hour_of_day"           : "Hour of Day",
    "day_of_week"           : "Day of Week",
    "is_weekend"            : "Weekend",
    "is_night"              : "Night-time",
    "balance_ratio"         : "Balance Ratio",
    "amount_zscore"         : "Amount Z-score",
    "velocity_1h"           : "Velocity (1 h)",
    "velocity_24h"          : "Velocity (24 h)",
    "amount_sum_1h"         : "Spend Sum (1 h)",
    "distinct_merchants_24h": "Distinct Merchants",
    "merchant_category_risk": "Merchant Risk",
    "country_mismatch"      : "Country Mismatch",
    "is_new_device"         : "New Device",
    "is_new_beneficiary"    : "New Beneficiary",
    "card_type_encoded"     : "Card Type",
    "channel_encoded"       : "Channel",
}


def _label(name: str) -> str:
    return _FEATURE_LABELS.get(name, name.replace("_", " ").title())


@router.post(
    "/explain",
    summary     = "SHAP Feature Attribution",
    description = (
        "Explain a fraud prediction using SHAP TreeExplainer values. "
        "Runs the same feature pipeline as /predict and returns the top-5 "
        "features by absolute SHAP contribution, plus the model baseline. "
        "Falls back gracefully when the XGBoost model is not loaded."
    ),
    tags        = ["Explainability"],
)
async def explain_fraud(payload: TransactionFeatures) -> JSONResponse:
    payload_dict = payload.model_dump()

    # ── Run full predict_risk (includes SHAP) ─────────────────────────────────
    result       = fraud_detector.predict_risk(payload_dict)
    risk_prob    = float(result["risk_score"])          # 0–1
    risk_score   = round(risk_prob * 100, 1)            # 0–100
    risk_level   = score_to_risk_level(risk_score)
    decision     = result["decision"]
    model_version = result["model_version"]
    shap_raw     = result.get("shap_values") or []      # [{feature,value,shap}]

    # Enrich with human-readable label
    shap_enriched = [
        {
            "feature": item["feature"],
            "value"  : item["value"],
            "shap"   : item["shap"],
            "label"  : _label(item["feature"]),
        }
        for item in shap_raw
    ]

    # ── SHAP baseline (expected_value of the explainer) ───────────────────────
    baseline = None
    if fraud_detector._explainer is not None:
        try:
            ev = fraud_detector._explainer.expected_value
            # Binary XGBoost: expected_value is either a scalar or list[float]
            baseline = round(float(ev[1]) if hasattr(ev, "__len__") else float(ev), 4)
        except Exception:
            pass

    # ── Message for heuristic fallback ────────────────────────────────────────
    is_model_loaded = fraud_detector.model is not None
    message = (
        None if is_model_loaded
        else "Running in heuristic-fallback mode — SHAP unavailable. "
             "Load an XGBoost model to enable SHAP explanations."
    )

    logger.info(
        "[explain] amount=%.2f  risk=%.1f  level=%s  decision=%s  "
        "shap_features=%d  model_loaded=%s",
        float(payload.amount), risk_score, risk_level, decision,
        len(shap_enriched), is_model_loaded,
    )

    return JSONResponse(content={
        "success"        : True,
        "risk_score"     : risk_prob,
        "risk_score_100" : risk_score,
        "risk_level"     : risk_level,
        "decision"       : decision,
        "shap_values"    : shap_enriched,
        "baseline"       : baseline,
        "model_version"  : model_version,
        "is_model_loaded": is_model_loaded,
        "message"        : message,
    })
