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


MAX_IMAGE_PIXELS = 64 * 1024 * 1024


def _vector(value, length: int) -> list[float] | None:
    if value is None:
        return None
    try:
        result = [float(item) for item in value]
        return result if len(result) == length and np.isfinite(result).all() else None
    except (TypeError, ValueError):
        return None


def _positive_dicom_int(value, name: str) -> int:
    try:
        result = int(str(value).strip())
    except (TypeError, ValueError) as error:
        raise ValueError(f"DICOM {name} must be a positive integer.") from error
    if result <= 0:
        raise ValueError(f"DICOM {name} must be a positive integer.")
    return result


def _dicom_header_dimensions(dataset) -> dict[str, int]:
    if "Rows" not in dataset or "Columns" not in dataset:
        raise ValueError("DICOM Rows and Columns are required.")
    rows = _positive_dicom_int(dataset.Rows, "Rows")
    columns = _positive_dicom_int(dataset.Columns, "Columns")
    number_of_frames = _positive_dicom_int(getattr(dataset, "NumberOfFrames", 1), "NumberOfFrames")
    if number_of_frames != 1:
        raise ValueError("Multiframe or non-2D DICOM images are not supported by this capability.")
    samples_per_pixel = _positive_dicom_int(getattr(dataset, "SamplesPerPixel", 1), "SamplesPerPixel")
    if samples_per_pixel != 1:
        raise ValueError("Multiframe or non-2D DICOM images are not supported by this capability.")
    if rows * columns > MAX_IMAGE_PIXELS:
        raise ValueError("DICOM image dimensions exceed the processing limit.")
    return {"rows": rows, "columns": columns, "samples_per_pixel": samples_per_pixel}


def inspect_dicom_header(data: bytes) -> dict[str, int] | None:
    """Read DICOM image dimensions without loading or decoding pixel data."""
    if not data or pydicom is None:
        return None
    try:
        dataset = pydicom.dcmread(io.BytesIO(data), force=True, stop_before_pixels=True)
    except (OSError, AttributeError, TypeError):
        return None
    image_tags = (
        "SOPClassUID",
        "Rows",
        "Columns",
        "NumberOfFrames",
        "SamplesPerPixel",
        "PhotometricInterpretation",
        "BitsAllocated",
        "PixelRepresentation",
    )
    if not any(tag in dataset for tag in image_tags):
        return None
    return _dicom_header_dimensions(dataset)


def decode_upload(data: bytes) -> tuple[np.ndarray, dict[str, Any]]:
    """Decode DICOM bytes or a standard image into an 8-bit grayscale array."""
    if not data:
        raise ValueError("Image upload is empty.")
    metadata: dict[str, Any] = {"format": "image"}
    if pydicom is not None:
        try:
            dataset = pydicom.dcmread(io.BytesIO(data), force=True)
            if any(tag in dataset for tag in ("PixelData", "FloatPixelData", "DoubleFloatPixelData")):
                dimensions = _dicom_header_dimensions(dataset)
                pixels = dataset.pixel_array.astype(np.float32)
                if pixels.ndim != 2:
                    raise ValueError("Multiframe or non-2D DICOM images are not supported by this capability.")
                if pixels.shape != (dimensions["rows"], dimensions["columns"]):
                    raise ValueError("DICOM pixel data dimensions do not match Rows and Columns.")
                slope = float(getattr(dataset, "RescaleSlope", 1) or 1)
                intercept = float(getattr(dataset, "RescaleIntercept", 0) or 0)
                pixels = pixels * slope + intercept
                display = _window_array(pixels, dataset)
                photometric = str(getattr(dataset, "PhotometricInterpretation", "") or "")
                if photometric == "MONOCHROME1":
                    display = 255 - display
                metadata = {
                    "format": "dicom",
                    "patient_id": str(getattr(dataset, "PatientID", "") or ""),
                    "study_date": str(getattr(dataset, "StudyDate", "") or ""),
                    "modality": str(getattr(dataset, "Modality", "") or ""),
                    "sop_instance_uid": str(getattr(dataset, "SOPInstanceUID", "") or ""),
                    "study_instance_uid": str(getattr(dataset, "StudyInstanceUID", "") or ""),
                    "series_instance_uid": str(getattr(dataset, "SeriesInstanceUID", "") or ""),
                    "rows": int(display.shape[0]),
                    "columns": int(display.shape[1]),
                    "photometric": photometric,
                    "instance_number": _optional_int(getattr(dataset, "InstanceNumber", None)),
                    "image_position_patient": _vector(getattr(dataset, "ImagePositionPatient", None), 3),
                    "image_orientation_patient": _vector(getattr(dataset, "ImageOrientationPatient", None), 6),
                    "pixel_spacing": _vector(getattr(dataset, "PixelSpacing", None), 2),
                }
                return display, metadata
        except ValueError:
            raise
        except (OSError, AttributeError, TypeError):
            pass

    encoded = np.frombuffer(data, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_GRAYSCALE)
    if image is None:
        try:
            pil = Image.open(io.BytesIO(data)).convert("L")
        except (OSError, ValueError) as error:
            raise ValueError("Image upload is malformed or uses an unsupported format.") from error
        image = np.array(pil)
    if image.ndim != 2 or image.size > 64 * 1024 * 1024:
        raise ValueError("Image dimensions exceed the supported processing limits.")
    metadata["rows"] = int(image.shape[0])
    metadata["columns"] = int(image.shape[1])
    return image, metadata


def _optional_int(value) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


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
