# OrthoView+ Testing

## Automated checks

| Check | Command/environment | Result |
|---|---|---|
| Backend tests | `cd server; npm.cmd test` | **124 passed, 0 failed.** Includes role/resource authorization, workflow-scoped patient and appointment access, exact study assignment, patient mapping and registration, study linking, audit events, AI identity/limits/recovery/result-path safety, notifications, and Orthanc service behavior. |
| AI-service tests | `cd ai-service; D:\OrthoViewPlus-AI\venv\Scripts\python.exe -m pytest` | **9 passed, 0 failed.** Includes processing behavior, malformed DICOM, geometry/modality validation and 200-slice bound. One upstream Starlette/AnyIO deprecation warning was emitted. |
| Frontend production build | `cd client; npm.cmd run build` | **Passed.** Vite transformed 135 modules and produced the production bundle. |
| Whitespace/error check | `git diff --check` | Passed on the final worktree. |

These are automated checks, not clinical or usability evaluations. The backend tests use isolated SQLite fixtures and mocked Orthanc/AI services; Python tests use generated synthetic DICOM data. They do not prove access to a production archive, clinical correctness, diagnostic performance, or fitness for clinical use.

## Security and workflow coverage

Automated regression coverage includes:

- Unassigned radiologists are denied access to another radiologist's exact study, including preview, rendered-image and tag routes; assigned radiologists retain access.
- Practitioner and administrator study access follows their separate permissions.
- Mapping verification and study linking require the exact verified internal patient/request relationship.
- Study linking rejects requests for the same patient when request modality is incompatible with the Orthanc study.
- AI creation derives identity from DICOM, rejects caller-supplied patient identity and mismatched source/prior resources, and enforces the instance ceiling for combined inputs.
- Job/result, file/overlay, review and retry routes enforce exact study assignment; job listing is filtered by authorization.
- Recovery does not recreate duplicate result rows or reprocess completed jobs; interrupted attempts have a bounded persisted retry policy.
- Result-file traversal and symlink paths are rejected.
- Patient-management tests cover administrator-only routes, search, duplicate MRNs, optional unknown demographics, audit events and preservation of pre-existing patients.
- Notification ownership, read and read-all behavior are checked; approving a report notifies only the requesting practitioner.
- Practitioner approved-report lists resolve each report to its linked study and expose only reports for studies in that practitioner's workflow.
- Recent audit details are returned only to administrators.
- Exposure and comparison are scoped to linked, verified, role-accessible studies.

## Live-service verification

The authorized Administrator workflow linked Orthanc study `f11cb78c-7d84408b-8af8b958-9ee2b8e8-602f7b9d` (application study ID 1) to imaging request 2 after checking the verified mapping `Ultra_fast_Brain` → `DEMO-IVY-TEST-003` and confirming the patient and MR modality. The saved link was retrieved through the application and independently confirmed in SQLite. No patient or request was created or changed for this operation. This link is an intentional live-data change specifically authorized by the user; unrelated records were not modified.

The production frontend build and automated endpoint/service tests passed. A complete interactive browser walkthrough of all three roles against the live services was not performed.

## Not evaluated

No SUS survey or participant study, clinical validation, diagnostic-accuracy evaluation, production deployment review, or diagnostic-grade viewer validation has been completed. Do not infer completion of these activities from automated tests or the successful build.
