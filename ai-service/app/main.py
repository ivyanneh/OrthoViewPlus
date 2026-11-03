from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.ai import router as ai_router

app = FastAPI(
    title="OrthoView+ AI Service",
    description=(
        "Assistive medical image processing for OrthoView+. "
        "Outputs are derived or synthetic and must be reviewed by a radiologist. "
        "This service does not diagnose patients."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(ai_router, prefix="/api/ai")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "orthoviewplus-ai",
        "diagnosis": False,
        "capabilities": [
            "restore",
            "completeness-check",
            "compare",
            "reconstruct",
            "segment-3d",
            "generate-synthetic",
            "generate-complementary-view",
        ],
        "excluded": ["similar-case-retrieval"],
    }
