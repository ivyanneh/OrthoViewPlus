# OrthoView+ System Requirements

## Functional requirements

### Identity, users and access

- **FR-01 Authentication:** users authenticate through the backend; protected API routes require a valid identity.
- **FR-02 Three roles:** administrator, practitioner and radiologist receive distinct navigation and server-enforced permissions.
- **FR-03 Administration:** administrators manage user accounts, restrictions, application patients, mappings, study/request links, schedules, alerts and audit records.
- **FR-04 Patient management:** administrators can search, register, view, edit and archive/reactivate application patients; practitioners can register and search within permitted clinical workflows through a dedicated patient/request workspace.
- **FR-05 DICOM identity:** administrators can refresh Orthanc, create pending mappings, verify/reject mappings explicitly, and link an exact study to a request for the same mapped patient.
- **FR-05a Link integrity:** the selected request must have the same internal patient and a compatible modality; the administrator explicitly selects the exact request.
- **FR-06 Request workflow:** practitioners submit imaging requests and schedule appointments; radiologists access/claim assigned requests and complete draft, approval and finalization workflows for reports.
- **FR-07 Study access:** access to linked studies is checked against verified patient identity and exact request relationships. Radiologists require exact assignment; practitioner access follows request/appointment permissions.
- **FR-08 Imaging:** authorized users can view supported study data and rendered images from Orthanc.
- **FR-09 Exposure:** the application presents available exposure indicators for authorized linked studies when supported metadata exists.
- **FR-10 Comparison:** authorized same-patient studies can be compared using image viewers and available acquisition metadata.
- **FR-11 Notifications:** users can view and update their own notification read state.
- **FR-12 AI prototypes:** radiologists can request supported bounded experimental processing for authorized studies and review labelled results. Similar-case retrieval is excluded.
- **FR-13 Auditing and operations:** relevant workflow/access actions are audited; administrators can view operational monitoring and audit information.

## Non-functional requirements

- **NFR-01 Security:** passwords are hashed; sensitive credentials remain backend-side; APIs enforce role, resource ownership, exact study assignment, verified mappings and patient consistency.
- **NFR-02 Data integrity:** retain existing records; preserve patient/request/study relationships and completed AI results during recovery.
- **NFR-03 Reliability:** input sizes and processing concurrency are bounded; errors are surfaced; retries and result insertion are controlled.
- **NFR-04 Maintainability:** the React client, Express API, SQLite application data, Orthanc archive and FastAPI processing service have distinct responsibilities.
- **NFR-05 Usability:** role-appropriate navigation, actionable validation and loading/error/empty states are provided.

## Scope and limitations

OrthoView+ is an academic workflow interface, not a PACS replacement or diagnostic system. The seven image-processing functions are experimental and not clinically validated. Results require radiologist review. The basic rendered DICOM viewer is not diagnostic-grade. No clinical deployment, diagnostic accuracy validation, or completed SUS evaluation is claimed.

## Verification

Verification status for this pass is summarized in the final requirements checklist and documented test results in [testing.md](./testing.md). A rendered page or registered route alone is not proof of an end-to-end workflow; live Orthanc and clinical workflows must be separately marked when not exercised.
