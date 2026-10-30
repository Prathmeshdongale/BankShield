"""
fraud_detector.py - XGBoost fraud scoring for BankShield.

Loads the model saved by notebooks/train.py and exposes predict_risk().
Falls back to a calibrated heuristic if the model file is absent.

Decision tiers (aligned with transactionService.js scoreTransaction hook):
    risk_score ≥ BLOCK_THRESHOLD  →  is_fraud=True,  decision="BLOCK"
    risk_score ≥ FLAG_THRESHOLD   →  is_fraud=False, decision="REVIEW"
    risk_score <  FLAG_THRESHOLD  →  is_fraud=False, decision="APPROVE"
"""

import os
import json
import math
from pathlib import Path

import joblib
import numpy as np

from app.core.config import settings
from app.core.logging import logger
from app.models.preprocessor import FeaturePreprocessor

# shap is an optional accelerator - if import fails we fall back gracefully
try:
    import shap as _shap
    _SHAP_AVAILABLE = True
except ImportError:                    # pragma: no cover
    _shap = None
    _SHAP_AVAILABLE = False
    logger.warning("shap not installed - feature contributions will be unavailable")

# Decision thresholds - overridden by trained_models/threshold.json if present
_DEFAULT_FLAG_THRESHOLD  = 0.45   # score ≥ this → flag for review
_DEFAULT_BLOCK_THRESHOLD = 0.80   # score ≥ this → block transaction

MODEL_VERSION = "xgboost-v2.0"


def _load_threshold() -> float:
    """Read the optimal threshold saved by notebooks/train.py, if available."""
    thresh_path = Path(settings.MODEL_DIR).parent / "trained_models" / "threshold.json"
    if thresh_path.exists():
        try:
            with open(thresh_path) as f:
                data = json.load(f)
            t = float(data.get("threshold", _DEFAULT_FLAG_THRESHOLD))
            logger.info(f"Loaded decision threshold {t:.4f} from {thresh_path}")
            return t
        except Exception as e:
            logger.warning(f"Could not read threshold.json: {e}")
    return _DEFAULT_FLAG_THRESHOLD


