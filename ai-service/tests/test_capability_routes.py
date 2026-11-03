import io

import numpy as np
from fastapi.testclient import TestClient
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

from app.main import app

client = TestClient(app)


def _dicom_bytes(
    study_date: str,
    slice_index: int = 0,
    *,
    shape: tuple[int, int] = (64, 64),
    modality: str = "CT",
    patient_id: str = "TEST-SYNTHETIC-PATIENT",
    spatial_metadata: bool = True,
    frames: int = 1,
) -> bytes:
    file_meta = FileMetaDataset()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.MediaStorageSOPClassUID = CTImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()

    dataset = FileDataset(None, {}, file_meta=file_meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = CTImageStorage
    dataset.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    dataset.PatientID = patient_id
    dataset.StudyInstanceUID = "1.2.826.0.1.3680043.10.543.1"
    dataset.SeriesInstanceUID = "1.2.826.0.1.3680043.10.543.2"
    dataset.StudyDate = study_date
    dataset.Modality = modality
    dataset.Rows, dataset.Columns = shape
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 0
    dataset.WindowCenter = 120
    dataset.WindowWidth = 300
    dataset.InstanceNumber = slice_index + 1
    if spatial_metadata:
        dataset.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        dataset.ImagePositionPatient = [0, 0, slice_index * 1.25]
        dataset.PixelSpacing = [0.7, 0.7]

    rows, columns = shape
    yy, xx = np.mgrid[:rows, :columns]
    center_y, center_x = rows // 2, columns // 2
    radius = min(rows, columns) // 3 + (slice_index % 4)
    pixels = (30 + ((xx * 3 + yy * 5) % 30)).astype(np.uint16)
    body = (xx - center_x) ** 2 + (yy - center_y) ** 2 < radius**2
    pixels[body] = (100 + ((xx[body] * 7 + yy[body] * 11 + slice_index) % 130)).astype(np.uint16)
    pixels[(xx > center_x - 8) & (xx < center_x - 3) & (yy > center_y - 16) & (yy < center_y + 16)] = 150
    if frames > 1:
        dataset.NumberOfFrames = frames
        pixels = np.stack([pixels] * frames)
    dataset.PixelData = pixels.tobytes()

    buffer = io.BytesIO()
    dataset.save_as(buffer, enforce_file_format=True)
    return buffer.getvalue()


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
