import base64
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

from app.main import app

client = TestClient(app)


def _dicom_bytes(
    study_date: str,
    slice_index: int = 0,
    *,
    shape: tuple[int, int] = (64, 64),
    declared_shape: tuple[int, int] | None = None,
    modality: str = "CT",
    patient_id: str | None = "TEST-SYNTHETIC-PATIENT",
    study_instance_uid: str | None = "1.2.826.0.1.3680043.10.543.1",
    series_instance_uid: str | None = "1.2.826.0.1.3680043.10.543.2",
    spatial_metadata: bool = True,
    orientation: tuple[float, ...] = (1, 0, 0, 0, 1, 0),
    pixel_spacing: tuple[float, float] = (0.7, 0.7),
    image_position: tuple[float, float, float] | None = None,
    include_dimensions: bool = True,
    declared_frames: int | None = None,
    frames: int = 1,
) -> bytes:
    file_meta = FileMetaDataset()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.MediaStorageSOPClassUID = CTImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()

    dataset = FileDataset(None, {}, file_meta=file_meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = CTImageStorage
    dataset.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    if patient_id is not None:
        dataset.PatientID = patient_id
    if study_instance_uid is not None:
        dataset.StudyInstanceUID = study_instance_uid
    if series_instance_uid is not None:
        dataset.SeriesInstanceUID = series_instance_uid
    dataset.StudyDate = study_date
    dataset.Modality = modality
    if include_dimensions:
        dataset.Rows, dataset.Columns = declared_shape or shape
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 0
    dataset.WindowCenter = 120
    dataset.WindowWidth = 300
    dataset.InstanceNumber = slice_index + 1
    if declared_frames is not None:
        dataset.NumberOfFrames = declared_frames
    if spatial_metadata:
        dataset.ImageOrientationPatient = list(orientation)
        dataset.ImagePositionPatient = list(image_position or (0, 0, slice_index * 1.25))
        dataset.PixelSpacing = list(pixel_spacing)

    rows, columns = shape
    yy, xx = np.mgrid[:rows, :columns]
    center_y, center_x = rows // 2, columns // 2
    radius = min(rows, columns) // 3 + (slice_index % 4)
    pixels = (30 + ((xx * 3 + yy * 5) % 30)).astype(np.uint16)
    body = (xx - center_x) ** 2 + (yy - center_y) ** 2 < radius**2
    pixels[body] = (100 + ((xx[body] * 7 + yy[body] * 11 + slice_index) % 130)).astype(np.uint16)
    pixels[(xx > center_x - 8) & (xx < center_x - 3) & (yy > center_y - 16) & (yy < center_y + 16)] = 150
    if frames > 1:
        if declared_frames is None:
            dataset.NumberOfFrames = frames
        pixels = np.stack([pixels] * frames)
    dataset.PixelData = pixels.tobytes()

    buffer = io.BytesIO()
    dataset.save_as(buffer, enforce_file_format=True)
    return buffer.getvalue()


def _assert_png_dimensions(encoded_image: str, expected_size: tuple[int, int]) -> None:
    image = Image.open(io.BytesIO(base64.b64decode(encoded_image, validate=True)))
    image.load()
    assert image.format == "PNG"
    assert image.width > 0
    assert image.height > 0
    assert image.size == expected_size


def _png_bytes(image: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(image).save(buffer, format="PNG")
    return buffer.getvalue()


def _post_completeness(data: bytes, filename: str = "image.dcm", exam_type: str = "", body_part: str = ""):
    return client.post(
        "/api/ai/completeness-check",
        files={"image": (filename, data, "application/dicom" if filename.endswith(".dcm") else "image/png")},
        data={"exam_type": exam_type, "body_part": body_part},
    )


def _post_complementary_view(data: bytes, filename: str = "image.dcm"):
    content_type = "application/dicom" if filename.endswith(".dcm") else "image/png"
    return client.post(
        "/api/ai/generate-complementary-view",
        files={"image": (filename, data, content_type)},
    )


def _post_synthetic(notes: str | None = None):
    data = {} if notes is None else {"notes": notes}
    return client.post("/api/ai/generate-synthetic", data=data)


def _post_restore(data: bytes, filename: str, content_type: str):
    return client.post(
        "/api/ai/restore",
        files={"image": (filename, data, content_type)},
    )


def _assert_restoration_result(result: dict, expected_size: tuple[int, int]) -> None:
    assert result["result_kind"] == "restored_image"
    _assert_png_dimensions(result["image_base64"], expected_size)
    metrics = result["metrics"]
    for metric_name in (
        "mean_absolute_change",
        "noise_estimate_original",
        "noise_estimate_restored",
    ):
        value = metrics[metric_name]
        assert isinstance(value, (int, float))
        assert np.isfinite(value)
        assert value >= 0
    assert metrics["mean_absolute_change"] <= 255
    assert metrics["noise_estimate_original"] <= 1_040_400
    assert metrics["noise_estimate_restored"] <= 1_040_400
    assert any("must not be treated as a new diagnostic image" in warning for warning in result["warnings"])
    assert "requires radiologist review" in result["label"]
    assert result["synthetic"] is False


def test_approved_capability_routes_accept_safe_synthetic_dicom_fixtures():
    current = _dicom_bytes("20260101", 0)
    prior = _dicom_bytes("20250101", 1)

    restore = client.post("/api/ai/restore", files={"image": ("current.dcm", current, "application/dicom")})
    assert restore.status_code == 200
    assert restore.json()["result_kind"] == "restored_image"

    completeness = client.post(
        "/api/ai/completeness-check",
        files={"image": ("current.dcm", current, "application/dicom")},
        data={"exam_type": "CT"},
    )
    assert completeness.status_code == 200
    assert "coverage_ratio" in completeness.json()["metrics"]

    comparison = client.post(
        "/api/ai/compare",
        files=[
            ("image", ("current.dcm", current, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )
    assert comparison.status_code == 200
    assert comparison.json()["result_kind"] == "longitudinal_comparison"

    reconstruction = client.post(
        "/api/ai/reconstruct",
        files=[
            ("image", ("current.dcm", current, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )
    assert reconstruction.status_code == 200
    assert reconstruction.json()["result_kind"] == "anatomical_reconstruction"

    complementary = client.post(
        "/api/ai/generate-complementary-view",
        files={"image": ("current.dcm", current, "application/dicom")},
    )
    assert complementary.status_code == 200
    assert complementary.json()["synthetic"] is True
    assert "SYNTHETIC" in complementary.json()["label"]

    synthetic = client.post("/api/ai/generate-synthetic", data={"notes": "19"})
    assert synthetic.status_code == 200
    assert synthetic.json()["synthetic"] is True
    assert "SYNTHETIC" in synthetic.json()["label"]

    slices = [_dicom_bytes("20260101", index) for index in range(8)]
    segmentation = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )
    assert segmentation.status_code == 200
    assert segmentation.json()["result_kind"] == "anatomical_3d"
    assert segmentation.json()["mesh"]["vertices"]
    assert segmentation.json()["mesh"]["faces"]

    health = client.get("/health").json()
    assert len(health["capabilities"]) == 7
    assert "similar-case-retrieval" in health["excluded"]


def test_3d_ct_volume_returns_valid_mesh_and_sensible_spacing_metadata():
    slices = [_dicom_bytes("20260101", index, modality="CT") for index in range(8)]

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "anatomical_3d"
    assert result["experimental"] is True
    assert any("not a validated anatomical segmentation" in warning for warning in result["warnings"])

    mesh = result["mesh"]
    vertices = np.asarray(mesh["vertices"], dtype=np.float64)
    raw_faces = np.asarray(mesh["faces"], dtype=np.float64)
    assert vertices.ndim == 2 and vertices.shape[1] == 3
    assert raw_faces.ndim == 2 and raw_faces.shape[1] == 3
    assert vertices.size > 0
    assert raw_faces.size > 0
    assert np.isfinite(vertices).all()
    assert np.isfinite(raw_faces).all()
    assert np.equal(raw_faces, np.floor(raw_faces)).all()
    faces = raw_faces.astype(np.int64)
    assert np.all(faces >= 0)
    assert np.all(faces < len(vertices))

    metrics = result["metrics"]
    assert metrics["slices_used"] == 8
    assert metrics["vertex_count"] == len(vertices)
    assert metrics["face_count"] == len(faces)
    voxel_spacing = np.asarray(metrics["voxel_spacing_mm"], dtype=np.float64)
    physical_extent = np.asarray(metrics["physical_extent_mm"], dtype=np.float64)
    assert voxel_spacing.shape == (3,)
    assert np.isfinite(voxel_spacing).all()
    assert np.all(voxel_spacing > 0)
    assert np.allclose(voxel_spacing, [2.5, 1.4, 1.4])
    assert physical_extent.shape == (3,)
    assert np.isfinite(physical_extent).all()
    assert np.all(physical_extent > 0)


def test_3d_route_accepts_regular_oblique_volume_with_rounded_orientation():
    orientation = (0.7071, 0.7071, 0, -0.4082, 0.4082, 0.8165)
    column_direction = np.asarray(orientation[:3], dtype=np.float64)
    row_direction = np.asarray(orientation[3:], dtype=np.float64)
    normal = np.cross(column_direction, row_direction)
    normal /= np.linalg.norm(normal)
    slices = [
        _dicom_bytes(
            "20260101",
            index,
            orientation=orientation,
            image_position=tuple(index * 1.25 * normal),
        )
        for index in range(8)
    ]

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "anatomical_3d"
    assert result["metrics"]["slices_used"] == 8
    assert result["experimental"] is True


def test_3d_route_rejects_in_plane_shift_in_oblique_volume():
    orientation = (0.7071, 0.7071, 0, -0.4082, 0.4082, 0.8165)
    column_direction = np.asarray(orientation[:3], dtype=np.float64)
    row_direction = np.asarray(orientation[3:], dtype=np.float64)
    normal = np.cross(column_direction, row_direction)
    normal /= np.linalg.norm(normal)
    lateral_shift = np.cross(normal, column_direction)
    lateral_shift /= np.linalg.norm(lateral_shift)
    slices = [
        _dicom_bytes(
            "20260101",
            index,
            orientation=orientation,
            image_position=tuple(index * 1.25 * normal + index * 0.2 * lateral_shift),
        )
        for index in range(8)
    ]

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "segmentation_rejected"
    assert "in-plane shifts" in result["warnings"][0]
    assert "gantry tilt" in result["warnings"][0]


def test_restore_route_accepts_synthetic_dicom_and_preserves_dimensions():
    response = _post_restore(_dicom_bytes("20260101", shape=(48, 80)), "image.dcm", "application/dicom")

    assert response.status_code == 200
    _assert_restoration_result(response.json(), (80, 48))


def test_restore_route_accepts_png_and_preserves_dimensions():
    image = np.zeros((37, 91), dtype=np.uint8)
    image[8:29, 22:70] = 180

    response = _post_restore(_png_bytes(image), "image.png", "image/png")

    assert response.status_code == 200
    _assert_restoration_result(response.json(), (91, 37))


@pytest.mark.parametrize(
    ("image", "filename"),
    [
        (np.full((32, 48), 127, dtype=np.uint8), "flat.png"),
        (
            np.random.default_rng(42).integers(0, 256, size=(40, 56), dtype=np.uint8),
            "noisy.png",
        ),
    ],
)
def test_restore_route_handles_flat_and_noisy_png_inputs(image, filename):
    response = _post_restore(_png_bytes(image), filename, "image/png")

    assert response.status_code == 200
    _assert_restoration_result(response.json(), (image.shape[1], image.shape[0]))


@pytest.mark.parametrize(
    ("data", "filename", "content_type", "expected_detail"),
    [
        (b"", "empty.dcm", "application/dicom", "is empty"),
        (b"not a DICOM file", "malformed.dcm", "application/dicom", "malformed or uses an unsupported format"),
        (b"unsupported file format", "unsupported.bin", "application/octet-stream", "malformed or uses an unsupported format"),
    ],
)
def test_restore_route_rejects_empty_malformed_or_unsupported_upload(
    data, filename, content_type, expected_detail
):
    response = _post_restore(data, filename, content_type)

    assert response.status_code == 400
    assert expected_detail in response.json()["detail"]


def test_restore_route_rejects_multiframe_dicom():
    response = _post_restore(
        _dicom_bytes("20260101", frames=2),
        "multiframe.dcm",
        "application/dicom",
    )

    assert response.status_code == 400
    assert "Multiframe or non-2D DICOM images are not supported" in response.json()["detail"]


@pytest.mark.parametrize(
    ("dicom_data", "expected_detail"),
    [
        (
            _dicom_bytes("20260101", shape=(4, 4), declared_shape=(8193, 8192)),
            "DICOM image dimensions exceed the processing limit",
        ),
        (
            _dicom_bytes("20260101", shape=(4, 4), declared_frames=2),
            "Multiframe or non-2D DICOM images are not supported",
        ),
        (
            _dicom_bytes("20260101", shape=(4, 4), declared_shape=(0, 4)),
            "DICOM Rows must be a positive integer",
        ),
        (
            _dicom_bytes("20260101", shape=(4, 4), include_dimensions=False),
            "DICOM Rows and Columns are required",
        ),
    ],
)
def test_restore_route_rejects_unsafe_dicom_header_before_pixel_decode(dicom_data, expected_detail):
    response = _post_restore(dicom_data, "invalid-header.dcm", "application/dicom")

    assert response.status_code == 400
    assert expected_detail in response.json()["detail"]


def test_synthetic_route_returns_labelled_decodable_phantom_image():
    response = _post_synthetic("19")

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "synthetic_image"
    assert result["synthetic"] is True
    assert result["experimental"] is False
    assert "SYNTHETIC" in result["label"]
    assert "not a clinical study" in result["label"]
    assert any("Not a patient examination" in warning for warning in result["warnings"])
    assert any("Do not use this output to represent clinical findings" in warning for warning in result["warnings"])
    assert result["metrics"] == {"seed": 19, "width": 512, "height": 512}
    _assert_png_dimensions(result["image_base64"], (512, 512))

    image = Image.open(io.BytesIO(base64.b64decode(result["image_base64"], validate=True)))
    pixels = np.asarray(image)
    assert image.mode == "L"
    assert pixels.shape == (512, 512)
    assert pixels.dtype == np.uint8
    assert np.isfinite(pixels).all()
    assert 0 <= int(pixels.min()) <= int(pixels.max()) <= 255
    assert np.unique(pixels).size > 1


def test_synthetic_route_is_deterministic_for_identical_seed():
    first = _post_synthetic("23")
    second = _post_synthetic("23")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["result_kind"] == "synthetic_image"
    assert first.json()["image_base64"] == second.json()["image_base64"]
    assert first.json()["generation_process"]["seed"] == second.json()["generation_process"]["seed"] == 23


def test_synthetic_route_accepts_zero_seed_deterministically():
    first = _post_synthetic("0")
    second = _post_synthetic("0")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["result_kind"] == "synthetic_image"
    assert first.json()["metrics"]["seed"] == 0
    assert first.json()["generation_process"]["seed"] == 0
    assert first.json()["image_base64"] == second.json()["image_base64"]


@pytest.mark.parametrize("invalid_seed", ["not-a-number", ""])
def test_synthetic_route_falls_back_to_default_seed_for_non_digit_parameters(invalid_seed):
    response = _post_synthetic(invalid_seed)
    default_response = _post_synthetic("7")

    assert response.status_code == 200
    assert response.json()["result_kind"] == "synthetic_image"
    assert response.json()["metrics"]["seed"] == 7
    assert response.json()["image_base64"] == default_response.json()["image_base64"]


def test_synthetic_route_accepts_large_positive_seed():
    response = _post_synthetic("2147483648")

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "synthetic_image"
    assert result["metrics"]["seed"] == 2147483648
    _assert_png_dimensions(result["image_base64"], (512, 512))


def test_synthetic_route_accepts_maximum_supported_seed():
    maximum_seed = (1 << 128) - 1
    response = _post_synthetic(str(maximum_seed))

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "synthetic_image"
    assert result["metrics"]["seed"] == maximum_seed
    assert result["generation_process"]["seed"] == maximum_seed
    _assert_png_dimensions(result["image_base64"], (512, 512))


@pytest.mark.parametrize("out_of_range_seed", ["-1", str(1 << 128)])
def test_synthetic_route_rejects_seed_outside_supported_range(out_of_range_seed):
    response = _post_synthetic(out_of_range_seed)

    assert response.status_code == 400
    assert response.json()["detail"] == f"Seed must be between 0 and {(1 << 128) - 1}."


def test_complementary_view_generates_labelled_image_from_synthetic_dicom():
    response = _post_complementary_view(_dicom_bytes("20260101"))

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "complementary_view"
    assert result["synthetic"] is True
    assert result["experimental"] is True
    assert "SYNTHETIC" in result["label"]
    assert any("not an acquired projection" in warning for warning in result["warnings"])
    assert any("never replace a required clinical examination" in warning for warning in result["warnings"])
    assert result["metrics"] == {"source_rows": 64, "source_columns": 64}
    _assert_png_dimensions(result["image_base64"], (64, 64))


def test_complementary_view_accepts_png_and_preserves_non_square_dimensions():
    image = np.zeros((37, 91), dtype=np.uint8)
    image[8:29, 22:70] = 180

    response = _post_complementary_view(_png_bytes(image), filename="image.png")

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "complementary_view"
    assert result["metrics"] == {"source_rows": 37, "source_columns": 91}
    _assert_png_dimensions(result["image_base64"], (91, 37))


@pytest.mark.parametrize(
    ("data", "expected_detail"),
    [
        (b"", "is empty"),
        (b"not an image", "malformed or uses an unsupported format"),
        (b"\x00\x01 unsupported image format", "malformed or uses an unsupported format"),
    ],
)
def test_complementary_view_rejects_empty_malformed_or_unsupported_upload(data, expected_detail):
    response = _post_complementary_view(data)

    assert response.status_code == 400
    assert expected_detail in response.json()["detail"]


def test_complementary_view_rejects_multiframe_dicom():
    response = _post_complementary_view(_dicom_bytes("20260101", frames=2))

    assert response.status_code == 400
    assert "Multiframe or non-2D DICOM images are not supported" in response.json()["detail"]


def test_complementary_view_handles_uniform_image_without_changing_dimensions():
    image = np.full((1, 17), 96, dtype=np.uint8)

    response = _post_complementary_view(_png_bytes(image), filename="uniform.png")

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "complementary_view"
    assert result["synthetic"] is True
    assert result["experimental"] is True
    _assert_png_dimensions(result["image_base64"], (17, 1))


def test_completeness_check_returns_valid_dicom_assessment():
    response = _post_completeness(_dicom_bytes("20260101"))

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "completeness_assessment"
    coverage_ratio = result["metrics"]["coverage_ratio"]
    assert np.isfinite(coverage_ratio)
    assert 0 <= coverage_ratio <= 1
    _assert_png_dimensions(result["image_base64"], (64, 64))
    assert any(
        "not a determination that the examination is diagnostically adequate" in warning
        for warning in result["warnings"]
    )


@pytest.mark.parametrize(
    ("data", "expected_detail"),
    [
        (b"", "is empty"),
        (b"not an image", "malformed or uses an unsupported format"),
    ],
)
def test_completeness_route_rejects_empty_or_malformed_upload(data, expected_detail):
    response = _post_completeness(data)

    assert response.status_code == 400
    assert expected_detail in response.json()["detail"]


def test_completeness_route_rejects_multiframe_dicom():
    response = _post_completeness(_dicom_bytes("20260101", frames=2))

    assert response.status_code == 400
    assert "Multiframe or non-2D DICOM images are not supported" in response.json()["detail"]


def test_completeness_check_accepts_png_and_preserves_non_square_dimensions():
    image = np.zeros((37, 91), dtype=np.uint8)
    image[8:29, 22:70] = 180

    response = _post_completeness(_png_bytes(image), filename="image.png")

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "completeness_assessment"
    _assert_png_dimensions(result["image_base64"], (91, 37))
    coverage_ratio = result["metrics"]["coverage_ratio"]
    assert np.isfinite(coverage_ratio)
    assert 0 <= coverage_ratio <= 1


def test_completeness_check_preserves_non_square_dicom_dimensions():
    response = _post_completeness(_dicom_bytes("20260101", shape=(48, 80)))

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "completeness_assessment"
    _assert_png_dimensions(result["image_base64"], (80, 48))


def test_completeness_check_reports_large_margins_on_all_sides():
    image = np.zeros((64, 64), dtype=np.uint8)
    image[16:48, 16:48] = 200

    response = _post_completeness(_png_bytes(image), filename="margins.png")

    assert response.status_code == 200
    result = response.json()
    assert result["metrics"]["possible_missing_coverage"] == ["bottom", "left", "right", "top"]


def test_completeness_check_reports_content_touching_image_borders():
    image = np.zeros((64, 64), dtype=np.uint8)
    image[:, :20] = 200

    response = _post_completeness(_png_bytes(image), filename="border.png")

    assert response.status_code == 200
    result = response.json()
    assert result["metrics"]["possible_missing_coverage"] == [
        "bottom-border-cut",
        "left-border-cut",
        "right",
        "top-border-cut",
    ]


def test_completeness_check_reports_when_no_foreground_is_detected():
    image = np.zeros((64, 64), dtype=np.uint8)

    response = _post_completeness(_png_bytes(image), filename="blank.png")

    assert response.status_code == 200
    result = response.json()
    assert result["metrics"]["coverage_ratio"] == 0
    assert result["metrics"]["possible_missing_coverage"] == ["no-anatomy-detected"]
    _assert_png_dimensions(result["image_base64"], (64, 64))


@pytest.mark.parametrize(
    ("exam_type", "body_part", "expected_warning"),
    [
        ("foot", "", "confirm all toes are included at the distal border"),
        ("chest", "", "confirm lung apices and costophrenic angles are included"),
        ("", "foot", "confirm all toes are included at the distal border"),
    ],
)
def test_completeness_check_includes_exam_guidance(exam_type, body_part, expected_warning):
    response = _post_completeness(
        _dicom_bytes("20260101"),
        exam_type=exam_type,
        body_part=body_part,
    )

    assert response.status_code == 200
    assert any(expected_warning in warning for warning in response.json()["warnings"])


def test_comparison_returns_decodable_images_and_bounded_metrics():
    current = _dicom_bytes(
        "20260101",
        patient_id="SAME-PATIENT",
        study_instance_uid="1.2.826.0.1.3680043.10.543.31",
        series_instance_uid="1.2.826.0.1.3680043.10.543.32",
    )
    prior = _dicom_bytes(
        "20250101",
        1,
        patient_id="SAME-PATIENT",
        study_instance_uid="1.2.826.0.1.3680043.10.543.41",
        series_instance_uid="1.2.826.0.1.3680043.10.543.42",
    )

    response = client.post(
        "/api/ai/compare",
        files=[
            ("image", ("current.dcm", current, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "longitudinal_comparison"
    _assert_png_dimensions(result["image_base64"], (64, 64))
    _assert_png_dimensions(result["overlay_base64"], (64, 64))
    difference = result["metrics"]["mean_absolute_difference"]
    assert np.isfinite(difference)
    assert 0 <= difference <= 255
    assert result["metrics"]["alignment"] in {"ecc-affine", "resize-only"}


def test_comparison_resizes_different_prior_dimensions_to_current_dimensions():
    current = _dicom_bytes("20260101", shape=(64, 64), patient_id="SAME-PATIENT")
    prior = _dicom_bytes("20250101", 1, shape=(32, 48), patient_id="SAME-PATIENT")

    response = client.post(
        "/api/ai/compare",
        files=[
            ("image", ("current.dcm", current, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "longitudinal_comparison"
    _assert_png_dimensions(result["image_base64"], (64, 64))
    _assert_png_dimensions(result["overlay_base64"], (64, 64))


@pytest.mark.parametrize(
    ("current_patient_id", "prior_patient_id", "warning"),
    [
        ("PATIENT-A", "PATIENT-B", "Patient IDs do not match"),
        (None, "PATIENT-A", "Missing PatientID"),
        ("PATIENT-A", None, "Missing PatientID"),
    ],
)
def test_comparison_rejects_mismatched_or_missing_patient_ids(current_patient_id, prior_patient_id, warning):
    current = _dicom_bytes("20260101", patient_id=current_patient_id)
    prior = _dicom_bytes("20250101", patient_id=prior_patient_id)

    response = client.post(
        "/api/ai/compare",
        files=[
            ("image", ("current.dcm", current, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "comparison_rejected"
    assert warning in result["warnings"][0]


def test_reconstruction_returns_decodable_images_and_bounded_metrics():
    current = _dicom_bytes("20260101", patient_id="SAME-PATIENT")
    prior = _dicom_bytes("20250101", 1, patient_id="SAME-PATIENT")

    response = client.post(
        "/api/ai/reconstruct",
        files=[
            ("image", ("current.dcm", current, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "anatomical_reconstruction"
    _assert_png_dimensions(result["image_base64"], (64, 64))
    _assert_png_dimensions(result["overlay_base64"], (64, 64))
    assert any(
        "Low-intensity pixels selected by the processing mask are estimated from the aligned prior image"
        in warning
        for warning in result["warnings"]
    )
    assert any(
        "does not identify abnormalities" in warning
        for warning in result["warnings"]
    )
    assert not any("Visible abnormalities" in warning for warning in result["warnings"])
    estimated_fraction = result["metrics"]["estimated_pixel_fraction"]
    assert np.isfinite(estimated_fraction)
    assert 0 <= estimated_fraction <= 1


def test_reconstruction_resizes_different_prior_dimensions_to_current_dimensions():
    current = _dicom_bytes("20260101", shape=(64, 64), patient_id="SAME-PATIENT")
    prior = _dicom_bytes("20250101", 1, shape=(32, 48), patient_id="SAME-PATIENT")

    response = client.post(
        "/api/ai/reconstruct",
        files=[
            ("image", ("current.dcm", current, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "anatomical_reconstruction"
    _assert_png_dimensions(result["image_base64"], (64, 64))
    _assert_png_dimensions(result["overlay_base64"], (64, 64))


@pytest.mark.parametrize(
    ("current_patient_id", "prior_patient_id", "warning"),
    [
        ("PATIENT-A", "PATIENT-B", "Patient IDs do not match"),
        (None, "PATIENT-A", "Missing PatientID"),
        ("PATIENT-A", None, "Missing PatientID"),
    ],
)
def test_reconstruction_rejects_mismatched_or_missing_patient_ids(
    current_patient_id, prior_patient_id, warning
):
    current = _dicom_bytes("20260101", patient_id=current_patient_id)
    prior = _dicom_bytes("20250101", patient_id=prior_patient_id)

    response = client.post(
        "/api/ai/reconstruct",
        files=[
            ("image", ("current.dcm", current, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "reconstruction_rejected"
    assert warning in result["warnings"][0]


@pytest.mark.parametrize("endpoint", ["compare", "reconstruct"])
@pytest.mark.parametrize("invalid_field", ["image", "prior_image"])
@pytest.mark.parametrize(
    ("invalid_data", "expected_detail"),
    [
        (b"", "is empty"),
        (b"not an image", "malformed or uses an unsupported format"),
    ],
)
def test_comparison_and_reconstruction_reject_empty_or_malformed_uploads(
    endpoint, invalid_field, invalid_data, expected_detail
):
    current_data = _dicom_bytes("20260101")
    prior_data = _dicom_bytes("20250101", 1)
    uploads = {
        "image": ("current.dcm", current_data, "application/dicom"),
        "prior_image": ("prior.dcm", prior_data, "application/dicom"),
    }
    uploads[invalid_field] = (
        f"{invalid_field}.dcm",
        invalid_data,
        "application/dicom",
    )

    response = client.post(f"/api/ai/{endpoint}", files=list(uploads.items()))

    assert response.status_code == 400
    assert expected_detail in response.json()["detail"]


@pytest.mark.parametrize("endpoint", ["compare", "reconstruct"])
@pytest.mark.parametrize("invalid_field", ["image", "prior_image"])
def test_comparison_and_reconstruction_reject_multiframe_dicom(endpoint, invalid_field):
    uploads = {
        "image": ("current.dcm", _dicom_bytes("20260101"), "application/dicom"),
        "prior_image": ("prior.dcm", _dicom_bytes("20250101", 1), "application/dicom"),
    }
    uploads[invalid_field] = (
        f"{invalid_field}.dcm",
        _dicom_bytes("20260101", frames=2),
        "application/dicom",
    )

    response = client.post(f"/api/ai/{endpoint}", files=list(uploads.items()))

    assert response.status_code == 400
    assert "Multiframe or non-2D DICOM images are not supported" in response.json()["detail"]


def test_invalid_and_incompatible_images_are_rejected_without_processing():
    empty = client.post("/api/ai/restore", files={"image": ("empty.png", b"", "image/png")})
    assert empty.status_code == 400
    malformed = client.post("/api/ai/restore", files={"image": ("bad.dcm", b"not an image", "application/dicom")})
    assert malformed.status_code == 400

    missing_identity = _dicom_bytes("20260101", 0, patient_id="")
    prior = _dicom_bytes("20250101", 1)
    rejected = client.post(
        "/api/ai/compare",
        files=[
            ("image", ("missing-id.dcm", missing_identity, "application/dicom")),
            ("prior_image", ("prior.dcm", prior, "application/dicom")),
        ],
    )
    assert rejected.status_code == 200
    assert rejected.json()["result_kind"] == "comparison_rejected"

    incompatible = [_dicom_bytes("20260101", index) for index in range(7)]
    incompatible.append(_dicom_bytes("20260101", 7, shape=(32, 64)))
    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(incompatible)],
    )
    assert response.status_code == 200
    assert response.json()["result_kind"] == "segmentation_rejected"
    assert "identical rows and columns" in response.json()["warnings"][0]


def test_3d_processing_requires_spatial_metadata_and_supported_modality():
    missing_position = [_dicom_bytes("20260101", index, spatial_metadata=False) for index in range(8)]
    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(missing_position)],
    )
    assert response.status_code == 200
    assert response.json()["result_kind"] == "segmentation_rejected"
    assert "ImageOrientationPatient" in response.json()["warnings"][0]

    unsupported = [_dicom_bytes("20260101", index, modality="DX") for index in range(8)]
    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(unsupported)],
    )
    assert response.status_code == 200
    assert response.json()["result_kind"] == "segmentation_rejected"
    assert "CT or MR modality" in response.json()["warnings"][0]


def test_3d_route_rejects_insufficient_slices():
    slices = [_dicom_bytes("20260101", index) for index in range(7)]

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    assert response.json()["result_kind"] == "segmentation_rejected"
    assert "At least eight" in response.json()["warnings"][0]


def test_3d_route_rejects_in_plane_slice_origin_shifts():
    slices = [
        _dicom_bytes("20260101", index, image_position=(index * 0.25, 0, index * 1.25))
        for index in range(8)
    ]

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "segmentation_rejected"
    assert "in-plane shifts" in result["warnings"][0]
    assert "gantry tilt" in result["warnings"][0]


def test_3d_route_rejects_irregular_slice_positions():
    z_positions = [index * 1.25 for index in range(7)] + [9.25]
    slices = [
        _dicom_bytes("20260101", index, image_position=(0, 0, z_positions[index]))
        for index in range(8)
    ]

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "segmentation_rejected"
    assert "irregular slice spacing" in result["label"]
    assert "varies by more than 20%" in result["warnings"][0]


def test_3d_route_rejects_aggregate_declared_volume_size_before_pixel_decode():
    slices = [
        _dicom_bytes("20260101", index, shape=(4, 4), declared_shape=(3000, 3000))
        for index in range(8)
    ]

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    result = response.json()
    assert result["result_kind"] == "segmentation_rejected"
    assert "64-million-voxel processing limit" in result["warnings"][0]


@pytest.mark.parametrize(
    ("inconsistent_metadata", "warning"),
    [
        ({"orientation": (0, 1, 0, -1, 0, 0)}, "incompatible ImageOrientationPatient"),
        ({"pixel_spacing": (0.8, 0.7)}, "matching positive PixelSpacing"),
    ],
)
def test_3d_route_rejects_inconsistent_spatial_metadata(inconsistent_metadata, warning):
    slices = [_dicom_bytes("20260101", index) for index in range(7)]
    slices.append(_dicom_bytes("20260101", 7, **inconsistent_metadata))

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    assert response.json()["result_kind"] == "segmentation_rejected"
    assert warning in response.json()["warnings"][0]


@pytest.mark.parametrize(
    ("invalid_data", "expected_status", "expected_detail"),
    [
        (b"", 400, "is empty"),
        (b"not a DICOM image", 400, "malformed or uses an unsupported format"),
    ],
)
def test_3d_route_rejects_empty_or_malformed_slice(invalid_data, expected_status, expected_detail):
    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", _dicom_bytes("20260101", index), "application/dicom")) for index in range(7)]
        + [("volume", ("invalid.dcm", invalid_data, "application/dicom"))],
    )

    assert response.status_code == expected_status
    assert expected_detail in response.json()["detail"]


def test_3d_volume_accepts_consistent_patient_study_and_series_identifiers():
    slices = [
        _dicom_bytes(
            "20260101",
            index,
            patient_id="CONSISTENT-PATIENT",
            study_instance_uid="1.2.826.0.1.3680043.10.543.11",
            series_instance_uid="1.2.826.0.1.3680043.10.543.12",
        )
        for index in range(8)
    ]

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    assert response.json()["result_kind"] == "anatomical_3d"


@pytest.mark.parametrize(
    ("identity_field", "field_name", "changed_value"),
    [
        ("patient_id", "PatientID", "DIFFERENT-PATIENT"),
        ("study_instance_uid", "StudyInstanceUID", "1.2.826.0.1.3680043.10.543.21"),
        ("series_instance_uid", "SeriesInstanceUID", "1.2.826.0.1.3680043.10.543.22"),
    ],
)
def test_3d_volume_rejects_inconsistent_dicom_identity(identity_field, field_name, changed_value):
    slices = [_dicom_bytes("20260101", index) for index in range(7)]
    slices.append(_dicom_bytes("20260101", 7, **{identity_field: changed_value}))

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    assert response.json()["result_kind"] == "segmentation_rejected"
    assert field_name in response.json()["warnings"][0]
    assert "same" in response.json()["warnings"][0]


@pytest.mark.parametrize(
    ("identity_field", "field_name"),
    [
        ("patient_id", "PatientID"),
        ("study_instance_uid", "StudyInstanceUID"),
        ("series_instance_uid", "SeriesInstanceUID"),
    ],
)
def test_3d_volume_rejects_missing_dicom_identity(identity_field, field_name):
    slices = [_dicom_bytes("20260101", index) for index in range(7)]
    slices.append(_dicom_bytes("20260101", 7, **{identity_field: None}))

    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", item, "application/dicom")) for index, item in enumerate(slices)],
    )

    assert response.status_code == 200
    assert response.json()["result_kind"] == "segmentation_rejected"
    assert field_name in response.json()["warnings"][0]
    assert "non-empty" in response.json()["warnings"][0]


def test_multiframe_dicom_is_rejected_by_single_image_processing():
    response = client.post(
        "/api/ai/restore",
        files={"image": ("multiframe.dcm", _dicom_bytes("20260101", frames=2), "application/dicom")},
    )
    assert response.status_code == 400
    assert "Multiframe or non-2D" in response.json()["detail"]


def test_3d_route_rejects_more_than_200_slices_before_decoding():
    response = client.post(
        "/api/ai/segment-3d",
        files=[("volume", (f"slice-{index}.dcm", b"not decoded", "application/dicom")) for index in range(201)],
    )
    assert response.status_code == 413
    assert "at most 200 slices" in response.json()["detail"]
