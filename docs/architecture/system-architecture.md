# OrthoView+ System Architecture

## Components

OrthoView+ comprises five cooperating components:

1. **React 19 / Vite frontend** — role-specific pages, forms, notifications and authenticated imaging viewers.
2. **Node.js / Express backend** — authentication, role and resource authorization, SQLite services, audit logging, Orthanc REST integration, and AI job management.
3. **SQLite / better-sqlite3** — users, patients, requests, appointments, internal study links, reports, audit logs, notifications and AI job/result metadata.
4. **Orthanc DICOM server** — source DICOM studies, series, instances, tags and rendered image representations.
5. **Python FastAPI image-processing service** — isolated experimental processing capabilities, invoked only by the backend.

The backend owns service credentials and the browser does not call Orthanc or FastAPI directly. SQLite stores references and application workflow metadata, not source DICOM files.

## Request and identity flow

1. A user signs in; Express authenticates and attaches the application user and role.
2. The frontend calls an authenticated Express route.
3. The route checks role and resource-specific permission before returning or changing data.
4. The backend reads/writes SQLite and, where required, calls Orthanc.
5. The backend records relevant administrative, clinical workflow, access and review actions in the audit log.
6. Only a radiologist-authorized AI route may enqueue processing; the backend resolves the exact source and optional prior resources and enforces the configured instance bound before sending DICOM files to FastAPI.

Application patient identity is established by an administrator-created, manually verified mapping from Orthanc DICOM PatientID to the internal patient record. DICOM name similarity is not used to auto-verify. A selected Orthanc study must be linked to an imaging request for the same internal patient. Radiologist access requires assignment to that exact linked study; practitioner access is scoped to the corresponding request/appointment; administrators retain their authorized management/archive access.

Study linking also requires a compatible request/study modality. The administrator must choose and confirm the exact imaging request; matching patient identity alone is insufficient.

## Role workflows

- **Administrator:** user/account management, patient registry, Orthanc refresh, pending/verified/rejected identity mappings, exact study-to-request linking, scheduling, alerts, operational monitoring and audit review.
- **Practitioner:** workflow-scoped patient registration/search/history, request submission, scheduling, authorized study and approved-report review, exposure information, same-patient authorized comparison, profile and notifications.
- **Radiologist:** assigned/claimable requests, request-scoped history, DICOM review for assigned linked studies, authorized comparison, experimental AI jobs/results, reporting/approval, profile and notifications.

Front-end route guards improve navigation but are not the security boundary; Express authorization is authoritative. Practitioner patient search/history, requests, appointments and reports are limited to that user's request/appointment workflow (including records the practitioner created). Radiologists can only retrieve history and reports associated with their assigned requests/studies.

## Imaging and AI limitations

The DICOM display is a basic study/image viewer rather than a diagnostic-grade PACS workstation. Exposure values depend on available modality metadata. The seven AI capabilities are prototypes (restoration, completeness assessment, longitudinal comparison, anatomical reconstruction, experimental 3D visualization, synthetic generation, and complementary-view synthesis). These capabilities use classical image-processing algorithms (OpenCV denoising, CLAHE, ECC alignment, intensity isosurface generation, procedural NumPy phantom generation) and are not trained predictive AI models. Similar-case retrieval is excluded. Derived and synthetic results are labelled and require radiologist review; they are not validated diagnoses and do not replace acquired images.

No SUS evaluation, clinical validation, hospital deployment, or diagnostic performance study is claimed. Live integration status depends on the configured Orthanc instance, database mappings/requests, and running AI service.
