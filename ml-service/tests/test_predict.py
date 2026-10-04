"""
tests/test_predict.py — pytest suite for the BankShield ML Service.

Run from the ml-service directory with the venv activated:

    cd d:\\B Tech\\bankshield\\ml-service
    .\\venv\\Scripts\\activate
    pytest tests/ -v

Coverage:
    - GET  /health  — model-loaded state, schema, uptime
    - POST /predict — happy paths (low/high/critical risk), response schema
    - POST /predict — input validation (missing fields, out-of-range values)
    - POST /predict — risk level mapping (LOW / MEDIUM / HIGH / CRITICAL)
    - POST /predict — decision mapping  (APPROVE / REVIEW / BLOCK)
    - POST /predict — latency assertion (< 1 second per request)
    - POST /predict — idempotency of deterministic inputs
    - POST /predict — rules_triggered list
    - POST /predict — request_id is unique per call
    - POST /predict — minimal payload (amount only)
    - POST /predict — boundary values (amount=0.01, amount=9_999_999)
"""

import time
import pytest
from fastapi.testclient import TestClient

# ── Import the app ────────────────────────────────────────────────────────────
# We import the FastAPI app directly so tests run without a live server.
from app.main import app

client = TestClient(app, raise_server_exceptions=False)


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def low_risk_payload():
    """A routine grocery purchase — should be APPROVE."""
    return {
        "amount"               : 250.0,
        "hour_of_day"          : 10,
        "day_of_week"          : 1,
        "account_balance"      : 95_000.0,
        "account_mean_txn"     : 350.0,
        "account_std_txn"      : 180.0,
        "velocity_1h"          : 1,
        "velocity_24h"         : 2,
        "amount_sum_1h"        : 250.0,
        "distinct_merchants_24h": 1,
        "merchant_category"    : "grocery",
        "country_mismatch"     : False,
        "is_new_device"        : False,
        "is_new_beneficiary"   : False,
        "card_type"            : "debit",
        "channel"              : "pos",
    }


@pytest.fixture
def high_risk_payload():
    """
    Night-time, cross-border crypto transaction on a new device — high fraud
    signals should push this into HIGH or CRITICAL territory.
    """
    return {
        "amount"               : 180_000.0,
        "hour_of_day"          : 2,
        "day_of_week"          : 6,
        "account_balance"      : 12_000.0,
        "account_mean_txn"     : 3_000.0,
        "account_std_txn"      : 1_500.0,
        "velocity_1h"          : 6,
        "velocity_24h"         : 18,
        "amount_sum_1h"        : 520_000.0,
        "distinct_merchants_24h": 9,
        "merchant_category"    : "crypto",
        "country_mismatch"     : True,
        "is_new_device"        : True,
        "is_new_beneficiary"   : True,
        "card_type"            : "credit",
        "channel"              : "web",
    }


