import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_DIR = str(BASE_DIR / "saved_models")
DEFAULT_MODEL_FILE = str(BASE_DIR / "saved_models" / "xgboost_fraud_model.joblib")


class Settings(BaseModel):
    PROJECT_NAME: str = "BankShield ML Service"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    PORT: int = int(os.getenv("PORT", 8000))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    MODEL_DIR: str = os.getenv("MODEL_DIR", DEFAULT_MODEL_DIR)
    MODEL_FILE: str = os.getenv("MODEL_FILE", DEFAULT_MODEL_FILE)


settings = Settings()
