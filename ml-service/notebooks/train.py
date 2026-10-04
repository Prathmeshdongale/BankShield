"""
notebooks/train.py — BankShield XGBoost Fraud Detector Training Script
=======================================================================

Generates a realistic synthetic banking fraud dataset, trains an XGBoost
classifier, handles class imbalance, tunes the decision threshold, reports
full metrics, and saves artefacts to trained_models/.

HOW TO RUN
----------
From the ml-service directory with the venv activated:

    cd d:\\B Tech\\bankshield\\ml-service
    .\\venv\\Scripts\\activate          # Windows
    # source venv/bin/activate         # Linux / macOS

    python notebooks/train.py

Optional flags:
    python notebooks/train.py --samples 150000   # more samples (default: 100000)
    python notebooks/train.py --fraud-rate 0.018 # custom fraud rate (default: 0.018 ≈ 1.8 %)
    python notebooks/train.py --output trained_models/xgboost_fraud_model.joblib

The script also saves to saved_models/ (FastAPI inference path) unless --no-copy is passed.

OUTPUT FILES
------------
trained_models/
    xgboost_fraud_model.joblib     — XGBoost pipeline (preprocessor + classifier)
    feature_names.json             — ordered feature list for inference
    threshold.json                 — optimal decision threshold
    training_metrics.json          — all metrics from the run
saved_models/
    xgboost_fraud_model.joblib     — copy used by FastAPI inference service

DATASET: Synthetic Banking Fraud
---------------------------------
18 engineered features that mimic the Kaggle Credit Card Fraud dataset signals
while adding domain-specific banking features:

  Temporal
    hour_of_day          0–23
    day_of_week          0 = Mon … 6 = Sun
    is_weekend           bool
    is_night             bool (23:00–04:59)

  Amount-based
    amount               log-normal, heavy tail
    amount_log           log1p(amount)
    balance_ratio        amount / (account_balance + 1) — high ratio = risky
    amount_zscore        (amount - account_mean_txn) / (account_std_txn + 1)

  Velocity (rolling windows)
    velocity_1h          transactions in last 1 hour from same account
    velocity_24h         transactions in last 24 hours
    amount_sum_1h        total spend in last 1 hour
    distinct_merchants_24h  unique merchants in last 24 hours

  Behavioural / context
    merchant_category_risk  encoded: 0=low 1=med 2=high (travel, crypto, etc.)
    country_mismatch     1 if txn country ≠ account home country
    is_new_device        1 if device fingerprint not seen in last 30 days
    is_new_beneficiary   1 if destination account is new (never received before)
    card_type_encoded    0=debit 1=credit 2=prepaid 3=virtual
    channel_encoded      0=web 1=mobile 2=atm 3=pos 4=upi 5=neft 6=branch
"""

import os
import sys
import json
import argparse
import shutil
import warnings
import time
from pathlib import Path

import numpy as np
import pandas as pd
import joblib
from scipy.stats import lognorm

from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    roc_auc_score,
    average_precision_score,
    precision_recall_curve,
    roc_curve,
    f1_score,
    precision_score,
    recall_score,
)
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR     = Path(__file__).resolve().parent
ML_SERVICE_DIR = SCRIPT_DIR.parent
TRAINED_DIR    = ML_SERVICE_DIR / "trained_models"
SAVED_DIR      = ML_SERVICE_DIR / "saved_models"

