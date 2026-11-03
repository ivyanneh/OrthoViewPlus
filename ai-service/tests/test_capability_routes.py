import io

import numpy as np
from fastapi.testclient import TestClient
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

from app.main import app

client = TestClient(app)


def _dicom_bytes(study_date: str, slice_index: int = 0) -> bytes:
    file_meta = FileMetaDataset()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.MediaStorageSOPClassUID = CTImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()

    dataset = FileDataset(None, {}, file_meta=file_meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = CTImageStorage
    dataset.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    dataset.PatientID = "TEST-SYNTHETIC-PATIENT"
    dataset.StudyInstanceUID = "1.2.826.0.1.3680043.10.543.1"
    dataset.SeriesInstanceUID = "1.2.826.0.1.3680043.10.543.2"
    dataset.StudyDate = study_date
    dataset.Modality = "CT"
    dataset.Rows = 64
    dataset.Columns = 64
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = 16
    dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 0
    dataset.WindowCenter = 120
    dataset.WindowWidth = 300

    yy, xx = np.mgrid[:64, :64]
    radius = 18 + (slice_index % 4)
    pixels = (30 + ((xx * 3 + yy * 5) % 30)).astype(np.uint16)
    body = (xx - 32) ** 2 + (yy - 32) ** 2 < radius**2
    pixels[body] = (100 + ((xx[body] * 7 + yy[body] * 11 + slice_index) % 130)).astype(np.uint16)
    pixels[(xx > 23) & (xx < 28) & (yy > 16) & (yy < 48)] = 150
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
