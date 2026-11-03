from __future__ import annotations

import cv2
import numpy as np

from .io_utils import decode_upload, to_base64


METHOD = {
    "name": "OpenCV non-local means + CLAHE restoration pipeline",
    "library": "opencv-python-headless",
    "licence": "Apache-2.0 (OpenCV)",
    "notes": (
        "Classical restoration: denoise with fastNlMeansDenoising, local contrast with CLAHE, "
        "and gentle unsharp masking. This is not a diagnostic enhancement model and does not invent anatomy."
    ),
}


def restore_image(data: bytes) -> dict:
    image, metadata = decode_upload(data)
    denoised = cv2.fastNlMeansDenoising(image, None, h=8, templateWindowSize=7, searchWindowSize=21)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    equalised = clahe.apply(denoised)
    blur = cv2.GaussianBlur(equalised, (0, 0), 1.0)
    restored = cv2.addWeighted(equalised, 1.25, blur, -0.25, 0)
    restored = np.clip(restored, 0, 255).astype(np.uint8)

    residual = cv2.absdiff(image, restored)
    metrics = {
        "mean_absolute_change": float(np.mean(residual)),
        "noise_estimate_original": float(np.mean(cv2.Laplacian(image, cv2.CV_64F) ** 2)),
        "noise_estimate_restored": float(np.mean(cv2.Laplacian(restored, cv2.CV_64F) ** 2)),
    }
    return {
        "result_kind": "restored_image",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": metrics,
        "source_metadata": metadata,
        "warnings": [
            "The original acquisition is unchanged.",
            "Restoration may reduce noise but must not be treated as a new diagnostic image.",
            "Review the original image alongside this output.",
        ],
        "label": "AI-restored image — derived, requires radiologist review",
        "image_base64": to_base64(restored),
        "experimental": False,
        "synthetic": False,
    }