TRAINED_DIR.mkdir(exist_ok=True)
SAVED_DIR.mkdir(exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# FEATURE NAMES  (must match preprocessor.py FeaturePreprocessor.feature_names)
# ─────────────────────────────────────────────────────────────────────────────
FEATURE_NAMES = [
    "amount_log",            # 0
    "hour_of_day",           # 1
    "day_of_week",           # 2
    "is_weekend",            # 3
    "is_night",              # 4
    "balance_ratio",         # 5
    "amount_zscore",         # 6
    "velocity_1h",           # 7
    "velocity_24h",          # 8
    "amount_sum_1h",         # 9
    "distinct_merchants_24h",# 10
    "merchant_category_risk",# 11
    "country_mismatch",      # 12
    "is_new_device",         # 13
    "is_new_beneficiary",    # 14
    "card_type_encoded",     # 15
    "channel_encoded",       # 16
    "amount",                # 17  (kept raw for tree splits on large amounts)
]

# ─────────────────────────────────────────────────────────────────────────────
# SYNTHETIC DATA GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

def generate_dataset(n_samples: int = 100_000, fraud_rate: float = 0.018, seed: int = 42) -> pd.DataFrame:
    """
    Generate a realistic banking transaction dataset with 18 features.

    Fraud is injected with a calibrated logistic model over risk factors so the
    dataset has non-trivial structure (not just random noise).

    Returns a DataFrame with columns = FEATURE_NAMES + ['label'].
    """
    rng = np.random.default_rng(seed)
    N   = n_samples

    print(f"\n[data] Generating {N:,} transactions (target fraud rate ≈ {fraud_rate*100:.1f}%)…")

    # ── Temporal ─────────────────────────────────────────────────────────────
    hour        = rng.integers(0, 24, N)
    dow         = rng.integers(0, 7,  N)
    is_weekend  = (dow >= 5).astype(np.float32)
    is_night    = ((hour >= 23) | (hour <= 4)).astype(np.float32)

    # ── Amount (log-normal, heavy tail for fraud) ─────────────────────────
    # Legitimate: mean ≈ ₹3,500, most < ₹50k
    amount_legit = rng.lognormal(mean=8.0, sigma=1.2, size=N).astype(np.float32)
    amount_legit = np.clip(amount_legit, 1.0, 2_000_000)

    # ── Account-level statistics (simulate per-account history) ──────────
    account_mean = rng.lognormal(7.5, 0.8, N).astype(np.float32)  # avg txn size
    account_std  = account_mean * rng.uniform(0.3, 1.5, N).astype(np.float32)
    account_bal  = rng.lognormal(10.5, 1.0, N).astype(np.float32)  # account balance

    balance_ratio = np.clip(amount_legit / (account_bal + 1), 0, 10).astype(np.float32)
    amount_zscore = np.clip(
        (amount_legit - account_mean) / (account_std + 1), -5, 10
    ).astype(np.float32)
    amount_log    = np.log1p(amount_legit).astype(np.float32)

    # ── Velocity features ────────────────────────────────────────────────
    velocity_1h             = rng.poisson(1.2, N).astype(np.float32)
    velocity_24h            = rng.poisson(4.5, N).astype(np.float32)
    amount_sum_1h           = (velocity_1h * rng.lognormal(7.0, 1.0, N)).astype(np.float32)
    distinct_merchants_24h  = np.minimum(
        rng.poisson(2.5, N), velocity_24h
    ).astype(np.float32)

    # ── Categorical / behavioural ────────────────────────────────────────
    # merchant_category_risk: 0=low(groceries,utility), 1=medium(retail,food),
    #                          2=high(travel,gaming,crypto,wire transfer)
    cat_probs = [0.45, 0.38, 0.17]
    merchant_cat = rng.choice([0, 1, 2], N, p=cat_probs).astype(np.float32)

    country_mismatch  = rng.binomial(1, 0.06, N).astype(np.float32)
    is_new_device     = rng.binomial(1, 0.08, N).astype(np.float32)
    is_new_beneficiary= rng.binomial(1, 0.12, N).astype(np.float32)

    # card_type: 0=debit(70%), 1=credit(20%), 2=prepaid(7%), 3=virtual(3%)
    card_type = rng.choice([0,1,2,3], N, p=[0.70, 0.20, 0.07, 0.03]).astype(np.float32)

    # channel: 0=web(25%), 1=mobile(30%), 2=atm(15%), 3=pos(20%), 4=upi(7%), 5=neft(2%), 6=branch(1%)
    channel = rng.choice([0,1,2,3,4,5,6], N,
                         p=[0.25,0.30,0.15,0.20,0.07,0.02,0.01]).astype(np.float32)

    # ── Fraud label generation (logistic risk model) ─────────────────────
    # Risk is a linear combination of features; threshold is calibrated so
    # roughly `fraud_rate` fraction of transactions are labelled fraud.
    logit = (
          0.0                              # intercept (calibrated below)
        + 0.8  * (balance_ratio > 0.5)    # txn > 50% of balance
        + 1.2  * (balance_ratio > 2.0)    # txn > 2× balance
        + 0.6  * (amount_zscore > 2.0)    # unusually large vs history
        + 1.0  * (amount_zscore > 4.0)    # extreme outlier
        + 1.8  * is_night                  # night-time
        + 0.4  * is_weekend                # weekend
        + 1.5  * (velocity_1h > 3)         # burst of txns in 1h
        + 0.8  * (velocity_1h > 5)
        + 0.6  * (velocity_24h > 15)
        + 1.2  * (distinct_merchants_24h > 8)  # many merchants
        + 1.4  * (merchant_cat == 2)       # high-risk merchant
        + 0.5  * (merchant_cat == 1)
        + 2.0  * country_mismatch          # cross-border
        + 1.5  * is_new_device             # device never seen before
        + 1.0  * is_new_beneficiary        # new recipient
        + 0.4  * (card_type == 2)          # prepaid
        + 0.6  * (card_type == 3)          # virtual
        + 0.3  * (channel == 0)            # web (slightly higher fraud)
    )

    # Calibrate intercept so expected fraud rate = fraud_rate
    # E[sigmoid(logit + b)] = fraud_rate  →  solve iteratively
    intercept = _calibrate_intercept(logit, fraud_rate, rng)
    logit     = logit + intercept

    fraud_prob = 1 / (1 + np.exp(-logit))
    label      = (rng.uniform(0, 1, N) < fraud_prob).astype(np.int32)

    # ── Fraud transactions have inflated amounts ──────────────────────────
    # Real-world fraud tends to involve higher-than-normal amounts
    fraud_idx              = label == 1
    amount_legit[fraud_idx] = amount_legit[fraud_idx] * rng.lognormal(0.8, 0.5, fraud_idx.sum())
    amount_legit           = np.clip(amount_legit, 1.0, 5_000_000).astype(np.float32)
    # Recompute derived features for fraud rows
    balance_ratio[fraud_idx] = np.clip(
        amount_legit[fraud_idx] / (account_bal[fraud_idx] + 1), 0, 10
    )
    amount_zscore[fraud_idx] = np.clip(
        (amount_legit[fraud_idx] - account_mean[fraud_idx]) / (account_std[fraud_idx] + 1), -5, 10
    )
    amount_log = np.log1p(amount_legit).astype(np.float32)

    actual_rate = label.mean()
    print(f"[data] Generated {N:,} transactions — {label.sum():,} fraud ({actual_rate*100:.2f}%)")

    df = pd.DataFrame({
        "amount_log"            : amount_log,
        "hour_of_day"           : hour.astype(np.float32),
        "day_of_week"           : dow.astype(np.float32),
        "is_weekend"            : is_weekend,
        "is_night"              : is_night,
        "balance_ratio"         : balance_ratio,
        "amount_zscore"         : amount_zscore,
        "velocity_1h"           : velocity_1h,
        "velocity_24h"          : velocity_24h,
        "amount_sum_1h"         : np.log1p(amount_sum_1h),   # log-scale for tree splits
        "distinct_merchants_24h": distinct_merchants_24h,
        "merchant_category_risk": merchant_cat,
        "country_mismatch"      : country_mismatch,
        "is_new_device"         : is_new_device,
        "is_new_beneficiary"    : is_new_beneficiary,
        "card_type_encoded"     : card_type,
        "channel_encoded"       : channel,
        "amount"                : amount_legit,
        "label"                 : label,
    })
    return df


def _calibrate_intercept(logit: np.ndarray, target_rate: float, rng, tol=1e-4, max_iter=50) -> float:
    """Binary search for intercept b such that mean(sigmoid(logit + b)) ≈ target_rate."""
    lo, hi = -20.0, 20.0
    for _ in range(max_iter):
        mid  = (lo + hi) / 2.0
        rate = (1 / (1 + np.exp(-(logit + mid)))).mean()
        if abs(rate - target_rate) < tol:
            return mid
        if rate < target_rate:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


# ─────────────────────────────────────────────────────────────────────────────
# OPTIMAL THRESHOLD SELECTION
# ─────────────────────────────────────────────────────────────────────────────

def find_optimal_threshold(y_true: np.ndarray, y_prob: np.ndarray,
                            strategy: str = "f1") -> float:
    """
    Find the probability threshold that maximises the chosen strategy.

    strategy options:
        "f1"    — maximise F1-score  (default; balanced precision/recall)
        "f2"    — maximise F2-score  (recall-weighted; use when FN is costlier)
        "precision_at_recall_80"  — highest precision at recall ≥ 0.80
        "youden" — Youden's J = Sensitivity + Specificity - 1
    """
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
    # thresholds has len = len(precisions) - 1
    precisions = precisions[:-1]
    recalls    = recalls[:-1]

    if strategy == "f1":
        denom  = precisions + recalls
        f1     = np.where(denom > 0, 2 * precisions * recalls / denom, 0)
        idx    = np.argmax(f1)
    elif strategy == "f2":
        denom  = 4 * precisions + recalls
        f2     = np.where(denom > 0, 5 * precisions * recalls / denom, 0)
        idx    = np.argmax(f2)
    elif strategy == "precision_at_recall_80":
        mask = recalls >= 0.80
        if not mask.any():
            mask = recalls >= recalls.max() * 0.95
        idx = np.argmax(np.where(mask, precisions, 0))
    elif strategy == "youden":
        fpr, tpr, roc_thresh = roc_curve(y_true, y_prob)
        j   = tpr - fpr
        idx_r = np.argmax(j)
        return float(roc_thresh[idx_r])
    else:
        raise ValueError(f"Unknown threshold strategy: {strategy}")

    return float(thresholds[idx])


# ─────────────────────────────────────────────────────────────────────────────
# METRICS HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def compute_metrics(y_true, y_prob, threshold, split_name=""):
    y_pred = (y_prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()

    metrics = {
        "split"           : split_name,
        "threshold"       : round(threshold, 4),
        "roc_auc"         : round(roc_auc_score(y_true, y_prob), 4),
        "pr_auc"          : round(average_precision_score(y_true, y_prob), 4),
        "f1"              : round(f1_score(y_true, y_pred, zero_division=0), 4),
        "precision"       : round(precision_score(y_true, y_pred, zero_division=0), 4),
        "recall"          : round(recall_score(y_true, y_pred, zero_division=0), 4),
        "specificity"     : round(tn / (tn + fp) if (tn + fp) > 0 else 0.0, 4),
        "tp"              : int(tp),
        "fp"              : int(fp),
        "fn"              : int(fn),
        "tn"              : int(tn),
        "false_alarm_rate": round(fp / (fp + tn) if (fp + tn) > 0 else 0.0, 4),
    }
    return metrics


def print_metrics_table(train_m, val_m, test_m):
    rows = [train_m, val_m, test_m]
    cols = ["split","threshold","roc_auc","pr_auc","f1","precision","recall",
            "specificity","false_alarm_rate","tp","fp","fn","tn"]
    header = f"{'Metric':<22}" + "".join(f"{c:>10}" for c in ["train","val","test"])
    print("\n" + "═"*52)
    print(" METRICS TABLE")
    print("═"*52)
    print(header)
    print("─"*52)
    for col in cols:
        vals = [str(r.get(col, "")) for r in rows]
        print(f"  {col:<20}" + "".join(f"{v:>10}" for v in vals))
    print("═"*52)


# ─────────────────────────────────────────────────────────────────────────────
# CROSS-VALIDATION
# ─────────────────────────────────────────────────────────────────────────────

def cross_validate(X_train, y_train, model_params, n_splits=5):
    """5-fold stratified CV — reports mean ± std ROC-AUC and PR-AUC."""
    skf    = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    aucs   = []
    prauc  = []
    print(f"\n[cv] {n_splits}-fold stratified cross-validation…")
    for fold, (tr_idx, va_idx) in enumerate(skf.split(X_train, y_train), 1):
        Xtr, Xva = X_train[tr_idx], X_train[va_idx]
        ytr, yva = y_train[tr_idx], y_train[va_idx]

        # scale_pos_weight computed per fold
        spw = (ytr == 0).sum() / max((ytr == 1).sum(), 1)
        m   = XGBClassifier(**{**model_params, "scale_pos_weight": spw})
        m.fit(Xtr, ytr,
              eval_set=[(Xva, yva)],
              verbose=False)
        prob = m.predict_proba(Xva)[:, 1]
        aucs.append(roc_auc_score(yva, prob))
        prauc.append(average_precision_score(yva, prob))
        print(f"  fold {fold}: ROC-AUC={aucs[-1]:.4f}  PR-AUC={prauc[-1]:.4f}")

    print(f"  CV mean ROC-AUC = {np.mean(aucs):.4f} ± {np.std(aucs):.4f}")
    print(f"  CV mean PR-AUC  = {np.mean(prauc):.4f} ± {np.std(prauc):.4f}")
    return {"cv_roc_auc_mean": round(np.mean(aucs), 4),
            "cv_roc_auc_std" : round(np.std(aucs), 4),
            "cv_pr_auc_mean" : round(np.mean(prauc), 4),
            "cv_pr_auc_std"  : round(np.std(prauc), 4)}


# ─────────────────────────────────────────────────────────────────────────────
# FEATURE IMPORTANCE
# ─────────────────────────────────────────────────────────────────────────────

def print_feature_importance(model, feature_names, top_n=10):
    imp = pd.Series(
        model.feature_importances_,
        index=feature_names
    ).sort_values(ascending=False)
    print(f"\n[importance] Top {top_n} features (gain):")
    for feat, score in imp.head(top_n).items():
        bar = "█" * int(score / imp.max() * 30)
        print(f"  {feat:<28} {score:.4f}  {bar}")
    return imp.to_dict()


# ─────────────────────────────────────────────────────────────────────────────
# MAIN TRAINING PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def train(
    n_samples    : int   = 100_000,
    fraud_rate   : float = 0.018,
    output_path  : str   = None,
    threshold_strategy: str = "f1",
    run_cv       : bool  = True,
    copy_to_saved: bool  = True,
):
    t0 = time.time()

    # ── 1. Generate dataset ──────────────────────────────────────────────────
    df = generate_dataset(n_samples=n_samples, fraud_rate=fraud_rate)
    X  = df[FEATURE_NAMES].values.astype(np.float32)
    y  = df["label"].values

    # ── 2. Stratified train / val / test split  (70 / 15 / 15) ──────────────
    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X, y, test_size=0.15, stratify=y, random_state=42
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_trainval, y_trainval, test_size=0.1765,  # 0.1765 × 0.85 ≈ 0.15
        stratify=y_trainval, random_state=42
    )

    fraud_train = y_train.sum()
    legit_train = (y_train == 0).sum()
    scale_pos_weight = legit_train / max(fraud_train, 1)

    print(f"\n[split] train={len(y_train):,}  val={len(y_val):,}  test={len(y_test):,}")
    print(f"[split] train fraud={fraud_train:,} ({fraud_train/len(y_train)*100:.2f}%)")
    print(f"[imbalance] scale_pos_weight = {scale_pos_weight:.1f}")

    # ── 3. XGBoost hyperparameters ───────────────────────────────────────────
    # Tuned for fraud detection: moderate depth, subsampling, L1 regularisation
    model_params = dict(
        n_estimators      = 400,
        max_depth         = 6,
        learning_rate     = 0.05,
        subsample         = 0.8,
        colsample_bytree  = 0.8,
        min_child_weight  = 5,       # avoids over-fitting on rare fraud patterns
        gamma             = 0.1,     # min loss-reduction for split
        reg_alpha         = 0.1,     # L1 — sparse features
        reg_lambda        = 1.5,     # L2 — smoothing
        scale_pos_weight  = scale_pos_weight,
        eval_metric       = "aucpr", # PR-AUC is better than logloss for imbalanced
        early_stopping_rounds = 30,
        random_state      = 42,
        n_jobs            = -1,
        tree_method       = "hist",  # fast histogram-based
    )

    # ── 4. Optional 5-fold cross-validation ──────────────────────────────────
    cv_metrics = {}
    if run_cv:
        cv_metrics = cross_validate(X_train, y_train, model_params)

    # ── 5. Final model training with early stopping on val set ───────────────
    print("\n[train] Fitting final XGBoost model…")
    model = XGBClassifier(**model_params)
    model.fit(
        X_train, y_train,
        eval_set        = [(X_val, y_val)],
        verbose         = 50,
    )
    best_iter = model.best_iteration
    print(f"[train] Best iteration: {best_iter}")

    # ── 6. Threshold optimisation on validation set ──────────────────────────
    val_prob   = model.predict_proba(X_val)[:, 1]
    threshold  = find_optimal_threshold(y_val, val_prob, strategy=threshold_strategy)
    print(f"\n[threshold] Strategy='{threshold_strategy}'  →  optimal threshold = {threshold:.4f}")

    # ── 7. Evaluate on all splits ─────────────────────────────────────────────
    train_prob = model.predict_proba(X_train)[:, 1]
    test_prob  = model.predict_proba(X_test)[:, 1]

    train_m = compute_metrics(y_train, train_prob, threshold, "train")
    val_m   = compute_metrics(y_val,   val_prob,   threshold, "val")
    test_m  = compute_metrics(y_test,  test_prob,  threshold, "test")

    print_metrics_table(train_m, val_m, test_m)

    # Detailed classification report on test set
    y_test_pred = (test_prob >= threshold).astype(int)
    print("\n[test] Classification Report:")
    print(classification_report(y_test, y_test_pred,
                                 target_names=["Legitimate", "Fraud"],
                                 digits=4))

    # ── 8. Feature importance ─────────────────────────────────────────────────
    importance = print_feature_importance(model, FEATURE_NAMES)

    # ── 9. Save artefacts ─────────────────────────────────────────────────────
    if output_path is None:
        output_path = str(TRAINED_DIR / "xgboost_fraud_model.joblib")

    joblib.dump(model, output_path, compress=3)
    print(f"\n[save] Model → {output_path}")

    # Feature names
    feat_path = str(TRAINED_DIR / "feature_names.json")
    with open(feat_path, "w") as f:
        json.dump(FEATURE_NAMES, f, indent=2)
    print(f"[save] Feature names → {feat_path}")

    # Optimal threshold
    thresh_path = str(TRAINED_DIR / "threshold.json")
    with open(thresh_path, "w") as f:
        json.dump({"threshold": threshold, "strategy": threshold_strategy}, f, indent=2)
    print(f"[save] Threshold → {thresh_path}")

    # Full metrics
    all_metrics = {
        "n_samples"       : n_samples,
        "fraud_rate_target": fraud_rate,
        "fraud_rate_actual": round(y.mean(), 5),
        "scale_pos_weight": round(scale_pos_weight, 2),
        "best_iteration"  : int(best_iter),
        "threshold"       : round(threshold, 4),
        "threshold_strategy": threshold_strategy,
        "train"           : train_m,
        "val"             : val_m,
        "test"            : test_m,
        "cv"              : cv_metrics,
        "feature_importance": importance,
        "training_time_s" : round(time.time() - t0, 1),
    }
    metrics_path = str(TRAINED_DIR / "training_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(all_metrics, f, indent=2, default=str)
    print(f"[save] Metrics → {metrics_path}")

    # Copy to saved_models/ (FastAPI inference path)
    if copy_to_saved:
        saved_model_path = str(SAVED_DIR / "xgboost_fraud_model.joblib")
        shutil.copy2(output_path, saved_model_path)
        print(f"[save] Copied to inference path → {saved_model_path}")

    elapsed = time.time() - t0
    print(f"\n✔  Training complete in {elapsed:.1f}s")
    print(f"   Test ROC-AUC = {test_m['roc_auc']}  |  PR-AUC = {test_m['pr_auc']}")
    print(f"   Test F1      = {test_m['f1']}  |  Precision = {test_m['precision']}  |  Recall = {test_m['recall']}")
    print(f"   Decision threshold = {threshold:.4f}\n")

    return all_metrics


# ─────────────────────────────────────────────────────────────────────────────
# CLI ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="BankShield XGBoost Fraud Detector Training"
    )
    parser.add_argument("--samples",    type=int,   default=100_000,
                        help="Number of synthetic transactions (default: 100000)")
    parser.add_argument("--fraud-rate", type=float, default=0.018,
                        help="Target fraud rate 0–1 (default: 0.018 = 1.8%%)")
    parser.add_argument("--output",     type=str,   default=None,
                        help="Output .joblib path (default: trained_models/xgboost_fraud_model.joblib)")
    parser.add_argument("--threshold-strategy", type=str, default="f1",
                        choices=["f1","f2","precision_at_recall_80","youden"],
                        help="Threshold optimisation strategy (default: f1)")
    parser.add_argument("--no-cv",     action="store_true",
                        help="Skip 5-fold cross-validation (faster)")
    parser.add_argument("--no-copy",   action="store_true",
                        help="Do NOT copy model to saved_models/")
    args = parser.parse_args()

    train(
        n_samples          = args.samples,
        fraud_rate         = args.fraud_rate,
        output_path        = args.output,
        threshold_strategy = args.threshold_strategy,
        run_cv             = not args.no_cv,
        copy_to_saved      = not args.no_copy,
    )


if __name__ == "__main__":
    main()
