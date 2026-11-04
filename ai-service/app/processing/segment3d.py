from __future__ import annotations

import numpy as np
from skimage import measure

from .io_utils import MAX_IMAGE_PIXELS, decode_upload, inspect_dicom_header

METHOD = {
    "name": "Intensity isosurface (marching cubes) on a validated DICOM volume",
    "library": "scikit-image.measure.marching_cubes",
    "licence": "BSD-3-Clause (scikit-image)",
    "notes": "Experimental CT/MR visualization; this is not validated anatomical segmentation.",
}


def _rejected(label: str, warning: str, metrics: dict | None = None) -> dict:
    return {
        "result_kind": "segmentation_rejected",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": metrics or {},
        "warnings": [warning],
        "label": label,
        "experimental": True,
        "synthetic": False,
    }


def segment_volume(files: list[bytes]) -> dict:
    if len(files) < 8:
        return _rejected(
            "3D visualisation unavailable — insufficient volume data",
            "At least eight CT/MR slices are required; a single projection image cannot provide accurate 3D anatomy.",
            {"slice_count": len(files)},
        )
    if len(files) > 200:
        return _rejected(
            "3D visualisation unavailable — volume exceeds processing limit",
            "The volume exceeds the 200-slice processing limit.",
            {"slice_count": len(files)},
        )

    headers = [inspect_dicom_header(item) for item in files]
    dicom_headers = [header for header in headers if header is not None]
    declared_voxels = sum(header["rows"] * header["columns"] for header in dicom_headers)
    if declared_voxels > MAX_IMAGE_PIXELS:
        return _rejected(
            "3D visualisation unavailable — volume exceeds memory limit",
            "The volume exceeds the 64-million-voxel processing limit.",
        )
    if len(dicom_headers) == len(files):
        dimensions = {(header["rows"], header["columns"]) for header in dicom_headers}
        if len(dimensions) != 1:
            return _rejected(
                "3D visualisation unavailable — incompatible slice dimensions",
                "All slices must be single-frame images with identical rows and columns.",
                {"slice_shapes": [[header["rows"], header["columns"]] for header in dicom_headers]},
            )

    decoded = [decode_upload(item) for item in files]
    slices = [image for image, _metadata in decoded]
    metadata = [item_metadata for _image, item_metadata in decoded]
    if any(item.get("format") != "dicom" for item in metadata):
        return _rejected(
            "3D visualisation unavailable — DICOM volume required",
            "Every volume slice must be a DICOM image with spatial metadata.",
        )

    for metadata_key, field_name in (
        ("patient_id", "PatientID"),
        ("study_instance_uid", "StudyInstanceUID"),
        ("series_instance_uid", "SeriesInstanceUID"),
    ):
        identifiers = [str(item.get(metadata_key) or "").strip() for item in metadata]
        if any(not identifier for identifier in identifiers):
            return _rejected(
                "3D visualisation unavailable — missing DICOM identity",
                f"Every volume slice must provide a non-empty {field_name}.",
            )
        if len(set(identifiers)) != 1:
            return _rejected(
                "3D visualisation unavailable — inconsistent DICOM identity",
                f"All volume slices must have the same {field_name}.",
            )

    modalities = {item.get("modality") for item in metadata}
    if len(modalities) != 1 or not modalities.issubset({"CT", "MR"}):
        return _rejected(
            "3D visualisation unavailable — unsupported or mixed modality",
            "A volume must contain slices from one CT or MR modality.",
            {"modalities": sorted(str(value) for value in modalities)},
        )

    shape = slices[0].shape
    if any(image.ndim != 2 or image.shape != shape for image in slices):
        return _rejected(
            "3D visualisation unavailable — incompatible slice dimensions",
            "All slices must be single-frame images with identical rows and columns.",
            {"slice_shapes": [list(image.shape) for image in slices]},
        )
    if len(slices) * int(shape[0]) * int(shape[1]) > MAX_IMAGE_PIXELS:
        return _rejected(
            "3D visualisation unavailable — volume exceeds memory limit",
            "The volume exceeds the 64-million-voxel processing limit.",
        )

    orientations = [item.get("image_orientation_patient") for item in metadata]
    positions = [item.get("image_position_patient") for item in metadata]
    spacings = [item.get("pixel_spacing") for item in metadata]
    if any(value is None for value in orientations + positions + spacings):
        return _rejected(
            "3D visualisation unavailable — missing spatial metadata",
            "Every slice must provide ImageOrientationPatient, ImagePositionPatient, and PixelSpacing.",
        )

    orientation = np.asarray(orientations[0], dtype=np.float64)
    if any(not np.allclose(orientation, item, rtol=0, atol=1e-4) for item in orientations[1:]):
        return _rejected(
            "3D visualisation unavailable — inconsistent slice orientation",
            "The slices have incompatible ImageOrientationPatient values.",
        )
    column_direction = orientation[:3]
    row_direction = orientation[3:]
    if (
        not np.isclose(np.linalg.norm(column_direction), 1, atol=1e-3)
        or not np.isclose(np.linalg.norm(row_direction), 1, atol=1e-3)
        or not np.isclose(np.dot(column_direction, row_direction), 0, atol=1e-3)
    ):
        return _rejected(
            "3D visualisation unavailable — invalid slice orientation",
            "DICOM slice orientation vectors must be unit-length and perpendicular.",
        )
    normal = np.cross(column_direction, row_direction)
    normal_magnitude = np.linalg.norm(normal)
    if not np.isfinite(normal_magnitude) or normal_magnitude <= 0:
        return _rejected(
            "3D visualisation unavailable — invalid slice orientation",
            "DICOM slice orientation does not define a finite, non-zero slice normal.",
        )
    normal /= normal_magnitude
    positions_array = np.asarray(positions, dtype=np.float64)
    projections = positions_array @ normal
    order = np.argsort(projections)
    projections = projections[order]
    sorted_positions = positions_array[order]
    sorted_slices = [slices[index] for index in order]
    sorted_metadata = [metadata[index] for index in order]
    differences = np.diff(projections)
    if np.any(differences <= 1e-4):
        return _rejected(
            "3D visualisation unavailable — duplicate or unordered slice positions",
            "Slice positions must be unique and spatially ordered.",
        )
    slice_spacing = float(np.median(differences))
    if np.max(np.abs(differences - slice_spacing)) / slice_spacing > 0.2:
        return _rejected(
            "3D visualisation unavailable — irregular slice spacing",
            "Slice spacing varies by more than 20%; the volume cannot be safely stacked.",
            {"slice_spacing_mm": differences.tolist()},
        )
    origin_displacements = np.diff(sorted_positions, axis=0)
    expected_displacements = differences[:, None] * normal
    in_plane_residuals = origin_displacements - expected_displacements
    if np.any(np.linalg.norm(in_plane_residuals, axis=1) > 1e-3):
        return _rejected(
            "3D visualisation unavailable — inconsistent in-plane slice positions",
            "Slice origins have in-plane shifts; gantry tilt or shifted slices are not supported.",
        )

    pixel_spacing = np.asarray(spacings[0], dtype=np.float64)
    if (
        not np.isfinite(pixel_spacing).all()
        or np.any(pixel_spacing <= 0)
        or any(not np.allclose(pixel_spacing, item, rtol=0, atol=1e-4) for item in spacings[1:])
    ):
        return _rejected(
            "3D visualisation unavailable — inconsistent pixel spacing",
            "All slices must have matching positive PixelSpacing values.",
        )

    factor = 2
    volume = np.stack(sorted_slices, axis=0)[::factor, ::factor, ::factor].astype(np.float32)
    voxel_spacing = np.array([slice_spacing, pixel_spacing[0], pixel_spacing[1]], dtype=np.float64) * factor
    threshold = float(np.percentile(volume, 85))
    try:
        vertices, faces, _normals, _values = measure.marching_cubes(volume, level=threshold, step_size=1)
    except (ValueError, RuntimeError) as error:
        return {
            "result_kind": "segmentation_failed",
            "method": METHOD,
            "licence": METHOD["licence"],
            "metrics": {"threshold_percentile": 85},
            "warnings": [f"Marching cubes could not generate a surface: {error}"],
            "label": "3D visualisation failed",
            "experimental": True,
            "synthetic": False,
        }

    z, y, x = vertices.T
    patient_coordinates = (
        sorted_positions[0]
        + z[:, None] * normal
        + y[:, None] * voxel_spacing[1] * row_direction
        + x[:, None] * voxel_spacing[2] * column_direction
    )
    physical_extent = np.ptp(patient_coordinates, axis=0)
    patient_coordinates -= patient_coordinates.mean(axis=0)
    scale = np.max(np.linalg.norm(patient_coordinates, axis=1)) or 1.0
    patient_coordinates /= scale
    faces = faces[:25000]
    return {
        "result_kind": "anatomical_3d",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": {
            "slices_used": len(sorted_slices),
            "threshold_percentile": 85,
            "vertex_count": int(len(patient_coordinates)),
            "face_count": int(len(faces)),
            "voxel_spacing_mm": [float(value) for value in voxel_spacing],
            "physical_extent_mm": [float(value) for value in physical_extent],
        },
        "warnings": [
            "This is an experimental intensity isosurface, not a validated anatomical segmentation.",
            "Physical slice and pixel spacing were used to preserve proportions; the displayed mesh is normalized.",
            "Rotate and inspect the mesh, then compare with the original slices.",
        ],
        "label": "Experimental 3D isosurface derived from volume — requires radiologist review",
        "mesh": {
            "vertices": patient_coordinates.astype(np.float32).tolist(),
            "faces": faces.astype(int).tolist(),
        },
        "experimental": True,
        "synthetic": False,
    }
