# OrthoView+ Development Notes

## Project layout

- `client/` — React/Vite role-based application.
- `server/` — Express API, SQLite services, authentication, authorization, auditing and integrations.
- `ai-service/` — Python FastAPI experimental image processing.
- `database/` — application schema documentation.
- `docs/` — architecture, requirements, verification and screenshot guidance.

## Local services

Run the backend from `server` with `npm.cmd run dev`, the frontend from `client` with `npm.cmd run dev`, and the AI service from `ai-service` with `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`. Configure backend-only environment variables privately; see the root README and `.env.example`. The backend defaults to port 3001, the Vite frontend typically uses 5173, Orthanc 8042, and the AI service 8000.

## Important implementation decisions

- Orthanc is the source of DICOM images and Orthanc resource IDs; SQLite stores application workflow records and links.
- The internal patient MRN is not the Orthanc DICOM PatientID.
- Mapping verification is an explicit administrator action and is never based solely on a name match.
- Exact linked-study assignment is required for radiologist access. Practitioner access follows requests/appointments. UI route guards supplement, not replace, backend checks.
- Practitioners use a dedicated patient workspace for workflow-scoped patient search, registration, history, requests, appointments and approved reports. Radiologists can save and approve reports on assigned studies.
- AI processing is radiologist-only and bounded; results use classical image-processing algorithms (OpenCV, NumPy, scikit-image) and procedural synthetic generation, not trained predictive models; results are experimental, labelled, and require review.
- Database migrations are additive; preserve existing users, patients, requests, studies and completed results.

## Current validation

Automated checks and their actual results are recorded in [testing.md](./testing.md). Tests exercise isolated backend databases and synthetic DICOM fixtures; they do not prove live Orthanc configuration or clinical validity.

## Limitations

The viewer is not a diagnostic-grade PACS workstation. AI image processing uses classical algorithms and procedural generation, not trained predictive models, and is not clinically validated. SUS/usability evaluation and clinical performance studies remain planned, not completed. Live study access and mapping depend on an external Orthanc archive and a correctly configured application database.
