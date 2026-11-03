from __future__ import annotations

import cv2
import numpy as np

from .io_utils import decode_upload, overlay_mask, to_base64

METHOD = {
    "name": "Field-of-view coverage heuristic (content bounding box vs frame)",
    "library": "OpenCV",
    "licence": "Apache-2.0 (OpenCV)",
    "notes": (
        "Estimates whether anatomy is cropped by comparing the content bounding box with the image frame "
        "and flagging large empty margins or content touching the border."
    ),
}


def assess_completeness(data: bytes, exam_type: str = "") -> dict:
    image, metadata = decode_upload(data)
    blurred = cv2.GaussianBlur(image, (5, 5), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if np.mean(binary) > 127:
        binary = 255 - binary
    kernel = np.ones((9, 9), np.uint8)
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    coords = cv2.findNonZero(binary)
    h, w = image.shape[:2]
    missing_sides = []
    coverage_ratio = 0.0
    mask = np.zeros_like(image)
    if coords is not None:
        x, y, bw, bh = cv2.boundingRect(coords)
        coverage_ratio = (bw * bh) / float(w * h)
        margin = {"left": x / w, "right": (w - (x + bw)) / w, "top": y / h, "bottom": (h - (y + bh)) / h}
        touches = {
            "left": x <= 2,
            "right": x + bw >= w - 2,
            "top": y <= 2,
            "bottom": y + bh >= h - 2,
        }
        for side, ratio in margin.items():
            if ratio > 0.12 and not touches[side]:
                missing_sides.append(side)
            if touches[side] and ratio < 0.01:
                missing_sides.append(f"{side}-border-cut")
        mask[y : y + bh, x : x + bw] = 255
        cv2.rectangle(mask, (x, y), (x + bw, y + bh), 180, 2)
    else:
        missing_sides = ["no-anatomy-detected"]

    exam = (exam_type or "").lower()
    exam_notes = []
    if "foot" in exam or "toe" in exam:
        exam_notes.append("For foot examinations, confirm all toes are included at the distal border.")
    if "chest" in exam:
        exam_notes.append("For chest examinations, confirm lung apices and costophrenic angles are included.")

    overlay = overlay_mask(image, 255 - mask if missing_sides else mask, color=(229, 162, 59), alpha=0.35)
    return {
        "result_kind": "completeness_assessment",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": {
            "coverage_ratio": round(float(coverage_ratio), 4),
            "possible_missing_coverage": sorted(set(missing_sides)),
        },
        "source_metadata": metadata,
        "warnings": [
            "This is an assistive coverage check, not a determination that the examination is diagnostically adequate.",
            *exam_notes,
        ],
        "label": "Coverage assessment — assistive, requires review",
        "image_base64": to_base64(overlay),
        "experimental": False,
        "synthetic": False,
    }
