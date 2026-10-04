import joblib
from sklearn.metrics import classification_report, roc_auc_score
from app.core.config import settings
from app.core.logging import logger
from app.training.train import generate_synthetic_data


def evaluate():
    if not os.path.exists(settings.MODEL_FILE):
        logger.error(f"Model file {settings.MODEL_FILE} not found. Run train.py first.")
        return

    model = joblib.load(settings.MODEL_FILE)
    X_test, y_test = generate_synthetic_data(500)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    auc = roc_auc_score(y_test, y_prob)
    logger.info(f"Test ROC-AUC: {auc:.4f}")
    logger.info("\n" + classification_report(y_test, y_pred))


if __name__ == "__main__":
    import os
    evaluate()
