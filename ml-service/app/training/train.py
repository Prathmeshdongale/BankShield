import os
import joblib
import numpy as np
from xgboost import XGBClassifier
from app.core.config import settings
from app.core.logging import logger


def generate_synthetic_data(n_samples: int = 1000):
    np.random.seed(42)
    # Features: amount, hour_of_day, transaction_velocity_1h, is_new_destination, is_night
    amounts = np.random.exponential(scale=200, size=n_samples)
    hours = np.random.randint(0, 24, size=n_samples)
    velocities = np.random.poisson(lam=1.5, size=n_samples)
    is_new = np.random.binomial(n=1, p=0.15, size=n_samples)
    is_night = ((hours >= 23) | (hours <= 4)).astype(int)

    X = np.column_stack([amounts, hours, velocities, is_new, is_night])

    # Fraud probability heuristic to generate labels
    logits = (
        (amounts > 2000) * 1.5
        + (velocities > 4) * 2.0
        + is_night * 1.2
        + is_new * 1.0
        - 3.5
    )
    probs = 1 / (1 + np.exp(-logits))
    y = (np.random.rand(n_samples) < probs).astype(int)

    return X, y


def train_model():
    logger.info("Generating synthetic training data...")
    X, y = generate_synthetic_data(2000)

    logger.info(f"Training XGBoost classifier on {len(y)} samples ({np.sum(y)} fraudulent)...")
    model = XGBClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.08,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X, y)

    os.makedirs(settings.MODEL_DIR, exist_ok=True)
    joblib.dump(model, settings.MODEL_FILE)
    logger.info(f"Model successfully trained and saved to {settings.MODEL_FILE}")


if __name__ == "__main__":
    train_model()
