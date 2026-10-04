import os
from pydantic import BaseModel


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
    MODEL_DIR: str = os.getenv("MODEL_DIR", "saved_models")
    MODEL_FILE: str = os.path.join(MODEL_DIR, "xgboost_fraud_model.joblib")


settings = Settings()
