from __future__ import annotations

import cv2
import numpy as np

from .io_utils import decode_upload, to_base64

METHOD = {
    "name": "ECC affine alignment with absolute-difference heatmap",
    "library": "OpenCV findTransformECC",
    "licence": "Apache-2.0 (OpenCV)",
}


def compare_images(current_bytes: bytes, prior_bytes: bytes, patient_id: str = "", prior_patient_id: str = "") -> dict:
    current, current_meta = decode_upload(current_bytes)
    prior, prior_meta = decode_upload(prior_bytes)

    current_pid = current_meta.get("patient_id") or ""
    prior_pid = prior_meta.get("patient_id") or ""
    
    if not current_pid or not prior_pid:
        return {
            "result_kind": "comparison_rejected",
            "method": METHOD,
            "licence": METHOD["licence"],
            "metrics": {},
            "warnings": ["Refused: Missing PatientID in DICOM metadata. Patient identity verification required."],
            "label": "Comparison rejected — missing patient identifiers",
            "experimental": False,
            "synthetic": False,
        }
    
    if current_pid != prior_pid:
        return {
            "result_kind": "comparison_rejected",
            "method": METHOD,
            "licence": METHOD["licence"],
            "metrics": {},
            "warnings": ["Refused: Patient IDs do not match. Unrelated patients cannot be compared."],
            "label": "Comparison rejected — patient identity mismatch",
            "experimental": False,
            "synthetic": False,
        }

    prior_resized = cv2.resize(prior, (current.shape[1], current.shape[0]), interpolation=cv2.INTER_AREA)
    warp = np.eye(2, 3, dtype=np.float32)
    aligned = prior_resized
    alignment = "none"
    try:
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-5)
        _, warp = cv2.findTransformECC(
            current.astype(np.float32) / 255.0,
            prior_resized.astype(np.float32) / 255.0,
            warp,
            cv2.MOTION_AFFINE,
            criteria,
            None,
            5,
        )
        aligned = cv2.warpAffine(prior_resized, warp, (current.shape[1], current.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
        alignment = "ecc-affine"
    except cv2.error:
        alignment = "resize-only"

    diff = cv2.absdiff(current, aligned)
    heatmap = cv2.applyColorMap(diff, cv2.COLORMAP_INFERNO)
    current_rgb = cv2.cvtColor(current, cv2.COLOR_GRAY2BGR)
    blended = cv2.addWeighted(current_rgb, 0.55, heatmap, 0.45, 0)

    return {
        "result_kind": "longitudinal_comparison",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": {
            "mean_absolute_difference": float(np.mean(diff)),
            "alignment": alignment,
            "current_study_date": current_meta.get("study_date"),
            "prior_study_date": prior_meta.get("study_date"),
        },
        "source_metadata": {"current": current_meta, "prior": prior_meta},
        "warnings": [
            "Highlighted regions indicate intensity change after alignment, not a diagnosis.",
            "Always inspect the original earlier and later acquisitions.",
        ],
        "label": "Longitudinal comparison — difference map, requires review",
        "image_base64": to_base64(cv2.cvtColor(blended, cv2.COLOR_BGR2RGB)),
        "overlay_base64": to_base64(aligned),
        "experimental": False,
        "synthetic": False,
    }
