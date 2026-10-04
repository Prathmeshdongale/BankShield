from fastapi import APIRouter
from .health  import router as health_router
from .predict import router as predict_router
from .explain import router as explain_router

api_router = APIRouter()
api_router.include_router(health_router, prefix="", tags=["Health"])
api_router.include_router(predict_router, prefix="", tags=["Inference"])
api_router.include_router(explain_router, prefix="", tags=["Explainability"])
