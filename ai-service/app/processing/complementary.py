from __future__ import annotations

import cv2
import numpy as np

from .io_utils import decode_upload, to_base64

METHOD = {
    "name": "Experimental shear/reprojection estimate of a complementary view",
    "library": "OpenCV geometric transforms",
    "licence": "Apache-2.0 (OpenCV)",
    "notes": "Research prototype. Never a substitute for a required clinical projection.",
}


def complementary_view(data: bytes) -> dict:
    image, metadata = decode_upload(data)
    h, w = image.shape[:2]
    # Horizontal intensity projection expanded into an estimated orthogonal-looking image.
    profile = image.mean(axis=1)
    estimated = np.tile(profile.reshape(h, 1), (1, w))
    shear = np.float32([[1, 0.35, 0], [0, 1, 0]])
    warped = cv2.warpAffine(image, shear, (w, h), borderMode=cv2.BORDER_REPLICATE)
    mixed = cv2.addWeighted(estimated.astype(np.uint8), 0.45, warped, 0.55, 0)
    mixed = cv2.GaussianBlur(mixed, (0, 0), 1.2)

    return {
        "result_kind": "complementary_view",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": {"source_rows": h, "source_columns": w},
        "source_metadata": metadata,
        "warnings": [
            "SYNTHETIC / ESTIMATED VIEW. This is not an acquired projection.",
            "It must never replace a required clinical examination.",
            "This capability is experimental.",
        ],
        "label": "SYNTHETIC complementary view — estimated, not acquired",
        "image_base64": to_base64(mixed),
        "experimental": True,
        "synthetic": True,
    }
