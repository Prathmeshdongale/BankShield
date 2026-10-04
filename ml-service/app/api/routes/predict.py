"""
predict.py — POST /predict  (core inference endpoint)

Flow
────
1.  Generate a UUID request_id for log correlation.
2.  Start a high-resolution timer.
3.  Validate input with Pydantic (happens before this handler runs).
4.  Call fraud_detector.predict_risk() — the model was loaded once at startup.
5.  Build the human-readable rule triggers list.
6.  Map raw probability → risk_score (0–100) → risk_level → decision.
7.  Record latency and log a structured line.
8.  Return PredictionResponse.

The model singleton (fraud_detector) is imported at module load time.
No per-request model loading — latency is dominated by numpy inference only.
"""

import time
import uuid
import logging

from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import JSONResponse

from app.schemas.transaction import TransactionFeatures
from app.schemas.prediction  import PredictionResponse, score_to_risk_level
from app.models.fraud_detector import fraud_detector

logger = logging.getLogger("bankshield-ml")
router = APIRouter()


# ── Rule-trigger helper ────────────────────────────────────────────────────────

def _g_float(payload: dict, key: str, default: float) -> float:
    """Safe float getter — returns default when value is None or missing."""
    v = payload.get(key)
    return float(v) if v is not None else default


def _g_int(payload: dict, key: str, default: int) -> int:
    """Safe int getter — returns default when value is None or missing."""
    v = payload.get(key)
    return int(v) if v is not None else default


def _g_bool(payload: dict, key: str, default: bool = False) -> bool:
    v = payload.get(key)
    return bool(v) if v is not None else default


def _build_rule_triggers(payload: dict, fraud_prob: float) -> list[str]:
    """
    Return a list of human-readable strings for the top fraud signals that fired.
    These appear in PredictionResponse.rules_triggered and are useful for
    analyst review and the Node.js fraud_alerts.trigger_reasons JSONB field.
    """
    triggers = []
    amount    = _g_float(payload, "amount", 0.0)
    hour      = _g_int(payload, "hour_of_day", 12)
    vel_1h    = _g_int(payload, "velocity_1h", 1)
    vel_24h   = _g_int(payload, "velocity_24h", 3)
    acct_bal  = _g_float(payload, "account_balance", 10_000.0)
    acct_mean = _g_float(payload, "account_mean_txn", amount)
    acct_std  = _g_float(payload, "account_std_txn", max(amount * 0.5, 1.0))
    bal_ratio = amount / (acct_bal + 1)
    z_score   = (amount - acct_mean) / (acct_std + 1)
    merchants = _g_int(payload, "distinct_merchants_24h", 1)
    merch_cat = str(payload.get("merchant_category") or "").lower()

    if hour >= 23 or hour <= 4:
        triggers.append("night_transaction")
    if _g_bool(payload, "country_mismatch"):
        triggers.append("country_mismatch")
    if _g_bool(payload, "is_new_device"):
        triggers.append("new_device")
    if _g_bool(payload, "is_new_beneficiary"):
        triggers.append("new_beneficiary")
    if vel_1h >= 3:
        triggers.append(f"high_velocity_1h:{vel_1h}")
    if vel_24h >= 12:
        triggers.append(f"high_velocity_24h:{vel_24h}")
    if merchants >= 6:
        triggers.append(f"many_merchants_24h:{merchants}")
    if bal_ratio >= 0.5:
        triggers.append(f"high_balance_ratio:{bal_ratio:.2f}")
    if z_score >= 3.0:
        triggers.append(f"amount_outlier_zscore:{z_score:.1f}")
    if any(k in merch_cat for k in ("crypto", "gambling", "wire", "forex", "gaming")):
        triggers.append(f"high_risk_merchant:{merch_cat}")
    ct = str(payload.get("card_type") or "").lower()
    if ct in ("prepaid", "virtual"):
        triggers.append(f"card_type:{ct}")
    if fraud_prob >= 0.90:
        triggers.append("model_high_confidence_fraud")
    return triggers


# ── Inference endpoint ────────────────────────────────────────────────────────

@router.post(
    "/predict",
    response_model   = PredictionResponse,
    summary          = "Fraud Risk Prediction",
    description      = (
        "Score a single bank transaction for fraud risk using a pre-trained "
        "XGBoost model. Returns fraud probability, 0–100 risk score, risk level "
        "(LOW/MEDIUM/HIGH/CRITICAL), and a recommended decision (APPROVE/REVIEW/BLOCK). "
        "Median latency < 5 ms."
    ),
    response_description = "Fraud prediction with risk score and decision",
    status_code      = status.HTTP_200_OK,
    tags             = ["Inference"],
)
async def predict_fraud(payload: TransactionFeatures, request: Request) -> PredictionResponse:
    request_id = str(uuid.uuid4())
    t_start    = time.perf_counter()

    # ── Run inference ─────────────────────────────────────────────────────────
    try:
        payload_dict = payload.model_dump()
        result       = fraud_detector.predict_risk(payload_dict)
    except Exception as exc:
        logger.error(
            "[predict] inference error  request_id=%s  error=%s",
            request_id, str(exc), exc_info=True,
        )
        raise HTTPException(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail      = "Inference failed — check model availability.",
        )

    latency_ms       = (time.perf_counter() - t_start) * 1000
    fraud_probability = float(result["risk_score"])                  # already in [0,1]
    risk_score        = round(fraud_probability * 100, 1)
    risk_level        = score_to_risk_level(risk_score)
    prediction        = bool(result["is_fraud"])
    decision          = str(result["decision"])
    model_version     = str(result.get("model_version", "unknown"))

    rules_triggered = _build_rule_triggers(payload_dict, fraud_probability)

    # ── SHAP feature contributions (top-5 from fraud_detector) ───────────────
    shap_top5 = result.get("shap_values") or []
    # Convert list[{feature, value, shap}] → dict{feature: shap} for the schema
    # Keep the richer list form in feature_contributions for downstream storage.
    feature_contributions: dict | None = (
        {item["feature"]: item["shap"] for item in shap_top5}
        if shap_top5 else None
    )

    # ── Structured log line ───────────────────────────────────────────────────
    logger.info(
        "[predict] request_id=%s  amount=%.2f  channel=%s  "
        "fraud_prob=%.4f  risk_score=%.1f  risk_level=%s  "
        "decision=%s  latency_ms=%.2f  rules=%s  shap_features=%s",
        request_id,
        float(payload.amount),
        str(payload.channel or "?"),
        fraud_probability,
        risk_score,
        risk_level,
        decision,
        latency_ms,
        ",".join(rules_triggered) if rules_triggered else "none",
        ",".join(item["feature"] for item in shap_top5) if shap_top5 else "none",
    )

    return PredictionResponse(
        fraud_probability      = fraud_probability,
        risk_score             = risk_score,
        risk_level             = risk_level,
        prediction             = prediction,
        decision               = decision,
        model_version          = model_version,
        latency_ms             = round(latency_ms, 2),
        request_id             = request_id,
        rules_triggered        = rules_triggered,
        feature_contributions  = feature_contributions,
        shap_values            = shap_top5,
    )
