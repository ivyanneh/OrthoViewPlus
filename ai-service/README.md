# OrthoView+ AI service

This Python FastAPI service implements seven assistive image-processing prototypes: restoration, completeness assessment, longitudinal comparison, anatomical reconstruction, experimental 3D visualization, synthetic phantom generation, and complementary-view synthesis. Similar-case retrieval is excluded. It does not diagnose patients, overwrite original DICOM files, or provide clinically validated outputs.

The Node.js backend is the only intended client. It authenticates and authorizes radiologists, validates the selected study and patient mapping, applies request/assignment checks and instance limits, then forwards DICOM files to this service. Do not expose this service directly to an untrusted network.

## Run (Windows PowerShell)

Use the project's existing Python environment where available. To create a local environment:

```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health and capability metadata are available at `/health`; processing routes are under `/api/ai`. Request size, volume size, and slice count are bounded in the API and processing layer. DICOM-derived outputs retain warnings and labels and must be reviewed by a radiologist.

## Tests

```powershell
python -m pytest
```

Tests use generated DICOM fixtures and verify input validation, image processing, spatial metadata requirements, and volume bounds. A passing test suite does not establish clinical validity, diagnostic performance, or fitness for clinical use.
