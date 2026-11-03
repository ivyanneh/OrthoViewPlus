from __future__ import annotations

import io
from typing import Any

import cv2
import numpy as np
from PIL import Image

try:
    import pydicom
except ImportError:  # pragma: no cover
    pydicom = None


def decode_upload(data: bytes) -> tuple[np.ndarray, dict[str, Any]]:
    """Decode DICOM bytes or a standard image into an 8-bit grayscale array."""
    metadata: dict[str, Any] = {"format": "image"}
    if pydicom is not None:
        try:
            dataset = pydicom.dcmread(io.BytesIO(data), force=True)
            if hasattr(dataset, "pixel_array"):
                pixels = dataset.pixel_array.astype(np.float32)
                slope = float(getattr(dataset, "RescaleSlope", 1) or 1)
                intercept = float(getattr(dataset, "RescaleIntercept", 0) or 0)
                pixels = pixels * slope + intercept
                display = _window_array(pixels, dataset)
                metadata = {
                    "format": "dicom",
                    "patient_id": str(getattr(dataset, "PatientID", "") or ""),
                    "study_date": str(getattr(dataset, "StudyDate", "") or ""),
                    "modality": str(getattr(dataset, "Modality", "") or ""),
                    "sop_instance_uid": str(getattr(dataset, "SOPInstanceUID", "") or ""),
                    "study_instance_uid": str(getattr(dataset, "StudyInstanceUID", "") or ""),
                    "rows": int(display.shape[0]),
                    "columns": int(display.shape[1]),
                    "photometric": str(getattr(dataset, "PhotometricInterpretation", "") or ""),
                }
                return display, metadata
        except Exception:
            pass

    encoded = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_GRAYSCALE)
    if image is None:
        pil = Image.open(io.BytesIO(data)).convert("L")
        image = np.array(pil)
    metadata["rows"] = int(image.shape[0])
    metadata["columns"] = int(image.shape[1])
    return image, metadata


def _window_array(pixels: np.ndarray, dataset) -> np.ndarray:
    center = getattr(dataset, "WindowCenter", None)
    width = getattr(dataset, "WindowWidth", None)
    if center is not None and width is not None:
        try:
            center = float(center[0] if hasattr(center, "__iter__") else center)
            width = float(width[0] if hasattr(width, "__iter__") else width)
            low = center - width / 2.0
            high = center + width / 2.0
            scaled = np.clip((pixels - low) / max(high - low, 1e-6), 0, 1)
            return (scaled * 255).astype(np.uint8)
        except Exception:
            pass
    low, high = np.percentile(pixels, (1, 99))
    scaled = np.clip((pixels - low) / max(high - low, 1e-6), 0, 1)
    return (scaled * 255).astype(np.uint8)


def encode_png(image: np.ndarray) -> bytes:
    if image.ndim == 2:
        ok, buffer = cv2.imencode(".png", image)
    else:
        ok, buffer = cv2.imencode(".png", cv2.cvtColor(image, cv2.COLOR_RGB2BGR))
    if not ok:
        raise ValueError("Unable to encode PNG output.")
    return buffer.tobytes()


def to_base64(image: np.ndarray) -> str:
    import base64

    return base64.b64encode(encode_png(image)).decode("ascii")


def overlay_mask(base: np.ndarray, mask: np.ndarray, color=(220, 70, 70), alpha=0.45) -> np.ndarray:
    rgb = cv2.cvtColor(base, cv2.COLOR_GRAY2RGB)
    tint = np.zeros_like(rgb)
    tint[:, :] = color
    binary = (mask > 0).astype(np.uint8)
    for channel in range(3):
        rgb[:, :, channel] = np.where(
            binary == 1,
            (alpha * tint[:, :, channel] + (1 - alpha) * rgb[:, :, channel]).astype(np.uint8),
            rgb[:, :, channel],
        )
    return rgb
