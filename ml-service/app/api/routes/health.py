"""
health.py — GET /health

Returns service status plus model metadata so the Node.js mlClient.js
and ops dashboards can verify the ML service is alive and model is loaded.
"""

import time
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from app.core.config   import settings
from app.schemas.prediction import HealthResponse
from app.models.fraud_detector import fraud_detector

logger = APIRouter()        # reuse variable name for clarity; actual logger below
_log   = logging.getLogger("bankshield-ml")

router = APIRouter()

# Module-level start time for uptime calculation
_SERVICE_START = time.monotonic()


@router.get(
    "/health",
    response_model      = HealthResponse,
    summary             = "Service Health Check",
    description         = "Returns service status, model metadata, and uptime.",
    tags                = ["Health"],
)
async def health_check() -> HealthResponse:
    model_loaded   = fraud_detector.model is not None
    model_version  = (
        fraud_detector.model.get_params().get("n_estimators", "?")
        if model_loaded else "none"
    )
    # Use the model version string from the detector itself
    mv_str   = "xgboost-v2.0" if model_loaded else "heuristic-baseline-v2"
    n_feats  = len(fraud_detector.preprocessor.feature_names)
    threshold = fraud_detector.flag_threshold
    uptime    = round(time.monotonic() - _SERVICE_START, 1)

    _log.debug("[health] uptime=%.1fs  model_loaded=%s", uptime, model_loaded)

    return HealthResponse(
        status         = "ok",
        service        = settings.PROJECT_NAME,
        version        = settings.VERSION,
        model_loaded   = model_loaded,
        model_version  = mv_str,
        model_features = n_feats,
        threshold      = round(threshold, 4),
        uptime_seconds = uptime,
        timestamp      = datetime.now(timezone.utc).isoformat(),
    )
