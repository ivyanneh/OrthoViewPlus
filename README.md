# OrthoView+

**A Web-based Clinical Interface for Enhancing Medical Imaging Workflows among Healthcare Practitioners**

OrthoView+ is an academic imaging-workflow interface. It uses React/Vite, an Express API, SQLite for application records, Orthanc for DICOM storage/retrieval, and a Python FastAPI service for experimental image processing. The browser communicates only with Express; Orthanc credentials and service configuration remain backend-side. SQLite stores patient/workflow metadata and references, not DICOM image files.

## Roles and workflows

- **Administrator:** dashboard, user and patient management, study identity mapping and exact study-to-request linking, scheduling, alerts, modality monitoring, audit logs, system administration, and account profile.
- **Practitioner:** dashboard, a dedicated patient workspace with workflow-scoped search/registration/history, imaging requests and scheduling, authorized studies and approved reports, exposure indicators, scan comparison, and notifications.
- **Radiologist:** assigned and claimable requests, request-scoped patient history, assigned DICOM studies, image viewing, same-patient authorized comparison, experimental AI processing/result review, reporting/approval, and notifications.

Backend authorization applies independently of the role-specific navigation and routes. Patient identity is established through a verified DICOM PatientID-to-application-patient mapping. A study becomes radiologist-accessible only after it is linked to an imaging request assigned to that radiologist. Practitioners are limited to patient records in their request/appointment workflow and studies attached to requests they submitted or appointments assigned to them.

## Imaging and patient identity

The administrator workflow is: register/find the application patient; refresh Orthanc; select a study; create a pending PatientID mapping; verify it manually (not by matching names); then link the exact Orthanc study to an imaging request for that same internal patient. If there is no request, the administrator workflow can create one for the verified patient. A request may then be claimed by a radiologist.

Orthanc owns the DICOM resources. The application stores internal patient IDs, request IDs, Orthanc resource IDs and verified mapping records in SQLite. Original studies are not copied into SQLite, and derived AI results are stored separately from source DICOMs.

## Approved experimental image-processing capabilities

The radiologist workflow exposes exactly seven capabilities:

1. Patient-specific anatomical reconstruction estimates image areas from an authorized prior study.
2. Restoration uses classical denoising, contrast enhancement and sharpening.
3. Longitudinal comparison highlights aligned intensity differences.
4. 3D visualization builds an experimental intensity isosurface from a spatially consistent CT/MR volume.
5. Completeness checking estimates field-of-view coverage.
6. Complementary-view synthesis creates an estimated, synthetic view.
7. Synthetic generation creates labelled procedural demonstration phantoms.

Similar-case retrieval is excluded. These capabilities use classical image-processing algorithms (OpenCV, NumPy, scikit-image) and procedural synthetic phantom generation, not trained predictive AI models. They are prototypes, not clinically validated diagnostic models. Outputs are labelled as derived, experimental or synthetic as appropriate, require radiologist review, and do not replace original acquisitions or acquired projections.

## Run locally

Use separate terminals. Configure a private `server/.env` from `.env.example`; set a unique `JWT_SECRET`, local database path, frontend origin, and the correct backend-only Orthanc credentials. The backend defaults to `http://localhost:8042` for Orthanc and `http://localhost:8000` for the AI service.

```powershell
cd server
npm.cmd install
npm.cmd run dev
```

```powershell
cd client
npm.cmd install
npm.cmd run dev
```

```powershell
cd ai-service
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Relevant optional server settings include `AI_SERVICE_URL`, `AI_RESULTS_DIR`, `AI_MAX_INSTANCES`, `AI_MAX_CONCURRENT`, and `ORTHANC_TIMEOUT_MS`. `DATABASE_PATH` is relative to the server directory unless absolute. Never put secrets in frontend variables or source control. The Python service is intended to be called by the backend, not directly by the browser.

## Verification commands

```powershell
cd server
npm.cmd test
```

```powershell
cd client
npm.cmd run build
```

```powershell
cd ai-service
python -m pytest
```

The backend tests use isolated temporary/in-memory SQLite fixtures. AI tests use generated synthetic DICOM fixtures; they do not prove clinical validity or a live archive workflow. A production build is not a substitute for browser-based usability or clinical testing.

## Current verification and limitations

The automated checks are documented in [testing.md](./docs/project-documentation/testing.md). Live workflow verification depends on the configured Orthanc archive, application database, and running AI service. Study linking, comparison and patient-specific AI processing must not be reported as live-verified unless those services and a verified mapping/request/assignment have actually been exercised.

The DICOM display is a basic Orthanc-rendered-image viewer, not a diagnostic-grade PACS workstation. Exposure values depend on modality and available DICOM tags. Image-processing methods are experimental prototypes; no SUS evaluation, clinical validation, diagnostic accuracy study, or hospital deployment is claimed.

## Project structure

- `client/` — React/Vite application.
- `server/` — Express API, SQLite services, authentication, authorization, Orthanc and AI integrations.
- `ai-service/` — FastAPI image-processing prototypes and tests.
- `database/` — database design documentation.
- `docs/` — architecture, requirements, development, testing and screenshot guidance.