class FraudDetector:
    """
    Wraps the XGBoost pipeline for real-time fraud scoring.

    Usage:
        from app.models.fraud_detector import fraud_detector
        result = fraud_detector.predict_risk(payload_dict)

    Returns dict:
        {
          "risk_score"   : float,   # 0.0–1.0
          "is_fraud"     : bool,    # True if score ≥ block_threshold
          "decision"     : str,     # "BLOCK" | "REVIEW" | "APPROVE"
          "model_version": str,
        }
    """

    def __init__(self):
        self.preprocessor     = FeaturePreprocessor()
        self.model            = None
        self.flag_threshold   = _DEFAULT_FLAG_THRESHOLD
        self.block_threshold  = _DEFAULT_BLOCK_THRESHOLD
        self._load()

    def _load(self):
        model_path = settings.MODEL_FILE
        if not os.path.exists(model_path):
            alt_path = Path(settings.MODEL_DIR).parent / 'trained_models' / 'xgboost_fraud_model.joblib'
            if alt_path.exists():
                model_path = str(alt_path)
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                self.flag_threshold  = _load_threshold()
                self.block_threshold = max(self.flag_threshold + 0.20, _DEFAULT_BLOCK_THRESHOLD)
                logger.info(
                    f"Loaded XGBoost model from {model_path}  "
                    f"(flag>={self.flag_threshold:.3f}, block>={self.block_threshold:.3f})"
                )
                # ── Build SHAP TreeExplainer once (cheap: no data needed) ──
                if _SHAP_AVAILABLE:
                    try:
                        self._explainer = _shap.TreeExplainer(self.model)
                        logger.info("SHAP TreeExplainer initialised.")
                    except Exception as e:
                        self._explainer = None
                        logger.warning(f"SHAP explainer init failed: {e}")
                else:
                    self._explainer = None
            except Exception as e:
                logger.warning(f"Could not load model: {e}. Running heuristic baseline.")
                self.model      = None
                self._explainer = None
        else:
            logger.info(
                "No serialised model found - running heuristic baseline. "
                "Run: python notebooks/train.py"
            )
            self.model      = None
            self._explainer = None

    def predict_risk(self, data: dict) -> dict:
        """
        Score a single transaction.

        Parameters
        ----------
        data : dict
            Raw transaction payload (keys defined in preprocessor.py).

        Returns
        -------
        dict with keys: risk_score, is_fraud, decision, model_version,
                        shap_values (list of {feature, value, shap} - top 5 by |shap|)
        """
        features = self.preprocessor.transform(data)

        if self.model is not None:
            prob = float(self.model.predict_proba(features)[0][1])
            ver  = MODEL_VERSION
        else:
            prob = self._heuristic(data)
            ver  = "heuristic-baseline-v2"

        is_fraud = prob >= self.block_threshold

        if prob >= self.block_threshold:
            decision = "BLOCK"
        elif prob >= self.flag_threshold:
            decision = "REVIEW"
        else:
            decision = "APPROVE"

        # ── SHAP top-5 feature contributions ─────────────────────────────────
        shap_top5 = self._compute_shap(features, data)

        return {
            "risk_score"   : round(prob, 4),
            "is_fraud"     : is_fraud,
            "decision"     : decision,
            "model_version": ver,
            "shap_values"  : shap_top5,
        }

    def _compute_shap(self, features: np.ndarray, raw: dict) -> list:
        """
        Compute SHAP values for the fraud class (class=1) and return the
        top 5 features ranked by |shap_value|.

        Returns a list of dicts:
            [{"feature": str, "value": float, "shap": float}, ...]

        Falls back to an empty list if SHAP is unavailable or the explainer
        was not initialised (e.g. heuristic mode).
        """
        if self._explainer is None or not _SHAP_AVAILABLE:
            return []

        try:
            # shap_values returns shape (1, n_features) for class=1
            sv = self._explainer.shap_values(features)

            # XGBoost binary classifier: sv is a 2-D array (samples × features)
            # When shap returns a list [neg_class, pos_class] we take index 1.
            if isinstance(sv, list):
                sv_row = np.array(sv[1][0])        # fraud class, first (only) sample
            else:
                sv_row = np.array(sv[0])           # already (features,)

            feat_names   = self.preprocessor.feature_names
            feat_values  = features[0].tolist()    # (n_features,) raw floats

            # Pair each feature with its shap value and raw input value
            contributions = [
                {
                    "feature": name,
                    "value"  : round(float(feat_values[i]), 4),
                    "shap"   : round(float(sv_row[i]),      4),
                }
                for i, name in enumerate(feat_names)
            ]

            # Sort by absolute SHAP descending, keep top 5
            contributions.sort(key=lambda x: abs(x["shap"]), reverse=True)
            return contributions[:5]

        except Exception as e:
            logger.warning(f"SHAP computation failed: {e}")
            return []

    # ── Heuristic fallback (used when no model file exists) ──────────────────
    @staticmethod
    def _heuristic(data: dict) -> float:
        amount  = float(data.get("amount", 0.0))
        hour    = int(data.get("hour_of_day", 12))
        vel_1h  = int(data.get("velocity_1h", 1))
        vel_24h = int(data.get("velocity_24h", 3))
        score   = 0.03

        # Amount signals
        if amount > 50_000:   score += 0.20
        if amount > 200_000:  score += 0.25
        if amount > 1_000_000: score += 0.25

        # Temporal signals
        if hour >= 23 or hour <= 4:  score += 0.12

        # Velocity signals
        if vel_1h >= 3:   score += 0.15
        if vel_1h >= 6:   score += 0.10
        if vel_24h >= 15: score += 0.10

        # Context signals
        if data.get("country_mismatch"):   score += 0.18
        if data.get("is_new_device"):      score += 0.12
        if data.get("is_new_beneficiary"): score += 0.08

        merch = str(data.get("merchant_category", "")).lower()
        if any(x in merch for x in ("crypto", "wire", "gambling", "forex")):
            score += 0.15

        return round(min(max(score, 0.01), 0.99), 4)


# Module-level singleton - imported by the FastAPI predict route
fraud_detector = FraudDetector()
