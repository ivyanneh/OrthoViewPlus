from __future__ import annotations

import cv2
import numpy as np

from .io_utils import decode_upload, overlay_mask, to_base64

METHOD = {
    "name": "Prior-exam aligned inpainting of low-signal regions",
    "library": "OpenCV inpaint + ECC alignment",
    "licence": "Apache-2.0 (OpenCV)",
    "notes": "Estimated anatomy from a prior examination of the same patient. Not exact recovery.",
}


def reconstruct(current_bytes: bytes, prior_bytes: bytes, patient_id: str = "", prior_patient_id: str = "") -> dict:
    current, current_meta = decode_upload(current_bytes)
    prior, prior_meta = decode_upload(prior_bytes)
    current_pid = current_meta.get("patient_id") or ""
    prior_pid = prior_meta.get("patient_id") or ""
    
    if not current_pid or not prior_pid:
        return {
            "result_kind": "reconstruction_rejected",
            "method": METHOD,
            "licence": METHOD["licence"],
            "metrics": {},
            "warnings": ["Refused: Missing PatientID in DICOM metadata. Patient identity verification required."],
            "label": "Reconstruction rejected — missing patient identifiers",
            "experimental": True,
            "synthetic": False,
        }
    
    if current_pid != prior_pid:
        return {
            "result_kind": "reconstruction_rejected",
            "method": METHOD,
            "licence": METHOD["licence"],
            "metrics": {},
            "warnings": ["Refused: prior and current Patient IDs do not match."],
            "label": "Reconstruction rejected — patient identity mismatch",
            "experimental": True,
            "synthetic": False,
        }

    prior_resized = cv2.resize(prior, (current.shape[1], current.shape[0]))
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(
            current.astype(np.float32) / 255.0,
            prior_resized.astype(np.float32) / 255.0,
            warp,
            cv2.MOTION_AFFINE,
            (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-4),
            None,
            5,
        )
        aligned = cv2.warpAffine(prior_resized, warp, (current.shape[1], current.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP)
    except cv2.error:
        aligned = prior_resized

    missing = (current < 12).astype(np.uint8) * 255
    missing = cv2.morphologyEx(missing, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
    reconstructed = current.copy()
    reconstructed[missing > 0] = aligned[missing > 0]
    reconstructed = cv2.inpaint(reconstructed, missing, 3, cv2.INPAINT_TELEA)
    # Preserve brighter (likely abnormal or true anatomy) pixels from the current image.
    reconstructed = np.where(current > 20, current, reconstructed).astype(np.uint8)
    overlay = overlay_mask(reconstructed, missing, color=(21, 154, 145), alpha=0.4)

    return {
        "result_kind": "anatomical_reconstruction",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": {
            "estimated_pixel_fraction": float(np.mean(missing > 0)),
        },
        "source_metadata": {"current": current_meta, "prior": prior_meta},
        "warnings": [
            "Highlighted pixels are estimated from a prior examination, not recovered from the current acquisition.",
            "Low-intensity pixels selected by the processing mask are estimated from the aligned prior image and inpainting.",
            "Current-image pixels above the preservation threshold are retained; this does not identify abnormalities.",
            "Do not treat this as an exact anatomical recovery.",
        ],
        "label": "Estimated reconstruction — generated regions identified on overlay",
        "image_base64": to_base64(reconstructed),
        "overlay_base64": to_base64(overlay),
        "experimental": True,
        "synthetic": False,
    }
