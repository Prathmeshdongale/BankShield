"""
main.py — BankShield ML Service FastAPI application factory.

Startup sequence
────────────────
1.  Create FastAPI app with OpenAPI metadata.
2.  Add CORS middleware.
3.  Add request-ID + latency logging middleware.
4.  Register startup lifespan: loads model once into fraud_detector singleton.
5.  Mount /health and /predict routes.
6.  Add global exception handlers (422 validation, 500 unhandled).

Model loading strategy
──────────────────────
The XGBoost model is loaded synchronously in the FastAPI `lifespan` startup
event. If the model file is absent the service starts in heuristic-fallback
mode and logs a WARNING — it will NOT crash so the /health endpoint always
responds, letting ops know the model file is missing.

Environment variables
─────────────────────
MODEL_DIR     path to directory containing xgboost_fraud_model.joblib
              (default: saved_models/)
PORT          port to bind (default: 8000)
HOST          bind address  (default: 0.0.0.0)
LOG_LEVEL     DEBUG / INFO / WARNING (default: INFO)
"""

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime   import datetime, timezone

from fastapi import FastAPI, Request, status
from fastapi.exceptions     import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses       import JSONResponse

from app.core.config  import settings
from app.core.logging import logger as _base_logger, setup_logging
from app.api.routes   import api_router

# ── Re-configure log level from env ──────────────────────────────────────────
_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.getLogger("bankshield-ml").setLevel(getattr(logging, _log_level, logging.INFO))
logger = logging.getLogger("bankshield-ml")

# ── Service start time (for /health uptime) ───────────────────────────────────
_APP_START = time.monotonic()


# ── Lifespan: model loaded once at startup ────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.
    Code before `yield` runs at startup; code after `yield` at shutdown.
    """
    logger.info("=" * 60)
    logger.info("  %s v%s  — startup", settings.PROJECT_NAME, settings.VERSION)
    logger.info("=" * 60)

    # Import here so the module-level singleton is initialised inside the
    # lifespan (avoids import-time side-effects in tests).
    from app.models.fraud_detector import fraud_detector  # noqa: F401

    if fraud_detector.model is not None:
        n = len(fraud_detector.preprocessor.feature_names)
        logger.info(
            "Model loaded: %d features  flag_threshold=%.4f  block_threshold=%.4f",
            n,
            fraud_detector.flag_threshold,
            fraud_detector.block_threshold,
        )
    else:
        logger.warning(
            "⚠ Model file not found at '%s'. "
            "Running in heuristic-fallback mode. "
            "Run: python notebooks/train.py",
            settings.MODEL_FILE,
        )

    yield  # ← application is live here

    logger.info("%s shutting down.", settings.PROJECT_NAME)


# ── Application factory ───────────────────────────────────────────────────────
app = FastAPI(
    title       = settings.PROJECT_NAME,
    version     = settings.VERSION,
    description = (
        "Real-time XGBoost fraud detection microservice for BankShield. "
        "**POST /predict** scores a bank transaction and returns fraud probability, "
        "0–100 risk score, risk level (LOW/MEDIUM/HIGH/CRITICAL), and a recommended "
        "decision (APPROVE/REVIEW/BLOCK)."
    ),
    docs_url    = "/docs",
    redoc_url   = "/redoc",
    lifespan    = lifespan,
)


# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = settings.CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ── Request-ID + latency middleware ───────────────────────────────────────────
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """
    Attach a X-Request-ID header to every response and log
    method + path + status + latency for every request.
    """
    req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = req_id

    t0 = time.perf_counter()
    response = await call_next(request)
    latency_ms = (time.perf_counter() - t0) * 1000

    response.headers["X-Request-ID"] = req_id
    response.headers["X-Latency-Ms"] = f"{latency_ms:.2f}"

    logger.info(
        "[http] %s %s → %d  %.2f ms  req_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        latency_ms,
        req_id,
    )
    return response


# ── Global exception handlers ─────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return a structured 422 with field-level error detail."""
    errors = []
    for e in exc.errors():
        errors.append({
            "field"  : " → ".join(str(loc) for loc in e["loc"]),
            "message": e["msg"],
            "type"   : e["type"],
        })
    logger.warning("[validation] %s %s  errors=%s", request.method, request.url.path, errors)
    return JSONResponse(
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY,
        content     = {
            "success": False,
            "error"  : "Input validation failed.",
            "details": errors,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "[unhandled] %s %s  error=%s",
        request.method, request.url.path, str(exc), exc_info=True,
    )
    return JSONResponse(
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
        content     = {
            "success": False,
            "error"  : "Internal server error.",
        },
    )


# ── Root redirect ─────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    return {
        "service" : settings.PROJECT_NAME,
        "version" : settings.VERSION,
        "docs"    : "/docs",
        "health"  : "/health",
        "predict" : "/predict",
    }


# ── Mount API routes ──────────────────────────────────────────────────────────
app.include_router(api_router)


# ── Dev entrypoint ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host    = settings.HOST,
        port    = settings.PORT,
        reload  = True,
        log_level = _log_level.lower(),
    )
