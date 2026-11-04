from __future__ import annotations

import numpy as np

from .io_utils import to_base64

MAX_SYNTHETIC_SEED = (1 << 128) - 1

METHOD = {
    "name": "Procedural radiographic phantom generator",
    "library": "NumPy",
    "licence": "Project code (academic prototype)",
    "notes": "No patient data is used. Output is synthetic and stored separately from clinical studies.",
}


def generate_synthetic(seed: int = 7) -> dict:
    seed = int(seed)
    if seed < 0 or seed > MAX_SYNTHETIC_SEED:
        raise ValueError(f"Seed must be between 0 and {MAX_SYNTHETIC_SEED}.")
    rng = np.random.default_rng(seed)
    height, width = 512, 512
    yy, xx = np.mgrid[0:height, 0:width]
    image = np.full((height, width), 18.0)
    # Soft-tissue torso ellipse
    torso = ((xx - 256) ** 2) / (170**2) + ((yy - 270) ** 2) / (220**2)
    image[torso < 1] = 70
    # Lung fields
    for cx in (190, 322):
        lungs = ((xx - cx) ** 2) / (70**2) + ((yy - 240) ** 2) / (120**2)
        image[lungs < 1] = 32
    # Spine
    image[np.abs(xx - 256) < 12] += 40
    # Rib arcs
    for radius in range(70, 180, 16):
        dist = np.sqrt((xx - 256) ** 2 + (yy - 210) ** 2)
        rib = np.abs(dist - radius) < 2.2
        image[rib] += 28
    image += rng.normal(0, 4.5, image.shape)
    image = np.clip(image, 0, 255).astype(np.uint8)

    return {
        "result_kind": "synthetic_image",
        "method": METHOD,
        "licence": METHOD["licence"],
        "metrics": {"seed": int(seed), "width": width, "height": height},
        "warnings": [
            "SYNTHETIC IMAGE. Not a patient examination.",
            "Do not use this output to represent clinical findings.",
        ],
        "label": "SYNTHETIC — demonstration phantom, not a clinical study",
        "image_base64": to_base64(image),
        "experimental": False,
        "synthetic": True,
        "generation_process": {
            "type": "procedural_numpy_phantom",
            "components": ["torso ellipse", "lung fields", "spine", "rib arcs", "gaussian noise"],
            "seed": int(seed),
        },
    }