@pytest.fixture
def minimal_payload():
    """Only the required `amount` field — all others use defaults."""
    return {"amount": 500.0}


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH
# ─────────────────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_200(self):
        r = client.get("/health")
        assert r.status_code == 200

    def test_health_schema(self):
        r    = client.get("/health")
        body = r.json()
        assert "status"          in body
        assert "model_loaded"    in body
        assert "model_version"   in body
        assert "model_features"  in body
        assert "threshold"       in body
        assert "uptime_seconds"  in body
        assert "timestamp"       in body

    def test_health_status_ok(self):
        body = client.get("/health").json()
        assert body["status"] == "ok"

    def test_health_model_features_count(self):
        """Preprocessor must expose exactly 18 features (matches training script)."""
        body = client.get("/health").json()
        assert body["model_features"] == 18

    def test_health_threshold_in_range(self):
        body = client.get("/health").json()
        assert 0.0 < body["threshold"] < 1.0

    def test_health_uptime_positive(self):
        body = client.get("/health").json()
        assert body["uptime_seconds"] >= 0.0

    def test_health_returns_request_id_header(self):
        r = client.get("/health")
        assert "x-request-id" in r.headers

    def test_health_returns_latency_header(self):
        r = client.get("/health")
        assert "x-latency-ms" in r.headers


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — response schema
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictSchema:
    def test_predict_returns_200(self, low_risk_payload):
        r = client.post("/predict", json=low_risk_payload)
        assert r.status_code == 200

    def test_predict_response_has_all_required_fields(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        for field in [
            "fraud_probability", "risk_score", "risk_level",
            "prediction", "decision", "model_version",
            "latency_ms", "request_id", "rules_triggered",
        ]:
            assert field in body, f"Missing field: {field}"

    def test_fraud_probability_in_range(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert 0.0 <= body["fraud_probability"] <= 1.0

    def test_risk_score_in_range(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert 0.0 <= body["risk_score"] <= 100.0

    def test_risk_score_is_fraud_probability_times_100(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert abs(body["risk_score"] - round(body["fraud_probability"] * 100, 1)) < 0.01

    def test_risk_level_valid_value(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert body["risk_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}

    def test_decision_valid_value(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert body["decision"] in {"APPROVE", "REVIEW", "BLOCK"}

    def test_prediction_is_bool(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert isinstance(body["prediction"], bool)

    def test_rules_triggered_is_list(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert isinstance(body["rules_triggered"], list)

    def test_request_id_is_string(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert isinstance(body["request_id"], str)
        assert len(body["request_id"]) > 0

    def test_latency_ms_positive(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert body["latency_ms"] > 0.0

    def test_response_has_request_id_header(self, low_risk_payload):
        r = client.post("/predict", json=low_risk_payload)
        assert "x-request-id" in r.headers


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — latency SLA
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictLatency:
    LATENCY_SLA_SECONDS = 1.0   # < 1 second end-to-end

    def test_single_request_under_1s(self, low_risk_payload):
        t0 = time.perf_counter()
        r  = client.post("/predict", json=low_risk_payload)
        elapsed = time.perf_counter() - t0
        assert r.status_code == 200
        assert elapsed < self.LATENCY_SLA_SECONDS, (
            f"Latency {elapsed:.3f}s exceeded SLA of {self.LATENCY_SLA_SECONDS}s"
        )

    def test_latency_ms_in_body_under_1000(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        assert body["latency_ms"] < 1000.0, (
            f"Body latency {body['latency_ms']} ms exceeded 1000 ms"
        )

    def test_high_risk_payload_still_under_1s(self, high_risk_payload):
        t0 = time.perf_counter()
        r  = client.post("/predict", json=high_risk_payload)
        elapsed = time.perf_counter() - t0
        assert r.status_code == 200
        assert elapsed < self.LATENCY_SLA_SECONDS


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — risk level & decision logic
# ─────────────────────────────────────────────────────────────────────────────

class TestPredictRiskMapping:
    def test_low_risk_payload_decision_not_block(self, low_risk_payload):
        """A routine grocery purchase should NOT be blocked."""
        body = client.post("/predict", json=low_risk_payload).json()
        # We don't assert APPROVE specifically (model may flag borderline cases)
        # but it should not be BLOCK
        assert body["decision"] in {"APPROVE", "REVIEW"}

    def test_high_risk_payload_elevated_score(self, high_risk_payload):
        """Night / cross-border / crypto / high-velocity payload → elevated risk."""
        body = client.post("/predict", json=high_risk_payload).json()
        # Risk should be measurably higher than a routine transaction
        assert body["risk_score"] > 30.0, (
            f"Expected risk_score > 30 for high-risk payload, got {body['risk_score']}"
        )

    def test_risk_level_consistency_with_score(self, low_risk_payload):
        """risk_level must be consistent with risk_score thresholds."""
        body = client.post("/predict", json=low_risk_payload).json()
        score = body["risk_score"]
        level = body["risk_level"]
        if score >= 80:
            assert level == "CRITICAL"
        elif score >= 60:
            assert level == "HIGH"
        elif score >= 30:
            assert level == "MEDIUM"
        else:
            assert level == "LOW"

    def test_risk_level_consistency_high_risk(self, high_risk_payload):
        """Same consistency check for the high-risk fixture."""
        body = client.post("/predict", json=high_risk_payload).json()
        score = body["risk_score"]
        level = body["risk_level"]
        if score >= 80:
            assert level == "CRITICAL"
        elif score >= 60:
            assert level == "HIGH"
        elif score >= 30:
            assert level == "MEDIUM"
        else:
            assert level == "LOW"

    def test_critical_risk_leads_to_block_or_review(self, high_risk_payload):
        """CRITICAL risk_level must result in REVIEW or BLOCK — never APPROVE."""
        body = client.post("/predict", json=high_risk_payload).json()
        if body["risk_level"] == "CRITICAL":
            assert body["decision"] in {"REVIEW", "BLOCK"}, (
                f"CRITICAL risk should be REVIEW or BLOCK, got {body['decision']}"
            )

    def test_low_risk_level_leads_to_approve(self):
        """Explicitly craft a very low-risk payload."""
        safe = {
            "amount"          : 50.0,
            "hour_of_day"     : 11,
            "day_of_week"     : 1,
            "account_balance" : 500_000.0,
            "account_mean_txn": 60.0,
            "account_std_txn" : 30.0,
            "velocity_1h"     : 1,
            "velocity_24h"    : 2,
            "merchant_category": "grocery",
            "country_mismatch": False,
            "is_new_device"   : False,
            "card_type"       : "debit",
            "channel"         : "pos",
        }
        r = client.post("/predict", json=safe)
        assert r.status_code == 200
        body = r.json()
        if body["risk_level"] == "LOW":
            assert body["decision"] == "APPROVE"


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — rules triggered
# ─────────────────────────────────────────────────────────────────────────────

class TestRulesTriggered:
    def test_night_transaction_triggers_rule(self):
        payload = {"amount": 5000.0, "hour_of_day": 2}
        body    = client.post("/predict", json=payload).json()
        assert "night_transaction" in body["rules_triggered"]

    def test_country_mismatch_triggers_rule(self):
        payload = {"amount": 5000.0, "country_mismatch": True}
        body    = client.post("/predict", json=payload).json()
        assert "country_mismatch" in body["rules_triggered"]

    def test_new_device_triggers_rule(self):
        payload = {"amount": 5000.0, "is_new_device": True}
        body    = client.post("/predict", json=payload).json()
        assert "new_device" in body["rules_triggered"]

    def test_high_velocity_1h_triggers_rule(self):
        payload = {"amount": 1000.0, "velocity_1h": 5}
        body    = client.post("/predict", json=payload).json()
        triggered = " ".join(body["rules_triggered"])
        assert "velocity_1h" in triggered

    def test_low_risk_has_few_triggers(self, low_risk_payload):
        body = client.post("/predict", json=low_risk_payload).json()
        # A clean low-risk transaction should not have many triggers
        assert len(body["rules_triggered"]) <= 3


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — request_id uniqueness
# ─────────────────────────────────────────────────────────────────────────────

class TestRequestId:
    def test_request_ids_are_unique(self, low_risk_payload):
        id1 = client.post("/predict", json=low_risk_payload).json()["request_id"]
        id2 = client.post("/predict", json=low_risk_payload).json()["request_id"]
        assert id1 != id2

    def test_client_supplied_request_id_echoed(self, low_risk_payload):
        """X-Request-ID header from the client should be echoed back."""
        custom_id = "test-correlation-abc-123"
        r = client.post(
            "/predict",
            json=low_risk_payload,
            headers={"X-Request-ID": custom_id},
        )
        assert r.headers.get("x-request-id") == custom_id


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — minimal payload (only `amount` provided)
# ─────────────────────────────────────────────────────────────────────────────

class TestMinimalPayload:
    def test_amount_only_returns_200(self, minimal_payload):
        r = client.post("/predict", json=minimal_payload)
        assert r.status_code == 200

    def test_amount_only_has_valid_risk_level(self, minimal_payload):
        body = client.post("/predict", json=minimal_payload).json()
        assert body["risk_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}

    def test_amount_only_has_valid_decision(self, minimal_payload):
        body = client.post("/predict", json=minimal_payload).json()
        assert body["decision"] in {"APPROVE", "REVIEW", "BLOCK"}


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — boundary values
# ─────────────────────────────────────────────────────────────────────────────

class TestBoundaryValues:
    def test_minimum_amount(self):
        r = client.post("/predict", json={"amount": 0.01})
        assert r.status_code == 200

    def test_very_large_amount(self):
        r = client.post("/predict", json={"amount": 9_999_999.0})
        assert r.status_code == 200

    def test_hour_0(self):
        r = client.post("/predict", json={"amount": 100.0, "hour_of_day": 0})
        assert r.status_code == 200

    def test_hour_23(self):
        r = client.post("/predict", json={"amount": 100.0, "hour_of_day": 23})
        assert r.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — input validation (422 errors)
# ─────────────────────────────────────────────────────────────────────────────

class TestInputValidation:
    def test_missing_amount_returns_422(self):
        r = client.post("/predict", json={"hour_of_day": 10})
        assert r.status_code == 422

    def test_zero_amount_returns_422(self):
        """amount has gt=0 constraint — 0 is invalid."""
        r = client.post("/predict", json={"amount": 0})
        assert r.status_code == 422

    def test_negative_amount_returns_422(self):
        r = client.post("/predict", json={"amount": -100.0})
        assert r.status_code == 422

    def test_invalid_hour_out_of_range_returns_422(self):
        r = client.post("/predict", json={"amount": 100.0, "hour_of_day": 25})
        assert r.status_code == 422

    def test_invalid_day_of_week_returns_422(self):
        r = client.post("/predict", json={"amount": 100.0, "day_of_week": 7})
        assert r.status_code == 422

    def test_empty_body_returns_422(self):
        r = client.post("/predict", json={})
        assert r.status_code == 422

    def test_string_amount_returns_422(self):
        r = client.post("/predict", json={"amount": "not_a_number"})
        assert r.status_code == 422

    def test_422_response_has_details(self):
        r = client.post("/predict", json={"amount": -1})
        body = r.json()
        # Our custom handler returns { success, error, details }
        assert "error" in body or "detail" in body  # either custom or FastAPI default


# ─────────────────────────────────────────────────────────────────────────────
# PREDICT — determinism (same input → same score)
# ─────────────────────────────────────────────────────────────────────────────

class TestDeterminism:
    def test_same_input_same_fraud_probability(self, low_risk_payload):
        """XGBoost inference is deterministic for the same input."""
        p1 = client.post("/predict", json=low_risk_payload).json()["fraud_probability"]
        p2 = client.post("/predict", json=low_risk_payload).json()["fraud_probability"]
        assert p1 == p2

    def test_same_input_same_risk_level(self, high_risk_payload):
        l1 = client.post("/predict", json=high_risk_payload).json()["risk_level"]
        l2 = client.post("/predict", json=high_risk_payload).json()["risk_level"]
        assert l1 == l2


# ─────────────────────────────────────────────────────────────────────────────
# ROOT  +  misc
# ─────────────────────────────────────────────────────────────────────────────

class TestMisc:
    def test_root_returns_200(self):
        r = client.get("/")
        assert r.status_code == 200

    def test_root_has_predict_key(self):
        body = client.get("/").json()
        assert "predict" in body

    def test_docs_endpoint_accessible(self):
        r = client.get("/docs")
        assert r.status_code == 200

    def test_unknown_route_returns_404(self):
        r = client.get("/nonexistent-endpoint")
        assert r.status_code == 404

    def test_wrong_method_on_predict_returns_405(self):
        r = client.get("/predict")
        assert r.status_code == 405
