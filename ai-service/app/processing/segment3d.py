from __future__ import annotations

import numpy as np
from skimage import measure

from .io_utils import decode_upload

METHOD = {
    "name": "Intensity isosurface (marching cubes) on stacked slices",
    "library": "scikit-image.measure.marching_cubes",
    "licence": "BSD-3-Clause (scikit-image)",
    "notes": "Intended for CT volumes. A single 2D radiograph cannot produce accurate 3D anatomy.",
}


def segment_volume(files: list[bytes]) -> dict:
    if len(files) < 8:
        return {
            "result_kind": "segmentation_rejected",
            "method": METHOD,
            "licence": METHOD["licence"],
            "metrics": {"slice_count": len(files)},
            "warnings": [
                "A CT volume with multiple slices is required.",
                "A single ordinary 2D X-ray does not provide an accurate 3D reconstruction of anatomy.",
            ],
            "label": "3D visualisation unavailable — insufficient volume data",
            "experimental": False,
            "synthetic": False,
        }

    slices = []
    modalities = set()
    for item in files:
        image, metadata = decode_upload(item)
        slices.append(image)
        if metadata.get("modality"):
            modalities.add(metadata["modality"])
    if modalities and not any(mod in {"CT", "MR"} for mod in modalities):
        return {
            "result_kind": "segmentation_rejected",
            "method": METHOD,
            "licence": METHOD["licence"],
            "metrics": {"modalities": sorted(modalities)},
            "warnings": ["3D isosurface visualisation is supported for CT/MR volumes, not projection radiographs."],
            "label": "3D visualisation unavailable — unsupported modality",
            "experimental": False,
            "synthetic": False,
        }

    volume = np.stack(slices, axis=0).astype(np.float32)
    volume = volume[::2, ::2, ::2]
    threshold = float(np.percentile(volume, 85))
    try:
        verts, faces, _normals, _values = measure.marching_cubes(volume, level=threshold, step_size=2)
    except Exception as error:
        return {
            "result_kind": "segmentation_failed",
            "method": METHOD,
            "licence": METHOD["licence"],
            "metrics": {},
            "warnings": [f"Marching cubes failed: {error}"],
            "label": "3D visualisation failed",
            "experimental": False,
            "synthetic": False,
        }

    verts = verts.astype(np.float32)
    verts -= verts.mean(axis=0)
    scale = np.max(np.linalg.norm(verts, axis=1)) or 1.0
    verts /= scale
    # Cap mesh size for browser delivery.
    faces = faces[:25000]
    return {
        "result_kind": "anatomical_3d",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": {
            "slices_used": len(slices),
            "threshold_percentile": 85,
            "vertex_count": int(len(verts)),
            "face_count": int(len(faces)),
        },
        "warnings": [
            "This is a density isosurface, not a validated anatomical segmentation.",
            "Rotate and inspect the mesh, then compare with the original slices.",
        ],
        "label": "3D isosurface derived from volume — requires radiologist review",
        "mesh": {
            "vertices": verts.tolist(),
            "faces": faces.astype(int).tolist(),
        },
        "experimental": False,
        "synthetic": False,
    }
