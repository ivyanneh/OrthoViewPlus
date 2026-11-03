import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.processing.restore import restore_image
from app.processing.synthetic import generate_synthetic
from app.processing.io_utils import encode_png


client = TestClient(app)


def _png_bytes():
    image = np.linspace(0, 255, 64 * 64, dtype=np.uint8).reshape(64, 64)
    image[:, :8] = 0
    return encode_png(image)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["diagnosis"] is False
    assert "similar-case-retrieval" in response.json()["excluded"]


def test_restore_changes_image_but_returns_metrics():
    result = restore_image(_png_bytes())
    assert result["image_base64"]
    assert "mean_absolute_change" in result["metrics"]
    assert result["synthetic"] is False


def test_synthetic_is_labelled():
    result = generate_synthetic(3)
    assert result["synthetic"] is True
    assert "SYNTHETIC" in result["label"]
    assert result["generation_process"]["seed"] == 3


def test_restore_endpoint():
    files = {"image": ("demo.png", _png_bytes(), "image/png")}
    response = client.post("/api/ai/restore", files=files)
    assert response.status_code == 200
    assert response.json()["result_kind"] == "restored_image"
