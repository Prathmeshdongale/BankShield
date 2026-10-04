"""
prediction.py — Response schemas for POST /predict.

PredictionResponse is the canonical output returned by every call to /predict.
It is also what the BankShield Node.js service expects from mlClient.js.

risk_score (0–100) vs fraud_probability (0.0–1.0)
─────────────────────────────────────────────────
• fraud_probability is the raw XGBoost output: a calibrated probability in [0, 1].
• risk_score is risk_score = round(fraud_probability * 100, 1), a human-friendly
  0–100 scale used in dashboards.

risk_level thresholds (configurable via env vars; defaults below):
  CRITICAL  risk_score ≥ 80   →  block immediately
  HIGH      risk_score ≥ 60   →  block / analyst review
  MEDIUM    risk_score ≥ 30   →  flag for review
  LOW       risk_score <  30  →  approve
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
import os


# ── Decision thresholds (override via environment variables) ──────────────────
_CRITICAL_SCORE = float(os.getenv("RISK_CRITICAL_SCORE", "80"))
_HIGH_SCORE     = float(os.getenv("RISK_HIGH_SCORE",     "60"))
_MEDIUM_SCORE   = float(os.getenv("RISK_MEDIUM_SCORE",   "30"))


def score_to_risk_level(risk_score: float) -> str:
    """Convert 0–100 risk score to a risk level string."""
    if risk_score >= _CRITICAL_SCORE:
        return "CRITICAL"
    if risk_score >= _HIGH_SCORE:
        return "HIGH"
    if risk_score >= _MEDIUM_SCORE:
        return "MEDIUM"
    return "LOW"


class PredictionResponse(BaseModel):
    """
    Response body for POST /predict.

    Fields
    ------
    fraud_probability : float   Raw model output probability [0.0, 1.0]
    risk_score        : float   Human-friendly score [0.0, 100.0]
    risk_level        : str     LOW | MEDIUM | HIGH | CRITICAL
    prediction        : bool    True if transaction is classified as fraud
    decision          : str     APPROVE | REVIEW | BLOCK
    model_version     : str     Model identifier string
    latency_ms        : float   End-to-end inference latency in milliseconds
    request_id        : str     UUID of this prediction request (for correlation)
    rules_triggered   : list    Human-readable fraud signals that fired
    feature_contributions : dict  Top feature name → contribution score (optional)
    """

    # ── Core prediction fields ────────────────────────────────────────────────
    fraud_probability: float = Field(
        ..., ge=0.0, le=1.0,
        description="Raw model fraud probability [0.0, 1.0]",
        examples=[0.8731],
    )
    risk_score: float = Field(
        ..., ge=0.0, le=100.0,
        description="Risk score on 0–100 scale (fraud_probability × 100)",
        examples=[87.3],
    )
    risk_level: str = Field(
        ..., pattern=r"^(LOW|MEDIUM|HIGH|CRITICAL)$",
        description="Risk tier: LOW (<30) | MEDIUM (30–60) | HIGH (60–80) | CRITICAL (≥80)",
        examples=["HIGH"],
    )
    prediction: bool = Field(
        ...,
        description="True = classified as fraud, False = legitimate",
        examples=[True],
    )
    decision: str = Field(
        ..., pattern=r"^(APPROVE|REVIEW|BLOCK)$",
        description="Recommended action: APPROVE | REVIEW | BLOCK",
        examples=["BLOCK"],
    )
    model_version: str = Field(
        "xgboost-v2.0",
        description="Identifier of the model used for this prediction",
    )

    # ── Observability ──────────────────────────────────────────────────────────
    latency_ms: float = Field(
        0.0, ge=0.0,
        description="Total inference latency in milliseconds",
        examples=[4.2],
    )
    request_id: str = Field(
        "",
        description="UUID of this prediction request for log correlation",
    )

    # ── Explainability (optional) ──────────────────────────────────────────────
    rules_triggered: List[str] = Field(
        default_factory=list,
        description="List of human-readable fraud signal strings that fired",
    )
    feature_contributions: Optional[Dict[str, float]] = Field(
        None,
        description="Top contributing features → SHAP value (summary dict)",
    )
    shap_values: List[Dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "Top-5 SHAP feature contributions as a rich list: "
            "[{feature: str, value: float, shap: float}, ...] "
            "sorted by |shap| descending. Empty when model unavailable."
        ),
    )

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "fraud_probability"    : 0.8731,
            "risk_score"           : 87.3,
            "risk_level"           : "CRITICAL",
            "prediction"           : True,
            "decision"             : "BLOCK",
            "model_version"        : "xgboost-v2.0",
            "latency_ms"           : 3.8,
            "request_id"           : "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            "rules_triggered"      : ["night_transaction", "country_mismatch", "high_velocity"],
            "feature_contributions": {"is_night": 0.18, "country_mismatch": 0.15},
        }
    })


class HealthResponse(BaseModel):
    """Response body for GET /health."""
    status         : str  = Field(..., examples=["ok"])
    service        : str  = Field(..., examples=["BankShield ML Service"])
    version        : str  = Field(..., examples=["1.0.0"])
    model_loaded   : bool = Field(..., description="True if XGBoost model is loaded")
    model_version  : str  = Field(..., examples=["xgboost-v2.0"])
    model_features : int  = Field(..., description="Number of input features expected")
    threshold      : float = Field(..., description="Active decision threshold")
    uptime_seconds : float = Field(..., description="Service uptime in seconds")
    timestamp      : str  = Field(..., examples=["2026-10-02T12:00:00.000000"])
